import type { ThemeId } from './config';
import { TAU, drawBackground, seeded } from './render';

/**
 * 배경 테마 그리기 — 이미지 파일 없이 Canvas API 로만 그린다.
 *
 * 테마 하나는 세 겹 + 입자로 이루어진다.
 *  - back     : 하늘·먼 풍경. 크기가 바뀔 때만 오프스크린 캔버스에 한 번 그린다
 *  - animated : 매 프레임 움직이는 빛줄기·물결·오로라 (back 과 front 사이)
 *  - front    : 가까운 실루엣. 오프스크린에 한 번 그려 animated 위에 덮는다
 *  - 입자     : 꽃잎·눈·불씨처럼 흩날리는 것 (ThemeAmbient)
 *
 * 과일과 검기가 묻히지 않도록 모든 테마는 중간~어두운 밝기로 맞추고 가장자리를 어둡게(비네트) 한다.
 * 좌표는 논리 좌표 (높이 500 고정, 너비는 화면 비율에 따라 바뀜)
 */

type Ctx = CanvasRenderingContext2D;
type Stops = readonly (readonly [number, string])[];

interface ThemeArt {
  back: (ctx: Ctx, w: number, h: number) => void;
  front?: (ctx: Ctx, w: number, h: number) => void;
  animated?: (ctx: Ctx, w: number, h: number, t: number) => void;
}

/* =========================================================
 * 공용 도우미
 * ========================================================= */

function vGrad(ctx: Ctx, y0: number, y1: number, stops: Stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function fillSky(ctx: Ctx, w: number, h: number, stops: Stops) {
  const g = vGrad(ctx, 0, h, stops);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return g;
}

/** 가운데가 진하고 바깥으로 사라지는 둥근 빛 */
function glow(ctx: Ctx, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function vignette(ctx: Ctx, w: number, h: number, alpha = 0.55) {
  const v = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.32,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.78,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function stars(
  ctx: Ctx,
  rnd: () => number,
  w: number,
  maxY: number,
  n: number,
  tint: readonly string[] = ['255,255,255'],
) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    // 위쪽일수록 촘촘하게
    const y = Math.pow(rnd(), 1.4) * maxY;
    const big = rnd() < 0.08;
    const r = big ? 1.1 + rnd() * 0.9 : 0.4 + rnd() * 0.7;
    const color = tint[Math.floor(rnd() * tint.length)] ?? '255,255,255';
    ctx.fillStyle = `rgba(${color},${0.35 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (big) {
      // 밝은 별에는 십자 빛살
      ctx.strokeStyle = `rgba(${color},0.35)`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - r * 4, y);
      ctx.lineTo(x + r * 4, y);
      ctx.moveTo(x, y - r * 4);
      ctx.lineTo(x, y + r * 4);
      ctx.stroke();
    }
  }
}

/**
 * 능선 높이 함수 — 시드가 같으면 항상 같은 모양.
 * peaks 가 false 면 사인파를 겹친 완만한 언덕 (amp = 출렁임 폭),
 * true 면 중간점 변위(midpoint displacement)로 만든 들쭉날쭉한 산맥 (amp = 가장 높은 봉우리 높이).
 */
function ridge(seed: number, baseY: number, amp: number, peaks = false) {
  const rnd = seeded(seed);
  if (!peaks) {
    const waves = Array.from({ length: 4 }, (_, i) => ({
      f: (0.004 + rnd() * 0.005) * (i + 1),
      p: rnd() * TAU,
      a: amp / (i + 1.2),
    }));
    return (x: number) => {
      let y = baseY;
      for (const s of waves) y -= Math.sin(x * s.f + s.p) * s.a;
      return y;
    };
  }
  // 0~SPAN 구간을 1024 칸으로 나눠 높이를 만든다 (화면이 더 넓으면 반복 — 양 끝 높이가 같아 이음매가 없다)
  const SPAN = 1600;
  const n = 1024;
  const hts = new Float32Array(n + 1);
  hts[0] = rnd();
  hts[n] = hts[0];
  let step = n;
  let rough = 1;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < n; i += step) {
      hts[i] = (hts[i - half]! + hts[i + half]!) / 2 + (rnd() - 0.5) * rough;
    }
    rough *= 0.55;
    step = half;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of hts) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const range = max - min || 1;
  return (x: number) => {
    const p = (((x % SPAN) + SPAN) % SPAN) * (n / SPAN);
    const i = Math.floor(p);
    const f = p - i;
    const v = hts[i]! * (1 - f) + hts[Math.min(n, i + 1)]! * f;
    // 높이를 제곱해 봉우리는 뾰족하게, 골짜기는 넓게
    const k = 0.15 + 0.85 * ((v - min) / range);
    return baseY - k * k * amp;
  };
}

function fillRidge(
  ctx: Ctx,
  w: number,
  h: number,
  y: (x: number) => number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-2, h + 2);
  for (let x = -2; x <= w + 8; x += 6) ctx.lineTo(x, y(x));
  ctx.lineTo(w + 8, h + 2);
  ctx.closePath();
  ctx.fill();
}

/**
 * 산 꼭대기의 눈 — 능선을 따라 덮고 아래 경계는 들쭉날쭉하다.
 * snowLine 보다 높은 곳에만 쌓이고, 높을수록 두껍다 (골짜기에는 눈이 없다)
 */
function snowCaps(
  ctx: Ctx,
  w: number,
  y: (x: number) => number,
  depth: number,
  fill: string | CanvasGradient,
  seed: number,
  snowLine = Infinity,
) {
  const rnd = seeded(seed);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-2, y(-2));
  for (let x = -2; x <= w + 8; x += 6) ctx.lineTo(x, y(x));
  for (let x = w + 8; x >= -2; x -= 6) {
    const top = y(x);
    const k =
      snowLine === Infinity ? 1 : Math.max(0, Math.min(1, (snowLine - top) / (depth * 1.5)));
    ctx.lineTo(x, top + depth * k * (0.35 + rnd() * 0.9));
  }
  ctx.closePath();
  ctx.fill();
}

/** 끝으로 갈수록 가늘어지는 가지·줄기 (2차 베지어를 여러 토막으로 나눠 굵기를 줄인다) */
function taperedCurve(
  ctx: Ctx,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  color: string,
) {
  const steps = 14;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    ctx.lineWidth = w0 + (w1 - w0) * t;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    px = x;
    py = y;
  }
}

/** 2차 베지어 위의 한 점 */
function onCurve(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** 위쪽에서 비스듬히 내려오는 빛줄기 하나 (가산 혼합으로 그릴 것) */
function lightShaft(
  ctx: Ctx,
  x: number,
  topW: number,
  bottomW: number,
  lean: number,
  len: number,
  color: string,
  alpha: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - topW / 2, 0);
  ctx.lineTo(x + topW / 2, 0);
  ctx.lineTo(x + lean + bottomW / 2, len);
  ctx.lineTo(x + lean - bottomW / 2, len);
  ctx.closePath();
  ctx.fill();
}

/** 0~1 사이 소수 부분 */
const frac = (v: number) => v - Math.floor(v);

/* =========================================================
 * 1. 밤벚꽃 정원
 * ========================================================= */

function sakuraBack(ctx: Ctx, w: number, h: number) {
  fillSky(ctx, w, h, [
    [0, '#120a2e'],
    [0.45, '#2f1750'],
    [0.78, '#58295e'],
    [1, '#2a1234'],
  ]);
  const rnd = seeded(101);
  stars(ctx, rnd, w, h * 0.5, 55, ['255,255,255', '255,220,240']);

  // 보름달 — 분홍빛 달무리
  const mx = w * 0.76;
  const my = h * 0.2;
  const mr = 32;
  glow(ctx, mx, my, mr * 5, 'rgba(255,200,230,0.18)');
  glow(ctx, mx, my, mr * 2, 'rgba(255,236,246,0.32)');
  const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fffdf6');
  disc.addColorStop(1, '#f0d8cc');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,150,150,0.22)';
  for (const [dx, dy, r] of [
    [-10, -6, 7],
    [9, 8, 5],
    [6, -13, 4],
    [-4, 12, 3.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, r, 0, TAU);
    ctx.fill();
  }

  // 먼 산과 산허리 안개
  fillRidge(ctx, w, h, ridge(3, h * 0.68, 90, true), '#2c1844');
  ctx.fillStyle = vGrad(ctx, h * 0.55, h * 0.8, [
    [0, 'rgba(255,170,220,0)'],
    [0.5, 'rgba(255,170,220,0.12)'],
    [1, 'rgba(255,170,220,0)'],
  ]);
  ctx.fillRect(0, h * 0.55, w, h * 0.25);

  // 언덕 위로 멀리 핀 벚나무 무리
  const hill = ridge(4, h * 0.72, 12);
  fillRidge(ctx, w, h, hill, '#1e0f2e');
  // 언덕 아래 연못 — 달빛과 꽃빛이 비친다
  const pondTop = sakuraPondTop(h);
  ctx.fillStyle = vGrad(ctx, pondTop, h, [
    [0, '#2a1a4a'],
    [1, '#120a22'],
  ]);
  ctx.fillRect(0, pondTop, w, h - pondTop);
  ctx.fillStyle = 'rgba(255,190,230,0.35)';
  ctx.fillRect(0, pondTop, w, 1);
  const reflect = ctx.createLinearGradient(0, pondTop, 0, h);
  reflect.addColorStop(0, 'rgba(255,236,246,0.28)');
  reflect.addColorStop(1, 'rgba(255,236,246,0)');
  ctx.fillStyle = reflect;
  ctx.beginPath();
  ctx.moveTo(mx - mr * 0.9, pondTop);
  ctx.lineTo(mx + mr * 0.9, pondTop);
  ctx.lineTo(mx + mr * 1.8, h);
  ctx.lineTo(mx - mr * 1.8, h);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < Math.ceil(w / 70); i++) {
    const x = rnd() * w;
    const y = hill(x) - 4;
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = `rgba(255,${150 + Math.floor(rnd() * 50)},${200 + Math.floor(rnd() * 30)},${0.16 + rnd() * 0.12})`;
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * 34, y - rnd() * 18, 6 + rnd() * 10, 0, TAU);
      ctx.fill();
    }
  }
  vignette(ctx, w, h, 0.5);
}

/** 꽃잎 5장짜리 벚꽃 한 송이 */
function blossom(ctx: Ctx, x: number, y: number, r: number, rot: number, light: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = `rgba(255,${190 + light * 40},${220 + light * 25},0.95)`;
  for (let i = 0; i < 5; i++) {
    ctx.rotate(TAU / 5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.42, r * 0.58, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ff7fae';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.07, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 가지를 따라 꽃송이·꽃망울 덩어리를 피운다 */
function blossomCluster(ctx: Ctx, rnd: () => number, x: number, y: number, spread: number) {
  // 뒤쪽 흐린 꽃 덩어리 → 앞쪽 또렷한 꽃
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255,${160 + Math.floor(rnd() * 60)},${205 + Math.floor(rnd() * 30)},0.5)`;
    ctx.beginPath();
    ctx.arc(x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread * 0.7, 4 + rnd() * 6, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    blossom(
      ctx,
      x + (rnd() - 0.5) * spread,
      y + (rnd() - 0.5) * spread * 0.7,
      4 + rnd() * 4,
      rnd() * TAU,
      rnd(),
    );
  }
}

function sakuraBranch(
  ctx: Ctx,
  rnd: () => number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  width: number,
) {
  taperedCurve(ctx, x0, y0, cx, cy, x1, y1, width, width * 0.18, '#1f0d18');
  // 위쪽 가장자리에 달빛 테두리
  ctx.save();
  ctx.translate(0, -width * 0.18);
  ctx.globalAlpha = 0.35;
  taperedCurve(ctx, x0, y0, cx, cy, x1, y1, width * 0.25, width * 0.05, '#7a4a62');
  ctx.restore();
  // 잔가지
  for (let i = 0; i < 4; i++) {
    const t = 0.3 + i * 0.17;
    const [bx, by] = onCurve(t, x0, y0, cx, cy, x1, y1);
    const dir = i % 2 === 0 ? 1 : -1;
    const ex = bx + (rnd() * 30 + 20) * Math.sign(x1 - x0 || 1);
    const ey = by + dir * (14 + rnd() * 18);
    taperedCurve(ctx, bx, by, (bx + ex) / 2, by + dir * 4, ex, ey, width * 0.35, 1, '#1f0d18');
    blossomCluster(ctx, rnd, ex, ey, 26);
  }
  for (let i = 0; i < 6; i++) {
    const [bx, by] = onCurve(0.25 + rnd() * 0.75, x0, y0, cx, cy, x1, y1);
    blossomCluster(ctx, rnd, bx, by + (rnd() - 0.5) * 10, 22);
  }
}

/** 은은하게 불 켜진 석등 */
function stoneLantern(ctx: Ctx, x: number, base: number, s: number) {
  glow(ctx, x, base - 58 * s, 70 * s, 'rgba(255,190,110,0.35)');
  ctx.fillStyle = '#140a14';
  // 받침·기둥·화사·지붕·보주
  ctx.fillRect(x - 16 * s, base - 8 * s, 32 * s, 8 * s);
  ctx.fillRect(x - 5 * s, base - 40 * s, 10 * s, 32 * s);
  ctx.fillRect(x - 14 * s, base - 46 * s, 28 * s, 6 * s);
  ctx.fillRect(x - 11 * s, base - 70 * s, 22 * s, 24 * s);
  ctx.beginPath();
  ctx.moveTo(x - 22 * s, base - 70 * s);
  ctx.lineTo(x, base - 86 * s);
  ctx.lineTo(x + 22 * s, base - 70 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, base - 89 * s, 4 * s, 0, TAU);
  ctx.fill();
  // 화창 불빛
  const g = ctx.createRadialGradient(x, base - 58 * s, 0, x, base - 58 * s, 9 * s);
  g.addColorStop(0, '#fff2c4');
  g.addColorStop(1, '#ff9a3c');
  ctx.fillStyle = g;
  ctx.fillRect(x - 6 * s, base - 64 * s, 12 * s, 12 * s);
}

/** 연못 수면 높이 (back·animated 공용) */
function sakuraPondTop(h: number) {
  return h * 0.8;
}

function sakuraAnimated(ctx: Ctx, w: number, h: number, t: number) {
  const pondTop = sakuraPondTop(h);
  const mx = w * 0.76;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 달빛 물결 — 짧은 가로줄이 반짝인다
  const rnd = seeded(103);
  for (let i = 0; i < 26; i++) {
    const depth = rnd();
    const y = pondTop + 4 + depth * (h - pondTop - 8);
    const x = mx + (rnd() - 0.5) * (40 + depth * 80);
    const a = Math.max(0, Math.sin(t * (1.2 + rnd() * 1.4) + rnd() * TAU));
    const len = 6 + depth * 16;
    ctx.fillStyle = `rgba(255,236,246,${a * 0.55})`;
    ctx.fillRect(x - len / 2, y, len, 1.2);
  }
  // 수면 위 잔물결
  ctx.strokeStyle = 'rgba(255,190,230,0.08)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const y = pondTop + 10 + k * 22;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * 0.04 + t * 1.1 + k * 2) * 1.6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function sakuraFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(102);
  // 왼쪽 위와 오른쪽 위에서 뻗어 나온 가지 — 가운데 놀이 공간은 비운다
  sakuraBranch(ctx, rnd, -20, h * 0.02, w * 0.12, h * 0.2, Math.min(w * 0.36, 300), h * 0.12, 16);
  sakuraBranch(
    ctx,
    rnd,
    w + 20,
    h * 0.3,
    w * 0.86,
    h * 0.1,
    Math.max(w * 0.66, w - 280),
    h * 0.05,
    14,
  );

  // 바닥 풀숲과 석등
  ctx.fillStyle = '#0f0614';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8)
    ctx.lineTo(x, h - 14 - Math.abs(Math.sin(x * 0.11)) * 10 - rnd() * 6);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  stoneLantern(ctx, Math.max(46, w * 0.07), h - 6, 0.9);
}

/* =========================================================
 * 2. 대나무 숲
 * ========================================================= */

/** 마디가 있는 대나무 줄기 하나 */
function bambooStalk(
  ctx: Ctx,
  x: number,
  width: number,
  h: number,
  lean: number,
  light: string,
  dark: string,
  node: string,
  seed: number,
) {
  const rnd = seeded(seed);
  ctx.save();
  ctx.translate(x, h + 10);
  ctx.rotate(lean);
  const len = h + 60;
  const g = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.35, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(-width / 2, -len, width, len);
  // 마디
  let y = -20 - rnd() * 40;
  while (y > -len) {
    ctx.fillStyle = node;
    ctx.fillRect(-width / 2 - 1, y - 2, width + 2, 3.5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-width / 2, y + 1.5, width, 1.2);
    y -= 50 + rnd() * 40;
  }
  ctx.restore();
}

/** 가는 댓잎 묶음 */
function bambooLeaves(ctx: Ctx, rnd: () => number, x: number, y: number, n: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6 + Math.PI * 0.5 * (rnd() < 0.5 ? 1 : 0.6);
    const len = 22 + rnd() * 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.14, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.14, 0, 0);
    ctx.fill();
    ctx.restore();
  }
}

