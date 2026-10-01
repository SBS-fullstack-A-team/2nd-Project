import { ITEMS, type ItemKind } from './config';

/**
 * 3D 장면 위에 얹는 2D 그림 — 아이템 아이콘, 불꽃, 방패 막, 화면 가장자리 효과.
 * 3D 위치를 화면으로 옮긴 점(x, y)과 1m 당 픽셀(scale)을 받아 그린다.
 */

/** 아이템 — 빛나는 원판 위에 아이콘. alpha 는 안개 적용 */
export function drawItemSprite(
  ctx: CanvasRenderingContext2D,
  kind: ItemKind,
  x: number,
  y: number,
  scale: number,
  t: number,
  alpha: number,
) {
  const info = ITEMS[kind];
  const r = scale * 0.34;
  if (r < 1) return;
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.8);
  glow.addColorStop(0, info.color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = alpha * (0.55 + Math.sin(t * 6) * 0.15);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff8e6';
  ctx.strokeStyle = info.color;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawItemIcon(ctx, kind, x, y, r * 0.62);
  ctx.restore();
}

/** 아이콘은 이모지 대신 도형으로 그린다 (OS마다 이모지 모양·크기가 달라서) */
function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  kind: ItemKind,
  x: number,
  y: number,
  r: number,
) {
  const color = ITEMS[kind].color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'magnet') {
    // 말굽자석 — 빨간 몸통에 은색 끝
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.05, r * 0.55, Math.PI, 0, true);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y - r * 0.05);
    ctx.lineTo(x - r * 0.55, y - r * 0.5);
    ctx.moveTo(x + r * 0.55, y - r * 0.05);
    ctx.lineTo(x + r * 0.55, y - r * 0.5);
    ctx.stroke();
  } else if (kind === 'shield') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.85);
    ctx.lineTo(x + r * 0.7, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.65, y + r * 0.45, x, y + r * 0.9);
    ctx.quadraticCurveTo(x - r * 0.65, y + r * 0.45, x - r * 0.7, y - r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(x - r * 0.08, y - r * 0.6, r * 0.16, r * 1.1);
  } else if (kind === 'boost') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.2, y - r * 0.95);
    ctx.lineTo(x - r * 0.5, y + r * 0.1);
    ctx.lineTo(x - r * 0.02, y + r * 0.1);
    ctx.lineTo(x - r * 0.22, y + r * 0.95);
    ctx.lineTo(x + r * 0.5, y - r * 0.15);
    ctx.lineTo(x + r * 0.02, y - r * 0.15);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#c8961a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5410';
    ctx.font = `900 ${Math.max(6, Math.round(r * 0.9))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×2', x, y + r * 0.05);
  }
}

/** 횃불 불꽃 — 흔들리는 두 겹 타원 + 주변 빛 */
export function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  t: number,
  seed: number,
  alpha: number,
) {
  const flicker = 1 + Math.sin(t * 18 + seed) * 0.12 + Math.sin(t * 31 + seed * 2) * 0.06;
  const w = scale * 0.16 * flicker;
  const h = scale * 0.3 * flicker;
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  const g = ctx.createRadialGradient(x, y, 0, x, y, scale * 0.9);
  g.addColorStop(0, 'rgba(255, 180, 80, 0.9)');
  g.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, scale * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ff8a2a';
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.3, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe07a';
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.15, w * 0.5, h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawShieldBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  t: number,
) {
  const r = scale * 1.05 * (1 + Math.sin(t * 5) * 0.02);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
  g.addColorStop(0, 'rgba(79, 179, 255, 0)');
  g.addColorStop(1, 'rgba(79, 179, 255, 0.4)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.7, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 215, 255, 0.85)';
  ctx.lineWidth = Math.max(1.5, scale * 0.03);
  ctx.stroke();
  ctx.restore();
}

export function drawBoostGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  t: number,
) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, scale * 0.2, x, y, scale * 1.4);
  g.addColorStop(0, `rgba(255, 190, 80, ${0.55 + Math.sin(t * 30) * 0.1})`);
  g.addColorStop(1, 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, scale * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- 화면 전체 효과 ----------

/**
 * 소실점에서 화면 가장자리로 뻗어 나가는 속도선.
 * strength 1 = 부스트, 그보다 작으면 최고 속도 근처의 옅은 선 (개수·굵기·진하기가 줄어든다)
 */
export function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  h: number,
  cx: number,
  cy: number,
  t: number,
  strength = 1,
) {
  if (strength <= 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 244, 214, ${0.8 * strength})`;
  ctx.lineWidth = 1 + 2 * strength;
  const count = Math.round(8 + 12 * strength);
  for (let i = 0; i < count; i++) {
    const a = (i / 20) * Math.PI * 2 + i * 0.37;
    const k = (t * 2.5 + i * 0.13) % 1;
    const r0 = h * (0.3 + k * 0.6);
    const r1 = r0 + h * 0.12;
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** 비틀거리는 동안 화면 가장자리가 붉게 맥박친다 — 한 번 더 부딪히면 끝이라는 경고 */
export function drawDanger(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  left: number,
  t: number,
) {
  const pulse = 0.5 + Math.sin(t * 9) * 0.5;
  const strength = Math.min(1, left / 1.5) * (0.25 + pulse * 0.2);
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, 'rgba(200, 30, 20, 0)');
  g.addColorStop(1, `rgba(200, 30, 20, ${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, h * 0.95);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
