import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { GameProps } from '@simsim/shared';
import { CONTROLS, FORMS, TIPS, type FormDef, type FormId } from './config';
import { CatBladeEngine, type GameSummary } from './engine';
import type { Action } from './player';
import { drawCat } from './renderCat';
import { SoundManager } from './sound';
import styles from './CatBlade.module.css';

type Screen = { name: 'menu' } | { name: 'playing' } | { name: 'result'; summary: GameSummary };

/** 터치 기기인지 (화면 버튼을 보여 줄지) */
function detectTouch() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

const BIG_KEY = 'simsim:cat-blade:big:v1';

/** 크게 보기 설정 (기본 켜짐) */
function loadBig() {
  try {
    return localStorage.getItem(BIG_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * 캣 블레이드 — Canvas 로 그리는 2D 로그라이크 액션.
 * 무적 구르기·패링·5가지 폼 체인지로 3개 스테이지의 2페이즈 보스를 쓰러뜨린다.
 * 게임이 끝나면 결과 요약을 보여 주고 onFinish(점수) 를 한 번 호출한다.
 * 닉네임 입력·점수 등록·랭킹은 GamePage 의 공통 결과창이 처리한다.
 */
export default function CatBlade({ onFinish }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CatBladeEngine | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [sound] = useState(() => new SoundManager());
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [paused, setPaused] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [muted, setMuted] = useState(() => sound.isMuted);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [touch, setTouch] = useState(detectTouch);
  const [infoForm, setInfoForm] = useState<FormDef>(FORMS[0] as FormDef);
  /** 마지막으로 누른 고양이 카드 — 같은 카드를 빠르게 두 번 누르면 각성 폼으로 시작 (이스터에그) */
  const lastTapRef = useRef<{ id: FormId; at: number } | null>(null);
  /** 크게 보기 — 게임 중에는 브라우저 화면 전체를 무대로 쓴다 */
  const [big, setBig] = useState(loadBig);

  // 크게 보기로 바꾸면 캔버스가 새로 만들어지므로 엔진이 새 캔버스에 그리도록 옮겨 준다
  const setCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el) engineRef.current?.attach(el);
  }, []);

  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => () => sound.destroy(), [sound]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: CatBladeEngine;
    try {
      engine = new CatBladeEngine(canvas, sound, {
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
  }, [sound]);

  /** upgrade 를 주면 그 고양이가 각성한 채로 시작한다 */
  function start(upgrade: FormId | null = null) {
    if (finishedRef.current) return; // 다시 하기는 GamePage 가 새로 마운트해서 처리
    sound.unlock(); // 브라우저 자동재생 정책 — 클릭 안에서 오디오를 깨운다
    sound.play('meow');
    engineRef.current?.start(upgrade);
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

  /** 진행 중인 판을 버리고 게임 홈(메뉴)으로 */
  function goHome() {
    engineRef.current?.idle();
    sound.resume();
    setPaused(false);
    setConfirmHome(false);
    setScreen({ name: 'menu' });
  }

  function toggleMute() {
    sound.unlock();
    sound.setMuted(!muted);
    setMuted(!muted);
  }

  function toggleBig() {
    const next = !big;
    setBig(next);
    try {
      localStorage.setItem(BIG_KEY, next ? '1' : '0');
    } catch {
      // 저장 실패는 무시
    }
  }

  function pad(action: Action, down: boolean) {
    engineRef.current?.setVirtual(action, down);
  }

  // 메뉴: Enter 로 시작 · 게임 중: Esc/P 일시정지
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (screen.name === 'menu' && e.key === 'Enter' && !engineError) {
        e.preventDefault();
        start();
      } else if (
        screen.name === 'playing' &&
        !e.repeat &&
        (e.code === 'Escape' || e.code === 'KeyP')
      ) {
        e.preventDefault();
        if (confirmHome) setConfirmHome(false);
        else if (paused) resume();
        else pause();
      } else if (screen.name === 'playing' && !e.repeat && e.code === 'KeyF') {
        e.preventDefault();
        toggleBig();
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

  const playing = screen.name === 'playing';
  const grow = (screen.name === 'menu' || screen.name === 'result') && !engineError;
  const bigOn = big && playing;

  // 크게 보기 중에는 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!bigOn) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [bigOn]);

  const stageEl = (
    <div className={`${styles.stage} ${grow ? styles.stageGrow : ''}`}>
      <canvas ref={setCanvas} className={styles.canvas} aria-label="캣 블레이드 게임 화면" />

      {playing && (
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
          <button
            type="button"
            className={styles.iconBtn}
            onClick={(e) => {
              e.currentTarget.blur();
              toggleBig();
            }}
            aria-label={big ? '작게 보기' : '크게 보기'}
            title={big ? '작게 보기 (F)' : '크게 보기 (F)'}
          >
            {big ? '🗗' : '⛶'}
          </button>
        </div>
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
          <div className={`${styles.panel} ${styles.menuPanel}`}>
            <h2 className={styles.logo}>
              CAT <span>BLADE</span>
            </h2>
            <p className={styles.subtitle}>
              캣 블레이드 — 구르고, 받아치고, 변신하라! 3개의 스테이지와 2페이즈 보스가 기다린다냥
            </p>

            <div className={styles.formList} role="list" aria-label="고양이 폼 5종">
              {FORMS.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  role="listitem"
                  className={`${styles.formCard} ${infoForm.id === f.id ? styles.formCardOn : ''}`}
                  style={{ ['--form-color' as string]: f.color }}
                  onClick={() => {
                    // 같은 카드를 빠르게 두 번 (더블클릭 · 더블탭) → 각성 폼으로 바로 시작
                    const now = performance.now();
                    const last = lastTapRef.current;
                    if (last && last.id === f.id && now - last.at < 400) {
                      lastTapRef.current = null;
                      start(f.id);
                      return;
                    }
                    lastTapRef.current = { id: f.id, at: now };
                    sound.unlock();
                    sound.play('select');
                    setInfoForm(f);
                  }}
                >
                  <CatPreview form={f} active={infoForm.id === f.id} />
                  <span className={styles.formName}>
                    <kbd>{i + 1}</kbd> {f.name}
                  </span>
                  <span className={styles.formType}>{f.type}</span>
                </button>
              ))}
            </div>
            <dl className={styles.spec}>
              <dt>기본 공격</dt>
              <dd>{infoForm.attack}</dd>
              <dt>스킬</dt>
              <dd>
                {infoForm.skill} (대기 {infoForm.skillCooldown}초)
              </dd>
              <dt>특징</dt>
              <dd>{infoForm.desc}</dd>
            </dl>

            <button type="button" className={styles.startBtn} onClick={() => start()}>
              ⚔ 모험 시작
            </button>

            <div className={styles.howtoGrid}>
              <ul className={styles.controls}>
                {CONTROLS.map((c) => (
                  <li key={c.keys}>
                    <kbd>{c.keys}</kbd>
                    <span>{c.action}</span>
                  </li>
                ))}
              </ul>
              <ul className={styles.tips}>
                {TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
            <p className={styles.secretHint}>🐾 마음에 드는 고양이를 두 번 연달아 쓰다듬으면…?</p>
            <p className={styles.rotateHint}>📱 휴대폰은 가로로 돌리면 화면이 더 커져요</p>
            <label className={styles.touchToggle}>
              <input type="checkbox" checked={touch} onChange={(e) => setTouch(e.target.checked)} />
              화면 터치 버튼 보이기
            </label>
          </div>
        </div>
      )}

      {playing && paused && (
        <div className={styles.overlay}>
          <div className={`${styles.panel} ${styles.compact}`}>
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
                <h2 className={styles.panelTitle}>⚙ 일시정지</h2>
                <p className={styles.panelText}>숨 고르고 다시 가자냥</p>
                <div className={styles.menuList}>
                  <button type="button" className={styles.startBtn} onClick={resume}>
                    ▶ 계속하기
                  </button>
                  <button type="button" className={styles.subBtn} onClick={toggleMute}>
                    {muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
                  </button>
                  <button type="button" className={styles.subBtn} onClick={() => setTouch(!touch)}>
                    {touch ? '🎮 터치 버튼 숨기기' : '🎮 터치 버튼 보이기'}
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
              {screen.summary.victory ? '🏆 VICTORY!' : '💀 GAME OVER'}
            </h2>
            <p className={styles.bigScore}>{screen.summary.score.toLocaleString()}점</p>
            {screen.summary.awakened && (
              <p className={styles.awakened}>★ {screen.summary.awakened} 각성 모드 ★</p>
            )}
            <dl className={styles.summary}>
              <dt>도달 스테이지</dt>
              <dd>
                {screen.summary.stageReached} ({screen.summary.stagesCleared}개 클리어)
              </dd>
              <dt>{screen.summary.victory ? '클리어 타임' : '플레이 시간'}</dt>
              <dd>{formatTime(screen.summary.timeSec)}</dd>
              <dt>처치한 적</dt>
              <dd>{screen.summary.kills}</dd>
              <dt>패링 성공</dt>
              <dd>{screen.summary.parries}회</dd>
              <dt>최대 콤보</dt>
              <dd>{screen.summary.maxCombo}</dd>
            </dl>
            <dl className={styles.breakdown}>
              {screen.summary.breakdown.map((b) => (
                <div key={b.label} className={styles.breakdownRow}>
                  <dt>{b.label}</dt>
                  <dd>+{b.value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.hint}>결과창에서 닉네임을 입력하면 랭킹에 등록돼요</p>
          </div>
        </div>
      )}
    </div>
  );
  const padEl = playing && touch && <TouchPad onPad={pad} disabled={paused} />;

  return (
    <div className={styles.root}>
      {bigOn ? (
        createPortal(
          <div className={`${styles.bigWrap} ${touch ? styles.bigTouch : ''}`}>
            {stageEl}
            {padEl}
          </div>,
          document.body,
        )
      ) : (
        <>
          {stageEl}
          {padEl}
        </>
      )}
      {bigOn && (
        <div className={styles.bigPlaceholder}>
          🐾 크게 보기로 플레이 중이에요 (F 또는 🗗 로 작게 보기)
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s.toString().padStart(2, '0')}초`;
}

/** 폼 선택 카드의 미니 캔버스 — 선택된 폼은 움직인다 */
function CatPreview({ form, active }: { form: FormDef; active: boolean }) {
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
      ctx.setTransform(1.7, 0, 0, 1.7, canvas.width / 2 - 4, canvas.height - 10);
      // 선택된 폼은 3초마다 한 번 기본 공격 동작을 보여 준다
      const cycle = t % 3;
      const attacking = active && cycle > 2.2;
      drawCat(ctx, {
        x: 0,
        y: 0,
        facing: 1,
        form: form.id,
        pose: attacking ? 'attack' : 'idle',
        t,
        runPhase: 0,
        attackP: attacking ? (cycle - 2.2) / 0.5 : 0,
        attackStep: 0,
        rollAngle: 0,
        flash: 0,
        alpha: 1,
      });
      if (active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [form, active]);
  return <canvas ref={ref} width={96} height={96} className={styles.preview} aria-hidden />;
}

/** 휴대폰용 화면 버튼 — 누르고 있는 동안 키를 누른 것과 같다 */
function TouchPad({
  onPad,
  disabled,
}: {
  onPad: (a: Action, down: boolean) => void;
  disabled: boolean;
}) {
  const bind = (action: Action) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (disabled) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 일부 브라우저는 캡처를 지원하지 않는다
      }
      onPad(action, true);
    },
    onPointerUp: () => onPad(action, false),
    onPointerCancel: () => onPad(action, false),
    onLostPointerCapture: () => onPad(action, false),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  });
  return (
    <div className={styles.pad} aria-label="터치 조작">
      <div className={styles.padMove}>
        <button type="button" className={styles.padBtn} {...bind('left')} aria-label="왼쪽">
          ◀
        </button>
        <button type="button" className={styles.padBtn} {...bind('down')} aria-label="아래">
          ▼
        </button>
        <button type="button" className={styles.padBtn} {...bind('right')} aria-label="오른쪽">
          ▶
        </button>
      </div>
      <div className={styles.padActions}>
        <button
          type="button"
          className={`${styles.padBtn} ${styles.padForm}`}
          {...bind('formNext')}
        >
          폼
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padParry}`} {...bind('parry')}>
          패링
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padSkill}`} {...bind('skill')}>
          스킬
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padRoll}`} {...bind('roll')}>
          구르기
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padJump}`} {...bind('jump')}>
          점프
        </button>
        <button
          type="button"
          className={`${styles.padBtn} ${styles.padAttack}`}
          {...bind('attack')}
        >
          공격
        </button>
      </div>
    </div>
  );
}