function bambooBack(ctx: Ctx, w: number, h: number) {
  fillSky(ctx, w, h, [
    [0, '#2e5426'],
    [0.3, '#16361c'],
    [1, '#040f07'],
  ]);
  glow(ctx, w * 0.5, -h * 0.15, h * 0.95, 'rgba(225,255,170,0.2)');
  const rnd = seeded(201);
  // 멀리 안개 속 줄기 (흐리게)
  for (let i = 0; i < Math.ceil(w / 22); i++) {
    bambooStalk(
      ctx,
      rnd() * w,
      5 + rnd() * 5,
      h,
      (rnd() - 0.5) * 0.06,
      'rgba(170,215,150,0.13)',
      'rgba(120,170,110,0.08)',
      'rgba(60,90,55,0.18)',
      300 + i,
    );
  }
  ctx.fillStyle = vGrad(ctx, 0, h, [
    [0, 'rgba(200,240,190,0.0)'],
    [0.6, 'rgba(200,240,190,0.08)'],
    [1, 'rgba(10,30,15,0.4)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  // 중간 줄기
  for (let i = 0; i < Math.ceil(w / 60); i++) {
    bambooStalk(
      ctx,
      rnd() * w,
      11 + rnd() * 7,
      h,
      (rnd() - 0.5) * 0.08,
      '#3a6a34',
      '#173a1a',
      '#102c13',
      400 + i,
    );
  }
  vignette(ctx, w, h, 0.45);
}

function bambooAnimated(ctx: Ctx, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = w * (0.12 + i * 0.2) + Math.sin(t * 0.25 + i * 1.7) * 14;
    const a = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(t * 0.6 + i * 2.1));
    lightShaft(ctx, x, 18 + i * 4, 90 + i * 12, 70, h * 1.05, '230,255,190', a);
  }
  ctx.restore();
}

function bambooFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(202);
  // 화면 양 끝 가까운 굵은 줄기
  const near: [number, number, number][] = [
    [w * 0.03, 34, -0.03],
    [w * 0.11, 24, 0.025],
    [w * 0.9, 28, -0.02],
    [w * 0.98, 38, 0.035],
  ];
  near.forEach(([x, width, lean], i) =>
    bambooStalk(ctx, x, width, h, lean, '#2d5a2a', '#0a1f0c', '#061407', 500 + i),
  );
  // 줄기 위쪽에서 늘어진 댓잎
  for (const [x] of near) {
    for (let k = 0; k < 3; k++) {
      bambooLeaves(ctx, rnd, x + (rnd() - 0.5) * 30, 20 + k * 60 + rnd() * 30, 7, '#0f2a10');
    }
  }
  // 바닥의 고사리 덤불
  ctx.fillStyle = '#04100a';
  for (let x = -10; x < w + 20; x += 34 + rnd() * 30) {
    const ht = 20 + rnd() * 26;
    for (let k = -3; k <= 3; k++) {
      ctx.save();
      ctx.translate(x, h + 4);
      ctx.rotate(k * 0.32);
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.quadraticCurveTo(-6, -ht * 0.6, 0, -ht);
      ctx.quadraticCurveTo(6, -ht * 0.6, 3, 0);
      ctx.fill();
      ctx.restore();
    }
  }
}

