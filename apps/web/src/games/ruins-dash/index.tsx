import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { GameProps } from '@simsim/shared';
import {
  CAUGHT_DELAY_MS,
  MULT_STEP_M,
  MULT_MAX,
  CLOSE_POINTS,
  COIN_POINTS,
  HOW_TO_PLAY,
  ITEM_KINDS,
  ITEMS,
  STUMBLE_WINDOW_SEC,
  type ItemKind,
} from './config';
import {
  createRun,
  jump,
  moveLane,
  scoreOf,
  slide,
  step,
  type RunEvent,
  type RunOptions,
  type RunState,
} from './engine';
import type { Look } from './looks';
import {
  countEvent,
  emptyStats,
  MISSION_MULT_CAP,
  missionReward,
  missionSet,
  runValue,
  type Mission,
  type RunStats,
} from './missions';
import { drawFrame, makeView, type View } from './render3d';
import { itemDuration, rewardsAt } from './shop';
import { ShopPanel } from './ShopPanel';
import { RunSound } from './sound';
import {
  loadBest,
  loadMuted,
  loadProgress,
  saveMuted,
  clearLastRun,
  loadLastRun,
  saveLastRun,
  saveProgress,
  updateBest,
  type Best,
  type Progress,
} from './storage';
import styles from './RuinsDash.module.css';

type Screen = 'ready' | 'shop' | 'playing' | 'paused' | 'caught';

interface Hud {
  score: number;
  distance: number;
  coins: number;
  /** 켜져 있는 아이템 효과와 남은 비율(0~1) */
  effects: { kind: ItemKind; ratio: number }[];
  /** 비틀거림 남은 비율(0~1). 0 이면 안전 */
  danger: number;
  /** 점수 배율과 다음 배율까지 진행도(0~1, 최고 배율이면 1) */
  mult: number;
  /** 이번 판 최고 배율에 닿았는지 */
  multTop: boolean;
  multRatio: number;
  bestMult: number;
  closeCount: number;
}

const EMPTY_HUD: Hud = {
  score: 0,
  distance: 0,
  coins: 0,
  effects: [],
  danger: 0,
  mult: 1,
  multTop: false,
  multRatio: 0,
  bestMult: 1,
  closeCount: 0,
};

function hudOf(run: RunState): Hud {
  return {
    score: scoreOf(run),
    distance: Math.floor(run.distance),
    coins: run.coins,
    effects: ITEM_KINDS.filter((k) => run.effects[k] > 0).map((kind) => ({
      kind,
      ratio: run.effects[kind] / run.durations[kind],
    })),
    danger: run.stumbleT / STUMBLE_WINDOW_SEC,
    mult: run.mult,
    multTop: run.mult >= run.multMax,
    multRatio: run.mult >= run.multMax ? 1 : run.multProgress / MULT_STEP_M,
    bestMult: run.bestMult,
    closeCount: run.closeCount,
  };
}

// ---------- 미션 · 상점 진행 ----------

/** 미션 레벨만큼 오른 기본 배율 */
function multBaseOf(p: Progress): number {
  return 1 + Math.min(p.missionLevel, MISSION_MULT_CAP);
}

/** 판을 시작할 때 쓸 값 — 기본 배율, 강화된 아이템 지속 시간 */
function runOptionsOf(p: Progress): RunOptions {
  const durations: RunOptions['durations'] = {};
  for (const kind of ITEM_KINDS) durations[kind] = itemDuration(kind, p.upgrades[kind]);
  return { multBase: multBaseOf(p), durations };
}

/** 미션 진행 값 — 누적 미션은 지난 판까지 쌓인 값 + 이번 판 */
function missionValue(
  m: Mission,
  i: number,
  p: Progress,
  stats: RunStats | null,
  run: RunState | null,
): number {
  const now = stats && run ? runValue(m, stats, run) : 0;
  return m.scope === 'total' ? (p.missionTotals[i] ?? 0) + now : now;
}

/** 판이 끝났을 때 결과창에 보여 줄 동전·미션 정리 */
interface RunSummary {
  coins: number;
  missions: { text: string; done: boolean; value: number; target: number }[];
  /** 이번 판에 미션 세트를 끝냈으면 새 레벨·보상 */
  levelUp: {
    level: number;
    reward: number;
    multBase: number | null;
    /** 이번에 받은 보상 품목 이름 */
    unlocked: string[];
  } | null;
}

