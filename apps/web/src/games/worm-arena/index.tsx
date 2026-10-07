import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';
import {
  BOUNTY_MIN_MASS,
  CONTROLS,
  FEAST_INTERVAL,
  HOW_TO_PLAY,
  POWERS,
  SKINS,
  TRAITS,
  findPower,
  type PowerKind,
} from './config';
import { WormEngine, type Hud, type Summary } from './engine';
import {
  ACHIEVEMENTS,
  HATS,
  MISSION_ALL_XP,
  MISSION_XP,
  applyRun,
  hatGoal,
  hatOf,
  levelOf,
  loadProfile,
  saveProfile,
  skinGoal,
  skinLabel,
  unlockedHats,
  unlockedSkins,
  type Profile,
  type RunReport,
} from './progress';
import { playSound } from './sound';
import styles from './WormArena.module.css';

type Screen =
  { name: 'menu' } | { name: 'playing' } | { name: 'result'; summary: Summary; report: RunReport };

type MenuTab = 'play' | 'guide' | 'missions' | 'collection' | 'stats';

const MENU_TABS: readonly { id: MenuTab; label: string }[] = [
  { id: 'play', label: '🎮 플레이' },
  { id: 'guide', label: '💡 알아두기' },
  { id: 'missions', label: '🎯 오늘의 미션' },
  { id: 'collection', label: '📖 도감' },
  { id: 'stats', label: '📊 기록' },
];

interface Notice {
  id: number;
  text: string;
}

const MUTE_KEY = 'worm-arena:muted';
const TUTORIAL_KEY = 'worm-arena:tutorial-done';

/** 첫 판 안내 — 해 보면 다음 단계로, 시간이 지나도 다음 단계로 */
interface TutorialStep {
  mouse: string;
  touch: string;
  /** 이 시간(초)이 지나면 저절로 넘어간다 */
  seconds: number;
  /** 해냈는지 */
  done: (t: { moved: boolean; ate: number; dashed: boolean }) => boolean;
}

const TUTORIAL: readonly TutorialStep[] = [
  {
    mouse: '🖱️ 마우스를 움직여 방향을 바꿔 보세요',
    touch: '👆 화면을 끌어서 방향을 바꿔 보세요',
    seconds: 8,
    done: (t) => t.moved,
  },
  {
    mouse: '🍬 빛나는 먹이를 먹고 길어져요',
    touch: '🍬 빛나는 먹이를 먹고 길어져요',
    seconds: 12,
    done: (t) => t.ate >= 8,
  },
  {
    mouse: '⚡ 클릭을 꾹 (또는 스페이스) — 대시! 왼쪽 위 게이지만큼 쓸 수 있어요',
    touch: '⚡ 오른쪽 아래 버튼을 꾹 — 대시! 왼쪽 위 게이지만큼 쓸 수 있어요',
    seconds: 10,
    done: (t) => t.dashed,
  },
  {
    mouse: '💥 다른 지렁이 머리 앞을 내 몸으로 막으면 쓰러뜨릴 수 있어요',
    touch: '💥 다른 지렁이 머리 앞을 내 몸으로 막으면 쓰러뜨릴 수 있어요',
    seconds: 6,
    done: () => false,
  },
  {
    mouse: '🧲 파워업 구슬과 ★ 황금 먹이 잔치도 노려 보세요!',
    touch: '🧲 파워업 구슬과 ★ 황금 먹이 잔치도 노려 보세요!',
    seconds: 5,
    done: () => false,
  },
];

function loadPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 이번 판에는 적용된다
  }
}

/**
 * 지렁이 아레나 — 슬리더리오 스타일. AI 지렁이들 사이에서 먹이를 먹고 길어지는 게임.
 * 점수는 가장 길었을 때 길이. 점수 등록·랭킹은 GamePage 의 공통 결과창이 처리한다.
 */