/* =========================================================
 * 3. 노을 해변
 * ========================================================= */

/** 바다와 해의 위치 (back·animated 공용) */
function beachLayout(w: number, h: number) {
  return { horizon: h * 0.6, sunX: w * 0.62, sunR: 46 };
}

function beachBack(ctx: Ctx, w: number, h: number) {
  const { horizon, sunX, sunR } = beachLayout(w, h);
  ctx.fillStyle = vGrad(ctx, 0, horizon, [
    [0, '#1d1340'],
    [0.35, '#55286a'],
    [0.62, '#b84a68'],
    [0.86, '#ec8458'],
    [1, '#ffbd78'],
  ]);
  ctx.fillRect(0, 0, w, horizon);
  const rnd = seeded(301);
  stars(ctx, rnd, w, horizon * 0.3, 22);

  // 해 — 수평선에 반쯤 걸려 있다
  glow(ctx, sunX, horizon, 240, 'rgba(255,170,90,0.45)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  const disc = ctx.createLinearGradient(0, horizon - sunR, 0, horizon);
  disc.addColorStop(0, '#fff3c8');
  disc.addColorStop(1, '#ffa24e');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, horizon + sunR * 0.25, sunR, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 노을 구름 — 아래쪽이 햇빛을 받는 길쭉한 구름
  for (let i = 0; i < 7; i++) {
    const cy = horizon * (0.2 + rnd() * 0.55);
    const cx = rnd() * w;
    const cw = 80 + rnd() * 140;
    const g = ctx.createLinearGradient(0, cy - 8, 0, cy + 8);
    g.addColorStop(0, 'rgba(120,60,120,0.35)');
    g.addColorStop(1, 'rgba(255,170,150,0.45)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, 6 + rnd() * 5, 0, 0, TAU);
    ctx.fill();
  }

  // 바다
  ctx.fillStyle = vGrad(ctx, horizon, h, [
    [0, '#5a2e62'],
    [0.4, '#33204e'],
    [1, '#160f28'],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  // 해가 비친 물빛 기둥
  const col = ctx.createLinearGradient(0, horizon, 0, h);
  col.addColorStop(0, 'rgba(255,190,110,0.45)');
  col.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(sunX - sunR * 1.1, horizon);
  ctx.lineTo(sunX + sunR * 1.1, horizon);
  ctx.lineTo(sunX + sunR * 2.4, h);
  ctx.lineTo(sunX - sunR * 2.4, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,170,0.5)';
  ctx.fillRect(0, horizon - 0.5, w, 1);

  // 왼쪽 아래 모래사장
  ctx.fillStyle = vGrad(ctx, h * 0.8, h, [
    [0, '#3a2234'],
    [1, '#1e1020'],
  ]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.quadraticCurveTo(w * 0.3, h * 0.84, w * 0.52, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  vignette(ctx, w, h, 0.5);
}

function beachAnimated(ctx: Ctx, w: number, h: number, t: number) {
  const { horizon, sunX, sunR } = beachLayout(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 물빛 기둥 안에서 반짝이는 잔물결
  const rnd = seeded(302);
  for (let i = 0; i < 46; i++) {
    const depth = rnd();
    const y = horizon + 4 + depth * (h - horizon - 10);
    const spread = sunR * (1.1 + depth * 1.3);
    const x = sunX + (rnd() - 0.5) * 2 * spread;
    const a = Math.max(0, Math.sin(t * (1.6 + rnd() * 1.6) + rnd() * TAU));
    const len = (6 + depth * 18) * (0.6 + rnd() * 0.6);
    ctx.fillStyle = `rgba(255,${200 + Math.floor(rnd() * 40)},150,${a * 0.7})`;
    ctx.fillRect(x - len / 2, y, len, 1.4 + depth);
  }
  // 바다 전체의 느린 물결선
  ctx.strokeStyle = 'rgba(255,180,200,0.07)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    const y = horizon + 14 + k * ((h - horizon) / 6) + Math.sin(t * 0.8 + k) * 3;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * 0.03 + t * 1.2 + k) * 2;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 야자수 실루엣 — 휘어진 줄기 + 늘어진 잎 */
function palm(ctx: Ctx, baseX: number, baseY: number, topX: number, topY: number, s: number) {
  const color = '#120818';
  const cx = (baseX + topX) / 2 + (topX - baseX) * 0.6;
  const cy = (baseY + topY) / 2;
  taperedCurve(ctx, baseX, baseY, cx, cy, topX, topY, 14 * s, 6 * s, color);
  // 줄기 마디
  ctx.strokeStyle = 'rgba(255,170,120,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const [x, y] = onCurve(i / 12, baseX, baseY, cx, cy, topX, topY);
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y);
    ctx.lineTo(x + 5 * s, y + 1);
    ctx.stroke();
  }
  // 잎 9장
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.42 + (i % 2 ? 0.1 : -0.1);
    const len = (70 + (i % 3) * 16) * s;
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.45 + len * 0.55;
    const mx = topX + Math.cos(a) * len * 0.55;
    const my = topY + Math.sin(a) * len * 0.6 - 10 * s;
    taperedCurve(ctx, topX, topY, mx, my, ex, ey, 4 * s, 1, color);
    // 잎줄기 양쪽의 작은 잎
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * s;
    for (let k = 2; k < 12; k++) {
      const [lx, ly] = onCurve(k / 12, topX, topY, mx, my, ex, ey);
      const drop = (9 + k) * s * 0.9;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - 5 * s, ly + drop);
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 5 * s, ly + drop);
      ctx.stroke();
    }
  }
  // 열매
  ctx.fillStyle = color;
  for (const [dx, dy] of [
    [-5, 6],
    [4, 7],
    [0, 11],
  ] as const) {
    ctx.beginPath();
    ctx.arc(topX + dx * s, topY + dy * s, 4.5 * s, 0, TAU);
    ctx.fill();
  }
}

function beachFront(ctx: Ctx, w: number, h: number) {
  palm(ctx, w * 0.04, h + 10, w * 0.15, h * 0.4, 1.05);
  palm(ctx, w * 0.98, h + 10, w * 0.88, h * 0.52, 0.85);
}

/* =========================================================
 * 4. 눈 내리는 밤
 * ========================================================= */

/** 눈 쌓인 전나무 실루엣 */
function pine(ctx: Ctx, x: number, base: number, ht: number, color: string, snow: string) {
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const top = base - ht + (i * ht) / (tiers + 0.6);
    const bottom = top + ht * 0.42;
    const half = ht * (0.16 + i * 0.07);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    ctx.fill();
    // 가지 위 눈
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half * 0.55, top + (bottom - top) * 0.55);
    ctx.quadraticCurveTo(
      x,
      top + (bottom - top) * 0.42,
      x - half * 0.55,
      top + (bottom - top) * 0.55,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillRect(x - ht * 0.03, base - ht * 0.1, ht * 0.06, ht * 0.1);
}

function snowBack(ctx: Ctx, w: number, h: number) {
  const sky = fillSky(ctx, w, h, [
    [0, '#050b20'],
    [0.5, '#11264f'],
    [1, '#284676'],
  ]);
  const rnd = seeded(401);
  stars(ctx, rnd, w, h * 0.55, 80, ['255,255,255', '200,220,255']);

  // 초승달 — 같은 하늘 그라데이션으로 한쪽을 덮어 깎는다
  const mx = Math.min(w * 0.2, 150);
  const my = h * 0.17;
  glow(ctx, mx, my, 110, 'rgba(190,210,255,0.18)');
  ctx.fillStyle = '#f4f1e2';
  ctx.beginPath();
  ctx.arc(mx, my, 26, 0, TAU);
  ctx.fill();
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.arc(mx + 11, my - 6, 23, 0, TAU);
  ctx.fill();

  // 먼 설산 — 달빛을 받는 왼쪽 비탈이 밝다
  const far = ridge(5, h * 0.66, 150, true);
  fillRidge(
    ctx,
    w,
    h,
    far,
    vGrad(ctx, h * 0.3, h * 0.7, [
      [0, '#2c4c80'],
      [1, '#18305a'],
    ]),
  );
  snowCaps(ctx, w, far, 34, 'rgba(225,236,255,0.78)', 6, h * 0.66 - 50);
  // 중간 눈 언덕
  const mid = ridge(7, h * 0.7, 16);
  fillRidge(
    ctx,
    w,
    h,
    mid,
    vGrad(ctx, h * 0.6, h, [
      [0, '#7f97c4'],
      [1, '#3c557f'],
    ]),
  );
  // 언덕 위 먼 전나무 숲
  for (let x = 0; x < w; x += 9 + rnd() * 14) {
    pine(ctx, x, mid(x) + 3, 18 + rnd() * 18, '#1a2b4c', 'rgba(220,232,255,0.55)');
  }
  vignette(ctx, w, h, 0.5);
}

function snowFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(402);
  // 가까운 눈 덮인 땅
  const near = ridge(9, h * 0.88, 10);
  fillRidge(
    ctx,
    w,
    h,
    near,
    vGrad(ctx, h * 0.8, h, [
      [0, '#a9bde2'],
      [1, '#6a82b0'],
    ]),
  );

  // 오른쪽 아래 불 켜진 오두막
  const cx = w - Math.max(80, w * 0.16);
  const base = near(cx) + 6;
  glow(ctx, cx, base - 22, 90, 'rgba(255,190,100,0.28)');
  ctx.fillStyle = '#2a1b22';
  ctx.fillRect(cx - 34, base - 40, 68, 40);
  ctx.fillRect(cx + 14, base - 72, 10, 22);
  // 지붕 + 쌓인 눈
  ctx.fillStyle = '#1c121a';
  ctx.beginPath();
  ctx.moveTo(cx - 44, base - 38);
  ctx.lineTo(cx, base - 70);
  ctx.lineTo(cx + 44, base - 38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#eef3ff';
  ctx.beginPath();
  ctx.moveTo(cx - 48, base - 36);
  ctx.lineTo(cx, base - 74);
  ctx.lineTo(cx + 48, base - 36);
  ctx.quadraticCurveTo(cx + 30, base - 44, cx + 20, base - 40);
  ctx.quadraticCurveTo(cx, base - 52, cx - 22, base - 41);
  ctx.quadraticCurveTo(cx - 34, base - 44, cx - 48, base - 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx + 12, base - 76, 14, 5);
  // 창문 불빛
  for (const wx of [-20, 8]) {
    const g = ctx.createRadialGradient(cx + wx + 6, base - 22, 0, cx + wx + 6, base - 22, 10);
    g.addColorStop(0, '#fff1c2');
    g.addColorStop(1, '#ff9f3a');
    ctx.fillStyle = g;
    ctx.fillRect(cx + wx, base - 28, 12, 12);
    ctx.fillStyle = '#2a1b22';
    ctx.fillRect(cx + wx + 5.4, base - 28, 1.4, 12);
    ctx.fillRect(cx + wx, base - 22.7, 12, 1.4);
  }

  // 양 끝 가까운 전나무
  pine(ctx, Math.max(30, w * 0.05), h + 4, 170, '#0b1730', 'rgba(235,242,255,0.9)');
  pine(ctx, Math.max(80, w * 0.13), h + 6, 110, '#0b1730', 'rgba(235,242,255,0.9)');
  pine(ctx, w - 26, h + 4, 140, '#0b1730', 'rgba(235,242,255,0.9)');
  for (let x = w * 0.22; x < w * 0.7; x += 70 + rnd() * 60) {
    pine(ctx, x, near(x) + 8, 34 + rnd() * 22, '#132344', 'rgba(235,242,255,0.8)');
  }
}

/* =========================================================
 * 5. 심해 산호초
 * ========================================================= */

function deepseaBack(ctx: Ctx, w: number, h: number) {
  fillSky(ctx, w, h, [
    [0, '#0e4c72'],
    [0.35, '#0a2f52'],
    [0.75, '#051a33'],
    [1, '#020a17'],
  ]);
  glow(ctx, w * 0.5, -h * 0.25, h * 0.9, 'rgba(120,220,255,0.25)');
  const rnd = seeded(501);
  // 멀리 바위 기둥
  for (let i = 0; i < Math.ceil(w / 120); i++) {
    const x = rnd() * w;
    const top = h * (0.45 + rnd() * 0.2);
    const bw = 30 + rnd() * 50;
    ctx.fillStyle = 'rgba(4,22,42,0.75)';
    ctx.beginPath();
    ctx.moveTo(x - bw, h);
    ctx.quadraticCurveTo(x - bw * 0.6, top + 40, x - bw * 0.2, top);
    ctx.quadraticCurveTo(x + bw * 0.3, top - 10, x + bw * 0.4, top + 30);
    ctx.quadraticCurveTo(x + bw * 0.8, top + 80, x + bw, h);
    ctx.closePath();
    ctx.fill();
  }
  // 저 멀리 물고기 떼
  ctx.fillStyle = 'rgba(150,210,240,0.18)';
  const sx = w * 0.3;
  const sy = h * 0.32;
  for (let i = 0; i < 26; i++) {
    const fx = sx + (rnd() - 0.5) * 140;
    const fy = sy + (rnd() - 0.5) * 50 + Math.sin(fx * 0.05) * 8;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 4, 1.6, 0, 0, TAU);
    ctx.moveTo(fx - 3, fy);
    ctx.lineTo(fx - 6.5, fy - 2);
    ctx.lineTo(fx - 6.5, fy + 2);
    ctx.fill();
  }
  // 해저 모래 능선
  fillRidge(ctx, w, h, ridge(11, h * 0.86, 10), '#06182b');
  vignette(ctx, w, h, 0.55);
}

function deepseaAnimated(ctx: Ctx, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 수면에서 비스듬히 내려오는 빛줄기
  for (let i = 0; i < 6; i++) {
    const x = w * (0.08 + i * 0.17) + Math.sin(t * 0.3 + i * 1.3) * 22;
    const a = 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 1.9));
    lightShaft(ctx, x, 24 + (i % 3) * 14, 120 + (i % 2) * 50, -40, h * 0.95, '150,230,255', a);
  }
  // 수면 근처 일렁이는 물빛 무늬
  ctx.strokeStyle = 'rgba(180,240,255,0.10)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const y =
        10 + k * 14 + Math.sin(x * 0.04 + t * 1.4 + k * 2) * 4 + Math.sin(x * 0.013 - t) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 천천히 떠다니는 해파리 2마리 (반투명 — 과일과 헷갈리지 않게 흐리게)
  for (let i = 0; i < 2; i++) {
    const x = w * (0.15 + 0.7 * frac(t * 0.008 + i * 0.55));
    const y = h * (0.28 + i * 0.22) + Math.sin(t * 0.45 + i * 2) * 26;
    const pulse = 1 + Math.sin(t * 2.2 + i) * 0.1;
    const hue = i === 0 ? '255,140,220' : '120,230,255';
    jellyfish(ctx, x, y, 16 * pulse, 16 / pulse, hue, t + i * 3);
  }
  ctx.restore();
}

