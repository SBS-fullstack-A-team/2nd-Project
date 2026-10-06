import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DURATIONS,
  MAX_HISTORY,
  MAX_ITEMS,
  MIN_ITEMS,
  NEAR_MISS_CHANCE,
  type DurationKey,
} from './config';
import {
  applyRemoved,
  layoutSlices,
  parseItems,
  pickWeighted,
  secureRandom,
  type Slice,
} from './items';
import { playFanfare, playTick, unlockSound } from './sound';
import { drawWheel, sliceAtPointer, targetRotation } from './wheel';
import styles from './RouletteWheel.module.css';

/** 항목은 이 브라우저에만 저장해 둔다 (다음 방송 때 다시 입력하지 않아도 되게) */
const STORAGE_KEY = 'simsim:roulette-wheel';
const SAMPLE = '노래 한 곡\n애교 3종\n물 한 잔 원샷\n스쿼트 20개\n꽝*2\n다음 판 면제';

interface Picked {
  label: string;
  color: string;
}

interface Spin {
  startedAt: number;
  from: number;
  to: number;
  durationMs: number;
  winner: Slice;
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  color: string;
}

function load(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function save(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 창 등) — 저장 없이 진행
  }
}

/** 끝으로 갈수록 천천히 — 마지막에 칸 경계를 하나씩 '딱… 딱…' 넘는다 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * 돌림판 룰렛 — 벌칙·미션·후원 룰렛용 추첨 도구.
 * 당첨 항목은 돌리기 전에 가중치대로 공정하게 뽑고(암호학적 난수), 돌림판은 그 칸에 멈추도록 연출만 한다.
 * 점수·랭킹은 없다.
 */
