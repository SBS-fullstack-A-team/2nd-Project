import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';

import {
  BUILDS,
  MAX_LEVEL,
  previewWave,
  skillDps,
  SKILLS,
  TOTAL_WAVES,
  towerChain,
  towerDps,
  towerRange,
  towerSlow,
  towerSplash,
  upgradeCost,
  wallSlow,
  wallThorn,
  type BuildKind,
  type EnemyKind,
} from './engine/config';
import {
  Engine,
  REFUSAL_TEXT,
  type Enemy,
  type RunResult,
  type SimEvent,
  type Snapshot,
} from './engine/engine';
import { colOf, index, isBuildable, rowOf } from './engine/maze';
import { cellFromPoint, drawGame, layout, pointFromEvent, type View } from './engine/render';
import { SoundEngine, mapSimEvent } from './engine/audio';
import { loadBest, updateBest, type Best } from './best';
import { MAX_SIM_STEP, SPEED_STEPS } from './config';

import { GameDock, type DockSelection } from './game-dock';
import { GameHud } from './game-hud';
import { EndingOverlay, IntroOverlay, PauseOverlay } from './game-overlays';
import styles from './Imjin50.module.css';

/* eslint-disable react-hooks/refs --
 * 이 게임은 캔버스 rAF 루프가 매 프레임 Engine 인스턴스를 직접 변형하며 시뮬레이션을 돌린다.
 * engine/sound 는 매 프레임 변형되는 외부 시뮬레이션 객체라 useRef 로 한 번만 만들고,
 * React 상태는 10Hz 스냅샷으로만 화면에 반영한다 — 렌더 중 ref 접근을 금지하는 최신
 * React Compiler 지향 규칙과는 이 지점에서 맞지 않아 이 파일에 한정해 끈다. */

type Mode = 'intro' | 'playing' | 'finished';

function playSimEvents(sound: SoundEngine, events: SimEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'shotCannon':
        sound.sim('shotCannon');
        break;
      case 'chain':
        sound.sim('chain');
        break;
      case 'kill':
        sound.sim(mapSimEvent(event.kind), { kind: event.kind });
        break;
      case 'skill':
        sound.sim('skill');
        break;
      case 'leak':
        sound.sim('leak');
        break;
      case 'waveStart':
        sound.sim(event.boss ? 'waveStartBoss' : 'waveStart');
        break;
      case 'waveClear':
        sound.sim('waveClear');
        break;
      case 'combo':
        sound.sim('combo', { combo: event.combo });
        break;
      case 'gameOver':
        sound.sim('gameOver');
        break;
      case 'victory':
        sound.sim('victory');
        break;
    }
  }
}

/** 그 시설만의 고유 능력치 — 업그레이드가 데미지·사거리 말고 무엇을 사는지 보여준다.
 *  statRow 가 구절마다 줄바꿈 없이 감싸도록 조각째 반환한다(하나로 이어 붙이면
 *  좁은 선택 패널에서 통째로 넘쳐흐른다). 스킬 이름은 스킬 버튼이 이미 보여주므로
 *  여기서는 다루지 않는다. */
function traitOf(kind: BuildKind, level: number): string[] | null {
  const parts: string[] = [];
  if (kind === 'wall') {
    const thorn = wallThorn(level);
    if (thorn > 0) {
      const slow = wallSlow(level);
      parts.push('옆 적에게 초당 체력 ' + (thorn * 100).toFixed(1) + '%');
      if (slow > 0) parts.push('둔화 ' + Math.round(slow * 100) + '%');
    }
  } else if (kind === 'hwacha') {
    parts.push('불길 ' + towerChain(kind, level) + '명');
  } else if (kind === 'cannon') {
    parts.push('폭발 ' + towerSplash(kind, level).toFixed(2) + '칸');
  } else if (kind === 'caltrop') {
    parts.push('둔화 ' + Math.round(towerSlow(kind, level) * 100) + '%');
  }
  return parts.length > 0 ? parts : null;
}

/**
 * 임진 50 — 벽으로 길을 접어 쉰 차례의 공세를 막는 미로형 타워디펜스.
 * 점수 등록·랭킹은 공통 GamePage 가 처리하므로, 여기서는 게임이 끝났을 때
 * onFinish(score) 를 한 번만 호출한다.
 */