function jellyfish(ctx: Ctx, x: number, y: number, rx: number, ry: number, rgb: string, t: number) {
  glow(ctx, x, y, rx * 3, `rgba(${rgb},0.12)`);
  const bell = ctx.createRadialGradient(x, y - ry * 0.3, 0, x, y, rx * 1.2);
  bell.addColorStop(0, `rgba(255,255,255,0.35)`);
  bell.addColorStop(0.5, `rgba(${rgb},0.28)`);
  bell.addColorStop(1, `rgba(${rgb},0.05)`);
  ctx.fillStyle = bell;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(x, y + ry * 0.35, x - rx, y);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.3)`;
  ctx.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const tx = x - rx * 0.7 + (k / 4) * rx * 1.4;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    for (let s = 1; s <= 6; s++) {
      ctx.lineTo(tx + Math.sin(t * 2 + k + s * 0.8) * 3, y + s * 6);
    }
    ctx.stroke();
  }
}

function deepseaFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(502);
  // 해초 — 물결에 휘어진 리본 모양 잎이 위로 갈수록 가늘어진다
  for (const [x, ht, s, color] of [
    [w * 0.02, h * 0.62, 1, '#0a2c2a'],
    [w * 0.06, h * 0.46, -1, '#0d3632'],
    [w * 0.1, h * 0.3, 1, '#0a2c2a'],
    [w * 0.92, h * 0.4, -1, '#0d3632'],
    [w * 0.96, h * 0.58, 1, '#0a2c2a'],
    [w * 0.995, h * 0.36, -1, '#0d3632'],
  ] as const) {
    const n = 18;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = h + 6 - ht * t;
      const cxk = x + Math.sin(t * 3.2 + x * 0.01) * 16 * s * t;
      // 잎 폭 — 가운데가 넓고 끝이 뾰족하다
      const half = 2 + 9 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.5);
      left.push([cxk - half, y]);
      right.push([cxk + half, y]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    left.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]![0], right[i]![1]);
    ctx.closePath();
    ctx.fill();
    // 잎맥
    ctx.strokeStyle = 'rgba(120,220,200,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    left.forEach(([px, py], i) => {
      const mx = (px + right[i]![0]) / 2;
      if (i === 0) ctx.moveTo(mx, py);
      else ctx.lineTo(mx, py);
    });
    ctx.stroke();
  }
  // 산호 — 가지마다 끝이 은은하게 빛난다
  const coral = (x: number, size: number, color: string, tip: string) => {
    const branchOut = (bx: number, by: number, a: number, len: number, depth: number) => {
      const ex = bx + Math.cos(a) * len;
      const ey = by + Math.sin(a) * len;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, depth * 2.4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (depth <= 0) {
        glow(ctx, ex, ey, 6, tip);
        return;
      }
      branchOut(ex, ey, a - 0.45 - rnd() * 0.2, len * 0.72, depth - 1);
      branchOut(ex, ey, a + 0.45 + rnd() * 0.2, len * 0.72, depth - 1);
    };
    branchOut(x, h + 2, -Math.PI / 2, size, 3);
  };
  coral(w * 0.16, 40, '#2a0f30', 'rgba(255,120,200,0.7)');
  coral(w * 0.25, 30, '#160a2a', 'rgba(120,230,255,0.7)');
  coral(w * 0.8, 38, '#2a0f30', 'rgba(255,170,90,0.7)');
  coral(w * 0.88, 28, '#160a2a', 'rgba(255,120,200,0.7)');
  // 바닥 바위
  fillRidge(ctx, w, h, ridge(12, h * 0.96, 6), '#020a14');
}

/* =========================================================
 * 6. 사막의 황혼
 * ========================================================= */

function camel(ctx: Ctx, x: number, y: number, s: number, rider: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  // 몸통과 혹
  ctx.moveTo(-14, -10);
  ctx.quadraticCurveTo(-12, -22, -4, -20);
  ctx.quadraticCurveTo(0, -27, 5, -20);
  ctx.quadraticCurveTo(12, -19, 13, -11);
  // 목과 머리
  ctx.quadraticCurveTo(18, -14, 19, -24);
  ctx.lineTo(25, -24);
  ctx.lineTo(25, -21);
  ctx.lineTo(21, -20);
  ctx.quadraticCurveTo(20, -8, 13, -5);
  ctx.lineTo(-14, -5);
  ctx.closePath();
  ctx.fill();
  // 다리
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const lx of [-11, -7, 8, 11]) {
    ctx.moveTo(lx, -6);
    ctx.lineTo(lx + (lx % 2 ? 1 : -1), 6);
  }
  ctx.stroke();
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.quadraticCurveTo(-18, -8, -17, -3);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (rider) {
    ctx.beginPath();
    ctx.moveTo(-3, -24);
    ctx.lineTo(3, -24);
    ctx.lineTo(1, -33);
    ctx.lineTo(-1, -33);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -36, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function desertBack(ctx: Ctx, w: number, h: number) {
  const horizon = h * 0.56;
  ctx.fillStyle = vGrad(ctx, 0, horizon, [
    [0, '#141d46'],
    [0.42, '#47387a'],
    [0.76, '#c8746a'],
    [1, '#ffc488'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(601);
  stars(ctx, rnd, w, horizon * 0.35, 36);
  // 금성(저녁별)
  glow(ctx, w * 0.82, h * 0.12, 14, 'rgba(255,250,230,0.9)');
  // 해가 막 진 자리의 잔광
  glow(ctx, w * 0.22, horizon, 260, 'rgba(255,190,120,0.42)');

  // 먼 피라미드
  const pyramid = (px: number, size: number) => {
    const top = horizon - size * 0.62;
    ctx.fillStyle = '#5a3350';
    ctx.beginPath();
    ctx.moveTo(px - size, horizon + 4);
    ctx.lineTo(px, top);
    ctx.lineTo(px + size, horizon + 4);
    ctx.closePath();
    ctx.fill();
    // 노을빛을 받는 왼쪽 면
    ctx.fillStyle = '#8a4e5c';
    ctx.beginPath();
    ctx.moveTo(px - size, horizon + 4);
    ctx.lineTo(px, top);
    ctx.lineTo(px - size * 0.12, horizon + 4);
    ctx.closePath();
    ctx.fill();
  };
  pyramid(w * 0.68, 70);
  pyramid(w * 0.8, 48);
  pyramid(w * 0.6, 34);

  // 모래 언덕 3겹 — 능선 왼쪽이 빛을 받는다
  const dune = (seed: number, baseY: number, amp: number, lit: string, shade: string) => {
    const y = ridge(seed, baseY, amp);
    const g = ctx.createLinearGradient(0, baseY - amp, w, baseY + amp);
    g.addColorStop(0, lit);
    g.addColorStop(1, shade);
    fillRidge(ctx, w, h, y, g);
    // 능선 하이라이트
    ctx.strokeStyle = 'rgba(255,210,160,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      if (x === 0) ctx.moveTo(x, y(x));
      else ctx.lineTo(x, y(x));
    }
    ctx.stroke();
    return y;
  };
  dune(13, horizon + 10, 14, '#a85a48', '#6a3640');
  const mid = dune(14, h * 0.7, 20, '#b8683e', '#6a3428');
  // 중간 언덕 능선을 걷는 낙타 행렬
  ctx.fillStyle = '#2a1418';
  const startX = w * 0.3;
  for (let i = 0; i < 4; i++) {
    const x = startX + i * 34;
    camel(ctx, x, mid(x) + 1, 0.9 - i * 0.04, i % 2 === 0);
  }
  dune(15, h * 0.86, 16, '#7a3c28', '#3a1a18');
  vignette(ctx, w, h, 0.5);
}

/* =========================================================
 * 7. 네온 시티
 * ========================================================= */

interface NeonSign {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  bars: number;
}

/** 화면 너비가 같으면 항상 같은 간판 배치 (back·animated 공용) */
function neonLayout(w: number, h: number) {
  const horizon = h * 0.66;
  const rnd = seeded(701);
  const signs: NeonSign[] = [];
  const colors = ['#ff3cc7', '#29f0ff', '#ffe14d', '#7dff8a'];
  for (let i = 0; i < Math.max(3, Math.floor(w / 180)); i++) {
    const sx = (w / Math.max(3, Math.floor(w / 180))) * (i + 0.5) + (rnd() - 0.5) * 50;
    signs.push({
      x: sx,
      y: horizon - 70 - rnd() * 90,
      w: 16 + rnd() * 14,
      h: 40 + rnd() * 40,
      color: colors[i % colors.length] ?? '#ff3cc7',
      bars: 2 + Math.floor(rnd() * 3),
    });
  }
  return { horizon, signs };
}

function neonBack(ctx: Ctx, w: number, h: number) {
  const { horizon } = neonLayout(w, h);
  ctx.fillStyle = vGrad(ctx, 0, horizon, [
    [0, '#06021a'],
    [0.55, '#1c0738'],
    [1, '#55104f'],
  ]);
  ctx.fillRect(0, 0, w, horizon);
  glow(ctx, w * 0.5, horizon, w * 0.55, 'rgba(255,60,190,0.35)');
  const rnd = seeded(702);
  stars(ctx, rnd, w, horizon * 0.35, 30, ['255,200,255', '200,240,255']);

  // 먼 빌딩 — 작은 창문 불빛
  const building = (x: number, bw: number, top: number, color: string, windows: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, top, bw, horizon - top + 1);
    for (let wy = top + 6; wy < horizon - 4; wy += 7) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
        if (rnd() > windows) continue;
        ctx.fillStyle = rnd() < 0.7 ? 'rgba(120,230,255,0.55)' : 'rgba(255,210,120,0.6)';
        ctx.fillRect(wx, wy, 2, 2.6);
      }
    }
  };
  for (let x = -10; x < w;) {
    const bw = 24 + rnd() * 40;
    building(x, bw, horizon - 50 - rnd() * 110, '#170932', 0.3);
    x += bw + 2;
  }
  // 가까운 빌딩 — 지붕 모서리에 네온 테두리
  for (let x = -20; x < w;) {
    const bw = 40 + rnd() * 60;
    // 화면 가운데는 낮게, 양 끝은 높게 (놀이 공간을 가리지 않게)
    const edge = Math.abs(x + bw / 2 - w / 2) / (w / 2);
    const top = horizon - 30 - (40 + rnd() * 70) * (0.5 + edge);
    building(x, bw, top, '#0b0420', 0.18);
    const neon = rnd() < 0.5 ? '#29f0ff' : '#ff3cc7';
    ctx.save();
    ctx.shadowColor = neon;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = neon;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 1, horizon);
    ctx.lineTo(x + 1, top + 1);
    ctx.lineTo(x + bw - 1, top + 1);
    ctx.stroke();
    ctx.restore();
    // 옥상 안테나와 빨간 경고등
    if (rnd() < 0.5) {
      ctx.strokeStyle = '#0b0420';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, top);
      ctx.lineTo(x + bw / 2, top - 22);
      ctx.stroke();
      glow(ctx, x + bw / 2, top - 22, 6, 'rgba(255,60,60,0.9)');
    }
    x += bw + 4;
  }

  // 지면 (그리드는 animated 에서 흐른다)
  ctx.fillStyle = vGrad(ctx, horizon, h, [
    [0, '#2a0838'],
    [1, '#07021a'],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = 'rgba(255,120,220,0.6)';
  ctx.fillRect(0, horizon - 0.5, w, 1.5);
  vignette(ctx, w, h, 0.5);
}

function neonAnimated(ctx: Ctx, w: number, h: number, t: number) {
  const { horizon, signs } = neonLayout(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 원근 그리드 — 가로줄이 앞으로 흘러온다
  const rows = 12;
  const shift = frac(t * 0.45);
  for (let k = 0; k < rows; k++) {
    const d = (k + shift) / rows;
    const y = horizon + d * d * (h - horizon);
    ctx.strokeStyle = `rgba(255,60,200,${0.08 + d * 0.4})`;
    ctx.lineWidth = 0.6 + d * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,60,200,0.28)';
  ctx.lineWidth = 1;
  const cols = 16;
  for (let k = -cols; k <= cols; k++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + k * 14, horizon);
    ctx.lineTo(w / 2 + k * (w / cols) * 1.6, h);
    ctx.stroke();
  }
  // 깜빡이는 세로 간판
  signs.forEach((s, i) => {
    const flick = Math.sin(t * 13 + i * 7.3) > -0.93 && Math.sin(t * 2.1 + i) > -0.98 ? 1 : 0.25;
    ctx.globalAlpha = flick;
    glow(ctx, s.x, s.y + s.h / 2, s.h, `${hexToRgba(s.color, 0.18)}`);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(s.x - s.w / 2, s.y, s.w, s.h);
    ctx.fillStyle = s.color;
    const gap = s.h / (s.bars + 1);
    for (let b = 1; b <= s.bars; b++) {
      ctx.fillRect(s.x - s.w * 0.3, s.y + b * gap - 2, s.w * 0.6, 3);
    }
  });
  ctx.restore();
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* =========================================================
 * 8. 불타는 화산
 * ========================================================= */

function volcanoLayout(w: number, h: number) {
  const cx = w * 0.66;
  const peakY = h * 0.34;
  return { cx, peakY, craterW: 40, base: h * 0.82 };
}

function volcanoBack(ctx: Ctx, w: number, h: number) {
  fillSky(ctx, w, h, [
    [0, '#0b0303'],
    [0.45, '#2a0806'],
    [0.75, '#5c1608'],
    [1, '#260904'],
  ]);
  const { cx, peakY, craterW, base } = volcanoLayout(w, h);
  const rnd = seeded(801);

  glow(ctx, cx, peakY, 260, 'rgba(255,90,20,0.32)');
  // 화산재 구름 — 뭉게뭉게 겹친 덩어리, 분화구 쪽 아랫면이 붉게 물든다
  for (let i = 0; i < 7; i++) {
    const x = (i / 7) * w + rnd() * 80;
    const y = h * (0.05 + rnd() * 0.2);
    const size = 30 + rnd() * 26;
    const near = 1 - Math.min(1, Math.abs(x - cx) / (w * 0.6));
    for (let k = 0; k < 6; k++) {
      const bx = x + (k - 2.5) * size * 0.7 + (rnd() - 0.5) * size * 0.4;
      const by = y + (rnd() - 0.5) * size * 0.5;
      const r = size * (0.6 + rnd() * 0.5);
      const g = ctx.createLinearGradient(0, by - r, 0, by + r);
      g.addColorStop(0, 'rgba(14,6,6,0.92)');
      g.addColorStop(0.6, 'rgba(40,12,8,0.9)');
      g.addColorStop(
        1,
        `rgba(${Math.round(120 + near * 90)},${Math.round(30 + near * 30)},12,0.85)`,
      );
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(bx, by, r * 1.25, r * 0.75, 0, 0, TAU);
      ctx.fill();
    }
  }

  // 먼 산맥
  fillRidge(ctx, w, h, ridge(16, h * 0.7, 110, true), '#1e0805');

  // 화산 — 비탈은 울퉁불퉁하고, 왼쪽 비탈은 분화구 불빛을 받아 붉다
  const left = cx - w * 0.44;
  const right = cx + w * 0.44;
  const slopeX = (side: -1 | 1, t: number) => {
    // t: 0 = 분화구 가장자리, 1 = 기슭. 위는 가파르고 아래는 완만한 오목한 비탈
    const edge = cx + (side * craterW) / 2;
    const foot = side < 0 ? left : right;
    return edge + (foot - edge) * Math.pow(t, 1.8);
  };
  const outline: [number, number][] = [];
  for (let i = 20; i >= 0; i--) {
    const t = i / 20;
    outline.push([
      slopeX(-1, t) + (i > 0 && i < 20 ? (rnd() - 0.5) * 7 : 0),
      peakY + (base + 20 - peakY) * t,
    ]);
  }
  // 분화구 가장자리 — 살짝 이가 빠진 모양
  outline.push([cx - craterW * 0.2, peakY + 4], [cx + craterW * 0.1, peakY - 3]);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    outline.push([
      slopeX(1, t) + (i > 0 && i < 20 ? (rnd() - 0.5) * 7 : 0),
      peakY + (base + 20 - peakY) * t,
    ]);
  }
  const body = ctx.createLinearGradient(left, 0, right, 0);
  body.addColorStop(0, '#2e0d08');
  body.addColorStop(0.42, '#1c0805');
  body.addColorStop(1, '#0b0302');
  ctx.fillStyle = body;
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  // 왼쪽 능선 테두리 — 분화구 불빛
  ctx.strokeStyle = 'rgba(255,110,40,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  outline.slice(0, 21).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  // 비탈의 골짜기 결 (어두운 골 + 밝은 능선)
  ctx.save();
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const side = i < 0 ? -1 : 1;
    const k = Math.abs(i) / 5.5;
    ctx.beginPath();
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const x =
        cx + side * (craterW * 0.4 * k + (Math.abs(slopeX(side, t) - cx) - craterW / 2) * k);
      const y = peakY + 4 + (base + 20 - peakY) * t;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x + (rnd() - 0.5) * 4, y);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = side < 0 ? 'rgba(255,90,40,0.08)' : 'rgba(255,90,40,0.03)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // 흘러내리는 용암 줄기 — 군데군데 식어 검게 굳은 마디가 있다
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const flow = (side: -1 | 1, spread: number, len: number, width: number, seed: number) => {
    const r = seeded(seed);
    const pts: [number, number][] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      const x =
        cx + side * craterW * 0.15 + side * (Math.abs(slopeX(side, t) - cx) - craterW / 2) * spread;
      const y = peakY + 3 + (base + 20 - peakY) * t;
      pts.push([x + Math.sin(i * 1.3 + seed) * 4 * t + (r() - 0.5) * 3, y]);
    }
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    };
    ctx.globalCompositeOperation = 'lighter';
    path();
    ctx.strokeStyle = 'rgba(255,70,10,0.18)';
    ctx.lineWidth = width * 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,110,30,0.55)';
    ctx.lineWidth = width * 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,130,0.75)';
    ctx.lineWidth = width * 0.5;
    ctx.stroke();
    // 식어서 굳은 마디
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(20,6,4,0.75)';
    for (let i = 3; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i]!;
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.9, width * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  };
  flow(-1, 0.55, 1, 2.6, 811);
  flow(1, 0.35, 0.9, 2.2, 812);
  flow(-1, 0.12, 0.75, 1.8, 813);
  ctx.restore();

  // 바닥의 용암 호수 (흐르는 빛은 animated 에서)
  ctx.fillStyle = vGrad(ctx, base, h, [
    [0, '#7a1a06'],
    [0.4, '#b8380a'],
    [1, '#4a0e04'],
  ]);
  ctx.fillRect(0, base, w, h - base);
  // 호숫가 — 식은 용암 껍질
  ctx.fillStyle = 'rgba(20,6,4,0.6)';
  for (let i = 0; i < Math.ceil(w / 40); i++) {
    const x = rnd() * w;
    const y = base + 6 + rnd() * (h - base - 12);
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + rnd() * 30, 2 + rnd() * 3, 0, 0, TAU);
    ctx.fill();
  }
  vignette(ctx, w, h, 0.55);
}

function volcanoAnimated(ctx: Ctx, w: number, h: number, t: number) {
  const { cx, peakY, craterW, base } = volcanoLayout(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 분화구 맥동
  const pulse = 0.55 + 0.3 * Math.sin(t * 2.2) + 0.15 * Math.sin(t * 7.3);
  glow(ctx, cx, peakY, 110, `rgba(255,120,30,${0.4 * pulse})`);
  glow(ctx, cx, peakY + 2, craterW * 0.7, `rgba(255,230,140,${0.7 * pulse})`);
  // 용암 분수 — 분화구에서 튀어 올랐다 떨어지는 불방울
  for (let i = 0; i < 16; i++) {
    const r = seeded(900 + i);
    const period = 1.6 + r() * 1.2;
    const k = frac(t / period + r());
    const vx = (r() - 0.5) * 70;
    const vy = -(90 + r() * 90);
    const x = cx + (r() - 0.5) * craterW * 0.5 + vx * k * period * 0.6;
    const y = peakY + vy * k * period * 0.6 + 160 * (k * period * 0.6) ** 2;
    if (y > peakY + 6) continue;
    const size = 1.6 + r() * 2.2;
    glow(ctx, x, y, size * 3, `rgba(255,${Math.round(150 + r() * 80)},60,${0.9 * (1 - k * 0.6)})`);
  }
  ctx.restore();

  // 피어오르는 연기 기둥 — 아래쪽은 불빛을 받는다
  for (let i = 0; i < 8; i++) {
    const k = frac(t * 0.06 + i / 8);
    const y = peakY - 12 - k * 200;
    const x = cx + Math.sin(k * 3 + i) * 14 + k * 50;
    const r = 16 + k * 64;
    const g = ctx.createRadialGradient(x, y + r * 0.3, 0, x, y, r);
    g.addColorStop(
      0,
      `rgba(${Math.round(150 - k * 110)},${Math.round(50 - k * 30)},25,${0.5 * (1 - k)})`,
    );
    g.addColorStop(0.6, `rgba(40,16,12,${0.45 * (1 - k)})`);
    g.addColorStop(1, 'rgba(20,8,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // 용암 호수 위를 흐르는 밝은 띠
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.rect(0, base, w, h - base);
  ctx.clip();
  for (let k = 0; k < 5; k++) {
    const y = base + 8 + k * ((h - base) / 5);
    ctx.strokeStyle = `rgba(255,${170 + k * 12},80,${0.18 + 0.1 * Math.sin(t * 1.6 + k)})`;
    ctx.lineWidth = 1.6 + (k % 2);
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 14) {
      const yy = y + Math.sin(x * 0.025 + t * 0.9 + k * 1.7) * 4;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // 부글부글 올라오는 기포
  for (let i = 0; i < 8; i++) {
    const r = seeded(950 + i);
    const k = frac(t * (0.4 + r() * 0.4) + r());
    const x = r() * w;
    const y = base + 10 + r() * (h - base - 16);
    const size = k * (4 + r() * 5);
    ctx.strokeStyle = `rgba(255,230,150,${0.7 * (1 - k)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function volcanoFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(802);
  // 앞쪽 현무암 바위 — 윗면 가장자리가 용암 빛을 받는다
  const rock = (x: number, bw: number, ht: number) => {
    const pts: [number, number][] = [[x - bw / 2, h + 4]];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const px = x - bw / 2 + (bw * i) / n;
      const py = h - ht * (0.45 + 0.55 * Math.sin((i / n) * Math.PI)) - rnd() * ht * 0.18;
      pts.push([px, py]);
    }
    pts.push([x + bw / 2, h + 4]);
    ctx.fillStyle = '#0a0302';
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,110,40,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.slice(1, -1).forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  };
  rock(w * 0.04, 150, 90);
  rock(w * 0.16, 90, 46);
  rock(w * 0.92, 170, 110);
  rock(w * 0.8, 80, 40);
}