/** "🎉 미션 세트 완료! 기본 배율 ×3 · 🪙 +75 · 🎁 황금 왕관" */
function levelUpText(l: NonNullable<RunSummary['levelUp']>): string {
  const gains: string[] = [];
  if (l.multBase !== null) gains.push(`기본 배율 ×${l.multBase}`);
  gains.push(`🪙 +${l.reward}`);
  // 예전에 저장된 정리에는 unlocked 가 없을 수 있다
  for (const name of l.unlocked ?? []) gains.push(`🎁 ${name}`);
  return `🎉 미션 세트 완료! ${gains.join(' · ')}`;
}

function isRunSummary(v: unknown): v is RunSummary {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as RunSummary).coins === 'number' &&
    Array.isArray((v as RunSummary).missions)
  );
}

/** 아슬아슬 보너스 팝업 */
interface ClosePop {
  id: number;
  points: number;
}

/** 아이템을 먹었을 때 잠깐 뜨는 안내 */
interface Toast {
  id: number;
  kind: ItemKind;
}

/** 스와이프로 인정하는 최소 이동 거리(px) */
const SWIPE_MIN = 26;
/** 한 프레임 최대 시간 — 탭 전환 등으로 멈췄다 돌아와도 한 번에 순간이동하지 않게 */
const MAX_DT = 1 / 20;

/**
 * 유적 탈출 — 3레인 2.5D 러너. 굴러오는 바위를 피해 끝없이 달린다.
 * 점수 = 달린 거리(m) + 동전 × 10. 붙잡히면 잠깐 연출 후 onFinish(score) 를 한 번 호출한다.
 */
