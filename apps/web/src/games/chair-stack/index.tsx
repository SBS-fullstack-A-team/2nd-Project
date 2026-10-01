import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';
import { CONTROLS, DIFFICULTIES, HOW_TO_PLAY, type Difficulty } from './config';
import { ChairStackEngine, type GameSummary, type Hud } from './engine';
import styles from './ChairStack.module.css';

type Screen = { name: 'menu' } | { name: 'playing' } | { name: 'result'; summary: GameSummary };

/** 휠 한 번에 너무 많이 돌지 않게 — 이 간격(ms) 안의 휠은 한 번으로 본다 */
const WHEEL_THROTTLE_MS = 120;

/**
 * 의자 탑 쌓기 — matter-js 물리로 의자를 떨어뜨려 높이 쌓는 게임.
 * 난이도 선택 → 의자를 옮기고 돌려서 떨어뜨리기 반복 → 하나라도 받침대 아래로 떨어지면 끝.
 * 점수는 최고 높이(cm). 점수 등록·랭킹은 GamePage 의 공통 결과창이 처리한다.
 */
export default function ChairStack({ onFinish }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChairStackEngine | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [hud, setHud] = useState<Hud | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [paused, setPaused] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: ChairStackEngine;
    try {
      engine = new ChairStackEngine(canvas, {
        onHud: setHud,
        onEnd: (summary) => {
          setScreen({ name: 'result', summary });
          // onFinish 는 한 판에 한 번만
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinishRef.current(summary.score);
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

  function start() {
    const def = DIFFICULTIES.find((d) => d.id === difficulty)!;
    engineRef.current?.start(def);
    setPaused(false);
    setScreen({ name: 'playing' });
  }

  function pause() {
    if (screen.name !== 'playing' || paused) return;
    engineRef.current?.pause();
    engineRef.current?.setMoveDir(0);
    setPaused(true);
  }

  function resume() {
    engineRef.current?.resume();
    setPaused(false);
  }

  // 키보드 — ←/→ 이동, ↑·X/Z 회전, 스페이스·↓ 떨어뜨리기, Esc·P 일시정지, 메뉴에서 Enter 시작
  useEffect(() => {
    const held = { left: false, right: false };
    const syncMove = () =>
      engineRef.current?.setMoveDir((held.right ? 1 : 0) - (held.left ? 1 : 0));

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (screen.name === 'menu') {
        if (k === 'arrowleft' || k === 'arrowright') {
          e.preventDefault();
          setDifficulty((d) => (d === 'easy' ? 'hard' : 'easy'));
        } else if (k === 'enter') {
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
      const engine = engineRef.current;
      if (k === 'arrowleft' || k === 'a') {
        e.preventDefault();
        held.left = true;
        syncMove();
      } else if (k === 'arrowright' || k === 'd') {
        e.preventDefault();
        held.right = true;
        syncMove();
      } else if (k === 'arrowup' || k === 'w' || k === 'x') {
        e.preventDefault();
        if (!e.repeat) engine?.rotate(1);
      } else if (k === 'z') {
        e.preventDefault();
        if (!e.repeat) engine?.rotate(-1);
      } else if (k === ' ' || k === 'arrowdown' || k === 's') {
        e.preventDefault();
        if (!e.repeat) engine?.drop();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') held.left = false;
      else if (k === 'arrowright' || k === 'd') held.right = false;
      else return;
      syncMove();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engineRef.current?.setMoveDir(0);
    };
  });

  // 마우스 휠로 돌리기 — 페이지가 스크롤되지 않게 passive: false 로 등록
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;
    let last = 0;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const now = performance.now();
      if (now - last < WHEEL_THROTTLE_MS || e.deltaY === 0) return;
      last = now;
      engineRef.current?.rotate(e.deltaY > 0 ? 1 : -1);
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [playing]);

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

  // 마우스: 움직이면 따라오고 클릭하면 떨어뜨린다 · 터치: 끌어서 옮기고 아래 버튼으로 떨어뜨린다
  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    if (e.pointerType === 'mouse' || e.buttons > 0)
      engineRef.current?.setHoldXFromClient(e.clientX);
  }
  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    if (e.pointerType !== 'mouse') {
      e.currentTarget.setPointerCapture(e.pointerId);
      engineRef.current?.setHoldXFromClient(e.clientX);
    }
  }
  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    if (e.pointerType === 'mouse' && e.button === 0) engineRef.current?.drop();
  }

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="의자 탑 쌓기 게임 화면"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        />

        {screen.name === 'playing' && hud && (
          <div className={styles.hud}>
            <span className={styles.hudHeight}>
              {hud.height}
              <small>cm</small>
            </span>
            <span className={styles.hudSub}>
              {difficulty === 'easy' ? '쉬움' : '어려움'} · 최고 {hud.best}cm · 의자 {hud.chairs}개
            </span>
          </div>
        )}

        {screen.name === 'playing' && !paused && (
          <button type="button" className={styles.pauseBtn} onClick={pause} aria-label="일시정지">
            ❚❚
          </button>
        )}

        {engineError && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <p>{engineError}</p>
            </div>
          </div>
        )}

        {!engineError && screen.name === 'menu' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={styles.title}>🪑 의자 탑 쌓기</h2>
              <ul className={styles.rules}>
                {HOW_TO_PLAY.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <dl className={styles.controls}>
                {CONTROLS.map((c) => (
                  <div key={c.action}>
                    <dt>{c.keys}</dt>
                    <dd>{c.action}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.hint}>휴대폰은 화면을 끌어서 옮기고 아래 버튼을 눌러요</p>
              <div className={styles.levels} role="radiogroup" aria-label="난이도">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={d.id === difficulty}
                    className={`${styles.level} ${d.id === difficulty ? styles.levelOn : ''}`}
                    onClick={() => setDifficulty(d.id)}
                  >
                    <strong>{d.label}</strong>
                    <span className={styles.levelDesc}>{d.description}</span>
                  </button>
                ))}
              </div>
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
            <div className={styles.panel}>
              <h2 className={styles.title}>💥 와르르!</h2>
              <p className={styles.bigScore}>{screen.summary.score.toLocaleString()}점</p>
              <p className={styles.summary}>
                {screen.summary.difficulty.label} · 최고 높이 {screen.summary.bestHeight}cm
                {screen.summary.difficulty.multiplier !== 1 &&
                  ` × ${screen.summary.difficulty.multiplier}`}
              </p>
              <p className={styles.summary}>
                의자 {screen.summary.chairs}개를 쌓았어요
                {screen.summary.bestHeight >= 100 &&
                  ` (약 ${(screen.summary.bestHeight / 100).toFixed(1)}m)`}
              </p>
              <p className={styles.hint}>결과창에서 닉네임을 입력하면 랭킹에 등록돼요</p>
            </div>
          </div>
        )}
      </div>

      {screen.name === 'playing' && (
        <div className={styles.pad}>
          <button
            type="button"
            className="btn"
            onClick={() => engineRef.current?.rotate(-1)}
            disabled={paused}
            aria-label="왼쪽으로 돌리기"
          >
            ⟲
          </button>
          <button
            type="button"
            className={`btn btn-primary ${styles.dropBtn}`}
            onClick={() => engineRef.current?.drop()}
            disabled={paused}
          >
            떨어뜨리기
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => engineRef.current?.rotate(1)}
            disabled={paused}
            aria-label="오른쪽으로 돌리기"
          >
            ⟳
          </button>
        </div>
      )}
    </div>
  );
}