/* =========================================================
 * 9. 오로라 설원
 * ========================================================= */

/** 오로라 한 줄 — 아래쪽이 밝은 초록이고 위로 갈수록 보랏빛으로 사라진다 (미리 그려 둔 세로 띠) */
const auroraStrips = new Map<string, HTMLCanvasElement>();
function auroraStrip(bottom: string, top: string) {
  const key = `${bottom}|${top}`;
  const hit = auroraStrips.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, top);
    grad.addColorStop(0.92, bottom);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 128);
  }
  auroraStrips.set(key, c);
  return c;
}

function auroraBack(ctx: Ctx, w: number, h: number) {
  fillSky(ctx, w, h, [
    [0, '#01030b'],
    [0.5, '#05172b'],
    [1, '#0b2a3a'],
  ]);
  const rnd = seeded(901);
  // 은하수 띠
  ctx.save();
  ctx.translate(w * 0.5, h * 0.3);
  ctx.rotate(-0.35);
  const band = ctx.createLinearGradient(0, -50, 0, 50);
  band.addColorStop(0, 'rgba(160,180,255,0)');
  band.addColorStop(0.5, 'rgba(160,180,255,0.08)');
  band.addColorStop(1, 'rgba(160,180,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(-w, -50, w * 2, 100);
  ctx.restore();
  stars(ctx, rnd, w, h * 0.7, Math.ceil(w / 4), ['255,255,255', '200,230,255', '255,240,220']);
}

function auroraAnimated(ctx: Ctx, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const curtains = [
    {
      base: 0.3,
      amp: 26,
      speed: 0.22,
      bottom: 'rgba(60,255,170,0.85)',
      top: 'rgba(120,90,255,0.4)',
    },
    {
      base: 0.4,
      amp: 18,
      speed: -0.17,
      bottom: 'rgba(80,255,210,0.7)',
      top: 'rgba(60,160,255,0.35)',
    },
    {
      base: 0.22,
      amp: 14,
      speed: 0.31,
      bottom: 'rgba(170,255,120,0.55)',
      top: 'rgba(255,90,200,0.3)',
    },
  ];
  const step = 4;
  curtains.forEach((c, i) => {
    const strip = auroraStrip(c.bottom, c.top);
    for (let x = -step; x <= w + step; x += step) {
      const y =
        h * c.base +
        Math.sin(x * 0.006 + t * c.speed + i) * c.amp +
        Math.sin(x * 0.019 - t * 0.5 + i * 2) * c.amp * 0.3;
      const len = 80 + 50 * Math.sin(x * 0.011 + t * 0.6 + i * 1.3);
      // 큰 물결로 밝기가 흐르고, 잔잔한 빛살이 살짝 얹힌다
      const wave = 0.5 + 0.5 * Math.sin(x * 0.012 + t * 0.9 + i * 3);
      const rays = 0.85 + 0.15 * Math.sin(x * 0.16 + t * 2.4 + i);
      ctx.globalAlpha = (0.18 + 0.5 * wave * wave) * rays;
      ctx.drawImage(strip, x, y - len, step + 1, len + 12);
    }
  });
  // 반짝이는 별
  ctx.globalAlpha = 1;
  const rnd = seeded(902);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.55;
    const a = Math.max(0, Math.sin(t * (1 + rnd() * 2) + rnd() * TAU));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function auroraFront(ctx: Ctx, w: number, h: number) {
  const rnd = seeded(903);
  // 설산 — 꼭대기 눈이 오로라 빛을 받아 초록빛을 띤다
  const far = ridge(17, h * 0.74, 200, true);
  fillRidge(
    ctx,
    w,
    h,
    far,
    vGrad(ctx, h * 0.34, h * 0.8, [
      [0, '#16304a'],
      [1, '#081626'],
    ]),
  );
  // 꼭대기 눈 — 오로라 빛을 받아 살짝 초록빛
  snowCaps(
    ctx,
    w,
    far,
    26,
    vGrad(ctx, h * 0.34, h * 0.7, [
      [0, 'rgba(210,255,240,0.6)'],
      [1, 'rgba(160,230,255,0.25)'],
    ]),
    18,
    h * 0.74 - 70,
  );
  const near = ridge(19, h * 0.84, 80, true);
  fillRidge(ctx, w, h, near, '#050e19');
  snowCaps(ctx, w, near, 12, 'rgba(200,240,255,0.22)', 20, h * 0.84 - 35);

  // 얼어붙은 호수 — 오로라가 희미하게 비친다
  const lakeTop = h * 0.82;
  ctx.fillStyle = vGrad(ctx, lakeTop, h, [
    [0, '#0d2c3a'],
    [1, '#04121c'],
  ]);
  ctx.fillRect(0, lakeTop, w, h - lakeTop);
  ctx.fillStyle = 'rgba(80,255,190,0.08)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(rnd() * w, lakeTop + 6 + rnd() * (h - lakeTop - 10), 30 + rnd() * 90, 1.5);
  }
  ctx.fillStyle = 'rgba(200,240,255,0.25)';
  ctx.fillRect(0, lakeTop, w, 1);
  // 호숫가 전나무 실루엣
  for (let x = 0; x < w; x += 8 + rnd() * 18) {
    if (x > w * 0.3 && x < w * 0.7 && rnd() < 0.6) continue;
    pine(ctx, x, lakeTop + 2, 16 + rnd() * 26, '#030b14', 'rgba(200,240,255,0.25)');
  }
  vignette(ctx, w, h, 0.5);
}

/* =========================================================
 * 10. 우주 성운
 * ========================================================= */

function cosmosBack(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = '#03010a';
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(1001);

  // 성운 — 가산 혼합으로 겹겹이
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, w * 0.28, h * 0.38, 280, 'rgba(140,60,255,0.34)');
  glow(ctx, w * 0.55, h * 0.22, 220, 'rgba(255,60,170,0.26)');
  glow(ctx, w * 0.74, h * 0.56, 250, 'rgba(40,200,255,0.2)');
  glow(ctx, w * 0.42, h * 0.3, 90, 'rgba(255,200,240,0.16)');
  // 성운 띠를 따라 흩어진 먼지 구름
  for (let i = 0; i < 40; i++) {
    const k = rnd();
    const x = w * (0.05 + k * 0.9) + (rnd() - 0.5) * 80;
    const y = h * (0.62 - k * 0.42) + (rnd() - 0.5) * 70;
    const color = ['160,80,255', '255,80,180', '60,200,255'][Math.floor(rnd() * 3)] ?? '160,80,255';
    glow(ctx, x, y, 20 + rnd() * 50, `rgba(${color},${0.08 + rnd() * 0.1})`);
  }
  ctx.restore();
  // 성운을 가르는 어두운 먼지 — 가장자리가 흐릿하도록 굵기를 줄여 가며 겹쳐 그린다
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = w * (0.2 + rnd() * 0.5);
    const y = h * (0.25 + rnd() * 0.3);
    const cy = y - 30 + rnd() * 60;
    const ex = x + 120 + rnd() * 60;
    const ey = y + (rnd() - 0.5) * 50;
    const width = 10 + rnd() * 12;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = 'rgba(3,1,10,0.11)';
      ctx.lineWidth = width * (1 - k * 0.22);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 60, cy, ex, ey);
      ctx.stroke();
    }
  }
  stars(ctx, rnd, w, h, Math.ceil(w / 3.2), [
    '255,255,255',
    '200,220,255',
    '255,220,200',
    '220,200,255',
  ]);

  // 작은 위성
  const mx = Math.min(w * 0.12, 90);
  const my = h * 0.2;
  const moon = ctx.createRadialGradient(mx - 5, my - 5, 1, mx, my, 16);
  moon.addColorStop(0, '#d8d2e8');
  moon.addColorStop(1, '#3a3450');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(mx, my, 16, 0, TAU);
  ctx.fill();

  // 고리 행성 (오른쪽 아래에 걸쳐 있다)
  const px = w * 0.84;
  const py = h * 0.86;
  const pr = 92;
  const ring = (front: boolean) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.38);
    ctx.scale(1, 0.26);
    ctx.beginPath();
    if (front) ctx.rect(-400, 0, 800, 400);
    else ctx.rect(-400, -400, 800, 400);
    ctx.clip();
    for (const [r, wd, a] of [
      [pr * 1.75, 14, 0.5],
      [pr * 1.52, 10, 0.35],
      [pr * 1.36, 6, 0.28],
    ] as const) {
      ctx.strokeStyle = `rgba(230,200,160,${a})`;
      ctx.lineWidth = wd;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  };
  glow(ctx, px, py, pr * 1.6, 'rgba(255,170,120,0.12)');
  ring(false);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.clip();
  const body = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
  body.addColorStop(0, '#f0b97a');
  body.addColorStop(0.5, '#b8643c');
  body.addColorStop(1, '#3a1a20');
  ctx.fillStyle = body;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  // 대기 줄무늬
  ctx.translate(px, py);
  ctx.rotate(-0.38);
  for (let i = -6; i <= 6; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(90,40,30,0.22)' : 'rgba(255,220,170,0.12)';
    ctx.fillRect(-pr, i * 14 - 4, pr * 2, 6 + (i % 3) * 3);
  }
  ctx.restore();
  // 밤 쪽 그림자
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.clip();
  const shadow = ctx.createRadialGradient(px - pr * 0.5, py - pr * 0.5, pr * 0.4, px, py, pr * 1.4);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,10,0.85)');
  ctx.fillStyle = shadow;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.restore();
  ring(true);
  vignette(ctx, w, h, 0.45);
}

