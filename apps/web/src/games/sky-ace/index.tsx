import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';
import { AIRCRAFTS, HOW_TO_PLAY, getAircraft, type AircraftDef, type AircraftId } from './config';
import { SkyAceEngine, type GameSummary } from './engine';
import { drawPlayerPlane } from './render';
import { SoundManager } from './sound';
import styles from './SkyAce.module.css';

type Screen = { name: 'menu' } | { name: 'playing' } | { name: 'result'; summary: GameSummary };

/**
 * 스카이 에이스 — Canvas 로 그리는 종스크롤 탄막 슈팅.
 * 기체 선택 → 3개 스테이지(각 2단 변신 보스) → 결과 요약 후 onFinish(점수) 한 번 호출.
 * 닉네임 입력·점수 등록·랭킹은 GamePage 의 공통 결과창이 처리한다.
 */
export default function SkyAce({ onFinish }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SkyAceEngine | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [sound] = useState(() => new SoundManager());
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [selected, setSelected] = useState<AircraftId>('p38');
  /** 이스터에그 — 홈 화면의 SKY ACE 제목을 누르면 숨은 기체가 나타난다 */
  const [secretOpen, setSecretOpen] = useState(false);
  const aircrafts = AIRCRAFTS.filter((a) => !a.secret || secretOpen);
  const [paused, setPaused] = useState(false);
  /** 설정 창에서 '게임 홈으로' 를 눌러 확인을 기다리는 중 */
  const [confirmHome, setConfirmHome] = useState(false);
  const [muted, setMuted] = useState(() => sound.isMuted);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => () => sound.destroy(), [sound]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: SkyAceEngine;
    try {
      engine = new SkyAceEngine(canvas, sound, {
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
      sound.stopBgm();
    };
  }, [sound]);

  function start() {
    sound.unlock(); // 브라우저 자동재생 정책 — 클릭 안에서 오디오를 깨운다
    sound.play('select');
    engineRef.current?.start(selected);
    setPaused(false);
    setScreen({ name: 'playing' });
  }

  function pause() {
    if (screen.name !== 'playing' || paused) return;
    engineRef.current?.pause();
    sound.suspend();
    setPaused(true);
  }

  function resume() {
    engineRef.current?.resume();
    sound.resume();
    setPaused(false);
    setConfirmHome(false);
  }

  /** 진행 중인 판을 버리고 기체 선택 화면(게임 홈)으로 */
  function goHome() {
    engineRef.current?.idle();
    sound.resume();
    setPaused(false);
    setConfirmHome(false);
    setScreen({ name: 'menu' });
  }

  function toggleSecret() {
    sound.unlock();
    const next = !secretOpen;
    setSecretOpen(next);
    if (next) {
      sound.play('secret');
      setSelected('phoenix');
    } else {
      sound.play('select');
      if (getAircraft(selected).secret) setSelected('p38');
    }
  }

  function toggleMute() {
    sound.unlock();
    sound.setMuted(!muted);
    setMuted(!muted);
  }

  // 메뉴: ←/→ 로 기체 선택, Enter 로 출격 · 게임 중: Esc/P 일시정지
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (screen.name === 'menu') {
        const idx = aircrafts.findIndex((a) => a.id === selected);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const next =
            (idx + (e.key === 'ArrowLeft' ? -1 : 1) + aircrafts.length) % aircrafts.length;
          setSelected(aircrafts[next]!.id);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          start();
        }
      } else if (screen.name === 'playing' && !e.repeat) {
        const k = e.key.toLowerCase();
        if (k === 'escape' || k === 'p') {
          e.preventDefault();
          if (confirmHome) setConfirmHome(false);
          else if (paused) resume();
          else pause();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 다른 탭·창으로 가면 자동 일시정지
  useEffect(() => {
    if (screen.name !== 'playing' || paused) return;
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

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="스카이 에이스 게임 화면" />

        {screen.name === 'playing' && (
          <>
            <div className={styles.topButtons}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleMute();
                }}
                aria-label={muted ? '소리 켜기' : '소리 끄기'}
              >
                {muted ? '🔇' : '🔊'}
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={(e) => {
                  e.currentTarget.blur();
                  pause();
                }}
                aria-label="설정 (일시정지)"
              >
                ⚙
              </button>
            </div>
            <button
              type="button"
              className={styles.bombBtn}
              onPointerDown={(e) => {
                e.preventDefault();
                engineRef.current?.useBomb();
              }}
            >
              BOMB
            </button>
          </>
        )}

        {engineError && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <p>{engineError}</p>
            </div>
          </div>
        )}

        {screen.name === 'menu' && !engineError && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={`${styles.logo} ${secretOpen ? styles.logoSecret : ''}`}>
                {/* 이스터에그: 제목을 누르면 글씨가 회색으로 바뀌고 숨은 기체가 나타난다 */}
                <button type="button" className={styles.logoButton} onClick={toggleSecret}>
                  SKY <span>ACE</span>
                </button>
              </h2>
              <p className={styles.subtitle}>기체를 고르고 출격하세요</p>
              <div className={styles.aircraftList} role="radiogroup" aria-label="기체 선택">
                {aircrafts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={selected === a.id}
                    className={`${styles.aircraft} ${a.secret ? styles.aircraftSecret : ''} ${selected === a.id ? styles.aircraftOn : ''}`}
                    onClick={() => {
                      sound.unlock();
                      sound.play('select');
                      setSelected(a.id);
                    }}
                  >
                    <AircraftPreview def={a} active={selected === a.id} />
                    <span className={styles.aircraftLabel}>
                      <strong>{a.name}</strong>
                      <span className={styles.aircraftType}>
                        {a.secret ? `✦ ${a.type} ✦` : a.type}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <AircraftSpec def={getAircraft(selected)} />
              <button type="button" className={styles.startBtn} onClick={start}>
                출격!
              </button>
              <ul className={styles.howto}>
                {HOW_TO_PLAY.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {screen.name === 'playing' && paused && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              {confirmHome ? (
                <>
                  <h2 className={styles.panelTitle}>게임 홈으로 갈까요?</h2>
                  <p className={styles.panelText}>
                    지금 판은 저장되지 않고, 점수도 랭킹에 등록되지 않아요.
                  </p>
                  <div className={styles.row}>
                    <button type="button" className={styles.dangerBtn} onClick={goHome}>
                      홈으로 이동
                    </button>
                    <button
                      type="button"
                      className={styles.subBtn}
                      onClick={() => setConfirmHome(false)}
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className={styles.panelTitle}>⚙ 설정</h2>
                  <p className={styles.panelText}>게임이 일시정지됐어요</p>
                  <div className={styles.menuList}>
                    <button type="button" className={styles.startBtn} onClick={resume}>
                      ▶ 계속하기
                    </button>
                    <button type="button" className={styles.subBtn} onClick={toggleMute}>
                      {muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
                    </button>
                    <button
                      type="button"
                      className={styles.subBtn}
                      onClick={() => setConfirmHome(true)}
                    >
                      🏠 게임 홈으로
                    </button>
                  </div>
                  <p className={styles.hint}>Esc 또는 P 로도 계속할 수 있어요</p>
                </>
              )}
            </div>
          </div>
        )}

        {screen.name === 'result' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>
                {screen.summary.allClear ? '🏆 올 클리어!' : '💥 게임 오버'}
              </h2>
              <p className={styles.bigScore}>{screen.summary.score.toLocaleString()}점</p>
              <dl className={styles.summary}>
                <dt>기체</dt>
                <dd>{screen.summary.aircraftName}</dd>
                <dt>도달 스테이지</dt>
                <dd>
                  {screen.summary.stageReached} ({screen.summary.stagesCleared}개 클리어)
                </dd>
                <dt>격추한 적</dt>
                <dd>{screen.summary.kills}대</dd>
                <dt>버틴 시간</dt>
                <dd>{formatTime(screen.summary.timeSec)}</dd>
              </dl>
              <p className={styles.hint}>결과창에서 닉네임을 입력하면 랭킹에 등록돼요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s.toString().padStart(2, '0')}초`;
}

function AircraftSpec({ def }: { def: AircraftDef }) {
  return (
    <dl className={styles.spec}>
      <dt>주포</dt>
      <dd>{def.main}</dd>
      <dt>서브</dt>
      <dd>{def.sub}</dd>
      <dt>필살기</dt>
      <dd>{def.bomb}</dd>
      <dt>능력치</dt>
      <dd className={def.secret ? styles.specSecret : undefined}>
        목숨 {def.lives} · 필살기 {def.bombs}개 · 화력 ×{def.bombPower} · 속도{' '}
        {Math.round(def.speed * 100)}%
      </dd>
    </dl>
  );
}

/** 기체 선택 카드의 미니 캔버스 — 선택된 기체는 추진 불꽃이 움직인다 */
function AircraftPreview({ def, active }: { def: AircraftDef; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 숨은 기체는 날개 오라가 넓어서 조금 작게 그린다
      const scale = def.secret ? 1.05 : 1.6;
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2 - 4);
      drawPlayerPlane(
        ctx,
        def.id,
        0,
        Math.sin(t * 3) * (active ? 2 : 0),
        t,
        0,
        def.color,
        def.accent,
      );
      if (active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [def, active]);
  return <canvas ref={ref} width={96} height={96} className={styles.preview} aria-hidden />;
}