export default function RuinsDash({ onFinish }: GameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgressState] = useState<Progress>(loadProgress);
  const progressRef = useRef(progress);
  // 미션 레벨(기본 배율)·상점 강화가 반영된 판
  const runRef = useRef<RunState>(createRun(runOptionsOf(progress)));
  const statsRef = useRef<RunStats>(emptyStats());
  const lookRef = useRef<Look>(progress.look);
  const viewRef = useRef<View | null>(null);
  const screenRef = useRef<Screen>('ready');
  const soundRef = useRef<RunSound | null>(null);
  const finishedRef = useRef(false);
  const finishTimerRef = useRef(0);
  const onFinishRef = useRef(onFinish);
  const swipeRef = useRef<{ x: number; y: number; used: boolean } | null>(null);

  const [screen, setScreenState] = useState<Screen>('ready');
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [toast, setToast] = useState<Toast | null>(null);
  const [closePop, setClosePop] = useState<ClosePop | null>(null);
  /** 배율이 오를 때마다 바뀌어 배율 표시가 한 번 튄다 */
  const [multFlash, setMultFlash] = useState(0);
  const popTimerRef = useRef(0);
  const [best, setBest] = useState<Best | null>(loadBest);
  const [newBest, setNewBest] = useState(false);
  /** 바위에 잡힌 게 아니라 떨어져서 끝났는지 */
  const [fell, setFell] = useState(false);
  const [muted, setMuted] = useState(loadMuted);
  /** 이번 판에 끝낸 미션 안내 */
  const [missionToast, setMissionToast] = useState<{ id: number; text: string } | null>(null);
  const missionToastTimerRef = useRef(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  /** 지난 판 정리 — 다시 하기로 새로 뜬 시작 화면에 한 번 보여 준다 */
  const [lastRun] = useState<RunSummary | null>(() => {
    const v = loadLastRun();
    return isRunSummary(v) ? v : null;
  });
  const missions = useMemo(() => missionSet(progress.missionLevel), [progress.missionLevel]);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const setScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const sound = useCallback((): RunSound => {
    soundRef.current ??= new RunSound();
    return soundRef.current;
  }, []);

  useEffect(() => {
    sound().muted = muted;
    saveMuted(muted);
  }, [muted, sound]);

  useEffect(() => () => soundRef.current?.dispose(), []);

  /** 진행 상황 저장 — 판을 시작하기 전이면 강화·배율이 반영된 판으로 다시 만든다 */
  const commitProgress = useCallback((next: Progress) => {
    progressRef.current = next;
    setProgressState(next);
    saveProgress(next);
    lookRef.current = next.look;
    if (screenRef.current === 'ready' || screenRef.current === 'shop') {
      runRef.current = createRun(runOptionsOf(next));
    }
  }, []);

  /** 목표에 닿은 미션을 완료로 표시한다 (완료는 판이 끝나기 전에도 바로 저장된다) */
  const checkMissions = useCallback(() => {
    const p = progressRef.current;
    const set = missionSet(p.missionLevel);
    const done = [...p.missionDone];
    let changed = false;
    set.forEach((m, i) => {
      if (done[i]) return;
      if (missionValue(m, i, p, statsRef.current, runRef.current) < m.target) return;
      done[i] = true;
      changed = true;
      const id = Date.now() + Math.random();
      setMissionToast({ id, text: m.text });
      window.clearTimeout(missionToastTimerRef.current);
      missionToastTimerRef.current = window.setTimeout(
        () => setMissionToast((cur) => (cur?.id === id ? null : cur)),
        1800,
      );
      soundRef.current?.play('multUp');
    });
    if (changed) commitProgress({ ...p, missionDone: done });
  }, [commitProgress]);

  useEffect(() => () => window.clearTimeout(missionToastTimerRef.current), []);

  const emit = useCallback((e: RunEvent) => {
    soundRef.current?.play(e);
    countEvent(statsRef.current, e, runRef.current);
    if (e === 'close') {
      // 방금 더해진 보너스 = 기본 보너스 × 지금 배율
      const id = Date.now() + Math.random();
      setClosePop({ id, points: CLOSE_POINTS * runRef.current.mult });
      window.clearTimeout(popTimerRef.current);
      popTimerRef.current = window.setTimeout(
        () => setClosePop((cur) => (cur?.id === id ? null : cur)),
        900,
      );
    } else if (e === 'multUp') {
      setMultFlash((n) => n + 1);
    }
  }, []);

  useEffect(() => () => window.clearTimeout(popTimerRef.current), []);

  /** 붙잡혔을 때 — 기록 저장, 연출 후 공통 결과창으로 점수 전달 */
  const handleCaught = useCallback(() => {
    const run = runRef.current;
    const score = scoreOf(run);

    // 동전은 지갑으로, 누적 미션은 이번 판 몫을 더하고, 세 개를 다 끝냈으면 레벨업
    checkMissions();
    const p = progressRef.current;
    const set = missionSet(p.missionLevel);
    const values = set.map((m, i) => missionValue(m, i, p, statsRef.current, run));
    const allDone = p.missionDone.every(Boolean);
    let next: Progress = {
      ...p,
      coins: p.coins + run.coins,
      missionTotals: set.map((m, i) =>
        m.scope === 'total' && !p.missionDone[i] ? (values[i] ?? 0) : (p.missionTotals[i] ?? 0),
      ),
    };
    let levelUp: RunSummary['levelUp'] = null;
    if (allDone) {
      const reward = missionReward(p.missionLevel);
      next = {
        ...next,
        coins: next.coins + reward,
        missionLevel: p.missionLevel + 1,
        missionDone: [false, false, false],
        missionTotals: [0, 0, 0],
      };
      // 배율은 MISSION_MULT_CAP 까지만 오르고, 그 뒤로는 동전 보상만
      const raised = multBaseOf(next) > multBaseOf(p);
      levelUp = {
        level: next.missionLevel,
        reward,
        multBase: raised ? multBaseOf(next) : null,
        unlocked: rewardsAt(next.missionLevel).map((it) => it.label),
      };
    }
    commitProgress(next);
    const runSummary: RunSummary = {
      coins: run.coins,
      missions: set.map((m, i) => ({
        text: m.text,
        done: p.missionDone[i] ?? false,
        value: values[i] ?? 0,
        target: m.target,
      })),
      levelUp,
    };
    setSummary(runSummary);
    saveLastRun(runSummary);

    const prev = loadBest();
    setNewBest(score > 0 && score > (prev?.score ?? 0));
    setFell(run.fell);
    setBest(updateBest(score, run.distance));
    setHud(hudOf(run));
    setScreen('caught');
    finishTimerRef.current = window.setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinishRef.current(score);
    }, CAUGHT_DELAY_MS);
  }, [setScreen, checkMissions, commitProgress]);

  // 연출 도중 페이지를 떠나면 결과 전달 타이머도 취소한다
  useEffect(() => () => window.clearTimeout(finishTimerRef.current), []);

  // ---------- 캔버스 크기 · 그리기 루프 ----------

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;

    function resize() {
      if (!wrap || !canvas || !ctx) return;
      // 3D 는 면이 많아 픽셀 수가 곧 부담이라, 고해상도 화면에서도 1.5배까지만 키운다
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewRef.current = makeView(w, h);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let caughtT: number | null = null;
    let hudTimer = 0;
    let toastId = 0;
    let toastTimer = 0;
    // 직전 프레임의 효과 남은 시간 — 값이 늘어났으면 방금 아이템을 먹은 것
    const prevEffects = { ...runRef.current.effects };

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const run = runRef.current;
      const mode = screenRef.current;

      if (mode !== 'paused') t += dt;
      if (mode === 'playing') {
        step(run, dt, emit);
        for (const kind of ITEM_KINDS) {
          if (run.effects[kind] > prevEffects[kind] + 0.01) {
            const id = ++toastId;
            setToast({ id, kind });
            window.clearTimeout(toastTimer);
            toastTimer = window.setTimeout(
              () => setToast((cur) => (cur?.id === id ? null : cur)),
              1300,
            );
          }
          prevEffects[kind] = run.effects[kind];
        }
        hudTimer += dt;
        if (run.status === 'caught') {
          caughtT = 0;
          handleCaught();
        } else if (hudTimer >= 0.1) {
          hudTimer = 0;
          setHud(hudOf(run));
          checkMissions();
        }
      } else if (mode === 'caught' && caughtT !== null) {
        caughtT += dt;
      }

      const view = viewRef.current;
      if (view && ctx) drawFrame(ctx, view, run, { t, caughtT, look: lookRef.current });
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(toastTimer);
      observer.disconnect();
    };
  }, [emit, handleCaught, checkMissions]);

  // ---------- 시작 · 일시정지 ----------

  const start = useCallback(() => {
    sound().unlock();
    if (screenRef.current === 'ready') clearLastRun();
    if (screenRef.current === 'ready' || screenRef.current === 'paused') setScreen('playing');
    // 방금 누른 시작 버튼에 포커스가 남으면 스페이스(점프)가 버튼 클릭으로도 처리되므로 풀어 준다
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [setScreen, sound]);

  const pause = useCallback(() => {
    if (screenRef.current === 'playing') setScreen('paused');
  }, [setScreen]);

  // 다른 탭·창으로 전환하면 자동 일시정지
  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') pause();
    }
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', pause);
    };
  }, [pause]);

  // ---------- 키보드 ----------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 결과창의 닉네임 입력 등 다른 입력칸에서 치는 키는 가로채지 않는다
      if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;

      const mode = screenRef.current;
      const run = runRef.current;
      const key = e.key;

      if (mode === 'shop') {
        if (key === 'Escape') {
          e.preventDefault();
          setScreen('ready');
        }
        return;
      }
      if (mode === 'ready' || mode === 'paused') {
        if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          start();
        }
        if (mode === 'paused' && (key === 'Escape' || key === 'p' || key === 'P')) {
          e.preventDefault();
          start();
        }
        return;
      }
      if (mode !== 'playing') return;

      if (key === 'Escape' || key === 'p' || key === 'P') {
        e.preventDefault();
        pause();
        return;
      }
      if (e.repeat) return;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') moveLane(run, -1, emit);
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') moveLane(run, 1, emit);
      else if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') jump(run, emit);
      else if (key === 'ArrowDown' || key === 's' || key === 'S') slide(run, emit);
      else return;
      e.preventDefault(); // 방향키·스페이스로 페이지가 스크롤되지 않게
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emit, pause, start, setScreen]);

  // ---------- 스와이프 (터치 · 마우스 드래그) ----------

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (screenRef.current !== 'playing') return;
    swipeRef.current = { x: e.clientX, y: e.clientY, used: false };
  }

  /** 손을 떼기 전에도 기준 거리를 넘는 순간 바로 반응한다 */
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = swipeRef.current;
    if (!s || s.used || screenRef.current !== 'playing') return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    s.used = true;
    const run = runRef.current;
    if (Math.abs(dx) > Math.abs(dy)) moveLane(run, dx < 0 ? -1 : 1, emit);
    else if (dy < 0) jump(run, emit);
    else slide(run, emit);
  }

  function onPointerEnd() {
    swipeRef.current = null;
  }

  const bestScore = best?.score ?? 0;
  const multBase = multBaseOf(progress);

  /** 미션 3개 목록 — 시작 화면에서 보여 준다 */
  const missionList = (
    <div className={styles.missions}>
      <p className={styles.missionsHead}>
        <span>🎯 미션 Lv.{progress.missionLevel + 1}</span>
        <span className={styles.missionsHint}>
          3개를 다 끝내면{' '}
          {progress.missionLevel < MISSION_MULT_CAP ? `기본 배율 ×${multBase + 1} · ` : ''}🪙{' '}
          {missionReward(progress.missionLevel)}
          {rewardsAt(progress.missionLevel + 1).map((it) => ` · 🎁 ${it.label}`)}
        </span>
      </p>
      <ul className={styles.missionList}>
        {missions.map((m, i) => {
          const done = progress.missionDone[i] ?? false;
          const value = missionValue(m, i, progress, null, null);
          return (
            <li key={m.kind} className={done ? styles.missionDone : undefined}>
              <span aria-hidden>{done ? '✅' : '⬜'}</span>
              <span className={styles.missionText}>{m.text}</span>
              {!done && m.scope === 'total' && (
                <span className={styles.missionCount}>
                  {Math.min(value, m.target)}/{m.target}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className={styles.root}>
      <div
        ref={wrapRef}
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <canvas ref={canvasRef} className={styles.canvas} aria-label="유적 탈출 게임 화면" />

        {(screen === 'playing' || screen === 'paused') && (
          <div className={styles.hud}>
            <div className={styles.hudMain}>
              <span className={styles.scoreRow}>
                <span className={styles.hudScore}>{hud.score.toLocaleString()}</span>
                <span
                  key={multFlash}
                  className={`${styles.mult} ${hud.multTop ? styles.multMax : ''}`}
                >
                  ×{hud.mult}
                </span>
              </span>
              <span className={styles.multBar} aria-hidden>
                <span className={styles.multFill} style={{ width: `${hud.multRatio * 100}%` }} />
              </span>
              <span className={styles.hudSub}>
                {hud.distance.toLocaleString()}m · 🪙 {hud.coins}
              </span>
              {hud.effects.length > 0 && (
                <ul className={styles.effects} aria-label="사용 중인 아이템">
                  {hud.effects.map(({ kind, ratio }) => (
                    <li key={kind} className={styles.effect}>
                      <span className={styles.effectIcon} style={{ background: ITEMS[kind].color }}>
                        {ITEMS[kind].icon}
                      </span>
                      <span className={styles.effectBar}>
                        <span
                          className={styles.effectFill}
                          style={{ width: `${ratio * 100}%`, background: ITEMS[kind].color }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.hudButtons}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? '소리 켜기' : '소리 끄기'}
              >
                {muted ? '🔇' : '🔊'}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={pause}
                aria-label="일시정지"
              >
                ⏸
              </button>
            </div>
          </div>
        )}

        {screen === 'playing' && closePop && (
          <div key={closePop.id} className={styles.closePop}>
            아슬아슬! <strong>+{closePop.points}</strong>
          </div>
        )}

        {screen === 'playing' && missionToast && (
          <div key={missionToast.id} className={styles.missionToast} role="status">
            ✅ 미션 완료 · {missionToast.text}
          </div>
        )}

        {screen === 'playing' && hud.danger > 0 && (
          <div className={styles.danger} role="status">
            <span>⚠ 바위가 바짝 따라온다! 한 번 더 부딪히면 끝</span>
            <span className={styles.dangerBar}>
              <span className={styles.dangerFill} style={{ width: `${hud.danger * 100}%` }} />
            </span>
          </div>
        )}

        {screen === 'playing' && toast && (
          <div
            key={toast.id}
            className={styles.toast}
            style={{ borderColor: ITEMS[toast.kind].color }}
          >
            <span className={styles.toastIcon} style={{ background: ITEMS[toast.kind].color }}>
              {ITEMS[toast.kind].icon}
            </span>
            <span>
              <strong>{ITEMS[toast.kind].label}</strong> {ITEMS[toast.kind].description}
            </span>
          </div>
        )}

        {screen === 'ready' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>RUINS DASH</p>
              <h2 className={styles.title}>유적 탈출</h2>
              <p className={styles.lead}>
                신전에서 보물을 챙겨 나오는 순간, 거대한 바위가 굴러오기 시작했다!
              </p>
              {lastRun && (
                <p className={styles.lastRun}>
                  지난 판 🪙 +{lastRun.coins}
                  {lastRun.levelUp
                    ? ` · ${levelUpText(lastRun.levelUp)}`
                    : ` · 미션 ${lastRun.missions.filter((m) => m.done).length}/3`}
                </p>
              )}
              {missionList}
              <table className={styles.howto}>
                <thead>
                  <tr>
                    <th>동작</th>
                    <th>키보드</th>
                    <th>터치</th>
                  </tr>
                </thead>
                <tbody>
                  {HOW_TO_PLAY.map((row) => (
                    <tr key={row.action}>
                      <td>{row.action}</td>
                      <td>{row.keys}</td>
                      <td>{row.touch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className={styles.itemGuide}>
                {ITEM_KINDS.map((kind) => (
                  <li key={kind}>
                    <span className={styles.effectIcon} style={{ background: ITEMS[kind].color }}>
                      {ITEMS[kind].icon}
                    </span>
                    <span>
                      <strong>{ITEMS[kind].label}</strong> {ITEMS[kind].description}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.note}>
                모퉁이에서는 꺾이는 쪽으로 밀어 방향을 트세요 — 못 돌면 떨어집니다. 길은
                신전·물가·절벽으로 바뀌고, 물가의 끊어진 판자는 점프로 건너야 합니다. 통나무에
                걸리거나 기둥에 스치면 비틀거리고, 비틀거리는 동안 또 부딪히면 잡힙니다.
              </p>
              <p className={styles.note}>
                안 부딪히고 달리면 점수 배율이 ×{multBase + MULT_MAX - 1} 까지 오르고(비틀거리면 ×
                {multBase}), 마지막 순간에 아슬아슬하게 피하면 보너스! 점수 = (거리 + 동전 ×{' '}
                {COIN_POINTS}) × 배율 + 아슬아슬 보너스
              </p>
              <button
                type="button"
                className={`btn btn-primary ${styles.startButton}`}
                onClick={start}
              >
                달리기 시작
              </button>
              <div className={styles.walletRow}>
                <span className={styles.wallet}>🪙 {progress.coins.toLocaleString()}</span>
                <button type="button" className="btn" onClick={() => setScreen('shop')}>
                  상점
                </button>
              </div>
              {bestScore > 0 && (
                <p className={styles.best}>
                  내 최고 기록 {bestScore.toLocaleString()}점 · {best?.distance.toLocaleString()}m
                </p>
              )}
            </div>
          </div>
        )}

        {screen === 'shop' && (
          <div className={styles.overlay}>
            <ShopPanel
              progress={progress}
              onChange={commitProgress}
              onClose={() => setScreen('ready')}
            />
          </div>
        )}

        {screen === 'paused' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={styles.title}>일시정지</h2>
              <p className={styles.lead}>바위도 잠시 멈췄어요.</p>
              <button
                type="button"
                className={`btn btn-primary ${styles.startButton}`}
                onClick={start}
              >
                계속 달리기
              </button>
              <p className={styles.note}>Esc · P 로도 계속할 수 있어요</p>
            </div>
          </div>
        )}

        {screen === 'caught' && (
          <div className={`${styles.overlay} ${styles.overlayCaught}`}>
            <div className={styles.caught}>
              <p className={styles.caughtTitle}>{fell ? '떨어졌다!' : '붙잡혔다!'}</p>
              <p className={styles.caughtScore}>{hud.score.toLocaleString()}점</p>
              <p className={styles.caughtSub}>
                {hud.distance.toLocaleString()}m · 동전 {hud.coins}개
              </p>
              <p className={styles.caughtSub}>
                최고 배율 ×{hud.bestMult} · 아슬아슬 {hud.closeCount}번
              </p>
              {newBest && <p className={styles.newBest}>🏅 내 최고 기록 갱신!</p>}
              {summary && (
                <>
                  <p className={styles.caughtCoins}>
                    🪙 +{summary.coins} · 보유 {progress.coins.toLocaleString()}
                  </p>
                  <ul className={styles.caughtMissions}>
                    {summary.missions.map((m) => (
                      <li key={m.text} className={m.done ? styles.missionDone : undefined}>
                        {m.done ? '✅' : '⬜'} {m.text}
                        {!m.done && (
                          <span className={styles.missionCount}>
                            {' '}
                            {Math.min(m.value, m.target)}/{m.target}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {summary.levelUp && (
                    <p className={styles.levelUp}>{levelUpText(summary.levelUp)}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