function cosmosAnimated(ctx: Ctx, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 반짝이는 별
  const rnd = seeded(1002);
  for (let i = 0; i < 34; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = Math.pow(Math.max(0, Math.sin(t * (0.8 + rnd() * 2) + rnd() * TAU)), 3);
    const r = 0.8 + rnd() * 1.2;
    glow(ctx, x, y, r * 4, `rgba(220,230,255,${a * 0.5})`);
  }
  // 별똥별 — 5초마다 한 번, 매번 다른 자리에서
  const period = 5;
  const cycle = Math.floor(t / period);
  const k = (t % period) / 0.9;
  if (k < 1) {
    const r = seeded(cycle * 31 + 7);
    const x0 = w * (0.1 + r() * 0.6);
    const y0 = h * (0.05 + r() * 0.3);
    const len = 160 + r() * 120;
    const ang = 0.35 + r() * 0.35;
    const hx = x0 + Math.cos(ang) * len * k;
    const hy = y0 + Math.sin(ang) * len * k;
    const tail = 90;
    const fade = Math.sin(k * Math.PI);
    const g = ctx.createLinearGradient(
      hx,
      hy,
      hx - Math.cos(ang) * tail,
      hy - Math.sin(ang) * tail,
    );
    g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
    g.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
    ctx.stroke();
    glow(ctx, hx, hy, 6, `rgba(255,255,255,${fade})`);
  }
  ctx.restore();
}