export default function Imjin50({ onFinish }: GameProps) {
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;

  const soundRef = useRef<SoundEngine | null>(null);
  if (!soundRef.current) soundRef.current = new SoundEngine();
  const sound = soundRef.current;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const finishedRef = useRef(false);
  // 아직 세우지 않은 자리에 무기를 얹어 보는 미리보기용 — 무기줄의 버튼을
  // 마우스로 훑을 때만 잠깐 바뀌는 값이라 리렌더가 필요 없어 ref 로 둔다.
  const hoverKindRef = useRef<BuildKind | null>(null);

  const [stats, setStats] = useState<Snapshot>(() => engine.snapshot());
  const [selection, setSelection] = useState<DockSelection | null>(null);
  const [pending, setPending] = useState<BuildKind | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>('intro');
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  // 결과창으로 넘긴 뒤에는 결말 장면을 걷어서 두 화면이 겹치지 않게 한다
  const [recorded, setRecorded] = useState(false);
  // 판에서 짚은 적의 종류 — 정보 카드로 보여준다
  const [inspected, setInspected] = useState<EnemyKind | null>(null);
  // 이 브라우저에서 지금까지의 최고 점수·최고 도달 공세 (서버 랭킹과는 별개)
  const [best, setBest] = useState<Best | null>(() => loadBest());

  // 공세 구성은 웨이브 번호로만 정해지는 순수 계산이라, 정비 시간에 미리 보여줘도
  // 공정성이 깨지지 않는다.
  const nextWave = useMemo(
    () => (stats.phase === 'break' ? previewWave(stats.wave) : null),
    [stats.phase, stats.wave],
  );

  const modeRef = useRef(mode);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const pendingRef = useRef(pending);
  modeRef.current = mode;
  pausedRef.current = paused;
  speedRef.current = speed;
  pendingRef.current = pending;

  const flash = useCallback((message: string | null) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    if (message) {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
    }
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    setMuted(sound.isMuted);
  }, [sound]);

  // 선택 칸이 바뀌면 이전 호버 미리보기는 더 이상 맞지 않으므로 지운다.
  // (버튼이 마우스 아래에서 그대로 사라지는 경우 mouseleave 가 안 올 수 있다.)
  useEffect(() => {
    hoverKindRef.current = null;
  }, [selection]);

  const toggleMute = useCallback(() => {
    setMuted(sound.toggleMuted());
  }, [sound]);

  const syncSelection = useCallback(() => {
    if (engine.selected === null) {
      setSelection(null);
      return;
    }
    const col = colOf(engine.selected);
    const row = rowOf(engine.selected);
    const build = engine.buildAt(col, row);
    if (!build) {
      setSelection({
        col,
        row,
        kind: null,
        level: 0,
        dps: 0,
        range: 0,
        trait: null,
        nextCost: null,
        refund: 0,
        skillUnlocked: false,
        skillCost: null,
      });
      return;
    }
    const def = BUILDS[build.kind];
    const maxed = def.upgradable && build.level >= MAX_LEVEL;
    setSelection({
      col,
      row,
      kind: build.kind,
      level: build.level,
      dps:
        towerDps(build.kind, build.level) +
        (build.skillUnlocked ? skillDps(build.kind, build.level) : 0),
      range: towerRange(build.kind, build.level),
      trait: traitOf(build.kind, build.level),
      nextCost:
        def.upgradable && build.level < MAX_LEVEL ? upgradeCost(build.kind, build.level) : null,
      refund: Math.floor(build.invested * 0.6),
      skillUnlocked: build.skillUnlocked,
      skillCost: maxed && !build.skillUnlocked ? SKILLS[build.kind].cost : null,
    });
  }, [engine]);

  // 한 판에 한 번만 호출한다 (승리/패배가 같은 틱에 겹치는 경우 대비)
  const finish = useCallback(
    (score: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish(score);
    },
    [onFinish],
  );

  // 결말 장면에서 "전과 기록하기"를 누르거나 시간이 지나면 공통 결과창으로 넘긴다
  const proceed = useCallback(() => {
    if (!result) return;
    finish(result.score);
    setRecorded(true);
  }, [finish, result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let last = performance.now();
    let tick = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      viewRef.current = layout(w, h, dpr);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (modeRef.current === 'playing' && !pausedRef.current) {
        // 배속만큼 늘어난 시간을 MAX_SIM_STEP 이하로 나눠 돌린다 (1배속에선 보통 한 번)
        let simLeft = dt * speedRef.current;
        while (simLeft > 0 && !engine.finished) {
          const step = Math.min(MAX_SIM_STEP, simLeft);
          engine.update(step);
          simLeft -= step;
        }
        const events = engine.drainEvents();
        if (events.length) playSimEvents(sound, events);
        for (const event of events) {
          if (event.type === 'waveStart' && event.boss) flash('왜장 출현! 성문 방비를 굳히십시오.');
        }
      } else if (modeRef.current === 'finished') {
        // 끝난 뒤에도 연기·불길 같은 효과는 가라앉을 때까지 흘려보낸다 (시뮬레이션은 멈춰 있다)
        engine.update(dt);
        engine.drainEvents();
      }

      const view = viewRef.current;
      if (view) drawGame(ctx, engine, view, now / 1000, hoverKindRef.current);

      tick += dt;
      if (tick >= 0.1) {
        tick = 0;
        setStats(engine.snapshot());
        const lowLives = engine.lives > 0 && engine.lives <= 4 && !engine.finished;
        if (lowLives) sound.startHeartbeat();
        else sound.stopHeartbeat();
        if (engine.finished && modeRef.current === 'playing') {
          sound.stopHeartbeat();
          const runResult = engine.result();
          setResult(runResult);
          const held = runResult.victory ? TOTAL_WAVES : Math.max(0, runResult.wave - 1);
          setBest(updateBest(runResult.score, held));
          setMode('finished');
        }
      }

      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sound.stopHeartbeat();
    };
  }, [engine, sound, flash]);

  const start = useCallback(() => {
    sound.unlock();
    sound.stopHeartbeat();
    engine.reset();
    setPending(null);
    setSelection(null);
    setPaused(false);
    setResult(null);
    setRecorded(false);
    setInspected(null);
    setStats(engine.snapshot());
    flash(null);
    setMode('playing');
  }, [engine, flash, sound]);

  // "처음부터 다시"는 곧장 재시작하지 않고 인트로 화면으로 돌아간다 — 작전 개요를
  // 다시 볼지, 바로 시작할지는 플레이어가 그 화면에서 고른다.
  const restartToIntro = useCallback(() => {
    sound.stopHeartbeat();
    engine.reset();
    setPending(null);
    setSelection(null);
    setPaused(false);
    setResult(null);
    setRecorded(false);
    setInspected(null);
    setStats(engine.snapshot());
    flash(null);
    setMode('intro');
  }, [engine, flash, sound]);

  const tryBuild = useCallback(
    (col: number, row: number, kind: BuildKind) => {
      if (engine.build(col, row, kind)) {
        engine.pending = null;
        setPending(null);
        flash(null);
        sound.build(kind);
        syncSelection();
        return true;
      }
      if (engine.refusal) {
        flash(REFUSAL_TEXT[engine.refusal]);
        sound.refuse();
      }
      return false;
    },
    [engine, flash, sound, syncSelection],
  );

  const handlePointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      sound.unlock();
      const canvas = canvasRef.current;
      const view = viewRef.current;
      if (!canvas || !view || modeRef.current !== 'playing' || pausedRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      // 무기를 놓으려는 게 아니면, 칸보다 먼저 적을 짚었는지부터 본다 — 계속
      // 움직이는 적이라 칸이 아니라 판 위 실수 좌표로 가까운 순서를 찾는다.
      if (!pendingRef.current) {
        const tap = pointFromEvent(view, px, py);
        let nearest: Enemy | null = null;
        let bestDist = Infinity;
        for (const enemy of engine.enemies) {
          if (enemy.dead) continue;
          const d = Math.hypot(enemy.x - tap.x, enemy.y - tap.y);
          if (d <= enemy.radius + 0.24 && d < bestDist) {
            bestDist = d;
            nearest = enemy;
          }
        }
        if (nearest) {
          setInspected(nearest.kind);
          return;
        }
      }
      setInspected(null);

      const { col, row } = cellFromPoint(view, px, py);

      const build = engine.buildAt(col, row);
      if (build) {
        engine.selected = index(col, row);
        engine.pending = null;
        setPending(null);
        syncSelection();
        return;
      }
      if (!isBuildable(col, row)) {
        engine.selected = null;
        syncSelection();
        return;
      }
      const kind = pendingRef.current;
      if (kind) {
        if (tryBuild(col, row, kind)) return;
        engine.selected = index(col, row);
        syncSelection();
        return;
      }
      engine.selected = index(col, row);
      syncSelection();
    },
    [engine, sound, syncSelection, tryBuild],
  );

  const pick = useCallback(
    (kind: BuildKind) => {
      if (selection && selection.kind === null) {
        if (tryBuild(selection.col, selection.row, kind)) return;
      }
      const next = pendingRef.current === kind ? null : kind;
      engine.pending = next;
      setPending(next);
    },
    [engine, selection, tryBuild],
  );

  return (
    <div className={styles.shell}>
      <div className={styles.root}>
        <GameHud stats={stats} />

        <div className={styles.body}>
          <div ref={wrapRef} className={styles.canvasWrap}>
            <canvas ref={canvasRef} onPointerDown={handlePointer} className={styles.canvas} />

            {notice && mode === 'playing' && !paused ? (
              <div className={styles.notice}>
                <p role="status" className={styles.noticeText}>
                  {notice}
                </p>
              </div>
            ) : null}
          </div>

          <GameDock
            stats={stats}
            selection={selection}
            pending={pending}
            speed={speed}
            paused={paused}
            muted={muted}
            onPick={pick}
            onToggleMute={toggleMute}
            onHoverKind={(kind) => {
              hoverKindRef.current = kind;
            }}
            nextWave={nextWave}
            inspected={inspected}
            onCloseInspect={() => setInspected(null)}
            best={best}
            onUpgrade={() => {
              if (!selection) return;
              if (engine.upgrade(selection.col, selection.row)) {
                const build = engine.buildAt(selection.col, selection.row);
                sound.upgrade(build?.level ?? 1);
              } else if (engine.refusal) {
                flash(REFUSAL_TEXT[engine.refusal]);
                sound.refuse();
              }
              syncSelection();
            }}
            onUnlockSkill={() => {
              if (!selection) return;
              if (engine.unlockSkill(selection.col, selection.row)) {
                sound.upgrade(MAX_LEVEL + 1);
              } else if (engine.refusal) {
                flash(REFUSAL_TEXT[engine.refusal]);
                sound.refuse();
              }
              syncSelection();
            }}
            onSell={() => {
              if (!selection) return;
              if (engine.sell(selection.col, selection.row)) sound.sell();
              engine.selected = null;
              syncSelection();
            }}
            onClose={() => {
              sound.ui();
              engine.selected = null;
              engine.pending = null;
              setPending(null);
              syncSelection();
            }}
            onCallWave={() => {
              if (engine.callWave()) sound.callWave();
            }}
            onSpeed={() => {
              sound.ui();
              setSpeed((value) => {
                const at = SPEED_STEPS.indexOf(value as (typeof SPEED_STEPS)[number]);
                return SPEED_STEPS[(at + 1) % SPEED_STEPS.length]!;
              });
            }}
            onPause={() => {
              sound.ui();
              setPaused((value) => !value);
            }}
          />

          {mode === 'playing' && paused ? (
            <PauseOverlay
              stats={stats}
              onResume={() => setPaused(false)}
              onRestart={restartToIntro}
            />
          ) : null}
          {mode === 'finished' && result && !recorded ? (
            <EndingOverlay result={result} onProceed={proceed} />
          ) : null}
        </div>

        {/* 인트로는 아직 의미 없는 점수판까지 덮는다 (점수판은 자리를 지켜 시작할 때 판이 들썩이지 않게) */}
        {mode === 'intro' ? <IntroOverlay onStart={start} /> : null}
      </div>
    </div>
  );
}
