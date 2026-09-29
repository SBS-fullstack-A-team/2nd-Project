/**
 * 인트로 뒤에 까는 전장 풍경. 1592년, 불타는 노을 아래 바다를 건너오는 왜선 함대와
 * 그 앞을 막아선 마지막 성벽. t(초)에 따라 배가 흔들리고 깃발이 나부끼며 불티가 오른다.
 * 모든 요소가 t 와 좌표만으로 정해지는 순수 함수라 상태를 따로 두지 않는다.
 */

const TAU = Math.PI * 2;

/** 인덱스마다 고정된 0~1 난수 (프레임마다 흔들리지 않게) */
function hash(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function ridge(
  ctx: CanvasRenderingContext2D,
  w: number,
  base: number,
  amp: number,
  seed: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let i = 0; i <= 48; i += 1) {
    const x = (i / 48) * w;
    const u = i / 48;
    const n =
      0.55 * Math.sin(u * 5.1 + seed) +
      0.3 * Math.sin(u * 11.7 + seed * 2.3) +
      0.15 * Math.sin(u * 23.9 + seed * 3.1);
    ctx.lineTo(x, base - amp * (0.55 + 0.45 * n));
  }
  ctx.lineTo(w, base);
  ctx.closePath();
  ctx.fill();
}

/** 왜선(아타케부네) 실루엣: 선체, 누각, 멍석 돛, 고물의 노보리 깃발 */
function ship(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  alpha: number,
  t: number,
  seed: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = '#0e0907';
  ctx.beginPath();
  ctx.moveTo(-1.25, -0.05);
  ctx.lineTo(1.3, -0.12);
  ctx.lineTo(0.95, 0.32);
  ctx.lineTo(-0.95, 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-0.7, -0.45, 1.1, 0.42);
  ctx.fillRect(-0.45, -0.65, 0.6, 0.22);

  ctx.strokeStyle = '#0e0907';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(0.05, -0.45);
  ctx.lineTo(0.05, -1.75);
  ctx.stroke();

  ctx.fillStyle = '#2b1c14';
  ctx.fillRect(-0.5, -1.65, 1.1, 1.0);
  ctx.strokeStyle = 'rgba(14,9,7,0.8)';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (let k = 1; k < 4; k += 1) {
    ctx.moveTo(-0.5, -1.65 + k * 0.25);
    ctx.lineTo(0.6, -1.65 + k * 0.25);
  }
  ctx.stroke();

  for (let k = 0; k < 2; k += 1) {
    const fx = -1.05 + k * 0.18;
    const flutter = Math.sin(t * 3 + seed + k) * 0.04;
    ctx.strokeStyle = '#0e0907';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(fx, -0.1);
    ctx.lineTo(fx, -1.25);
    ctx.stroke();
    ctx.fillStyle = '#8c7a66';
    ctx.fillRect(fx + flutter, -1.2, 0.12, 0.7);
    ctx.fillStyle = '#7a2a18';
    ctx.fillRect(fx + flutter, -1.2, 0.12, 0.14);
  }

  ctx.strokeStyle = 'rgba(14,9,7,0.9)';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let k = 0; k < 6; k += 1) {
    const ox = -0.75 + k * 0.3;
    const sway = Math.sin(t * 2 + k + seed) * 0.08;
    ctx.moveTo(ox, 0.2);
    ctx.lineTo(ox - 0.12 + sway, 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/** 조선군 깃발: 깃대 끝에서 바람에 물결치는 천 */
function banner(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  pole: number,
  size: number,
  color: string,
  t: number,
  seed: number,
): void {
  ctx.strokeStyle = '#0c0806';
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x, base - pole);
  ctx.stroke();

  const top = base - pole;
  const len = size * 1.3;
  const tall = size * 0.8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let i = 1; i <= 8; i += 1) {
    const u = i / 8;
    ctx.lineTo(x + u * len, top + Math.sin(t * 3.2 + seed + u * 4) * size * 0.12 * u);
  }
  for (let i = 8; i >= 0; i -= 1) {
    const u = i / 8;
    ctx.lineTo(x + u * len, top + tall + Math.sin(t * 3.2 + seed + u * 4 + 0.4) * size * 0.12 * u);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawIntroScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
): void {
  const horizon = h * 0.56;
  const unit = Math.min(w, h);

  // 불타는 노을
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#140c09');
  sky.addColorStop(0.55, '#3a160e');
  sky.addColorStop(1, '#a2461f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 1);

  // 붉은 해
  const sx = w * 0.7;
  const sy = horizon - h * 0.07;
  const sr = unit * 0.11;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
  glow.addColorStop(0, 'rgba(255,120,50,0.38)');
  glow.addColorStop(1, 'rgba(255,120,50,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = 'rgba(216,85,42,0.9)';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, TAU);
  ctx.fill();

  // 멀리 불타는 마을에서 오르는 연기
  for (let i = 0; i < 4; i += 1) {
    const bx = w * (0.08 + i * 0.22 + hash(i) * 0.08);
    for (let k = 0; k < 7; k += 1) {
      const phase = (t * 0.035 + k / 7 + hash(i + 3)) % 1;
      const r = unit * (0.02 + phase * 0.08);
      ctx.fillStyle = `rgba(28,16,12,${(0.32 * (1 - phase)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(
        bx + Math.sin(phase * 3 + i) * w * 0.02 + phase * w * 0.06,
        horizon - h * 0.04 - phase * h * 0.38,
        r,
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  // 먹빛 산 능선 세 겹
  ridge(ctx, w, horizon, h * 0.16, 1.3, '#5a2718');
  ridge(ctx, w, horizon, h * 0.1, 4.7, '#3a1a12');
  ridge(ctx, w, horizon, h * 0.05, 8.1, '#22110c');

  // 불빛이 비친 바다
  const seaBottom = h * 0.82;
  const sea = ctx.createLinearGradient(0, horizon, 0, seaBottom);
  sea.addColorStop(0, '#4a2418');
  sea.addColorStop(1, '#12181a');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, seaBottom - horizon + 1);
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i += 1) {
    const u = i / 26;
    const y = horizon + Math.pow(u, 1.4) * (seaBottom - horizon);
    const x = sx + Math.sin(t * 1.1 + i * 1.7) * w * 0.03 * (1 + u * 2);
    const half = w * (0.015 + u * 0.05);
    ctx.strokeStyle = `rgba(255,140,70,${(0.32 * (1 - u)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, unit * 0.004);
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
  }

  // 다가오는 왜선 함대 (먼 배부터 그린다)
  const fleet = Array.from({ length: 7 }, (_, i) => ({ i, d: 0.25 + hash(i + 10) * 0.75 })).sort(
    (a, b) => a.d - b.d,
  );
  for (const { i, d } of fleet) {
    const span = 1.3;
    const drift = (hash(i + 20) * span + t * 0.006 * (0.4 + d)) % span;
    const x = (1.15 - drift) * w;
    const y = horizon + d * (seaBottom - horizon) * 0.7;
    const s = unit * 0.045 * (0.35 + d);
    ship(ctx, x, y + Math.sin(t * 1.3 + i) * s * 0.06, s, 0.45 + 0.55 * d, t, i);
  }

  // 마지막 성벽과 여장
  const wallTop = h * 0.82;
  ctx.fillStyle = '#140d0a';
  ctx.fillRect(0, wallTop, w, h - wallTop);
  const merlon = unit * 0.035;
  for (let x = unit * 0.01; x < w; x += merlon * 1.6) {
    ctx.fillRect(x, wallTop - merlon * 0.6, merlon, merlon * 0.6 + 1);
  }
  ctx.strokeStyle = 'rgba(255,150,90,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 1; r < 5; r += 1) {
    const y = wallTop + r * (h - wallTop) * 0.22;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // 문루: 처마가 들린 기와지붕
  const px = w * 0.8;
  const pw = unit * 0.3;
  const ph = unit * 0.13;
  ctx.fillStyle = '#0c0806';
  ctx.fillRect(px - pw * 0.34, wallTop - ph * 0.55, pw * 0.05, ph * 0.55);
  ctx.fillRect(px + pw * 0.29, wallTop - ph * 0.55, pw * 0.05, ph * 0.55);
  ctx.fillRect(px - pw * 0.38, wallTop - ph * 0.62, pw * 0.76, ph * 0.1);
  ctx.beginPath();
  ctx.moveTo(px - pw * 0.6, wallTop - ph * 0.58);
  ctx.quadraticCurveTo(px, wallTop - ph * 0.72, px + pw * 0.6, wallTop - ph * 0.58);
  ctx.lineTo(px + pw * 0.38, wallTop - ph);
  ctx.quadraticCurveTo(px, wallTop - ph * 1.06, px - pw * 0.38, wallTop - ph);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(px - pw * 0.3, wallTop - ph * 1.08, pw * 0.6, ph * 0.08);

  // 성벽 위 조선군 깃발
  const flag = unit * 0.05;
  banner(ctx, w * 0.1, wallTop - merlon * 0.6, unit * 0.16, flag, '#c0442a', t, 0.3);
  banner(ctx, w * 0.33, wallTop - merlon * 0.6, unit * 0.13, flag * 0.9, '#d9a441', t, 1.7);
  banner(ctx, w * 0.55, wallTop - merlon * 0.6, unit * 0.15, flag, '#3f5f8a', t, 2.9);

  // 불티
  for (let i = 0; i < 70; i += 1) {
    const p = (hash(i) + t * (0.04 + hash(i + 99) * 0.05)) % 1;
    const x = ((((hash(i + 7) + p * 0.12) * w + Math.sin(t * 0.8 + i) * w * 0.02) % w) + w) % w;
    const y = h * (1.02 - p * 1.1);
    const size = unit * (0.002 + hash(i + 3) * 0.004);
    const twinkle = 0.5 + 0.5 * Math.sin(t * 6 + i);
    ctx.fillStyle = `rgba(255,170,80,${((1 - p) * 0.8 * twinkle).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
  }

  // 글이 읽히도록 위쪽은 짙게, 아래(성벽·함대)는 옅게 덮는다
  const veil = ctx.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, 'rgba(12,9,6,0.72)');
  veil.addColorStop(0.55, 'rgba(12,9,6,0.52)');
  veil.addColorStop(1, 'rgba(12,9,6,0.3)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
}