/* =========================================================
 * 테마 목록
 * ========================================================= */

const ART: Record<ThemeId, ThemeArt> = {
  board: { back: drawBackground },
  sakura: { back: sakuraBack, animated: sakuraAnimated, front: sakuraFront },
  bamboo: { back: bambooBack, animated: bambooAnimated, front: bambooFront },
  beach: { back: beachBack, animated: beachAnimated, front: beachFront },
  snow: { back: snowBack, front: snowFront },
  deepsea: { back: deepseaBack, animated: deepseaAnimated, front: deepseaFront },
  desert: { back: desertBack },
  neon: { back: neonBack, animated: neonAnimated },
  volcano: { back: volcanoBack, animated: volcanoAnimated, front: volcanoFront },
  aurora: { back: auroraBack, animated: auroraAnimated, front: auroraFront },
  cosmos: { back: cosmosBack, animated: cosmosAnimated },
};

export function drawThemeBack(ctx: Ctx, id: ThemeId, w: number, h: number) {
  ART[id].back(ctx, w, h);
}

/** 앞쪽 실루엣 층이 있으면 그리고 true */
export function drawThemeFront(ctx: Ctx, id: ThemeId, w: number, h: number): boolean {
  const front = ART[id].front;
  if (!front) return false;
  front(ctx, w, h);
  return true;
}