export default function WormArena({ onFinish }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const engineRef = useRef<WormEngine | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [initialMuted] = useState(() => loadPref(MUTE_KEY) === '1');
  const mutedRef = useRef(initialMuted);
  const noticeId = useRef(0);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  // 성장 기록 — 결과 처리(엔진 콜백)에서도 최신 값을 쓰도록 ref 에도 둔다
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const profileRef = useRef(profile);
  const [tab, setTab] = useState<MenuTab>('play');
  const [lockedHint, setLockedHint] = useState<string | null>(null);
  // 첫 판 안내 — 진행 중인 단계 (없으면 null)
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const tutorialRef = useRef({ moved: false, ate: 0, dashed: false, since: 0 });
  const [touchDevice] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
  );
  const [notices, setNotices] = useState<Notice[]>([]);
  /** 화면 가운데 큰 글씨 — 연속 킬 */
  const [banner, setBanner] = useState<Notice | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  function updateProfile(next: Profile) {
    profileRef.current = next;
    setProfile(next);
    saveProfile(next);
    setLockedHint(null);
  }

  function notify(text: string) {
    const id = ++noticeId.current;
    setNotices((prev) => [...prev, { id, text }].slice(-3));
    window.setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 2200);
  }

  function showBanner(text: string) {
    const id = ++noticeId.current;
    setBanner({ id, text });
    window.setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 1600);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: WormEngine;
    try {
      engine = new WormEngine(canvas, {
        onHud: setHud,
        onEnd: (summary) => {
          // 레벨·업적·미션 반영
          const { profile: next, report } = applyRun(profileRef.current, summary);
          profileRef.current = next;
          setProfile(next);
          saveProfile(next);
          setScreen({ name: 'result', summary, report });
          // onFinish 는 한 판에 한 번만
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinishRef.current(summary.score);
          }
        },
        onEvent: (kind, text) => {
          playSound(kind, mutedRef.current);
          if (kind === 'eat') tutorialRef.current.ate += 1;
          if (kind === 'kill') notify(`💥 「${text}」을(를) 쓰러뜨렸어요!`);
          if (kind === 'die') notify(text ? `「${text}」에게 부딪혔어요…` : '벽에 부딪혔어요…');
          if (kind === 'streak' && text) showBanner(text);
          if (kind === 'shield') notify('🛡️ 방패가 막아 줬어요! 얼른 빠져나가요');
          if (kind === 'feast') notify('✨ 황금 먹이 잔치! ★ 쪽으로 가 보세요');
          if (kind === 'bounty' && text) notify(`👑 「${text}」에게 현상금이 걸렸어요!`);
          if (kind === 'bountyClaim' && text) showBanner(`👑 현상금 획득! ${text}`);
          if (kind === 'power' && text) {
            const def = findPower(text as PowerKind);
            notify(`${def.icon} ${def.label} ${def.seconds}초! ${def.tip}`);
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '게임을 시작하지 못했어요.';
      queueMicrotask(() => setEngineError(message));
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const playing = screen.name === 'playing' && !paused;

  // Esc 등으로 전체 화면이 풀려도 버튼 상태를 맞춘다
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  const skins = unlockedSkins(profile);
  const hats = unlockedHats(profile);
  // 잠긴 걸 고른 채로 저장돼 있으면 기본값
  const skin = SKINS.find((s) => s.id === profile.skin && skins.has(s.id)) ?? SKINS[0]!;
  const hat = hats.has(profile.hat) ? hatOf(profile.hat) : HATS[0]!;
  const missionsLeft = profile.daily.missions.filter((m) => !m.done).length;

  function start() {
    engineRef.current?.start(skin.colors, hat.icon);
    // 단계 시작 시각은 첫 확인 때 잰다
    tutorialRef.current = { moved: false, ate: 0, dashed: false, since: -1 };
    setTutorialStep(loadPref(TUTORIAL_KEY) === '1' ? null : 0);
    setHud(null);
    setNotices([]);
    setPaused(false);
    setScreen({ name: 'playing' });
  }

  function pause() {
    if (screen.name !== 'playing' || paused) return;
    engineRef.current?.pause();
    setPaused(true);
  }

  function resume() {
    engineRef.current?.resume();
    setPaused(false);
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    savePref(MUTE_KEY, next ? '1' : '0');
  }

  // 키보드 — ←/→·A/D 돌기, 스페이스·↑·W 가속, Esc·P 일시정지, 메뉴에서 Enter 시작
  useEffect(() => {
    const held = { left: false, right: false };
    const syncTurn = () => {
      tutorialRef.current.moved = true;
      engineRef.current?.setTurn((held.right ? 1 : 0) - (held.left ? 1 : 0));
    };

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      // F — 전체 화면 켜기/끄기 (어느 화면에서나)
      if (k === 'f' && !e.repeat) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (screen.name === 'menu') {
        if (k === 'enter') {
          e.preventDefault();
          start();
        }
        return;
      }
      if (screen.name !== 'playing') return;
      if (k === 'escape' || k === 'p') {
        e.preventDefault();
        if (!e.repeat) {
          if (paused) resume();
          else pause();
        }
        return;
      }
      if (paused) return;
      if (k === 'arrowleft' || k === 'a') {
        e.preventDefault();
        held.left = true;
        syncTurn();
      } else if (k === 'arrowright' || k === 'd') {
        e.preventDefault();
        held.right = true;
        syncTurn();
      } else if (k === ' ' || k === 'arrowup' || k === 'w') {
        e.preventDefault();
        engineRef.current?.setBoost(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') held.left = false;
      else if (k === 'arrowright' || k === 'd') held.right = false;
      else if (k === ' ' || k === 'arrowup' || k === 'w') {
        engineRef.current?.setBoost(false);
        return;
      } else return;
      syncTurn();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engineRef.current?.setTurn(0);
    };
  });

  // 다른 탭·창으로 가면 자동 일시정지
  useEffect(() => {
    if (!playing) return;
    function onVisibility() {
      if (document.visibilityState === 'hidden') pause();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pause);
    };
  });

  // 마우스: 움직이면 그쪽으로, 누르고 있으면 가속 · 터치: 끄는 쪽으로 가고, 가속은 아래 버튼
  // 첫 판 안내 진행 — HUD 가 갱신될 때마다(초당 5번) 확인
  useEffect(() => {
    if (tutorialStep === null || !playing) return;
    const t = tutorialRef.current;
    if (hud?.boosting) t.dashed = true;
    const step = TUTORIAL[tutorialStep];
    if (!step) return;
    if (t.since < 0) t.since = performance.now();
    const elapsed = (performance.now() - t.since) / 1000;
    if (step.done(t) || elapsed >= step.seconds) {
      const next = tutorialStep + 1;
      t.since = performance.now();
      queueMicrotask(() => {
        if (next >= TUTORIAL.length) {
          savePref(TUTORIAL_KEY, '1');
          setTutorialStep(null);
        } else {
          setTutorialStep(next);
        }
      });
    }
  }, [hud, tutorialStep, playing]);

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    tutorialRef.current.moved = true;
    if (e.pointerType === 'mouse' || e.buttons > 0)
      engineRef.current?.setPointer(e.clientX, e.clientY);
  }
  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    engineRef.current?.setPointer(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') engineRef.current?.setBoost(true);
    else e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse') engineRef.current?.setBoost(false);
  }

  return (
    <div className={styles.root}>
      <div ref={stageRef} className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="지렁이 아레나 게임 화면"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {screen.name === 'playing' && hud && (
          <>
            <div className={styles.hud}>
              <span className={styles.length}>
                {hud.length.toLocaleString()}
                <small>길이</small>
              </span>
              <span className={styles.sub}>
                최고 {hud.best.toLocaleString()} · 💥 {hud.kills} · {hud.rank}위/{hud.total}
              </span>
              <span
                className={`${styles.stamina} ${hud.exhausted ? styles.staminaOut : ''}`}
                title="대시 게이지"
              >
                ⚡
                <span className={styles.staminaBar}>
                  <span style={{ width: `${hud.stamina * 100}%` }} />
                </span>
              </span>
              {hud.effects.length > 0 && (
                <span className={styles.effects}>
                  {hud.effects.map((e) => {
                    const def = findPower(e.kind);
                    return (
                      <span key={e.kind} className={styles.effect} title={def.label}>
                        {def.icon}
                        <span className={styles.effectBar}>
                          <span
                            style={{
                              width: `${(e.left / e.max) * 100}%`,
                              background: def.color,
                            }}
                          />
                        </span>
                      </span>
                    );
                  })}
                </span>
              )}
              {hud.feast && <span className={styles.feast}>★ 황금 먹이 잔치 중</span>}
              {hud.bounty && (
                <span className={styles.bounty}>
                  👑 현상금 {hud.bounty.name} · +{hud.bounty.reward}
                </span>
              )}
            </div>
            <ol className={styles.leaders} aria-label="길이 순위">
              {hud.leaders.map((l, i) => (
                <li key={`${l.name}-${i}`} className={l.me ? styles.me : ''}>
                  <span>
                    {i + 1}. {l.bounty && '👑 '}
                    {l.name}
                  </span>
                  <b>{l.length.toLocaleString()}</b>
                </li>
              ))}
              {hud.rank > hud.leaders.length && (
                <li className={styles.me}>
                  <span>{hud.rank}. 나</span>
                  <b>{hud.length.toLocaleString()}</b>
                </li>
              )}
            </ol>
          </>
        )}

        {/* 왼쪽 아래 보조 버튼 — 전체 화면은 어느 화면에서나, 소리·일시정지는 게임 중에만 */}
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? '전체 화면 끄기' : '전체 화면'}
            title={fullscreen ? '전체 화면 끄기 (Esc · F)' : '전체 화면 (F)'}
          >
            {fullscreen ? '🗗' : '⛶'}
          </button>
          {screen.name === 'playing' && (
            <>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={toggleMute}
                aria-label={muted ? '소리 켜기' : '소리 끄기'}
                title={muted ? '소리 켜기' : '소리 끄기'}
              >
                {muted ? '🔇' : '🔊'}
              </button>
              {!paused && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={pause}
                  aria-label="일시정지"
                  title="일시정지 (Esc · P)"
                >
                  ❚❚
                </button>
              )}
            </>
          )}
        </div>

        {/* 터치 가속 버튼 */}
        {playing && (
          <button
            type="button"
            className={`${styles.boostBtn} ${hud?.boosting ? styles.boostOn : ''}`}
            disabled={hud ? !hud.canBoost : false}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              engineRef.current?.setBoost(true);
            }}
            onPointerUp={() => engineRef.current?.setBoost(false)}
            onPointerCancel={() => engineRef.current?.setBoost(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            ⚡ 가속
          </button>
        )}

        {screen.name === 'playing' && tutorialStep !== null && TUTORIAL[tutorialStep] && (
          <div className={styles.tutorial} aria-live="polite">
            <span className={styles.tutorialStep}>
              안내 {tutorialStep + 1}/{TUTORIAL.length}
            </span>
            <p>{touchDevice ? TUTORIAL[tutorialStep].touch : TUTORIAL[tutorialStep].mouse}</p>
            <button
              type="button"
              className={styles.tutorialSkip}
              onClick={() => {
                savePref(TUTORIAL_KEY, '1');
                setTutorialStep(null);
              }}
            >
              건너뛰기
            </button>
          </div>
        )}

        {banner && (
          <p key={banner.id} className={styles.banner} aria-live="polite">
            {banner.text}
          </p>
        )}

        <div className={styles.notices} aria-live="polite">
          {notices.map((n) => (
            <p key={n.id} className={styles.notice}>
              {n.text}
            </p>
          ))}
        </div>

        {engineError && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <p>{engineError}</p>
            </div>
          </div>
        )}

        {!engineError && screen.name === 'menu' && (
          <div className={styles.overlay}>
            <div className={`${styles.panel} ${styles.menuPanel}`}>
              <h2 className={styles.title}>🪱 지렁이 아레나</h2>
              <LevelBar xp={profile.xp} />
              <div className={styles.tabs} role="tablist">
                {MENU_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.id === 'missions' && missionsLeft > 0 && (
                      <span className={styles.dot}>{missionsLeft}</span>
                    )}
                  </button>
                ))}
              </div>

              {tab === 'play' && (
                <>
                  <ul className={styles.rules}>
                    {HOW_TO_PLAY.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className={styles.pickLabel}>내 지렁이 색</p>
                  <div className={styles.skins} role="radiogroup" aria-label="지렁이 색">
                    {SKINS.map((s) => {
                      const open = skins.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={s.id === skin.id}
                          aria-label={open ? s.label : `${s.label} (잠김: ${skinGoal(s.id)})`}
                          title={open ? s.label : `🔒 ${skinGoal(s.id)}`}
                          className={`${styles.skin} ${s.id === skin.id ? styles.skinOn : ''} ${open ? '' : styles.locked}`}
                          style={{ background: swatch(s.colors) }}
                          onClick={() =>
                            open
                              ? updateProfile({ ...profile, skin: s.id })
                              : setLockedHint(`🔒 ${s.label} — ${skinGoal(s.id)}`)
                          }
                        />
                      );
                    })}
                  </div>
                  <p className={styles.pickLabel}>모자</p>
                  <div className={styles.hats} role="radiogroup" aria-label="모자">
                    {HATS.map((h) => {
                      const open = hats.has(h.id);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          role="radio"
                          aria-checked={h.id === hat.id}
                          aria-label={open ? h.label : `${h.label} (잠김: ${hatGoal(h)})`}
                          title={open ? h.label : `🔒 ${hatGoal(h)}`}
                          className={`${styles.hat} ${h.id === hat.id ? styles.skinOn : ''} ${open ? '' : styles.locked}`}
                          onClick={() =>
                            open
                              ? updateProfile({ ...profile, hat: h.id })
                              : setLockedHint(`🔒 ${h.label} — ${hatGoal(h)}`)
                          }
                        >
                          {h.icon || '✕'}
                        </button>
                      );
                    })}
                  </div>
                  <p className={styles.hint}>
                    {lockedHint ?? `${skin.label}${hat.icon ? ` + ${hat.label}` : ''}`}
                  </p>
                  <dl className={styles.controls}>
                    {CONTROLS.map((c) => (
                      <div key={c.action}>
                        <dt>{c.keys}</dt>
                        <dd>{c.action}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={`${styles.hint} ${styles.touchHint}`}>
                    화면을 끌어서 방향을 정하고, ⚡ 버튼으로 가속해요
                  </p>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      savePref(TUTORIAL_KEY, '0');
                      setLockedHint('다음 판에서 처음 안내를 다시 보여 줄게요');
                    }}
                  >
                    처음 안내 다시 보기
                  </button>
                </>
              )}

              {tab === 'missions' && (
                <>
                  <p className={styles.hint}>
                    날마다 바뀌어요 · 하나에 +{MISSION_XP} XP, 모두 깨면 +{MISSION_ALL_XP} XP
                  </p>
                  <ul className={styles.list}>
                    {profile.daily.missions.map((m) => (
                      <li key={m.id} className={m.done ? styles.done : ''}>
                        <span className={styles.listIcon}>{m.done ? '✅' : '🎯'}</span>
                        <span className={styles.listBody}>
                          <strong>{m.text}</strong>
                          <Progress cur={m.progress} max={m.target} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {profile.daily.allDone && (
                    <p className={styles.good}>🎉 오늘의 미션 완료! 내일 또 만나요</p>
                  )}
                </>
              )}

              {tab === 'guide' && (
                <>
                  <p className={styles.pickLabel}>
                    파워업 — 경기장에 떠 있는 아이콘을 머리로 먹어요
                  </p>
                  <ul className={styles.list}>
                    {POWERS.map((p) => (
                      <li key={p.kind}>
                        <span className={styles.listIcon}>{p.icon}</span>
                        <span className={styles.listBody}>
                          <strong>
                            {p.label} <small>· {p.seconds}초</small>
                          </strong>
                          <small>{p.desc}</small>
                        </span>
                      </li>
                    ))}
                    <li>
                      <span className={styles.listIcon}>★</span>
                      <span className={styles.listBody}>
                        <strong>
                          황금 먹이 잔치 <small>· {FEAST_INTERVAL}초마다</small>
                        </strong>
                        <small>
                          경기장 한 곳에 큰 황금 먹이가 쏟아져요. 미니맵의 ★ 를 보고 먼저 가세요. AI
                          도 몰려와요!
                        </small>
                      </span>
                    </li>
                  </ul>
                  <p className={styles.pickLabel}>현상금 지렁이</p>
                  <ul className={styles.list}>
                    <li>
                      <span className={styles.listIcon}>👑</span>
                      <span className={styles.listBody}>
                        <strong>
                          가장 긴 AI 에게 현상금 <small>· 길이 {BOUNTY_MIN_MASS} 이상</small>
                        </strong>
                        <small>
                          머리 위 왕관과 금빛 고리, 화면 끝 👑 화살표로 찾아요. 내가 쓰러뜨리면
                          떨어지는 먹이와 따로 보너스 길이를 받고, 클수록 현상금이 커져요. 다른
                          지렁이가 확실히 더 길어지면 현상금이 옮겨 가요.
                        </small>
                      </span>
                    </li>
                  </ul>
                  <p className={styles.pickLabel}>지렁이 성격 — 이름 앞 아이콘으로 알 수 있어요</p>
                  <ul className={styles.list}>
                    {TRAITS.map((t) => (
                      <li key={t.kind}>
                        <span className={styles.listIcon}>{t.icon || '🪱'}</span>
                        <span className={styles.listBody}>
                          <strong>{t.label}</strong>
                          <small>{t.desc}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.hint}>
                    파워업은 AI 지렁이도 먹어요. 👻 유령 · 🛡️ 방패를 먹은 지렁이는 부딪혀도 안
                    쓰러져요.
                  </p>
                </>
              )}

              {tab === 'collection' && (
                <>
                  <p className={styles.hint}>
                    업적 {profile.achievements.length}/{ACHIEVEMENTS.length} · 깨면 스킨·모자가
                    열려요
                  </p>
                  <ul className={styles.list}>
                    {ACHIEVEMENTS.map((a) => {
                      const done = profile.achievements.includes(a.id);
                      const [cur, max] = a.progress(profile.life);
                      const reward = a.reward.skin
                        ? `🎨 ${skinLabel(a.reward.skin)}`
                        : `${hatOf(a.reward.hat ?? 'none').icon} ${hatOf(a.reward.hat ?? 'none').label}`;
                      return (
                        <li key={a.id} className={done ? styles.done : ''}>
                          <span className={styles.listIcon}>{done ? a.icon : '🔒'}</span>
                          <span className={styles.listBody}>
                            <strong>
                              {a.title} <small>· {a.goal}</small>
                            </strong>
                            {done ? (
                              <small className={styles.good}>달성! 보상: {reward}</small>
                            ) : (
                              <>
                                <Progress cur={cur} max={max} />
                                <small>보상: {reward}</small>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {tab === 'stats' && (
                <dl className={styles.controls}>
                  {[
                    ['플레이한 판', `${profile.life.games}판`],
                    ['최고 길이', profile.life.bestLength.toLocaleString()],
                    ['가장 오래 버틴 시간', formatSeconds(profile.life.bestSeconds)],
                    ['한 판 최다 킬', `${profile.life.bestKills}마리`],
                    ['최고 연속 킬', `${profile.life.bestStreak}연속`],
                    ['누적 킬', `${profile.life.kills.toLocaleString()}마리`],
                    ['누적 먹이', `${profile.life.food.toLocaleString()}개`],
                    ['누적 황금 먹이', `${profile.life.golden.toLocaleString()}개`],
                    ['누적 파워업', `${profile.life.powerups}개`],
                    ['1위 찍은 판', `${profile.life.firstPlaces}판`],
                    ['미션 완료한 날', `${profile.life.missionDays}일`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <button type="button" className="btn btn-primary" onClick={start}>
                시작하기
              </button>
            </div>
          </div>
        )}

        {screen.name === 'playing' && paused && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={styles.title}>일시정지</h2>
              <button type="button" className="btn btn-primary" onClick={resume}>
                계속하기
              </button>
              <p className={styles.hint}>Esc 또는 P 로도 계속할 수 있어요</p>
            </div>
          </div>
        )}

        {screen.name === 'result' && (
          <div className={styles.overlay}>
            <div className={`${styles.panel} ${styles.menuPanel}`}>
              <h2 className={styles.title}>💫 꿈틀 끝!</h2>
              <p className={styles.bigScore}>{screen.summary.score.toLocaleString()}</p>
              <p className={styles.summary}>
                {screen.report.newBestLength ? (
                  <span className={styles.record}>
                    🎉 개인 신기록! (이전 {screen.report.prevBestLength.toLocaleString()})
                  </span>
                ) : screen.report.prevBestLength > 0 ? (
                  `가장 길었을 때 길이 · 내 최고 ${screen.report.prevBestLength.toLocaleString()}까지 ${Math.max(0, screen.report.prevBestLength - screen.summary.score).toLocaleString()} 남음`
                ) : (
                  '가장 길었을 때 길이'
                )}
              </p>

              <div className={styles.xpBox}>
                <span>
                  +{screen.report.xpGained} XP
                  {screen.report.levelAfter > screen.report.levelBefore && (
                    <b className={styles.levelUp}> 🆙 레벨 {screen.report.levelAfter}!</b>
                  )}
                </span>
                <LevelBar xp={profile.xp} />
              </div>

              {(screen.report.newAchievements.length > 0 ||
                screen.report.missionsDone.length > 0) && (
                <ul className={styles.list}>
                  {screen.report.newAchievements.map((a) => (
                    <li key={a.id} className={styles.done}>
                      <span className={styles.listIcon}>{a.icon}</span>
                      <span className={styles.listBody}>
                        <strong>업적 달성 · {a.title}</strong>
                        <small className={styles.good}>
                          {a.reward.skin
                            ? `🎨 「${skinLabel(a.reward.skin)}」 스킨이 열렸어요!`
                            : `${hatOf(a.reward.hat ?? 'none').icon} 「${hatOf(a.reward.hat ?? 'none').label}」 모자가 열렸어요!`}
                        </small>
                      </span>
                    </li>
                  ))}
                  {screen.report.missionsDone.map((m) => (
                    <li key={m.id} className={styles.done}>
                      <span className={styles.listIcon}>✅</span>
                      <span className={styles.listBody}>
                        <strong>미션 완료 · {m.text}</strong>
                        <small className={styles.good}>+{MISSION_XP} XP</small>
                      </span>
                    </li>
                  ))}
                  {screen.report.allMissionsDone && (
                    <li className={styles.done}>
                      <span className={styles.listIcon}>🎉</span>
                      <span className={styles.listBody}>
                        <strong>오늘의 미션 모두 완료!</strong>
                        <small className={styles.good}>+{MISSION_ALL_XP} XP</small>
                      </span>
                    </li>
                  )}
                </ul>
              )}

              {screen.report.nextGoal && (
                <div className={styles.nextGoal}>
                  <small>
                    다음 해금 · {screen.report.nextGoal.achievement.icon}{' '}
                    {screen.report.nextGoal.achievement.goal}
                  </small>
                  <Progress
                    cur={screen.report.nextGoal.current}
                    max={screen.report.nextGoal.target}
                  />
                </div>
              )}

              <dl className={styles.controls}>
                <div>
                  <dt>쓰러뜨린 지렁이</dt>
                  <dd>{screen.summary.kills}마리</dd>
                </div>
                <div>
                  <dt>최고 순위</dt>
                  <dd>{screen.summary.bestRank < 99 ? `${screen.summary.bestRank}위` : '-'}</dd>
                </div>
                <div>
                  <dt>버틴 시간</dt>
                  <dd>{formatSeconds(screen.summary.seconds)}</dd>
                </div>
                <div>
                  <dt>마지막</dt>
                  <dd>
                    {screen.summary.by ? `「${screen.summary.by}」에게 부딪힘` : '벽에 부딪힘'}
                  </dd>
                </div>
              </dl>
              <p className={styles.hint}>결과창에서 닉네임을 입력하면 랭킹에 등록돼요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSeconds(sec: number): string {
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

/** 스킨 미리보기 줄무늬 */
function swatch(colors: readonly string[]): string {
  return `repeating-linear-gradient(90deg, ${colors
    .map((c, i) => `${c} ${i * 8}px ${(i + 1) * 8}px`)
    .join(', ')})`;
}

function Progress({ cur, max }: { cur: number; max: number }) {
  const ratio = Math.min(1, cur / max);
  return (
    <span className={styles.progress}>
      <span className={styles.progressBar}>
        <span style={{ width: `${ratio * 100}%` }} />
      </span>
      <small>
        {Math.min(cur, max).toLocaleString()}/{max.toLocaleString()}
      </small>
    </span>
  );
}

function LevelBar({ xp }: { xp: number }) {
  const { level, into, need } = levelOf(xp);
  return (
    <span className={styles.levelBar}>
      <b>Lv.{level}</b>
      <span className={styles.progressBar}>
        <span style={{ width: `${(into / need) * 100}%` }} />
      </span>
      <small>
        {into}/{need} XP
      </small>
    </span>
  );
}
