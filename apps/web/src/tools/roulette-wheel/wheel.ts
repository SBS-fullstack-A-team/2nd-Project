import type { Slice } from './items';

const TAU = Math.PI * 2;
/** 당첨 띠(위)·돌리기 버튼(아래)이 돌림판을 가리지 않도록 비워 두는 높이 (px) */
const RESERVED_TOP = 66;
const RESERVED_BOTTOM = 62;

/** 각도를 [-π/2, 3π/2) 범위로 맞춘다 (칸 각도 범위와 같게) */
function normalize(angle: number): number {
  return ((((angle + Math.PI / 2) % TAU) + TAU) % TAU) - Math.PI / 2;
}

/**
 * 위쪽 바늘이 가리키는 칸.
 * 돌림판을 rotation 만큼 돌리면 바늘(화면 위쪽, -π/2) 아래에는 돌림판 각도 -π/2 - rotation 이 온다.
 */
export function sliceAtPointer(slices: Slice[], rotation: number): Slice | undefined {
  const angle = normalize(-Math.PI / 2 - rotation);
  return slices.find((s) => angle >= s.a0 && angle < s.a1) ?? slices[slices.length - 1];
}

/**
 * 당첨 칸의 angle 위치가 바늘 아래에 오도록 하는 최종 회전값 — 지금보다 최소 turns 바퀴 더 돈다.
 */
export function targetRotation(current: number, angle: number, turns: number): number {
  const base = -Math.PI / 2 - angle;
  const k = Math.ceil((current + turns * TAU - base) / TAU);
  return base + k * TAU;
}

export interface WheelView {
  slices: Slice[];
  rotation: number;
  /** 바늘이 칸 경계에 걸려 튕기는 정도 (0~1) */
  flap: number;
  /** 결과 발표 중이면 당첨 칸을 빛낸다 */
  winner: number | null;
  /** 시간(초) — 반짝이 전구 애니메이션 */
  time: number;
  spinning: boolean;
}

/** 돌림판 한 장면을 그린다 (size × size 정사각형 영역을 가운데에 맞춰서) */
export function drawWheel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: WheelView,
): void {
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7,
  );
  bg.addColorStop(0, '#2a2f6b');
  bg.addColorStop(1, '#0c0e26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 위에는 당첨 띠, 아래에는 돌리기 버튼 자리를 비워 두고 그 사이에 돌림판을 넣는다.
  // 돌림판 + 바늘 높이는 반지름의 약 2.45배 (위로 바늘까지 1.32R, 아래로 테두리까지 1.13R)
  // 작은 화면에서는 비워 두는 높이도 줄인다
  const top = Math.min(RESERVED_TOP, height * 0.12);
  const bottom = Math.min(RESERVED_BOTTOM, height * 0.12);
  const free = height - top - bottom;
  const R = Math.min(width * 0.45, free / 2.45);
  if (R <= 0) return;
  const cx = width / 2;
  const cy = top + (free - 2.45 * R) / 2 + 1.32 * R;

  // 테두리 (금속 링 + 전구)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = R * 0.08;
  ctx.fillStyle = '#1a1d45';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.09, 0, TAU);
  ctx.fill();
  ctx.restore();
  const rim = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
  rim.addColorStop(0, '#ffe58a');
  rim.addColorStop(0.5, '#d49b1f');
  rim.addColorStop(1, '#ffe58a');
  ctx.strokeStyle = rim;
  ctx.lineWidth = R * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.045, 0, TAU);
  ctx.stroke();
  const bulbs = 24;
  for (let i = 0; i < bulbs; i++) {
    const a = (i / bulbs) * TAU;
    // 돌 때는 빠르게, 멈추면 천천히 번갈아 깜빡인다
    const on = Math.floor(view.time * (view.spinning ? 10 : 2.5) + i) % 2 === 0;
    ctx.fillStyle = on ? '#fffbe6' : '#8a6a1c';
    if (on) {
      ctx.shadowColor = '#fff3b0';
      ctx.shadowBlur = R * 0.04;
    }
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R * 1.045, cy + Math.sin(a) * R * 1.045, R * 0.017, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 칸
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(view.rotation);
  for (const s of view.slices) {
    const dim = view.winner !== null && view.winner !== s.index;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, s.a0, s.a1);
    ctx.closePath();
    ctx.fill();
    // 안쪽이 살짝 어둡게 — 입체감
    const shade = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    shade.addColorStop(0, 'rgba(0,0,0,0.28)');
    shade.addColorStop(0.6, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = shade;
    ctx.fill();
    if (dim) {
      ctx.fillStyle = 'rgba(10,12,38,0.55)';
      ctx.fill();
    }
    if (view.slices.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1, R * 0.006);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(s.a0) * R, Math.sin(s.a0) * R);
      ctx.stroke();
    }
    drawLabel(ctx, s, R);
  }
  if (view.winner !== null) {
    const s = view.slices.find((x) => x.index === view.winner);
    if (s) {
      const pulse = 0.6 + 0.4 * Math.sin(view.time * 8);
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = R * 0.025;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.985, s.a0, s.a1);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // 가운데 단추
  const hub = ctx.createRadialGradient(cx - R * 0.04, cy - R * 0.05, R * 0.02, cx, cy, R * 0.16);
  hub.addColorStop(0, '#ffffff');
  hub.addColorStop(0.35, '#ffd23f');
  hub.addColorStop(1, '#b07a00');
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#fff3c4';
  ctx.lineWidth = R * 0.012;
  ctx.stroke();
  ctx.fillStyle = '#3a2a00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(R * 0.07)}px system-ui, sans-serif`;
  ctx.fillText(view.spinning ? '…' : 'SPIN', cx, cy + R * 0.005);

  drawPointer(ctx, cx, cy - R * 1.045, R, view.flap);
}