export function drawThemeAnimated(ctx: Ctx, id: ThemeId, w: number, h: number, t: number) {
  ART[id].animated?.(ctx, w, h, t);
}

/* =========================================================
 * ThemeAmbient — 꽃잎·댓잎·눈·물방울·모래바람·빗줄기·불씨
 * ========================================================= */

type MoteKind = 'petal' | 'leaf' | 'snow' | 'bubble' | 'sand' | 'rain' | 'ember';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  phase: number;
  /** 0~1 — 깊이(멀수록 작고 느리고 흐리다) */
  depth: number;
}

const MOTES: Partial<Record<ThemeId, { kind: MoteKind; perWidth: number; min: number }>> = {
  sakura: { kind: 'petal', perWidth: 26, min: 18 },
  bamboo: { kind: 'leaf', perWidth: 50, min: 10 },
  snow: { kind: 'snow', perWidth: 9, min: 50 },
  deepsea: { kind: 'bubble', perWidth: 26, min: 18 },
  desert: { kind: 'sand', perWidth: 34, min: 14 },
  neon: { kind: 'rain', perWidth: 10, min: 45 },
  volcano: { kind: 'ember', perWidth: 16, min: 30 },
  aurora: { kind: 'snow', perWidth: 30, min: 14 },
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class ThemeAmbient {
  private motes: Mote[] = [];
  private kind: MoteKind | null = null;
  private w = 800;
  private h = 500;

  setTheme(id: ThemeId, w: number, h: number) {
    this.w = w;
    this.h = h;
    const spec = MOTES[id];
    this.kind = spec?.kind ?? null;
    const count = spec ? Math.max(spec.min, Math.round(w / spec.perWidth)) : 0;
    // 처음부터 화면 곳곳에 흩어진 상태로 시작
    this.motes = Array.from({ length: count }, () => this.spawn(true));
  }

  /** 화면 크기만 바뀐 경우 — 입자는 비율대로 옮긴다 */
  resize(w: number, h: number) {
    for (const m of this.motes) {
      m.x = (m.x / this.w) * w;
      m.y = (m.y / this.h) * h;
    }
    this.w = w;
    this.h = h;
  }

  private spawn(anywhere: boolean): Mote {
    const w = this.w;
    const h = this.h;
    const depth = Math.random();
    const m: Mote = {
      x: rnd(0, w),
      y: anywhere ? rnd(0, h) : -20,
      vx: 0,
      vy: 0,
      size: 1,
      rot: rnd(0, TAU),
      vr: rnd(-2, 2),
      phase: rnd(0, TAU),
      depth,
    };
    const near = 0.45 + depth * 0.55;
    switch (this.kind) {
      case 'petal':
        m.vx = rnd(10, 40);
        m.vy = rnd(28, 55) * near;
        m.size = rnd(3.2, 5.5) * near;
        break;
      case 'leaf':
        m.vx = rnd(-10, 20);
        m.vy = rnd(30, 50) * near;
        m.size = rnd(6, 10) * near;
        break;
      case 'snow':
        m.vx = rnd(-8, 12);
        m.vy = rnd(22, 55) * near;
        m.size = rnd(0.8, 2.8) * near;
        break;
      case 'bubble':
        m.y = anywhere ? rnd(0, h) : h + 20;
        m.vy = -rnd(18, 48) * near;
        m.size = rnd(1.5, 5) * near;
        break;
      case 'sand':
        m.x = anywhere ? rnd(0, w) : -80;
        m.y = rnd(h * 0.35, h);
        m.vx = rnd(70, 150) * near;
        m.size = rnd(30, 90) * near;
        break;
      case 'rain':
        m.vx = -140;
        m.vy = rnd(480, 640) * near;
        m.size = rnd(10, 18) * near;
        break;
      case 'ember':
        m.y = anywhere ? rnd(0, h) : h + 10;
        // 불씨는 수명이 있다 (phase 9초에 꺼짐)
        m.phase = anywhere ? rnd(0, 6) : 0;
        m.vx = rnd(-15, 25);
        m.vy = -rnd(30, 85) * near;
        m.size = rnd(1.2, 3) * near;
        break;
      default:
        break;
    }
    return m;
  }

  update(dt: number) {
    if (!this.kind) return;
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]!;
      m.phase += dt;
      m.rot += m.vr * dt;
      switch (this.kind) {
        case 'petal':
        case 'leaf':
          m.x += (m.vx + Math.sin(m.phase * 1.6) * 26) * dt;
          m.y += m.vy * dt;
          break;
        case 'snow':
          m.x += (m.vx + Math.sin(m.phase * 1.2 + m.depth * 5) * 12) * dt;
          m.y += m.vy * dt;
          break;
        case 'bubble':
          m.x += Math.sin(m.phase * 2.4) * 14 * dt;
          m.y += m.vy * dt;
          break;
        case 'sand':
          m.x += m.vx * dt;
          m.y += Math.sin(m.phase * 1.5) * 8 * dt;
          break;
        case 'rain':
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          break;
        case 'ember':
          m.x += (m.vx + Math.sin(m.phase * 3) * 18) * dt;
          m.y += m.vy * dt;
          break;
      }
      const out =
        m.y > h + 30 ||
        m.y < -40 ||
        m.x > w + 120 ||
        m.x < -140 ||
        (this.kind === 'ember' && m.phase > 9);
      if (out) this.motes[i] = this.spawn(false);
    }
  }

  draw(ctx: Ctx) {
    if (!this.kind) return;
    switch (this.kind) {
      case 'petal':
        for (const m of this.motes) {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(m.rot);
          // 뒤집히며 떨어지는 느낌 — 가로 폭이 주기적으로 줄었다 늘어난다
          ctx.scale(Math.max(0.15, Math.abs(Math.cos(m.phase * 2.2))), 1);
          ctx.globalAlpha = 0.55 + m.depth * 0.4;
          ctx.fillStyle = m.depth > 0.5 ? '#ffc4dc' : '#f79cc4';
          ctx.beginPath();
          ctx.moveTo(0, -m.size);
          ctx.quadraticCurveTo(m.size * 0.95, -m.size * 0.2, 0, m.size);
          ctx.quadraticCurveTo(-m.size * 0.95, -m.size * 0.2, 0, -m.size);
          ctx.fill();
          ctx.restore();
        }
        break;
      case 'leaf':
        for (const m of this.motes) {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(m.rot);
          ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(m.phase * 1.8))));
          ctx.globalAlpha = 0.5 + m.depth * 0.45;
          ctx.fillStyle = m.depth > 0.5 ? '#9fcf5a' : '#5f9a3a';
          ctx.beginPath();
          ctx.moveTo(-m.size, 0);
          ctx.quadraticCurveTo(0, -m.size * 0.22, m.size, 0);
          ctx.quadraticCurveTo(0, m.size * 0.22, -m.size, 0);
          ctx.fill();
          ctx.restore();
        }
        break;
      case 'snow':
        for (const m of this.motes) {
          ctx.globalAlpha = 0.35 + m.depth * 0.6;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size, 0, TAU);
          ctx.fill();
        }
        break;
      case 'bubble':
        ctx.lineWidth = 1;
        for (const m of this.motes) {
          ctx.globalAlpha = 0.35 + m.depth * 0.45;
          ctx.strokeStyle = '#bff0ff';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(m.x - m.size * 0.35, m.y - m.size * 0.35, Math.max(0.6, m.size * 0.25), 0, TAU);
          ctx.fill();
        }
        break;
      case 'sand':
        ctx.lineCap = 'round';
        for (const m of this.motes) {
          const g = ctx.createLinearGradient(m.x - m.size, 0, m.x, 0);
          g.addColorStop(0, 'rgba(255,214,170,0)');
          g.addColorStop(1, `rgba(255,214,170,${0.12 + m.depth * 0.18})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1 + m.depth;
          ctx.beginPath();
          ctx.moveTo(m.x - m.size, m.y + Math.sin(m.phase) * 3);
          ctx.quadraticCurveTo(m.x - m.size / 2, m.y - 4, m.x, m.y);
          ctx.stroke();
        }
        break;
      case 'rain':
        ctx.strokeStyle = 'rgba(160,210,255,1)';
        ctx.lineWidth = 1;
        for (const m of this.motes) {
          ctx.globalAlpha = 0.12 + m.depth * 0.22;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x + (m.vx / m.vy) * m.size, m.y + m.size);
          ctx.stroke();
        }
        break;
      case 'ember':
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const m of this.motes) {
          const flick = 0.55 + 0.45 * Math.sin(m.phase * 9 + m.depth * 20);
          const life = Math.max(0, 1 - m.phase / 9);
          ctx.globalAlpha = flick * life * (0.5 + m.depth * 0.5);
          ctx.fillStyle = m.depth > 0.6 ? '#ffe08a' : m.depth > 0.3 ? '#ffb347' : '#ff6a1a';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * 테마 미리보기 한 장 — 메뉴의 테마 카드에 쓰는 정지 화면.
 * (w, h) 는 논리 크기, 실제 캔버스 크기에 맞춰 호출 전에 scale 해 둔다
 */
export function drawThemeSnapshot(ctx: Ctx, id: ThemeId, w: number, h: number) {
  drawThemeBack(ctx, id, w, h);
  drawThemeAnimated(ctx, id, w, h, 3.2);
  drawThemeFront(ctx, id, w, h);
  const ambient = new ThemeAmbient();
  ambient.setTheme(id, w, h);
  ambient.draw(ctx);
}
