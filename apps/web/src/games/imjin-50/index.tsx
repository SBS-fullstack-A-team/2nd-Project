import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';

import {
  BUILDS,
  MAX_LEVEL,
  towerChain,
  towerDps,
  towerRange,
  towerSlow,
  towerSplash,
  upgradeCost,
  type BuildKind,
} from './engine/config';
import { Engine, REFUSAL_TEXT, type SimEvent, type Snapshot } from './engine/engine';
import { colOf, index, isBuildable, rowOf } from './engine/maze';
import { cellFromPoint, drawGame, layout, type View } from './engine/render';
import { SoundEngine, mapSimEvent } from './engine/audio';

import { GameDock, type DockSelection } from './game-dock';
import { GameHud } from './game-hud';
import { IntroOverlay, PauseOverlay } from './game-overlays';
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

/** 그 시설만의 고유 능력치 — 업그레이드가 데미지·사거리 말고 무엇을 사는지 보여준다. */
function traitOf(kind: BuildKind, level: number): string | null {
  if (kind === 'hwacha') return '연쇄 ' + towerChain(kind, level) + '명';
  if (kind === 'cannon') return '폭발 ' + towerSplash(kind, level).toFixed(2) + '칸';
  if (kind === 'caltrop') return '둔화 ' + Math.round(towerSlow(kind, level) * 100) + '%';
  return null;
}

/**
 * 임진 50 — 벽으로 길을 접어 쉰 번의 파도를 막는 미로형 타워디펜스.
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

  const [stats, setStats] = useState<Snapshot>(() => engine.snapshot());
  const [selection, setSelection] = useState<DockSelection | null>(null);
  const [pending, setPending] = useState<BuildKind | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>('intro');
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

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
      });
      return;
    }
    const def = BUILDS[build.kind];
    setSelection({
      col,
      row,
      kind: build.kind,
      level: build.level,
      dps: towerDps(build.kind, build.level),
      range: towerRange(build.kind, build.level),
      trait: traitOf(build.kind, build.level),
      nextCost:
        def.upgradable && build.level < MAX_LEVEL ? upgradeCost(build.kind, build.level) : null,
      refund: Math.floor(build.invested * 0.6),
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
        engine.update(dt * speedRef.current);
        const events = engine.drainEvents();
        if (events.length) playSimEvents(sound, events);
      }

      const view = viewRef.current;
      if (view) drawGame(ctx, engine, view, now / 1000);

      tick += dt;
      if (tick >= 0.1) {
        tick = 0;
        setStats(engine.snapshot());
        const lowLives = engine.lives > 0 && engine.lives <= 4 && !engine.finished;
        if (lowLives) sound.startHeartbeat();
        else sound.stopHeartbeat();
        if (engine.finished && modeRef.current === 'playing') {
          sound.stopHeartbeat();
          setMode('finished');
          finish(engine.result().score);
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
  }, [engine, sound, finish]);

  const start = useCallback(() => {
    sound.unlock();
    sound.stopHeartbeat();
    engine.reset();
    setPending(null);
    setSelection(null);
    setPaused(false);
    setStats(engine.snapshot());
    flash(null);
    setMode('playing');
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
      const { col, row } = cellFromPoint(view, event.clientX - rect.left, event.clientY - rect.top);

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
    <div className={styles.root}>
      <GameHud stats={stats} />

      <div ref={wrapRef} className={styles.canvasWrap}>
        <canvas ref={canvasRef} onPointerDown={handlePointer} className={styles.canvas} />

        {notice && mode === 'playing' && !paused ? (
          <div className={styles.notice}>
            <p role="status" className={styles.noticeText}>
              {notice}
            </p>
          </div>
        ) : null}

        {mode === 'intro' ? <IntroOverlay onStart={start} /> : null}
        {mode === 'playing' && paused ? (
          <PauseOverlay onResume={() => setPaused(false)} onRestart={start} />
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
          setSpeed((value) => (value === 1 ? 2 : 1));
        }}
        onPause={() => {
          sound.ui();
          setPaused((value) => !value);
        }}
      />
    </div>
  );
}