/** 칸 이름 — 가운데에서 바깥쪽으로 반지름 방향을 따라 쓴다 */
function drawLabel(ctx: CanvasRenderingContext2D, s: Slice, R: number): void {
  const span = s.a1 - s.a0;
  // 글자 높이는 칸 폭(바깥쪽 60% 지점의 호 길이)에 맞춘다
  const size = Math.min(R * 0.085, span * R * 0.62 * 0.8);
  if (size < 7) return;
  ctx.save();
  ctx.rotate(s.a0 + span / 2);
  ctx.fillStyle = '#1b1a33';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const maxWidth = R * 0.7;
  // 글자를 줄이다가 너무 작아지면(칸 크기의 60%) 그 크기에서 뒤를 '…'로 자른다
  const minFont = Math.max(9, size * 0.6);
  let font = size;
  ctx.font = `800 ${font}px system-ui, sans-serif`;
  while (font > minFont && ctx.measureText(s.label).width > maxWidth) {
    font -= 1;
    ctx.font = `800 ${font}px system-ui, sans-serif`;
  }
  let label = s.label;
  while (label.length > 1 && ctx.measureText(label).width > maxWidth) {
    label = label.slice(0, -2) + '…';
  }
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 2;
  ctx.fillText(label, R * 0.9, 0);
  ctx.restore();
}

/** 위쪽 바늘 — 칸 경계를 지날 때 옆으로 튕긴다 */
function drawPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  flap: number,
): void {
  ctx.save();
  ctx.translate(x, y - R * 0.04);
  // 돌림판이 시계 방향으로 돌면 위쪽 테두리는 오른쪽으로 움직여 바늘 끝을 오른쪽으로 민다
  ctx.rotate(-flap * 0.45);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = R * 0.03;
  ctx.shadowOffsetY = R * 0.01;
  const w = R * 0.085;
  const h = R * 0.2;
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, '#ff8fab');
  g.addColorStop(0.5, '#ff3366');
  g.addColorStop(1, '#b3123e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(-w * 1.1, h * 0.2, -w, -h * 0.1);
  ctx.arc(0, -h * 0.1, w, Math.PI, 0);
  ctx.quadraticCurveTo(w * 1.1, h * 0.2, 0, h);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -h * 0.1, w * 0.38, 0, TAU);
  ctx.fill();
  ctx.restore();
}