export default function RouletteWheel() {
  const [text, setText] = useState(load);
  const [removed, setRemoved] = useState<string[]>([]);
  const [removeMode, setRemoveMode] = useState(false);
  const [duration, setDuration] = useState<DurationKey>('normal');
  const [muted, setMuted] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<(Picked & { index: number }) | null>(null);
  const [history, setHistory] = useState<Picked[]>([]);
  const [copied, setCopied] = useState(false);

  const { items: allItems, total } = useMemo(() => parseItems(text), [text]);
  const items = useMemo(() => applyRemoved(allItems, removed), [allItems, removed]);
  const slices = useMemo(() => layoutSlices(items), [items]);
  const canSpin = slices.length >= MIN_ITEMS && !spinning;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 그리기 루프는 한 번만 만들고, 바뀌는 값은 ref 로 읽는다
  const live = useRef({ slices, muted, winner: null as number | null });
  useEffect(() => {
    live.current = { slices, muted, winner: result?.index ?? null };
  }, [slices, muted, result]);
  const rotation = useRef(0);
  const spinRef = useRef<Spin | null>(null);
  const confetti = useRef<Confetti[]>([]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let size = { width: 0, height: 0 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // 결과 발표 — 기록에 남기고 꽃가루를 터뜨린다 ('뽑힌 항목 빼기'는 다음 판을 돌릴 때 반영)
    const onDone = (winner: Slice) => {
      setSpinning(false);
      setResult({ label: winner.label, color: winner.color, index: winner.index });
      setHistory((h) => [{ label: winner.label, color: winner.color }, ...h].slice(0, MAX_HISTORY));
      if (!live.current.muted) playFanfare();
      confetti.current = Array.from({ length: 140 }, (_, i) => ({
        x: 0.5 + (Math.random() - 0.5) * 0.2,
        y: 0.45,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -0.6 - Math.random() * 0.9,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 12,
        color: i % 4 === 0 ? '#ffffff' : winner.color,
      }));
    };

    let frame = 0;
    let last = performance.now();
    let flap = 0;
    let lastIndex = -1;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const { slices: current, winner } = live.current;
      const spin = spinRef.current;
      if (spin) {
        const t = Math.min(1, (now - spin.startedAt) / spin.durationMs);
        rotation.current = spin.from + (spin.to - spin.from) * easeOut(t);
        if (t >= 1) {
          spinRef.current = null;
          onDone(spin.winner);
        }
      }
      // 바늘이 칸 경계를 넘으면 '딱' + 바늘이 튕긴다 (한 프레임에 여러 칸을 넘어도 한 번만)
      const under = sliceAtPointer(current, rotation.current)?.index ?? -1;
      if (under !== lastIndex) {
        if (lastIndex !== -1 && spin) {
          flap = 1;
          if (!live.current.muted) playTick();
        }
        lastIndex = under;
      }
      flap = Math.max(0, flap - dt * 7);

      drawWheel(ctx, size.width, size.height, {
        slices: current,
        rotation: rotation.current,
        flap,
        winner: spin ? null : winner,
        time: now / 1000,
        spinning: spin !== null,
      });
      drawConfetti(ctx, size.width, size.height, dt, confetti);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const spin = useCallback(() => {
    if (!canSpin) return;
    unlockSound();
    save(text);
    // 직전 당첨을 빼는 모드면 지금 반영하고 돌린다
    let pool = slices;
    if (removeMode && result) {
      const nextRemoved = [...removed, result.label];
      setRemoved(nextRemoved);
      pool = layoutSlices(applyRemoved(allItems, nextRemoved));
      live.current = { ...live.current, slices: pool };
      if (pool.length < MIN_ITEMS) {
        setResult(null);
        return;
      }
    }
    setResult(null);
    setCopied(false);
    confetti.current = [];

    const winner = pickWeighted(pool);
    const span = winner.a1 - winner.a0;
    // 바늘은 칸을 a1 쪽에서 들어와 a0 쪽으로 나간다 → a0 끝자락에 멈추면 '넘어갈 듯 말 듯'
    const at =
      secureRandom() < NEAR_MISS_CHANCE
        ? 0.03 + secureRandom() * 0.07
        : 0.15 + secureRandom() * 0.7;
    const { sec, turns } = DURATIONS[duration];
    const from = rotation.current;
    spinRef.current = {
      startedAt: performance.now(),
      from,
      to: targetRotation(from, winner.a0 + span * at, turns + secureRandom()),
      durationMs: sec * 1000 * (0.9 + secureRandom() * 0.2),
      winner,
    };
    setSpinning(true);
  }, [canSpin, text, slices, removeMode, result, removed, allItems, duration]);

  // 스페이스바로 돌리기 (입력칸·버튼에 포커스가 있을 때는 그쪽 동작을 그대로 둔다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON') return;
      e.preventDefault();
      spin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spin]);

  async function copyHistory() {
    const lines = history.map((h, i) => `${history.length - i}. ${h.label}`).reverse();
    try {
      await navigator.clipboard.writeText(`돌림판 결과\n${lines.join('\n')}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const removedCount = removed.length + (removeMode && result ? 1 : 0);

  return (
    <div className={styles.tool}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onClick={spin}
          role="button"
          aria-label="돌림판 — 누르면 돌아가요"
        />
        {result && !spinning && (
          <div className={styles.result} role="status">
            <span className={styles.resultLabel}>당첨!</span>
            <strong className={styles.resultValue} style={{ borderColor: result.color }}>
              {result.label}
            </strong>
          </div>
        )}
        <button
          type="button"
          className={`btn btn-primary ${styles.spinButton}`}
          disabled={!canSpin}
          onClick={spin}
        >
          {spinning
            ? '돌아가는 중…'
            : slices.length < MIN_ITEMS
              ? `항목이 ${MIN_ITEMS}개 이상 필요해요`
              : '🎡 돌리기 (스페이스바)'}
        </button>
      </div>

      <aside className={styles.side}>
        <label className={styles.label} htmlFor="roulette-items">
          항목
        </label>
        <textarea
          id="roulette-items"
          className={styles.items}
          value={text}
          disabled={spinning}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder={'한 줄에 하나\n벌칙*3 → 칸 3배 (확률도 3배)'}
          spellCheck={false}
        />
        <p className={styles.summary}>
          <strong>{slices.length}칸</strong>
          {removedCount > 0 && <span> · 뽑혀서 빠짐 {removedCount}</span>}
          {total > MAX_ITEMS && (
            <span className={styles.warn}> — 최대 {MAX_ITEMS}개까지만 들어가요</span>
          )}
        </p>

        <div className={styles.toggle} role="radiogroup" aria-label="돌리는 시간">
          {(Object.keys(DURATIONS) as DurationKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={duration === key}
              className={`${styles.toggleButton} ${duration === key ? styles.selected : ''}`}
              onClick={() => setDuration(key)}
            >
              {DURATIONS[key].label}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={removeMode}
            onChange={(e) => setRemoveMode(e.target.checked)}
          />
          뽑힌 항목은 다음 판부터 빼기
        </label>
        <div className={styles.controlRow}>
          <button type="button" className="btn" onClick={() => setMuted(!muted)}>
            {muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={spinning || (removed.length === 0 && !(removeMode && result))}
            onClick={() => {
              setRemoved([]);
              setResult(null);
            }}
          >
            ↩️ 빠진 항목 되돌리기
          </button>
        </div>

        <div className={styles.historyHead}>
          <span className={styles.label}>기록</span>
          <button
            type="button"
            className={`btn ${styles.small}`}
            disabled={history.length === 0}
            onClick={() => void copyHistory()}
          >
            {copied ? '✅ 복사했어요' : '📋 복사'}
          </button>
          <button
            type="button"
            className={`btn ${styles.small}`}
            disabled={history.length === 0}
            onClick={() => setHistory([])}
          >
            지우기
          </button>
        </div>
        <ol className={styles.history}>
          {history.length === 0 && <li className={styles.empty}>아직 돌리지 않았어요</li>}
          {history.map((h, i) => (
            <li key={`${history.length - i}`} className={i === 0 ? styles.latest : ''}>
              <span className={styles.round}>{history.length - i}</span>
              <span className={styles.dot} style={{ background: h.color }} />
              <span className={styles.historyLabel}>{h.label}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/** 당첨 꽃가루 — 화면 비율 좌표(0~1)로 가운데에서 터져 떨어진다 */
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dt: number,
  ref: { current: Confetti[] },
): void {
  if (ref.current.length === 0) return;
  ref.current = ref.current.filter((c) => c.y < 1.1);
  for (const c of ref.current) {
    c.vy += 1.6 * dt;
    c.vx *= 1 - dt * 1.5;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.spin * dt;
    ctx.save();
    ctx.translate(c.x * width, c.y * height);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-6, -3.5, 12, 7);
    ctx.restore();
  }
}
