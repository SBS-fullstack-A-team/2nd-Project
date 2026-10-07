/**
 * 보스 5종 그리기 — 1단계와 2단계(변신 후)의 모습이 다르다.
 * 이미지 없이 그라디언트·패스만으로 입체감(명암, 리벳, 패널선, 발광부)을 낸다.
 * 모든 좌표는 보스 중심 기준이고, 보스의 앞쪽(플레이어 쪽)이 +y 다.
 */
import { TAU, drawSprite, drawThrust, ellipse, glowSprite, poly } from './render';

export interface BossLook {
  x: number;
  y: number;
  t: number;
  phase: 1 | 2;
  /** 맞았을 때 번쩍임 */
  flash: boolean;
  /** 0~1, 2단 변신 연출 진행도 */
  morph: number;
  /** Kraken 코어 개방 정도 0~1 */
  open: number;
  /** 남은 체력 비율 0~1 (손상 표현용) */
  hp: number;
  /** 보스 → 플레이어 방향 (포탑 조준용) */
  aim: number;
}

/* ---------------- 공용 도우미 ---------------- */

function rivets(ctx: CanvasRenderingContext2D, pts: [number, number][], r = 1.6) {
  for (const [x, y] of pts) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ellipse(ctx, x + 0.6, y + 0.6, r, r);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ellipse(ctx, x - 0.3, y - 0.3, r * 0.6, r * 0.6);
  }
}

/** 빛나는 구체 (코어·렌즈) */
function glowOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a = 1,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ellipse(ctx, x, y, r, r);
}

/** 포신 (조준 방향으로 회전) */
function barrel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  w: number,
  color = '#2a2d33',
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#15171b');
  g.addColorStop(0.5, color === '#2a2d33' ? '#5a606a' : color);
  g.addColorStop(1, '#15171b');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, 0, w, len);
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(-w / 2 - 1, len - 3, w + 2, 4);
  ctx.restore();
}

/** 그림자 */
function dropShadow(ctx: CanvasRenderingContext2D, dx: number, dy: number, rx: number, ry: number) {
  const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, rx);
  g.addColorStop(0, 'rgba(0,0,20,0.35)');
  g.addColorStop(1, 'rgba(0,0,20,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(1, ry / rx);
  ellipse(ctx, 0, 0, rx, rx);
  ctx.restore();
}

/** 피격 시 가산 합성으로 살짝 하얗게 */
function hitFlash(ctx: CanvasRenderingContext2D, on: boolean, rx: number, ry: number) {
  if (!on) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ellipse(ctx, 0, 0, rx, rx);
  ctx.restore();
}

/** 변신 중 하얗게 번쩍이는 원 */
function morphFlash(ctx: CanvasRenderingContext2D, morph: number) {
  if (morph <= 0) return;
  const a = Math.sin(morph * Math.PI);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 220);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ellipse(ctx, 0, 0, 220, 220);
}

/** 손상 자국 — 체력이 줄수록 그을음과 불씨가 늘어난다 (위치는 고정) */
function scorch(
  ctx: CanvasRenderingContext2D,
  spots: [number, number, number][],
  dmg: number,
  t: number,
) {
  const n = Math.min(spots.length, Math.floor(spots.length * Math.max(0, dmg)));
  for (let i = 0; i < n; i++) {
    const [x, y, r] = spots[i]!;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,10,5,0.85)');
    g.addColorStop(0.6, 'rgba(30,20,10,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ellipse(ctx, x, y, r, r);
    const flick = 0.6 + 0.4 * Math.sin(t * 13 + i * 2.1);
    glowOrb(ctx, x + 1, y, r * 0.35 * flick, 'rgba(255,120,30,0.9)', 0.8);
  }
}

/** 관(촉수·팔·꼬리)의 중심선 한 점 — 위치와 그 자리의 반지름 */
type TubePt = readonly [x: number, y: number, r: number];

/** 굵기가 변하는 관 윤곽 경로 — 양 끝은 둥글게 닫는다 */
function tubePath(ctx: CanvasRenderingContext2D, pts: readonly TubePt[]) {
  const n = pts.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const dirs: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, r] = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!;
    const c = pts[Math.min(n - 1, i + 1)]!;
    const d = Math.atan2(c[1] - a[1], c[0] - a[0]);
    dirs.push(d);
    left.push([x + Math.cos(d + Math.PI / 2) * r, y + Math.sin(d + Math.PI / 2) * r]);
    right.push([x + Math.cos(d - Math.PI / 2) * r, y + Math.sin(d - Math.PI / 2) * r]);
  }
  // 이웃 점의 중간을 지나는 곡선으로 매끈하게 잇는다
  const side = (s: [number, number][]) => {
    for (let i = 1; i < s.length - 1; i++) {
      const [x, y] = s[i]!;
      const [nx, ny] = s[i + 1]!;
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const last = s[s.length - 1]!;
    ctx.lineTo(last[0], last[1]);
  };
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  side(left);
  const [ex, ey, er] = pts[n - 1]!;
  ctx.arc(ex, ey, er, dirs[n - 1]! + Math.PI / 2, dirs[n - 1]! - Math.PI / 2, true);
  side(right.reverse());
  const [sx, sy, sr] = pts[0]!;
  ctx.arc(sx, sy, sr, dirs[0]! - Math.PI / 2, dirs[0]! + Math.PI / 2, true);
  ctx.closePath();
}

/** 관을 칠한다 — 바탕 + 왼쪽 위 하이라이트 + 오른쪽 아래 그림자로 둥근 입체감 */
function tube(
  ctx: CanvasRenderingContext2D,
  pts: readonly TubePt[],
  base: string | CanvasGradient,
  light = 'rgba(255,255,255,0.2)',
  dark = 'rgba(0,0,0,0.38)',
) {
  tubePath(ctx, pts);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 겹쳐 칠하면 마디마다 진해지므로, 옮긴 관 하나를 한 번에 칠한다
  tubePath(
    ctx,
    pts.map(([x, y, r]) => [x + r * 0.5, y + r * 0.5, r * 0.8] as const),
  );
  ctx.fillStyle = dark;
  ctx.fill();
  tubePath(
    ctx,
    pts.map(([x, y, r]) => [x - r * 0.38, y - r * 0.38, r * 0.3] as const),
  );
  ctx.fillStyle = light;
  ctx.fill();
  ctx.restore();
}

/** 관절 사슬 중심선 — 방향 angle(q) 를 따라 한 마디씩 뻗는다 (q = 0 뿌리 ~ 1 끝) */
function chain(
  x: number,
  y: number,
  len: number,
  segs: number,
  angle: (q: number) => number,
  radius: (q: number) => number,
): TubePt[] {
  const pts: TubePt[] = [[x, y, radius(0)]];
  const step = len / segs;
  for (let i = 1; i <= segs; i++) {
    const a = angle((i - 0.5) / segs);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y, radius(i / segs)]);
  }
  return pts;
}

/** 사슬 끝을 (tx, ty) 에 맞춘다 — 뿌리는 그대로 두고 끝으로 갈수록 많이 옮긴다 */
function pinTip(pts: readonly TubePt[], tx: number, ty: number): TubePt[] {
  const n = pts.length - 1;
  const [lx, ly] = pts[n]!;
  return pts.map(([x, y, r], i) => {
    const q = (i / n) ** 1.5;
    return [x + (tx - lx) * q, y + (ty - ly) * q, r] as const;
  });
}

/** 두 점 사이를 굵기가 변하는 직선 관 마디로 나눈다 */
function limb(ax: number, ay: number, ar: number, bx: number, by: number, br: number, n = 5) {
  const pts: TubePt[] = [];
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    pts.push([ax + (bx - ax) * q, ay + (by - ay) * q, ar + (br - ar) * q]);
  }
  return pts;
}

/** x 좌우 반전 (오른쪽 기준으로 만든 관을 왼쪽에 쓸 때) */
const mirrorX = (pts: readonly TubePt[], s: number): TubePt[] =>
  pts.map(([x, y, r]) => [x * s, y, r] as const);

/** 결정적 의사 난수 0~1 — 매 프레임 같은 모양(균열·판 흔들림)을 내기 위해 쓴다 */
function hash(n: number) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/* =========================================================
 * Stage 1 — 거대 비행선 골리앗
 * ========================================================= */
export function drawGoliath(ctx: CanvasRenderingContext2D, b: BossLook) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.phase === 1) goliathShip(ctx, b);
  else goliathMech(ctx, b);
  hitFlash(ctx, b.flash, 150, 60);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

const GOLIATH_SCORCH: [number, number, number][] = [
  [-60, -20, 16],
  [40, 18, 14],
  [110, -10, 12],
  [-115, 12, 13],
  [10, -34, 12],
  [-30, 30, 11],
];

function goliathShip(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  dropShadow(ctx, 30, 80, 170, 46);

  // 양 끝 꼬리날개
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#3d3826';
    poly(ctx, [
      140 * s,
      -10,
      178 * s,
      -38,
      186 * s,
      -30,
      160 * s,
      0,
      186 * s,
      30,
      178 * s,
      38,
      140 * s,
      10,
    ]);
    ctx.fillStyle = '#6a6040';
    poly(ctx, [146 * s, -8, 176 * s, -32, 180 * s, -28, 156 * s, -2]);
    ctx.fillStyle = '#b8342a';
    poly(ctx, [172 * s, -34, 186 * s, -30, 182 * s, -24, 170 * s, -28]);
  }

  // 기낭 본체
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 150, 58, 0, 0, TAU);
  ctx.clip();
  const env = ctx.createLinearGradient(0, -58, 0, 58);
  env.addColorStop(0, '#4c4430');
  env.addColorStop(0.35, '#a89a6e');
  env.addColorStop(0.55, '#8c7f58');
  env.addColorStop(1, '#3a3322');
  ctx.fillStyle = env;
  ctx.fillRect(-150, -58, 300, 116);
  // 위장 무늬
  ctx.fillStyle = 'rgba(60,70,40,0.35)';
  ellipse(ctx, -80, -18, 34, 14);
  ellipse(ctx, 30, 26, 40, 12);
  ellipse(ctx, 95, -22, 26, 12);
  ellipse(ctx, -20, 8, 22, 10);
  // 세로 늑골 (가장자리로 갈수록 좁아 보이게)
  for (let i = -7; i <= 7; i++) {
    const x = Math.sin((i / 8) * (Math.PI / 2)) * 150;
    ctx.strokeStyle = 'rgba(30,24,14,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, -60);
    ctx.lineTo(x, 60);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,200,0.12)';
    ctx.beginPath();
    ctx.moveTo(x + 2, -60);
    ctx.lineTo(x + 2, 60);
    ctx.stroke();
  }
  // 가로 이음매
  ctx.strokeStyle = 'rgba(30,24,14,0.5)';
  ctx.lineWidth = 1.2;
  for (const ry of [24, 42]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 150, ry, 0, 0, TAU);
    ctx.stroke();
  }
  // 가운데 장갑 띠
  const band = ctx.createLinearGradient(0, -9, 0, 9);
  band.addColorStop(0, '#2e2a22');
  band.addColorStop(0.5, '#5d574a');
  band.addColorStop(1, '#23201a');
  ctx.fillStyle = band;
  ctx.fillRect(-150, -8, 300, 16);
  const pts: [number, number][] = [];
  for (let x = -138; x <= 138; x += 14) pts.push([x, -4], [x, 4]);
  rivets(ctx, pts, 1.3);
  // 손상
  scorch(ctx, GOLIATH_SCORCH, Math.max(0, (1 - b.hp) * 2 - 0.1), t);
  ctx.restore();

  // 광택과 외곽선
  ctx.fillStyle = 'rgba(255,250,230,0.16)';
  ellipse(ctx, -24, -32, 100, 9);
  ctx.strokeStyle = '#1e1a10';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 150, 58, 0, 0, TAU);
  ctx.stroke();

  // 엔진 포드 + 레이저 포
  for (const s of [-1, 1]) {
    const px = 92 * s;
    ctx.save();
    ctx.translate(px, 0);
    ctx.save();
    ctx.rotate(Math.PI);
    drawThrust(ctx, 0, 36, 12, 30, t);
    ctx.restore();
    const pod = ctx.createLinearGradient(-17, 0, 17, 0);
    pod.addColorStop(0, '#24211c');
    pod.addColorStop(0.45, '#6d675c');
    pod.addColorStop(1, '#1c1a16');
    ctx.fillStyle = pod;
    ctx.beginPath();
    ctx.roundRect(-17, -36, 34, 70, 14);
    ctx.fill();
    ctx.strokeStyle = '#121110';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 냉각 핀
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 5; i++) ctx.fillRect(-13, -26 + i * 7, 26, 2.5);
    rivets(ctx, [
      [-12, -32],
      [12, -32],
      [-12, 28],
      [12, 28],
    ]);
    // 레이저 포구 — 충전되듯 맥동
    ctx.fillStyle = '#18161a';
    ellipse(ctx, 0, 30, 10, 10);
    ctx.fillStyle = '#3b1016';
    ellipse(ctx, 0, 30, 7, 7);
    glowOrb(ctx, 0, 30, 9 + Math.sin(t * 6 + s) * 3, '#ff3a4a');
    ctx.restore();
  }

  // 곤돌라 (함교)
  ctx.save();
  ctx.translate(0, 30);
  const hull = ctx.createLinearGradient(-34, 0, 34, 0);
  hull.addColorStop(0, '#1d1f25');
  hull.addColorStop(0.5, '#4a4e58');
  hull.addColorStop(1, '#1a1b20');
  ctx.fillStyle = hull;
  poly(ctx, [-34, -10, 34, -10, 30, 14, 14, 26, -14, 26, -30, 14]);
  ctx.strokeStyle = '#0e0f12';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 창문 불빛
  for (let i = -3; i <= 3; i++) {
    const on = Math.sin(t * 2 + i) > -0.6;
    ctx.fillStyle = on ? '#ffd46a' : '#6a5a30';
    ctx.fillRect(i * 8 - 2.5, -5, 5, 4);
  }
  // 부채꼴 포탑
  ctx.fillStyle = '#2b2d33';
  ellipse(ctx, 0, 14, 12, 9);
  for (let i = -3; i <= 3; i++) barrel(ctx, 0, 16, Math.PI / 2 + i * 0.17, 16, 3.2);
  ctx.fillStyle = '#5a5f6a';
  ellipse(ctx, 0, 13, 8, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ellipse(ctx, -2, 11, 4, 2);
  ctx.restore();

  // 항법등
  const blink = Math.floor(t * 2.5) % 2 === 0;
  glowOrb(ctx, -148, 0, blink ? 9 : 4, '#ff2a2a');
  glowOrb(ctx, 148, 0, blink ? 4 : 9, '#2aff6a');
}

/**
 * 골리앗 2단계 — 불타 버린 기낭을 찢고 나온 강철 거인.
 * 투구를 쓴 머리, 포탑을 얹은 거대한 견갑, 앞으로 뻗은 건틀릿 두 팔, 가슴 원자로.
 * 등 뒤로는 찢어진 기낭 잔해가 불타며 펄럭이고 검은 연기가 흩날린다.
 */
function goliathMech(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const pulse = 0.65 + 0.35 * Math.sin(t * 7);
  dropShadow(ctx, 30, 86, 168, 46);

  // ---------- 1) 연기 꼬리 — 찢어진 기낭에서 검은 연기가 뒤로 흩날린다 ----------
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.55 + i / 7) % 1;
      const r = 9 + k * 26;
      ctx.fillStyle = `rgba(38,34,32,${0.4 * (1 - k)})`;
      ellipse(ctx, s * (120 + k * 26 + Math.sin(t * 2 + i) * 4), -16 - k * 120, r, r * 0.85);
    }
  }

  // ---------- 2) 찢어진 기낭 잔해 ----------
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    goliathTatters(ctx, t + (s > 0 ? 0 : 1.7));
    ctx.restore();
  }

  // ---------- 3) 등 뒤 쌍발 추진기 ----------
  for (const s of [-1, 1]) {
    const ex = s * 30;
    ctx.save();
    ctx.translate(ex, -58);
    ctx.scale(1, -1);
    drawThrust(ctx, 0, 0, 15, 30, t + s, '#ffe0ff', '#ff3a8a');
    ctx.restore();
    ctx.fillStyle = metal(ctx, ex - 12, -64, ex + 12, -40, '#8a8670', '#45443a', '#1a1a16');
    ctx.beginPath();
    ctx.roundRect(ex - 12, -64, 24, 28, 5);
    ctx.fill();
    ctx.fillStyle = '#0d0d0b';
    for (const by of [-58, -52, -46]) ctx.fillRect(ex - 12, by, 24, 2);
    ctx.fillStyle = `rgba(255,74,154,${0.7 * pulse})`;
    ctx.fillRect(ex - 8, -66, 16, 3);
  }

  // ---------- 4) 건틀릿 팔 (견갑 아래로 뻗는다) ----------
  for (const s of [-1, 1]) goliathArm(ctx, t, s, pulse);

  // ---------- 5) 흉갑 몸통 ----------
  const chest = [
    -44, -52, 44, -52, 60, -28, 62, 6, 48, 32, 22, 44, -22, 44, -48, 32, -62, 6, -60, -28,
  ];
  ctx.fillStyle = '#0c0c0a';
  ctx.save();
  ctx.scale(1.05, 1.05);
  poly(ctx, chest);
  ctx.restore();
  ctx.fillStyle = metal(ctx, -50, -52, 50, 44, '#9a9478', '#55523f', '#1f1e17');
  poly(ctx, chest);
  // 왼쪽 위 빛을 받는 모서리
  ctx.fillStyle = 'rgba(255,250,220,0.12)';
  poly(ctx, [-42, -48, 0, -48, -8, -40, -52, -26, -56, 2, -60, -26]);
  // 장갑판 이음선 (어두운 홈 + 밝은 턱)
  for (const [color, dy] of [
    ['rgba(0,0,0,0.55)', 0],
    ['rgba(255,250,220,0.14)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    polyline(ctx, [-60, -28 + dy, -30, -36 + dy, 30, -36 + dy, 60, -28 + dy]);
    polyline(ctx, [-62, 6 + dy, -36, 18 + dy]);
    polyline(ctx, [62, 6 + dy, 36, 18 + dy]);
    polyline(ctx, [0, -52 + dy, 0, -36 + dy]);
  }
  // 배 갑옷 비늘판 (앞으로 겹친 세 겹)
  for (let k = 0; k < 3; k++) {
    const y = 20 + k * 8;
    const w = 34 - k * 6;
    ctx.fillStyle = metal(ctx, -w, y - 4, w, y + 6, '#8a8670', '#45443a', '#1a1a16');
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + 10, w, y);
    ctx.lineTo(w - 3, y + 7);
    ctx.quadraticCurveTo(0, y + 16, -w + 3, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c9a45a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + 10, w, y);
    ctx.stroke();
  }
  // 등 방열 격자 — 원자로 열이 새어 나온다
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = '#0d0d0b';
    ctx.fillRect(-20, -48 + k * 4, 40, 2.4);
    ctx.fillStyle = `rgba(255,74,154,${0.55 * pulse})`;
    ctx.fillRect(-18, -47.4 + k * 4, 36, 1);
  }
  // 황동 테두리
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.8;
  polyline(ctx, [...chest, chest[0]!, chest[1]!]);
  ctx.globalAlpha = 1;
  rivets(
    ctx,
    [
      [-38, -44],
      [38, -44],
      [-54, -20],
      [54, -20],
      [-54, 4],
      [54, 4],
      [-40, 26],
      [40, 26],
    ],
    1.3,
  );
  // 원자로 → 어깨로 흐르는 에너지 도관
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,74,154,0.85)';
  ctx.lineWidth = 2.4;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -t * 50;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 26, -10);
    ctx.quadraticCurveTo(s * 40, -22, s * 56, -6);
    ctx.stroke();
  }
  ctx.restore();

  // ---------- 6) 가슴 원자로 + 회전 포탑 고리 (회전 탄막의 발사점) ----------
  const cy = -8;
  ctx.fillStyle = '#08080a';
  ellipse(ctx, 0, cy, 30, 30);
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(t * 3);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillStyle = metal(ctx, -4, 20, 4, 34, '#b0b4bc', '#6a707b', '#2a2d33');
    ctx.fillRect(-3.5, 20, 7, 13);
    ctx.fillStyle = '#101115';
    ctx.fillRect(-2, 29, 4, 5);
  }
  ctx.strokeStyle = '#6a707b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, cy, 36 * (0.9 + pulse * 0.2), 'rgba(255,60,150,0.7)', 0.8);
  ctx.restore();
  const core = ctx.createRadialGradient(-4, cy - 4, 1, 0, cy, 16);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, '#ff8ac8');
  core.addColorStop(1, '#8a0a4a');
  ctx.fillStyle = core;
  ellipse(ctx, 0, cy, 15, 15);
  // 원자로를 감싼 4개의 걸쇠
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.save();
    ctx.translate(Math.cos(a) * 17, cy + Math.sin(a) * 17);
    ctx.rotate(a);
    ctx.fillStyle = '#2a2b30';
    ctx.fillRect(-2, -4, 6, 8);
    ctx.restore();
  }

  // ---------- 7) 견갑 + 어깨 포탑 (조준탄 발사점 ±60, +16) ----------
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 66, 2);
    ctx.scale(s, 1);
    // 겹친 견갑 세 장 — 바깥쪽이 크고 아래에 깔린다
    for (let k = 0; k < 3; k++) {
      const rx = 32 - k * 7;
      const ry = 34 - k * 8;
      const ox = 4 - k * 3;
      const oy = -2 + k * 3;
      ctx.fillStyle = '#0c0c0a';
      ellipse(ctx, ox + 1.5, oy + 2, rx + 1, ry + 1);
      ctx.fillStyle = metal(
        ctx,
        ox - rx,
        oy - ry,
        ox + rx,
        oy + ry,
        '#a29c80',
        '#57543f',
        '#1d1c16',
      );
      ellipse(ctx, ox, oy, rx, ry);
      ctx.strokeStyle = '#c9a45a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, 0, -2.2, 1.0);
      ctx.stroke();
    }
    // 바깥으로 솟은 뿔 가시
    ctx.fillStyle = metal(ctx, 26, -30, 50, -10, '#c8c2a4', '#6a6650', '#1d1c16');
    poly(ctx, [24, -20, 52, -36, 32, -8]);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    poly(ctx, [52, -36, 32, -8, 30, -14]);
    rivets(
      ctx,
      [
        [26, -12],
        [30, 18],
        [10, 26],
      ],
      1.3,
    );
    ctx.restore();
    // 포탑 — 플레이어를 조준하는 쌍열 중포
    const px = s * 60;
    barrel(ctx, px - 4, 16, b.aim, 26, 5.5);
    barrel(ctx, px + 4, 16, b.aim, 26, 5.5);
    ctx.fillStyle = metal(ctx, px - 13, 3, px + 13, 29, '#8a909c', '#4a4e58', '#16181d');
    ellipse(ctx, px, 16, 13, 13);
    ctx.strokeStyle = '#c9a45a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, 16, 13, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, px, 16, 8, 'rgba(255,74,154,0.9)', 0.8 * pulse);
    ctx.restore();
  }

  // ---------- 8) 투구 머리 ----------
  goliathHelm(ctx, t, pulse);

  // ---------- 9) 손상 + 튀는 스파크 ----------
  scorch(ctx, GOLIATH_MECH_SCORCH, Math.max(0, (0.5 - b.hp) * 2.4), t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const k = (t * 3 + i * 0.37) % 1;
    const a = i * 1.7 + Math.floor(t * 3 + i * 0.37) * 2.3;
    const r = 30 + k * 60;
    ctx.fillStyle = `rgba(255,200,240,${1 - k})`;
    ellipse(ctx, Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 2, 2);
  }
  ctx.restore();
}

const GOLIATH_MECH_SCORCH: [number, number, number][] = [
  [-30, -30, 10],
  [44, 14, 9],
  [-70, 18, 10],
  [76, -14, 9],
  [18, 30, 8],
  [-48, -40, 8],
];

/** 오른쪽 기준 — 불타며 펄럭이는 기낭 천 조각과 부러진 늑골 */
function goliathTatters(ctx: CanvasRenderingContext2D, t: number) {
  const f1 = Math.sin(t * 5) * 4;
  const f2 = Math.sin(t * 6.3 + 1) * 4;
  const cloth = [
    58,
    -46,
    96,
    -58,
    126,
    -50 + f1,
    150,
    -34,
    138,
    -24 + f2,
    158,
    -8,
    136,
    0 + f1,
    148,
    18,
    124,
    20 + f2,
    130,
    38,
    104,
    30,
    92,
    44,
    76,
    26,
    60,
    22,
  ];
  // 늑골 — 천보다 먼저 그려서 찢긴 틈 사이로 보이게 하고, 끝은 천 밖으로 삐져나온다
  const ribs = [
    [64, -40, 120, -62, 168, -40],
    [64, -14, 124, -26, 172, -4],
    [64, 12, 118, 8, 160, 30],
  ];
  for (const [ax, ay, cx, cy, bx, by] of ribs) {
    ctx.strokeStyle = '#1c1a16';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ax!, ay!);
    ctx.quadraticCurveTo(cx!, cy!, bx!, by!);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,190,160,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.fillStyle = metal(ctx, 60, -56, 150, 40, '#b0a274', '#7a6e4c', '#2e2818');
  poly(ctx, cloth);
  ctx.save();
  poly(ctx, cloth);
  ctx.clip();
  // 위장 무늬 + 천 주름
  ctx.fillStyle = 'rgba(60,70,40,0.35)';
  ellipse(ctx, 96, -30, 22, 10);
  ellipse(ctx, 120, 12, 18, 8);
  ctx.strokeStyle = 'rgba(30,24,14,0.4)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(62, -40 + k * 14);
    ctx.quadraticCurveTo(110, -46 + k * 14 + f1, 160, -30 + k * 12);
    ctx.stroke();
  }
  // 불에 탄 구멍 — 가장자리가 달아오른다
  for (const [hx, hy, hr] of [
    [112, -32, 9],
    [136, 4, 7],
    [92, 16, 6],
  ] as const) {
    ctx.fillStyle = '#120c08';
    ellipse(ctx, hx, hy, hr, hr * 0.8);
    ctx.strokeStyle = `rgba(255,140,40,${0.6 + 0.3 * Math.sin(t * 9 + hx)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr, hr * 0.8, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  // 찢긴 바깥 가장자리가 타오른다
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,120,30,${0.55 + 0.25 * Math.sin(t * 11)})`;
  ctx.lineWidth = 2;
  polyline(ctx, cloth.slice(4, 22));
  ctx.restore();
  // 바람에 뒤로 날리는 작은 불꽃
  for (const [fx, fy] of [
    [150, -34],
    [158, -8],
    [148, 18],
  ] as const) {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(1, -1);
    drawThrust(ctx, 0, 0, 7, 16, t * 1.3 + fx, '#fff0b0', '#ff5a1a');
    ctx.restore();
  }
}

/** 건틀릿 팔 — 어깨에서 팔꿈치를 거쳐 앞으로 뻗은 주먹, 집게발이 쥐었다 폈다 한다 */
function goliathArm(ctx: CanvasRenderingContext2D, t: number, s: number, pulse: number) {
  const sw = Math.sin(t * 1.8 + s * 1.3);
  const sx = s * 62;
  const sy = 8;
  const ex = s * (98 + sw * 3);
  const ey = 22 + sw * 4;
  const wx = s * (104 + sw * 2);
  const wy = 54 + sw * 6;
  const armMetal = metal(ctx, sx, sy - 10, wx, wy + 10, '#8a8670', '#4a4a3e', '#18181a');
  tube(ctx, limb(sx, sy, 13, ex, ey, 10), armMetal);
  // 팔꿈치 유압 피스톤
  ctx.strokeStyle = '#c0c4cc';
  ctx.lineWidth = 2.4;
  polyline(ctx, [sx + s * 8, sy + 12, ex - s * 4, ey + 12]);
  ctx.strokeStyle = '#2a2b30';
  ctx.lineWidth = 1;
  polyline(ctx, [sx + s * 8, sy + 12, ex - s * 4, ey + 12]);
  // 아래팔 — 건틀릿으로 굵어진다
  tube(ctx, limb(ex, ey, 11, wx, wy, 15), armMetal);
  for (const q of [0.35, 0.65]) {
    const bx = ex + (wx - ex) * q;
    const by = ey + (wy - ey) * q;
    ctx.strokeStyle = '#c9a45a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(bx, by, 12 + q * 3, 3, Math.atan2(wy - ey, wx - ex) + Math.PI / 2, 0, TAU);
    ctx.stroke();
  }
  // 팔꿈치 관절
  ctx.fillStyle = metal(ctx, ex - 9, ey - 9, ex + 9, ey + 9, '#b0b4bc', '#5a5f6a', '#1a1b20');
  ellipse(ctx, ex, ey, 9, 9);
  rivets(ctx, [[ex, ey]], 2);
  // 주먹 — 아래팔 방향으로 돌려서 그린다 (+y 가 손끝)
  const grip = 0.5 + 0.5 * Math.sin(t * 2.4 + s);
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(Math.atan2(wy - ey, wx - ex) - Math.PI / 2);
  // 집게발 3개 — 벌렸다 오므린다
  for (const k of [-1, 0, 1]) {
    ctx.save();
    ctx.translate(k * 8, 10);
    ctx.rotate(k * (0.15 + grip * 0.35));
    ctx.fillStyle = metal(ctx, -4, 0, 4, 22, '#c8ccd4', '#5a5f6a', '#121317');
    poly(ctx, [-4.5, 0, 4.5, 0, 3, 14, -1, 24, -2.5, 14]);
    ctx.restore();
  }
  ctx.fillStyle = metal(ctx, -15, -10, 15, 14, '#a29c80', '#57543f', '#1d1c16');
  ctx.beginPath();
  ctx.roundRect(-15, -10, 30, 22, 6);
  ctx.fill();
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 주먹 마디 징
  for (const k of [-1, 0, 1]) {
    ctx.fillStyle = '#d8d4c0';
    poly(ctx, [k * 9 - 3, 8, k * 9, 14, k * 9 + 3, 8]);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, 0, 9, 'rgba(255,74,154,0.85)', 0.7 * pulse);
  ctx.restore();
  ctx.restore();
}

/** 투구 쓴 머리 — 볏과 뿔, 앞쪽 T자 바이저가 빛난다 */
function goliathHelm(ctx: CanvasRenderingContext2D, t: number, pulse: number) {
  const hy = 52;
  ctx.save();
  // 머리는 몸에 비해 크게 — (0, hy) 를 중심으로 키운다
  ctx.translate(0, hy);
  ctx.scale(1.25, 1.25);
  ctx.translate(0, -hy);
  // 목 보호대
  ctx.fillStyle = metal(ctx, -26, 34, 26, 50, '#6a6650', '#3a3a30', '#121210');
  poly(ctx, [-28, 36, 28, 36, 22, 50, -22, 50]);
  // 옆으로 뻗었다 앞으로 휘는 황소 뿔
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#0c0c0a';
    ctx.beginPath();
    ctx.moveTo(s * 15, hy - 7);
    ctx.quadraticCurveTo(s * 44, hy - 14, s * 40, hy + 22);
    ctx.quadraticCurveTo(s * 34, hy - 2, s * 15, hy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metal(ctx, s * 14, hy - 12, s * 42, hy + 22, '#f4ecd0', '#a49a78', '#3a3626');
    ctx.beginPath();
    ctx.moveTo(s * 16, hy - 6);
    ctx.quadraticCurveTo(s * 42, hy - 12, s * 39, hy + 20);
    ctx.quadraticCurveTo(s * 33, hy - 1, s * 16, hy + 4);
    ctx.closePath();
    ctx.fill();
    // 뿔 마디 줄무늬
    ctx.strokeStyle = 'rgba(60,50,30,0.5)';
    ctx.lineWidth = 1;
    for (const k of [0.3, 0.5, 0.7]) {
      polyline(ctx, [s * (16 + k * 26), hy - 9 + k * 4, s * (18 + k * 18), hy + 2 + k * 2]);
    }
  }
  // 투구 돔
  ctx.fillStyle = '#0c0c0a';
  ellipse(ctx, 0, hy + 1, 23, 21);
  const dome = ctx.createRadialGradient(-7, hy - 8, 2, 0, hy, 24);
  dome.addColorStop(0, '#d0ccb4');
  dome.addColorStop(0.45, '#6e6a54');
  dome.addColorStop(1, '#1a1a14');
  ctx.fillStyle = dome;
  ellipse(ctx, 0, hy, 21, 19);
  // 볏 — 정수리를 가로지르는 황동 지느러미
  ctx.fillStyle = metal(ctx, -4, hy - 20, 4, hy + 14, '#f0d48a', '#c9a45a', '#5a4420');
  poly(ctx, [-3, hy - 22, 3, hy - 22, 4, hy + 6, 0, hy + 12, -4, hy + 6]);
  // 바이저 — 앞쪽 테두리에 T 자로 빛나는 틈
  ctx.fillStyle = '#060608';
  poly(ctx, [-16, hy + 8, 16, hy + 8, 12, hy + 17, -12, hy + 17]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const v = 0.6 + 0.4 * pulse;
  ctx.fillStyle = `rgba(255,90,170,${v})`;
  ctx.fillRect(-13, hy + 10, 26, 2.6);
  ctx.fillRect(-1.6, hy + 10, 3.2, 7);
  glowOrb(ctx, 0, hy + 12, 14, 'rgba(255,74,154,0.6)', 0.35 * v);
  ctx.restore();
  rivets(
    ctx,
    [
      [-15, hy - 2],
      [15, hy - 2],
    ],
    1.2,
  );
  // 볏 끝 경고등
  glowOrb(ctx, 0, hy - 22, Math.floor(t * 2.5) % 2 ? 6 : 3, '#ff2a4a');
  ctx.restore();
}

/* =========================================================
 * Stage 2 — 해상 요새 크라켄
 * ========================================================= */
const KRAKEN_SCORCH: [number, number, number][] = [
  [-90, 30, 14],
  [80, -40, 13],
  [-40, -50, 12],
  [120, 20, 12],
  [-130, -10, 11],
  [50, 48, 11],
];

/** 선체 바깥 장갑 / 갑판 / 중앙 성채 윤곽 */
const KRAKEN_OUTER = [
  -152, -22, -114, -68, 114, -68, 152, -22, 152, 22, 114, 64, -114, 64, -152, 22,
];
const KRAKEN_DECK = [
  -138, -16, -104, -56, 104, -56, 138, -16, 138, 16, 104, 52, -104, 52, -138, 16,
];
const KRAKEN_CITADEL = [-60, -30, -44, -44, 44, -44, 60, -30, 60, 34, 44, 46, -44, 46, -60, 34];

/**
 * 2단계 — 갑판이 찢겨 벌어진 구멍 윤곽 (중심 0, 8 기준 각도별 반지름 배율).
 * 매 프레임 같은 모양이어야 해서 미리 정해 둔다.
 */
const KRAKEN_TEAR = Array.from({ length: 22 }, (_, i) => 0.82 + hash(i + 3) * 0.3);

/** 촉수 하나의 모양 (오른쪽 기준, 왼쪽은 좌우 반전) */
interface Tentacle {
  /** 뿌리 위치 */
  x: number;
  y: number;
  /** 뻗는 방향 (라디안) · 끝으로 갈수록 말리는 정도 · 길이 · 뿌리 굵기 */
  a: number;
  curl: number;
  len: number;
  r: number;
  /** 흔들림 위상 */
  ph: number;
  /** 끝을 이 자리에 고정 (탄이 나가는 자리) */
  pin?: [number, number];
}

/** 1단계 — 선체 아래에서 뻗어 나온 촉수 */
const KRAKEN_ARMS_CALM: Tentacle[] = [
  { x: 128, y: -46, a: -0.55, curl: -1.1, len: 118, r: 21, ph: 0 },
  { x: 146, y: 4, a: 0.05, curl: 0.9, len: 110, r: 20, ph: 1.3 },
  { x: 118, y: 50, a: 0.85, curl: 1.3, len: 88, r: 17, ph: 2.1 },
  // 앞 촉수 — 끝의 발광 미끼에서 물결탄이 나간다 (±90, +118)
  { x: 76, y: 52, a: 1.4, curl: 0.35, len: 80, r: 19, ph: 0.7, pin: [90, 118] },
];

/** 2단계 — 더 굵고 길게 날뛰는 촉수 (앞 촉수 끝의 아가리에서 바늘탄) */
const KRAKEN_ARMS_RAGE: Tentacle[] = [
  { x: 70, y: -62, a: -1.35, curl: -0.9, len: 124, r: 22, ph: 2.6 },
  { x: 128, y: -46, a: -0.5, curl: -1.3, len: 146, r: 25, ph: 0 },
  { x: 146, y: 4, a: 0.05, curl: 1.1, len: 138, r: 24, ph: 1.3 },
  { x: 118, y: 50, a: 0.8, curl: 1.4, len: 108, r: 20, ph: 2.1 },
  { x: 76, y: 52, a: 1.4, curl: 0.35, len: 82, r: 21, ph: 0.7, pin: [90, 118] },
];

/** 촉수 중심선 — 끝으로 갈수록 가늘어지고 물결치며 말린다 */
function tentaclePts(c: Tentacle, t: number, speed: number, wave: number): TubePt[] {
  let pts = chain(
    c.x,
    c.y,
    c.len,
    14,
    (q) => c.a + c.curl * q * q + Math.sin(t * speed + c.ph - q * 3.2) * wave * q,
    (q) => c.r * (1 - q * 0.78),
  );
  if (c.pin) pts = pinTip(pts, c.pin[0] + Math.sin(t * 2 + c.ph) * 3, c.pin[1]);
  return pts;
}

/**
 * 촉수 그리기 — 살갗 + 한쪽 줄의 빨판 + (2단계) 생체 발광 줄무늬.
 * tip: 'lure' 1단계 발광 미끼 / 'maw' 2단계 이빨 달린 아가리
 */
function krakenTentacle(
  ctx: CanvasRenderingContext2D,
  pts: TubePt[],
  rage: boolean,
  t: number,
  side: number,
  tip: 'lure' | 'maw' | null,
) {
  const n = pts.length - 1;
  const [rx, ry] = pts[0]!;
  const [tx, ty] = pts[n]!;
  const skin = ctx.createLinearGradient(rx, ry, tx, ty);
  skin.addColorStop(0, rage ? '#3a0820' : '#1a4450');
  skin.addColorStop(0.5, rage ? '#7a1a40' : '#2e6e74');
  skin.addColorStop(1, rage ? '#c0386a' : '#5aa8a0');
  tube(ctx, pts, skin, rage ? 'rgba(255,180,210,0.22)' : 'rgba(200,255,250,0.2)');
  // 2단계 — 등줄기를 따라 흐르는 생체 발광
  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const [x0, y0, r0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      const k = 0.5 + 0.5 * Math.sin(t * 6 - i * 0.8);
      ctx.strokeStyle = `rgba(255,60,140,${0.55 * k})`;
      ctx.lineWidth = Math.max(1, r0 * 0.22);
      polyline(ctx, [x0, y0, x1, y1]);
    }
    ctx.restore();
  }
  // 빨판 — 촉수 한쪽 가장자리를 따라 줄지어 난다
  for (let i = 1; i < n - 1; i++) {
    const [x, y, r] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    const d = Math.atan2(ny - y, nx - x) + (side * Math.PI) / 2;
    const sx = x + Math.cos(d) * r * 0.55;
    const sy = y + Math.sin(d) * r * 0.55;
    const sr = Math.max(1.2, r * 0.3);
    ctx.fillStyle = rage ? '#ffb8d0' : '#cfe8e0';
    ellipse(ctx, sx, sy, sr, sr);
    ctx.fillStyle = rage ? '#3a0618' : '#163a40';
    ellipse(ctx, sx, sy, sr * 0.5, sr * 0.5);
    if (rage && i % 2 === 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, sx, sy, sr * 2.4, 'rgba(255,80,160,0.8)', 0.5 + 0.5 * Math.sin(t * 7 + i));
      ctx.restore();
    }
  }
  if (tip === 'lure') {
    // 아귀처럼 빛나는 미끼
    const p = 0.7 + 0.3 * Math.sin(t * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, tx, ty, 14 * p, 'rgba(90,208,255,0.9)', 0.9);
    ctx.restore();
    ctx.fillStyle = '#e8fbff';
    ellipse(ctx, tx, ty, 3.5, 3.5);
  } else if (tip === 'maw') {
    // 끝이 네 갈래로 벌어진 이빨 아가리
    const [px, py] = pts[n - 1]!;
    const d = Math.atan2(ty - py, tx - px);
    const open = 0.35 + 0.2 * Math.sin(t * 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, tx, ty, 16, 'rgba(255,40,80,0.9)', 0.9);
    ctx.restore();
    for (let k = 0; k < 4; k++) {
      const a = d + (k - 1.5) * (0.5 + open);
      ctx.fillStyle = '#f0e0d0';
      poly(ctx, [
        tx + Math.cos(a + 1.2) * 3,
        ty + Math.sin(a + 1.2) * 3,
        tx + Math.cos(a) * 12,
        ty + Math.sin(a) * 12,
        tx + Math.cos(a - 1.2) * 3,
        ty + Math.sin(a - 1.2) * 3,
      ]);
    }
  }
}

/** 오른쪽 기준 촉수 목록을 좌우 양쪽으로 그린다 */
function krakenArms(
  ctx: CanvasRenderingContext2D,
  arms: Tentacle[],
  t: number,
  rage: boolean,
  speed: number,
  wave: number,
) {
  for (const s of [-1, 1]) {
    for (const c of arms) {
      const pts = mirrorX(tentaclePts(c, t + (s < 0 ? 1.1 : 0), speed, wave), s);
      krakenTentacle(ctx, pts, rage, t, -s, c.pin ? (rage ? 'maw' : 'lure') : null);
    }
  }
}

/**
 * 크라켄 — 거대 촉수 괴물이 등에 짊어진 해상 요새.
 * 1단계: 강철 요새가 물 위에 떠 있고, 그 아래 거대한 그림자와 촉수가 선체를 붙잡고 있다.
 * 2단계(각성): 갑판이 찢겨 벌어지며 괴물의 거대한 눈과 부리가 드러나고, 촉수가 붉게 빛나며 날뛴다.
 * open: 변신 중 중앙 장갑문이 열리는 정도 (0~1)
 */
export function drawKraken(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const rage = b.phase === 2;
  ctx.save();
  ctx.translate(b.x, b.y);

  krakenWater(ctx, t, rage);
  // 선체 밑에서 뻗어 나온 촉수 (선체보다 먼저 그려서 밑에 깔린다)
  if (rage) krakenArms(ctx, KRAKEN_ARMS_RAGE, t, true, 3.6, 0.75);
  else krakenArms(ctx, KRAKEN_ARMS_CALM, t, false, 2.2, 0.45);

  krakenHull(ctx, b, rage);

  // 선체 가장자리를 넘어 갑판을 움켜쥔 촉수
  for (const s of [-1, 1]) {
    const grip: Tentacle = rage
      ? { x: 96, y: -26, a: -0.9, curl: 1.6, len: 78, r: 18, ph: 0.4 }
      : { x: 178, y: -34, a: Math.PI - 0.25, curl: -1.3, len: 70, r: 16, ph: 0.4 };
    const pts = mirrorX(tentaclePts(grip, t + (s < 0 ? 0.8 : 0), rage ? 3 : 1.6, 0.3), s);
    krakenTentacle(ctx, pts, rage, t, s, null);
  }

  scorch(ctx, KRAKEN_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);
  hitFlash(ctx, b.flash, 150, 66);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/** 물 — 물속의 거대한 그림자, 퍼져 나가는 물결, 선체에 부딪히는 물보라 */
function krakenWater(ctx: CanvasRenderingContext2D, t: number, rage: boolean) {
  // 물속 괴물의 몸통 그림자
  const sh = ctx.createRadialGradient(0, -6, 30, 0, -6, 220);
  sh.addColorStop(0, rage ? 'rgba(40,0,12,0.6)' : 'rgba(0,10,22,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.save();
  ctx.scale(1, 0.6);
  ellipse(ctx, 0, -10, 220, 220);
  ctx.restore();
  // 물속에서 천천히 움직이는 커다란 촉수 그림자
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3 + Math.sin(t * 0.7 + i) * 0.12;
    const pts = chain(
      Math.cos(a) * 110,
      Math.sin(a) * 50,
      150,
      8,
      (q) => a + Math.sin(t * 1.2 + i * 1.7 - q * 2.5) * 0.6 * q,
      (q) => 16 * (1 - q * 0.8),
    );
    tubePath(ctx, pts);
    ctx.fillStyle = rage ? 'rgba(50,0,16,0.3)' : 'rgba(0,14,26,0.28)';
    ctx.fill();
  }
  // 퍼져 나가는 물결 고리
  ctx.strokeStyle = rage ? 'rgba(255,200,210,0.25)' : 'rgba(200,235,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = (t * (rage ? 0.8 : 0.5) + i / 3) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.ellipse(0, 0, 160 + k * 80, 76 + k * 40, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 2단계 — 물이 끓어오르는 거품
  if (rage) {
    for (let i = 0; i < 14; i++) {
      const k = (t * 0.9 + hash(i)) % 1;
      const a = hash(i + 20) * TAU;
      const r = 150 + hash(i + 40) * 50;
      ctx.strokeStyle = `rgba(255,220,230,${0.5 * (1 - k)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.5, 2 + k * 5, 0, TAU);
      ctx.stroke();
    }
  }
}

function krakenHull(ctx: CanvasRenderingContext2D, b: BossLook, rage: boolean) {
  const t = b.t;
  const pulse = 0.6 + 0.4 * Math.sin(t * (rage ? 7 : 3));

  // ---------- 물보라 테두리 ----------
  ctx.save();
  ctx.scale(1.04, 1.07);
  ctx.strokeStyle = 'rgba(235,248,255,0.16)';
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = t * 24;
  polyline(ctx, [...KRAKEN_OUTER, KRAKEN_OUTER[0]!, KRAKEN_OUTER[1]!]);
  ctx.restore();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + t * 0.5;
    ctx.fillStyle = 'rgba(235,248,255,0.45)';
    ellipse(ctx, Math.cos(a) * 158, Math.sin(a) * 72, 12 + Math.sin(t * 4 + i) * 5, 5);
  }

  // ---------- 바깥 장갑 띠 — 녹물 자국과 따개비 ----------
  ctx.fillStyle = metal(ctx, -150, -68, 150, 64, '#4e5c66', '#2e3a42', '#141b20');
  poly(ctx, KRAKEN_OUTER);
  ctx.strokeStyle = '#080c0f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.save();
  poly(ctx, KRAKEN_OUTER);
  ctx.clip();
  for (let i = 0; i < 18; i++) {
    const x = -140 + i * 16.5 + hash(i) * 6;
    const len = 6 + hash(i + 7) * 10;
    const g = ctx.createLinearGradient(0, -68, 0, -68 + len);
    g.addColorStop(0, 'rgba(140,70,30,0.55)');
    g.addColorStop(1, 'rgba(140,70,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, -68, 2.2, len);
  }
  for (let i = 0; i < 30; i++) {
    const a = hash(i + 50) * TAU;
    const x = Math.cos(a) * 146;
    const y = Math.sin(a) * 62;
    ctx.fillStyle = 'rgba(210,205,190,0.55)';
    ellipse(ctx, x, y, 1.6 + hash(i) * 1.4, 1.4 + hash(i) * 1.2);
  }
  ctx.restore();

  // ---------- 갑판 ----------
  ctx.fillStyle = metal(ctx, -138, -56, 138, 52, '#76858f', '#56646f', '#36424c');
  poly(ctx, KRAKEN_DECK);
  ctx.save();
  poly(ctx, KRAKEN_DECK);
  ctx.clip();
  // 미끄럼 방지 격자
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -138; x <= 138; x += 5) {
    ctx.moveTo(x, -56);
    ctx.lineTo(x + 20, 52);
  }
  ctx.stroke();
  // 패널선
  for (const [color, dx] of [
    ['rgba(15,20,25,0.4)', 0],
    ['rgba(255,255,255,0.1)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = -126; x <= 126; x += 18) {
      ctx.moveTo(x + dx, -56);
      ctx.lineTo(x + dx, 52);
    }
    ctx.stroke();
  }
  ctx.restore();
  // 갑판 난간 기둥
  ctx.save();
  ctx.strokeStyle = 'rgba(200,215,225,0.6)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 5]);
  polyline(ctx, [...KRAKEN_DECK, KRAKEN_DECK[0]!, KRAKEN_DECK[1]!]);
  ctx.restore();
  // 뱃머리 경고 줄무늬
  ctx.save();
  ctx.beginPath();
  ctx.rect(-104, 46, 208, 6);
  ctx.clip();
  for (let x = -110; x < 110; x += 12) {
    ctx.fillStyle = '#e8c02a';
    poly(ctx, [x, 52, x + 6, 46, x + 12, 46, x + 6, 52]);
  }
  ctx.restore();
  const rv: [number, number][] = [];
  for (let x = -100; x <= 100; x += 20) rv.push([x, -62], [x, 58]);
  rivets(ctx, rv);

  // ---------- 미사일 사일로 4기 (유도 미사일 발사점) ----------
  for (const mx of [-112, -70, 70, 112]) {
    if (rage) {
      // 2단계 — 터져 나간 사일로가 불타고 있다
      ctx.fillStyle = '#0a0d10';
      ellipse(ctx, mx, -18, 14, 16);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, mx, -18, 12 + pulse * 4, 'rgba(255,110,30,0.9)', 0.8);
      ctx.restore();
      ctx.save();
      ctx.translate(mx, -26);
      ctx.scale(1, -1);
      drawThrust(ctx, 0, 0, 12, 22, t * 1.4 + mx, '#fff0b0', '#ff4a1a');
      ctx.restore();
      continue;
    }
    ctx.fillStyle = '#121a20';
    ctx.fillRect(mx - 14, -36, 28, 38);
    // 경고 테두리
    ctx.strokeStyle = '#e8c02a';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(mx - 14, -36, 28, 38);
    ctx.setLineDash([]);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const hx = mx - 11 + c * 12;
        const hy = -33 + r * 11.5;
        ctx.fillStyle = metal(ctx, hx, hy, hx + 10, hy + 10, '#7a8892', '#46525c', '#222b32');
        ctx.fillRect(hx, hy, 10, 10);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 0.8;
        polyline(ctx, [hx, hy + 10, hx + 10, hy]);
        const lit = (r + c + Math.floor(t * 4)) % 4 === 0;
        ctx.fillStyle = lit ? '#ffb03a' : '#7a3a10';
        ellipse(ctx, hx + 8, hy + 2, 1.4, 1.4);
      }
    }
  }

  // ---------- 조준 포탑 (앞쪽 모서리) ----------
  for (const tx of [-112, 112]) {
    ctx.save();
    ctx.translate(tx, 30);
    ctx.rotate(b.aim - Math.PI / 2);
    for (const bx of [-4.5, 4.5]) {
      ctx.fillStyle = metal(ctx, bx - 2.5, 0, bx + 2.5, 0, '#5a606a', '#2a2d33', '#101114');
      ctx.fillRect(bx - 2.5, 4, 5, 26);
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(bx - 3.5, 26, 7, 4);
    }
    ctx.fillStyle = metal(ctx, -16, -14, 16, 14, '#a8b4be', '#58646e', '#1e262c');
    poly(ctx, [-15, -12, 15, -12, 17, 4, 11, 14, -11, 14, -17, 4]);
    ctx.strokeStyle = '#0d1216';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#2a333a';
    ellipse(ctx, -4, -3, 4, 4);
    ctx.fillStyle = rage ? '#ff4a5a' : '#9fe8ff';
    ctx.fillRect(4, -6, 6, 2);
    ctx.restore();
  }

  // ---------- 중앙 성채 ----------
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.save();
  ctx.translate(5, 6);
  poly(ctx, KRAKEN_CITADEL);
  ctx.restore();
  ctx.fillStyle = metal(ctx, -60, -44, 60, 46, '#8c9ca8', '#55636e', '#27313a');
  poly(ctx, KRAKEN_CITADEL);
  ctx.strokeStyle = '#0d1216';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 성채 측면 총안
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#0a0e12';
      ctx.fillRect(s * 54 - 2, -22 + k * 13, 4, 7);
      ctx.fillStyle = rage ? 'rgba(255,90,90,0.6)' : 'rgba(160,230,255,0.5)';
      ctx.fillRect(s * 54 - 1, -20 + k * 13, 2, 3);
    }
  }

  // ---------- 함교 탑 + 레이더 + 탐조등 ----------
  if (!rage) {
    ctx.save();
    ctx.translate(0, -52);
    ctx.fillStyle = metal(ctx, -30, -12, 30, 14, '#9aaab6', '#5e6c78', '#232b31');
    poly(ctx, [-30, -10, 30, -10, 24, 14, -24, 14]);
    ctx.fillStyle = metal(ctx, -18, -22, 18, 0, '#b0c0cc', '#6a7a86', '#2a333a');
    poly(ctx, [-18, -20, 18, -20, 14, -2, -14, -2]);
    ctx.fillStyle = '#9fe8ff';
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 10 - 3, 2, 6, 3);
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 9 - 2.5, -14, 5, 2.5);
    // 안테나 마스트
    ctx.strokeStyle = '#c8d4dc';
    ctx.lineWidth = 1.2;
    polyline(ctx, [-22, -10, -22, -30]);
    polyline(ctx, [22, -10, 24, -26]);
    glowOrb(ctx, -22, -30, Math.floor(t * 2) % 2 ? 4 : 2, '#ff3a3a');
    // 회전 레이더 접시
    const ra = t * 3;
    ctx.save();
    ctx.translate(0, -26);
    ctx.scale(Math.cos(ra), 1);
    ctx.fillStyle = metal(ctx, -14, -5, 14, 5, '#e0e8ee', '#8a9aa6', '#3a454e');
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // 탐조등 — 바다를 훑는 빛줄기
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sa = Math.PI / 2 + Math.sin(t * 0.9) * 1.1;
    const beam = ctx.createRadialGradient(0, -40, 4, 0, -40, 260);
    beam.addColorStop(0, 'rgba(255,250,220,0.22)');
    beam.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.arc(0, -40, 260, sa - 0.12, sa + 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    // 2단계 — 함교가 부서져 불타는 잔해만 남았다
    ctx.fillStyle = '#1a2026';
    poly(ctx, [-30, -60, -8, -66, 6, -58, 28, -62, 24, -38, -24, -38]);
    ctx.strokeStyle = 'rgba(255,140,60,0.7)';
    ctx.lineWidth = 1.4;
    polyline(ctx, [-30, -60, -8, -66, 6, -58, 28, -62]);
    ctx.save();
    ctx.translate(-6, -58);
    ctx.scale(1, -1);
    drawThrust(ctx, 0, 0, 18, 30, t * 1.2, '#fff0b0', '#ff4a1a');
    ctx.restore();
  }

  // ---------- 중앙 — 1단계는 조개 장갑문, 2단계는 찢겨 드러난 괴물의 눈 ----------
  if (rage) krakenMaw(ctx, b, pulse);
  else krakenHatch(ctx, b);
}

/** 1단계 중앙 — 둥근 조개 장갑문, 변신하면서 좌우로 열려 눈이 드러난다 */
function krakenHatch(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const cy = 8;
  const open = b.open * 34;
  ctx.fillStyle = '#05080b';
  ellipse(ctx, 0, cy, 38, 36);
  if (b.open > 0) krakenEye(ctx, b, 26, '#3ad0ff');
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * open, 0);
    ctx.beginPath();
    ctx.arc(0, cy, 34, -Math.PI / 2, Math.PI / 2, s < 0);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, -34, cy - 34, 34, cy + 34, '#a8b6c0', '#56646f', '#1c252c');
    ctx.fill();
    ctx.strokeStyle = '#0a0e12';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 조개껍데기 같은 방사 홈
    ctx.save();
    ctx.clip();
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + ((k + 0.5) / 7) * Math.PI;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.2;
      polyline(ctx, [0, cy, s * Math.cos(a) * 36, cy + Math.sin(a) * 36]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      polyline(ctx, [1, cy + 1, s * Math.cos(a) * 36 + 1, cy + Math.sin(a) * 36 + 1]);
    }
    for (const r of [14, 24]) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // 문 안쪽 가장자리 경고 줄무늬
    for (let y = -24; y < 40; y += 8) {
      ctx.fillStyle = (y / 8) % 2 === 0 ? '#e8c02a' : '#1a1a1a';
      const half = Math.sqrt(Math.max(0, 34 * 34 - (y + 4 - cy) ** 2));
      if (half > 4) ctx.fillRect(s < 0 ? -5 : 0, y, 5, 8);
    }
    rivets(
      ctx,
      [
        [s * 26, cy - 18],
        [s * 30, cy],
        [s * 26, cy + 18],
      ],
      1.4,
    );
    ctx.restore();
  }
  // 닫혀 있어도 틈으로 빛이 샌다
  if (b.open < 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#3ad0ff';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
    ctx.fillRect(-1.5, cy - 34, 3, 68);
    glowOrb(ctx, 0, cy, 20, 'rgba(58,208,255,0.6)', 0.25 + 0.15 * Math.sin(t * 4));
    ctx.restore();
  }
}

/** 괴물의 눈 — 플레이어를 따라 움직이는 세로 동공 */
function krakenEye(ctx: CanvasRenderingContext2D, b: BossLook, r: number, color: string) {
  const t = b.t;
  const cy = 8;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, cy, r * 1.7 + Math.sin(t * 5) * 3, color, 0.8);
  ctx.restore();
  const sclera = ctx.createRadialGradient(-r * 0.25, cy - r * 0.3, 2, 0, cy, r);
  sclera.addColorStop(0, '#fff6d8');
  sclera.addColorStop(0.45, color === '#3ad0ff' ? '#7fe4ff' : '#ff9a5a');
  sclera.addColorStop(0.85, color === '#3ad0ff' ? '#0a5a8a' : '#a01020');
  sclera.addColorStop(1, '#1a0008');
  ctx.fillStyle = sclera;
  ellipse(ctx, 0, cy, r, r);
  // 홍채 무늬
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(t * 0.6);
  ctx.strokeStyle = 'rgba(40,0,10,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    ctx.rotate(TAU / 18);
    polyline(ctx, [r * 0.35, 0, r * 0.82, 0]);
  }
  ctx.restore();
  // 세로 동공
  const px = Math.cos(b.aim) * r * 0.22;
  const py = cy + Math.sin(b.aim) * r * 0.22;
  ctx.fillStyle = '#080002';
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(0.32, 1);
  ellipse(ctx, 0, 0, r * 0.62, r * 0.62);
  ctx.restore();
  // 젖은 눈의 반사광
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ellipse(ctx, -r * 0.35, cy - r * 0.38, r * 0.16, r * 0.1);
}

/** 2단계 중앙 — 찢어진 갑판 구멍 속 살덩이, 네 갈래 부리, 이빨 고리, 거대한 눈 */
function krakenMaw(ctx: CanvasRenderingContext2D, b: BossLook, pulse: number) {
  const t = b.t;
  const cy = 8;
  const n = KRAKEN_TEAR.length;
  const tear = (scale: number) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = KRAKEN_TEAR[i]! * scale;
      const x = Math.cos(a) * 70 * k;
      const y = cy + Math.sin(a) * 52 * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // 찢긴 강판 — 바깥으로 말려 올라간 가장자리
  tear(1.12);
  ctx.fillStyle = '#9aa8b2';
  ctx.fill();
  tear(1);
  const flesh = ctx.createRadialGradient(0, cy, 6, 0, cy, 70);
  flesh.addColorStop(0, '#7a1430');
  flesh.addColorStop(0.6, '#3a0616');
  flesh.addColorStop(1, '#12020a');
  ctx.fillStyle = flesh;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,150,80,0.8)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // 맥동하는 혈관
  ctx.save();
  tear(1);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.2;
    const k = 0.5 + 0.5 * Math.sin(t * 5 - i);
    ctx.strokeStyle = `rgba(255,50,90,${0.35 + 0.35 * k})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 30, cy + Math.sin(a) * 26);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.3) * 48,
      cy + Math.sin(a + 0.3) * 38,
      Math.cos(a + 0.1) * 70,
      cy + Math.sin(a + 0.1) * 54,
    );
    ctx.stroke();
  }
  ctx.restore();
  // 이빨 고리 — 안쪽을 향한 송곳니
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.sin(t * 2) * 0.03;
    const r0 = 42;
    const r1 = 31 + (i % 2) * 3;
    ctx.fillStyle = '#efe2cc';
    poly(ctx, [
      Math.cos(a - 0.12) * r0,
      cy + Math.sin(a - 0.12) * r0 * 0.86,
      Math.cos(a) * r1,
      cy + Math.sin(a) * r1 * 0.86,
      Math.cos(a + 0.12) * r0,
      cy + Math.sin(a + 0.12) * r0 * 0.86,
    ]);
  }
  krakenEye(ctx, b, 26 + pulse * 1.5, '#ff3a5a');
  // 네 갈래 부리 — 눈을 감싸며 벌렸다 오므린다
  const bite = 0.18 + 0.14 * Math.sin(t * 3.2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.save();
    ctx.translate(Math.cos(a) * 40, cy + Math.sin(a) * 34);
    ctx.rotate(a + Math.PI / 2 + bite);
    ctx.fillStyle = metal(ctx, -10, -10, 10, 22, '#4a3040', '#1e0e18', '#08040a');
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.quadraticCurveTo(4, -14, 12, -2);
    ctx.quadraticCurveTo(10, 14, -4, 24);
    ctx.quadraticCurveTo(0, 10, -9, -6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,210,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

/* =========================================================
 * Stage 5 — 시공간 메카 크로노스
 * ========================================================= */
/** 2단계 — 장갑 이음매가 갈라져 안쪽 열기가 새어 나오는 선 */
const CHRONOS_CRACKS: number[][] = [
  [-24, -46, -14, -30, -26, -16, -12, 0],
  [28, -44, 16, -28, 32, -10],
  [-38, 26, -24, 38, -30, 58],
  [36, 22, 22, 40, 28, 60],
  [-88, -34, -70, -24, -60, -8],
  [92, -38, 74, -22, 66, -6],
];

/** 손상 자국 위치 (체력이 줄수록 앞에서부터 하나씩 늘어난다) */
const CHRONOS_SCORCH: [number, number, number][] = [
  [-30, 36, 9],
  [36, -32, 8],
  [-84, -30, 8],
  [90, -28, 7],
  [22, 54, 7],
  [-40, -50, 7],
  [62, 4, 6],
];

/** 2단계 — 왜곡장에 생기는 시공간 균열 */
const CHRONOS_RIFTS: number[][] = [
  [-150, -40, -132, -52, -138, -30, -118, -36],
  [146, 30, 128, 22, 136, 44, 114, 40],
  [-120, 96, -104, 84, -100, 104],
  [110, -104, 96, -90, 116, -82],
];

/** 금속판 그라디언트 — 왼쪽 위에서 빛을 받는다 */
function metal(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  light: string,
  mid: string,
  dark: string,
) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  return g;
}

/** 꺾인 선 하나 (패널 이음선·균열용) */
function polyline(ctx: CanvasRenderingContext2D, pts: readonly number[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) ctx.moveTo(pts[i]!, pts[i + 1]!);
    else ctx.lineTo(pts[i]!, pts[i + 1]!);
  }
  ctx.stroke();
}

/**
 * 크로노스 — 시공간 엔진을 품은 중장갑 전함형 메카.
 * 건메탈 장갑 선체 + 뒤로 꺾인 장갑 날개 + 쌍발 엔진, 가운데 장갑 하우징 안에서 자이로 고리가 도는 시공간 코어.
 * 2단계(광란)에서는 코어 셔터가 열리고 날개 끝에 에너지 칼날이 돋으며, 장갑 틈과 주변 공간이 갈라진다.
 */
export function drawChronos(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const rage = b.phase === 2;
  /** 주 발광색 / 보조 발광색 */
  const glow = rage ? '#ff5a2a' : '#a36bff';
  const glow2 = rage ? '#ffc04a' : '#6ad8ff';
  const glowRgb = rage ? '255,90,42' : '163,107,255';
  /** 황동 테두리 — 얇은 강조선으로만 쓴다 */
  const trim = '#c9a45a';
  const spin = rage ? 3.2 : 1;
  const pulse = 0.65 + 0.35 * Math.sin(t * (rage ? 9 : 3));

  ctx.save();
  ctx.translate(b.x, b.y);

  dropShadow(ctx, 26, 124, 150, 42);

  // ---------- 1) 시공간 왜곡장 — 비스듬히 누운 홀로그램 고리 3겹 ----------
  const aura = ctx.createRadialGradient(0, 0, 40, 0, 0, 180);
  aura.addColorStop(0, `rgba(${glowRgb},0.26)`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ellipse(ctx, 0, 0, 180, 180);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.scale(1, 0.78);
  for (const [r, speed, segs, alpha] of [
    [118, 0.25, 6, 0.45],
    [134, -0.35, 10, 0.32],
    [150, 0.15, 3, 0.25],
  ] as const) {
    ctx.save();
    ctx.rotate(t * speed * spin);
    ctx.strokeStyle = glow;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a0 + (TAU / segs) * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 가장 안쪽 고리의 눈금 (시계 눈금을 은은하게 남긴다)
  ctx.save();
  ctx.rotate(-t * 0.5 * spin);
  ctx.strokeStyle = glow2;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const inner = i % 5 === 0 ? 100 : 104;
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * 108, Math.sin(a) * 108);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // 2단계 — 공간이 찢어진 균열이 깜빡인다
  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    CHRONOS_RIFTS.forEach((r, i) => {
      const f = 0.5 + 0.5 * Math.sin(t * 11 + i * 1.7);
      ctx.strokeStyle = `rgba(255,120,60,${0.35 * f})`;
      ctx.lineWidth = 6;
      polyline(ctx, r);
      ctx.strokeStyle = `rgba(255,236,200,${0.9 * f})`;
      ctx.lineWidth = 1.6;
      polyline(ctx, r);
    });
    ctx.restore();
  }

  // ---------- 2) 쌍발 엔진 (뒤쪽 = 위) ----------
  for (const s of [-1, 1]) {
    const ex = s * 30;
    ctx.save();
    ctx.translate(ex, -92);
    ctx.scale(1, -1);
    drawThrust(
      ctx,
      0,
      0,
      13,
      rage ? 40 : 28,
      t + s,
      rage ? '#ffe0b0' : '#efe6ff',
      rage ? '#ff4a1a' : '#8a5aff',
    );
    ctx.restore();
    ctx.fillStyle = metal(ctx, ex - 10, 0, ex + 10, 0, '#6a707c', '#3a3f4a', '#16181e');
    ctx.fillRect(ex - 10, -92, 20, 44);
    ctx.fillStyle = '#0e1015';
    for (const by of [-84, -70, -56]) ctx.fillRect(ex - 10, by, 20, 2.5);
    ctx.fillStyle = `rgba(${glowRgb},${0.6 * pulse})`;
    ctx.fillRect(ex - 6, -95, 12, 4);
  }

  // ---------- 3) 장갑 날개 (뒤로 꺾임) + 2단계 에너지 칼날 ----------
  const hover = Math.sin(t * 1.6) * 0.02;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(hover);

    if (rage) {
      // 날개 끝에서 돋는 에너지 칼날
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flick = 0.75 + 0.25 * Math.sin(t * 17);
      for (const blade of [
        [128, -60, 176, -110, 146, -50],
        [120, -40, 172, -70, 136, -32],
        [104, -22, 150, -36, 116, -14],
      ]) {
        const g = ctx.createLinearGradient(blade[0]!, blade[1]!, blade[2]!, blade[3]!);
        g.addColorStop(0, `rgba(255,200,120,${0.9 * flick})`);
        g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        poly(ctx, blade);
        // 칼날 바깥 모서리 — 하얗게 달아오른 날
        ctx.strokeStyle = `rgba(255,236,200,${0.95 * flick})`;
        ctx.lineWidth = 1.6;
        polyline(ctx, [blade[0]!, blade[1]!, blade[2]!, blade[3]!]);
      }
      ctx.restore();
    }

    // 날개 아래판 (그림자 쪽 두께)
    ctx.fillStyle = '#0e1015';
    poly(ctx, [34, -28, 92, -52, 134, -64, 142, -50, 120, -28, 72, 0, 40, 18]);
    // 날개 윗판
    ctx.fillStyle = metal(ctx, 40, -60, 120, 10, '#727a88', '#3e4450', '#1c1f26');
    poly(ctx, [38, -26, 92, -48, 130, -60, 136, -51, 116, -31, 70, -5, 42, 12]);
    // 패널 이음선
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    polyline(ctx, [62, -36, 58, 3]);
    polyline(ctx, [88, -46, 90, -14]);
    polyline(ctx, [112, -55, 112, -32]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    polyline(ctx, [63, -36, 59, 3]);
    polyline(ctx, [89, -46, 91, -14]);
    // 앞전 황동 테두리
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.3;
    polyline(ctx, [136, -51, 116, -31, 70, -5, 42, 12]);
    // 발광 배기구 3줄 (앞전과 나란히)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const off = 7 + k * 6;
      ctx.strokeStyle = `rgba(${glowRgb},${0.85 * pulse})`;
      ctx.lineWidth = 2.2;
      polyline(ctx, [70 + k * 6, -5 - off, 104 + k * 4, -24 - off]);
    }
    ctx.restore();
    rivets(
      ctx,
      [
        [48, 2],
        [76, -12],
        [100, -26],
        [124, -44],
      ],
      1.1,
    );
    // 날개 끝 무장 포드
    ctx.fillStyle = metal(ctx, 122, -66, 136, -36, '#7a808c', '#3a3f4a', '#15181e');
    ctx.beginPath();
    ctx.ellipse(130, -50, 7, 16, -0.35, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  // 날개 끝 포신 — 좌우 반전 밖에서 그려야 조준 방향이 맞다
  for (const s of [-1, 1]) {
    barrel(ctx, s * 130, -40, b.aim, 16, 4);
    glowOrb(ctx, s * 130, -50, 5, `rgba(${glowRgb},0.9)`, 0.8 * pulse);
  }

  // ---------- 4) 선체 ----------
  const hull = [
    0, 86, 18, 72, 30, 46, 50, 18, 58, -14, 48, -48, 30, -78, 12, -88, -12, -88, -30, -78, -48, -48,
    -58, -14, -50, 18, -30, 46, -18, 72,
  ];
  ctx.fillStyle = '#0b0d12';
  poly(ctx, hull);
  ctx.save();
  ctx.scale(0.94, 0.95);
  ctx.fillStyle = metal(ctx, -50, -80, 50, 80, '#6c7380', '#373c47', '#14161c');
  poly(ctx, hull);
  ctx.restore();
  // 왼쪽 위에서 받는 빛 — 장갑 모서리 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  poly(ctx, [-44, -44, -28, -74, -14, -80, -32, -40, -46, -10]);
  // 장갑판 이음선 (어두운 선 + 1px 아래 밝은 선으로 홈을 표현)
  for (const [color, dy] of [
    ['rgba(0,0,0,0.6)', 0],
    ['rgba(255,255,255,0.12)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    polyline(ctx, [-40, -56 + dy, 0, -64 + dy, 40, -56 + dy]);
    polyline(ctx, [-50, 16 + dy, 0, 34 + dy, 50, 16 + dy]);
    polyline(ctx, [-28, 48 + dy, 0, 58 + dy, 28, 48 + dy]);
    polyline(ctx, [0, -88 + dy, 0, -64 + dy]);
    polyline(ctx, [-46, -44 + dy, -54, -14 + dy]);
    polyline(ctx, [46, -44 + dy, 54, -14 + dy]);
  }
  // 옆구리 방열판
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const fy = -34 + k * 7;
      ctx.fillStyle = '#101218';
      ctx.fillRect(s > 0 ? 40 : -50, fy, 10, 4);
      ctx.fillStyle = `rgba(${glowRgb},${0.45 * pulse})`;
      ctx.fillRect(s > 0 ? 41 : -49, fy + 1.4, 8, 1.2);
    }
  }
  ctx.strokeStyle = trim;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.2;
  poly(ctx, hull);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.stroke();
  ctx.globalAlpha = 1;
  rivets(
    ctx,
    [
      [-30, -58],
      [30, -58],
      [-36, 24],
      [36, 24],
      [-18, 52],
      [18, 52],
      [-50, -20],
      [50, -20],
    ],
    1.3,
  );

  // ---------- 5) 시공간 코어 ----------
  const cy = -14;
  // 하우징 — 움푹 들어간 원통 + 볼트 고리
  ctx.fillStyle = '#07080c';
  ellipse(ctx, 0, cy, 34, 34);
  ctx.strokeStyle = metal(ctx, -34, cy - 34, 34, cy + 34, '#8a909c', '#3a3f4a', '#111318');
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, cy, 31, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, cy, 34.5, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 10;
    rivets(ctx, [[Math.cos(a) * 31, cy + Math.sin(a) * 31]], 1.2);
  }

  // 코어 빛
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, cy, rage ? 54 : 40, `rgba(${glowRgb},0.55)`, 0.6 * pulse);
  ctx.restore();
  const core = ctx.createRadialGradient(-4, cy - 4, 1, 0, cy, 15);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, glow2);
  core.addColorStop(0.8, glow);
  core.addColorStop(1, rage ? '#4a0a00' : '#1a0a40');
  ctx.fillStyle = core;
  ellipse(ctx, 0, cy, 13 + pulse * 1.5, 13 + pulse * 1.5);

  // 자이로 고리 3개 — 각자 다른 축으로 기울며 돈다
  ctx.save();
  ctx.translate(0, cy);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 3 + t * 0.6 * spin);
    ctx.scale(1, 0.15 + 0.85 * Math.abs(Math.cos(t * (1.1 + i * 0.45) * spin + i)));
    ctx.strokeStyle = i === 0 ? trim : glow2;
    ctx.lineWidth = i === 0 ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 19 + i * 2.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 장갑 셔터 4장 — 1단계는 반쯤 닫혀 있고, 2단계는 활짝 열린다
  const inner = rage ? 27 : 18;
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(Math.PI / 4);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.fillStyle = metal(ctx, -10, -30, 10, -inner, '#5a606c', '#2c3038', '#121419');
    ctx.beginPath();
    ctx.arc(0, 0, 29, -0.42 - Math.PI / 2, 0.42 - Math.PI / 2);
    ctx.arc(0, 0, inner, 0.42 - Math.PI / 2, -0.42 - Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // ---------- 6) 센서 바이저 + 쌍열 주포 ----------
  ctx.fillStyle = '#05060a';
  poly(ctx, [-20, 22, 20, 22, 14, 31, -14, 31]);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1;
  ctx.stroke();
  const scan = Math.sin(t * 2.2 * spin) * 12;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, scan, 26.5, 10, rage ? 'rgba(255,40,40,0.9)' : 'rgba(106,216,255,0.9)');
  ctx.fillStyle = rage ? 'rgba(255,80,60,0.5)' : 'rgba(106,216,255,0.45)';
  ctx.fillRect(-16, 26, 32, 1.2);
  ctx.restore();

  for (const s of [-1, 1]) barrel(ctx, s * 7, 54, b.aim, 30, 5);
  ctx.fillStyle = metal(ctx, -14, 42, 14, 66, '#7a808c', '#3a3f4a', '#15181e');
  ellipse(ctx, 0, 54, 14, 11);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 54, 14, 11, 0, 0, TAU);
  ctx.stroke();
  glowOrb(ctx, 0, 54, 6, `rgba(${glowRgb},0.9)`, 0.9 * pulse);

  // ---------- 7) 손상 표현 ----------
  scorch(ctx, CHRONOS_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);
  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    const heat = 140 + Math.floor(Math.sin(t * 12) * 60);
    for (const c of CHRONOS_CRACKS) {
      ctx.strokeStyle = 'rgba(255,90,30,0.45)';
      ctx.lineWidth = 5;
      polyline(ctx, c);
      ctx.strokeStyle = `rgba(255,${heat},80,0.95)`;
      ctx.lineWidth = 1.8;
      polyline(ctx, c);
    }
    ctx.restore();
  }

  hitFlash(ctx, b.flash, 95, 95);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/* =========================================================
 * Stage 3 — 용암 거신 이그니스
 * ========================================================= */
/** 손상 자국 위치 */
const IGNIS_SCORCH: [number, number, number][] = [
  [-30, -60, 10],
  [36, 24, 9],
  [-20, 64, 8],
  [76, 10, 8],
  [-84, 6, 8],
  [12, -92, 7],
];

/** 선체 윤곽 — 뱃머리(+y)가 플레이어 쪽, 꼬리(-y)에 엔진 */
const IGNIS_HULL = [
  0, 130, 22, 112, 34, 84, 46, 40, 50, -10, 48, -70, 40, -104, 24, -118, -24, -118, -40, -104, -48,
  -70, -50, -10, -46, 40, -34, 84, -22, 112,
];
/** 비행갑판 */
const IGNIS_DECK = [0, 98, 16, 86, 26, 40, 30, -20, 28, -98, -28, -98, -30, -20, -26, 40, -16, 86];

/** 2단계 — 과열로 장갑이 갈라진 선 */
const IGNIS_CRACKS: number[][] = [
  [-44, -60, -36, -46, -42, -30, -34, -16],
  [46, -54, 38, -38, 44, -22],
  [-40, 50, -30, 62, -34, 78],
  [38, 54, 30, 68, 32, 84],
  [-90, -6, -76, 4, -66, 0],
  [92, -2, 78, 8, 68, 4],
];

/** 2단계 — 갑판 위에서 타오르는 불길 자리 */
const IGNIS_FIRES: [number, number][] = [
  [-20, -74],
  [22, 60],
  [-24, 30],
  [40, -86],
];

/** 갑판 위 무인 전투기 (위치, 기울기) */
const IGNIS_DRONES: [number, number, number][] = [
  [-13, 2, -0.15],
  [13, 12, 0.15],
  [-13, 26, -0.15],
];

/**
 * 이그니스 — 용암 노심으로 나는 화염 공중 항모. 뱃머리 = 플레이어 쪽 +y.
 * 1단계(출격): 비행갑판에 무인기가 늘어선 장갑 항모. 우현 함교와 굴뚝, 뒤쪽 용암 박격포 두 문,
 *   갑판 한가운데 용암 사일로, 날개 끝 개틀링 포드, 뱃머리 화염 방사포.
 * 2단계(노심 폭주): 비행갑판이 좌우로 갈라져 용암 노심이 드러나고, 날개에서 방열핀이 펼쳐지며,
 *   뱃머리 포문이 세 갈래로 벌어진다. 엔진은 후연소로 하얗게 타오르고 갑판 곳곳에 불이 붙는다.
 * breathing: 화염 방사 중이면 뱃머리 포문이 달아오른다
 */
export function drawIgnis(ctx: CanvasRenderingContext2D, b: BossLook, breathing: boolean) {
  const t = b.t;
  const rage = b.phase === 2;
  /** 변신 진행도 — 갑판이 갈라지고 방열핀이 펼쳐지는 정도 */
  const open = rage ? 1 : b.morph;
  const pulse = 0.6 + 0.4 * Math.sin(t * (rage ? 8 : 3));
  const firing = breathing || rage;

  ctx.save();
  ctx.translate(b.x, b.y);
  dropShadow(ctx, 26, 128, 150 + open * 20, 50);

  // 열기 오라 + (2단계) 퍼져 나가는 열파
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, 0, 170 + open * 30, `rgba(255,80,20,${0.12 + open * 0.12})`, 0.12);
  if (rage) {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.6 + i / 2) % 1;
      ctx.strokeStyle = `rgba(255,140,60,${0.22 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 10, 80 + k * 150, 90 + k * 130, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  ignisEngines(ctx, t, open, pulse);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ignisWing(ctx, t, open, pulse);
    ctx.restore();
  }
  // 날개 끝 개틀링 — 좌우 반전 밖에서 그려야 조준 방향이 맞다 (발사점 ±104, +18)
  for (const s of [-1, 1]) ignisGatling(ctx, t, s * 104, 18, b.aim, rage);

  ignisHull(ctx, t, open, rage, pulse);
  ignisDeck(ctx, t, open, rage, pulse);
  for (const s of [-1, 1]) ignisMortar(ctx, t, s, rage, pulse);
  ignisIsland(ctx, t, rage, pulse);
  ignisProw(ctx, t, open, firing, pulse);

  // ---------- 손상 ----------
  scorch(ctx, IGNIS_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);
  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    for (const c of IGNIS_CRACKS) {
      ctx.strokeStyle = 'rgba(255,90,20,0.5)';
      ctx.lineWidth = 5;
      polyline(ctx, c);
      ctx.strokeStyle = `rgba(255,${190 + Math.round(pulse * 60)},120,0.95)`;
      ctx.lineWidth = 1.6;
      polyline(ctx, c);
    }
    ctx.restore();
    for (const [i, [fx, fy]] of IGNIS_FIRES.entries()) {
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(1, -1);
      drawThrust(ctx, 0, 0, 11, 22, t * 1.3 + i * 1.7, '#fff0b0', '#ff4a1a');
      ctx.restore();
    }
  }
  ignisParticles(ctx, t, rage);

  hitFlash(ctx, b.flash, 110, 100);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/** 꼬리의 4발 엔진 — 화면 위쪽으로 불꽃을 뿜는다 (2단계는 후연소) */
function ignisEngines(ctx: CanvasRenderingContext2D, t: number, open: number, pulse: number) {
  for (const ex of [-32, -12, 12, 32]) {
    ctx.save();
    ctx.translate(ex, -124);
    ctx.scale(1, -1);
    drawThrust(
      ctx,
      0,
      0,
      13,
      30 + open * 26,
      t + ex,
      open > 0.5 ? '#ffffff' : '#ffe9a8',
      open > 0.5 ? '#ffb03a' : '#ff6a1a',
    );
    ctx.restore();
  }
  // 엔진 몸체
  for (const ex of [-32, -12, 12, 32]) {
    ctx.fillStyle = metal(ctx, ex - 9, -128, ex + 9, -100, '#7a7470', '#3a3634', '#121010');
    ctx.beginPath();
    ctx.roundRect(ex - 9, -128, 18, 30, 4);
    ctx.fill();
    ctx.strokeStyle = '#0a0808';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#0a0808';
    for (const by of [-120, -114]) ctx.fillRect(ex - 9, by, 18, 1.6);
    // 노즐 안쪽 불빛
    ctx.fillStyle = `rgba(255,${150 + Math.round(open * 90)},60,${0.6 + 0.4 * pulse})`;
    ctx.fillRect(ex - 6, -130, 12, 3);
  }
}

/** 오른쪽 날개 — 앞전에 붉은 띠, 2단계에서 뒤쪽으로 방열핀이 펼쳐진다 */
function ignisWing(ctx: CanvasRenderingContext2D, t: number, open: number, pulse: number) {
  const tip = 122 + open * 14;
  // 2단계 방열핀 — 날개 뒷전에서 펼쳐져 붉게 달아오른다
  if (open > 0) {
    for (let k = 0; k < 6; k++) {
      const x = 58 + k * 12;
      const len = (20 + k * 2) * open;
      const y0 = -26 + k * 3.4;
      ctx.fillStyle = metal(ctx, x - 3, y0 - len, x + 3, y0, '#5a5250', '#2e2a2a', '#121010');
      ctx.fillRect(x - 3, y0 - len, 6, len);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y0, 0, y0 - len);
      g.addColorStop(0, `rgba(255,${120 + Math.round(pulse * 80)},40,0.9)`);
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 2, y0 - len, 4, len);
      ctx.restore();
    }
  }
  const under = [44, 46, 50, -36, 100, -16, tip, 4, tip + 4, 26, 108, 38, 70, 50];
  ctx.fillStyle = '#0c0a0a';
  poly(ctx, under);
  ctx.fillStyle = metal(ctx, 50, -36, tip, 44, '#8a827c', '#4a4442', '#1a1616');
  poly(ctx, [48, 42, 52, -30, 100, -12, tip - 2, 6, tip + 1, 22, 106, 34, 70, 45]);
  // 패널 이음선
  for (const [color, d] of [
    ['rgba(0,0,0,0.55)', 0],
    ['rgba(255,240,220,0.12)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    polyline(ctx, [74 + d, -22, 72 + d, 44]);
    polyline(ctx, [98 + d, -12, 96 + d, 36]);
    polyline(ctx, [52, 6 + d, tip - 4, 12 + d]);
  }
  // 앞전 — 붉은 장갑 띠 + 황동 테두리
  ctx.fillStyle = '#7a2216';
  poly(ctx, [48, 42, 70, 45, 106, 34, tip + 1, 22, tip - 1, 17, 104, 28, 70, 39, 49, 36]);
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1;
  polyline(ctx, [49, 36, 70, 39, 104, 28, tip - 1, 17]);
  // 날개 위 용암 냉각 도관 — 맥동한다
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,110,30,${0.45 + 0.35 * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -t * 40;
  polyline(ctx, [52, -6, 80, 2, 104, 10]);
  ctx.restore();
  rivets(
    ctx,
    [
      [58, -20],
      [86, -12],
      [60, 30],
      [90, 26],
    ],
    1.2,
  );
  // 날개 끝 포드
  ctx.fillStyle = metal(ctx, 96, -6, 114, 38, '#9a928c', '#4a4442', '#141212');
  ctx.beginPath();
  ctx.roundRect(95, -6, 18, 40, 8);
  ctx.fill();
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 항법등
  glowOrb(ctx, tip + 2, 16, Math.floor(t * 2.5) % 2 ? 6 : 3, '#ff3a2a');
}

/** 날개 끝 회전 개틀링 — 플레이어를 조준한다 */
function ignisGatling(
  ctx: CanvasRenderingContext2D,
  t: number,
  x: number,
  y: number,
  aim: number,
  rage: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim - Math.PI / 2);
  // 총열 6개를 원통처럼 — 돌아가는 듯 밝기가 흐른다
  for (let i = 0; i < 4; i++) {
    const bx = -4.5 + i * 3;
    const k = 0.5 + 0.5 * Math.sin(t * 30 + i * 1.6);
    ctx.fillStyle = `rgb(${50 + k * 70},${52 + k * 70},${58 + k * 70})`;
    ctx.fillRect(bx - 1.2, 6, 2.4, 22);
  }
  ctx.fillStyle = '#1a1818';
  ctx.fillRect(-6.5, 14, 13, 3);
  ctx.fillRect(-6.5, 25, 13, 3);
  ctx.restore();
  ctx.fillStyle = metal(ctx, x - 10, y - 10, x + 10, y + 10, '#b0a8a0', '#5a5250', '#1a1616');
  ellipse(ctx, x, y, 10, 10);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, x, y, 7, rage ? 'rgba(255,200,90,0.9)' : 'rgba(255,140,40,0.9)', 0.7);
  ctx.restore();
}

/** 선체 — 장갑판, 붉은 띠, 옆구리 방열구, 아래 용암에 비친 테두리 빛 */
function ignisHull(
  ctx: CanvasRenderingContext2D,
  t: number,
  open: number,
  rage: boolean,
  pulse: number,
) {
  ctx.fillStyle = '#0a0808';
  ctx.save();
  ctx.scale(1.05, 1.02);
  poly(ctx, IGNIS_HULL);
  ctx.restore();
  ctx.fillStyle = metal(ctx, -50, -118, 50, 130, '#8a827c', '#4a4442', '#181414');
  poly(ctx, IGNIS_HULL);
  ctx.save();
  poly(ctx, IGNIS_HULL);
  ctx.clip();
  // 왼쪽 위에서 받는 빛
  ctx.fillStyle = 'rgba(255,245,230,0.1)';
  poly(ctx, [-48, -70, -40, -104, -24, -118, -30, -60, -44, 30, -50, -10]);
  // 선체 옆 붉은 장갑 띠 (현측 장갑)
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#6a1e14';
    poly(ctx, [
      s * 50,
      -10,
      s * 48,
      -70,
      s * 42,
      -70,
      s * 44,
      -10,
      s * 40,
      40,
      s * 30,
      84,
      s * 34,
      84,
      s * 46,
      40,
    ]);
  }
  // 장갑판 이음선
  for (const [color, d] of [
    ['rgba(0,0,0,0.55)', 0],
    ['rgba(255,240,220,0.12)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (const y of [-80, -40, 0, 50, 90]) polyline(ctx, [-50, y + d, 50, y + d]);
  }
  ctx.restore();
  // 아래 용암에 비친 붉은 테두리 빛
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,110,40,${0.35 + 0.2 * pulse})`;
  ctx.lineWidth = 1.6;
  polyline(ctx, [...IGNIS_HULL, IGNIS_HULL[0]!, IGNIS_HULL[1]!]);
  ctx.restore();
  // 옆구리 방열구 — 2단계는 활짝 열려 불을 뿜는다
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const vy = -60 + k * 11;
      const vx = s * 45;
      ctx.fillStyle = '#0a0808';
      ctx.fillRect(vx - 3, vy, 6, 6);
      ctx.fillStyle = `rgba(255,${110 + Math.round(open * 100)},40,${0.4 + 0.5 * pulse * (0.5 + open)})`;
      ctx.fillRect(vx - 2, vy + 1.5, 4, 3);
      if (rage && k % 2 === 0) {
        ctx.save();
        ctx.translate(vx + s * 2, vy + 3);
        ctx.rotate((-s * Math.PI) / 2);
        drawThrust(ctx, 0, 0, 6, 14, t * 1.7 + k, '#fff0b0', '#ff5a1a');
        ctx.restore();
      }
    }
  }
  rivets(
    ctx,
    [
      [-40, -96],
      [40, -96],
      [-46, -40],
      [46, -40],
      [-42, 36],
      [42, 36],
      [-26, 96],
      [26, 96],
    ],
    1.3,
  );
}

/** 비행갑판 — 1단계는 무인기와 활주로, 2단계는 좌우로 갈라져 용암 노심이 드러난다 */
function ignisDeck(
  ctx: CanvasRenderingContext2D,
  t: number,
  open: number,
  rage: boolean,
  pulse: number,
) {
  const dx = open * 20;
  // 갈라진 틈 아래의 노심 구덩이
  if (open > 0) {
    ctx.save();
    poly(ctx, IGNIS_DECK);
    ctx.clip();
    ctx.fillStyle = '#060404';
    ctx.fillRect(-dx - 2, -100, dx * 2 + 4, 200);
    ignisReactor(ctx, t, open, pulse);
    ctx.restore();
  }
  for (const s of [-1, 1]) {
    ctx.save();
    // 바깥으로 민 다음 한쪽 반만 오린다 (가운데에 노심이 보이는 틈이 생긴다)
    ctx.translate(s * dx, 0);
    ctx.beginPath();
    ctx.rect(s < 0 ? -60 : 0, -130, 60, 260);
    ctx.clip();
    ignisDeckHalf(ctx, t, open, rage, pulse);
    ctx.restore();
  }
}

/** 갑판 한 장 (좌우 공통 — 그리는 쪽은 바깥 clip 이 정한다) */
function ignisDeckHalf(
  ctx: CanvasRenderingContext2D,
  t: number,
  open: number,
  rage: boolean,
  pulse: number,
) {
  ctx.fillStyle = metal(ctx, -30, -98, 30, 98, '#3e3a3a', '#2a2626', '#161414');
  poly(ctx, IGNIS_DECK);
  ctx.save();
  poly(ctx, IGNIS_DECK);
  ctx.clip();
  // 갑판 판재 줄
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = -96; y < 98; y += 8) {
    ctx.moveTo(-30, y);
    ctx.lineTo(30, y);
  }
  ctx.stroke();
  // 가장자리 흰 점선 + 가운데 노란 점선
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(235,235,225,0.7)';
  ctx.lineWidth = 1.4;
  polyline(ctx, [-22, -92, -24, -20, -20, 40, -12, 82]);
  polyline(ctx, [22, -92, 24, -20, 20, 40, 12, 82]);
  ctx.strokeStyle = 'rgba(240,200,60,0.85)';
  polyline(ctx, [0, -92, 0, 90]);
  ctx.setLineDash([]);
  // 사출기 궤도 두 줄
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  polyline(ctx, [-8, 34, -8, 86]);
  polyline(ctx, [8, 34, 8, 86]);
  // 승강기 두 칸
  ctx.strokeStyle = 'rgba(240,200,60,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-24, -64, 16, 14);
  ctx.strokeRect(8, -24, 16, 14);
  // 활주 유도등 — 뱃머리 쪽으로 흐른다
  for (let k = 0; k < 9; k++) {
    const y = -88 + k * 20;
    const lit = (k - Math.floor(t * 8)) % 9 === 0 || (k - Math.floor(t * 8)) % 9 === -9;
    const c = rage ? '255,80,60' : '255,190,80';
    for (const x of [-26 + k * 0.6, 26 - k * 0.6]) {
      ctx.fillStyle = `rgba(${c},${lit ? 1 : 0.35})`;
      ellipse(ctx, x * (1 - Math.max(0, y - 40) / 120), y, 1.6, 1.6);
    }
  }
  ctx.restore();
  // 갑판 위 무인 전투기 — 2단계는 불타 버려 그을린 자국만
  if (open < 0.5) {
    for (const [x, y, a] of IGNIS_DRONES) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      poly(ctx, [1.5, 10, 9.5, -5, 1.5, -2, -6.5, -5]);
      ctx.fillStyle = metal(ctx, -8, -8, 8, 9, '#b8b0a8', '#6a625e', '#2a2626');
      poly(ctx, [0, 9, 8, -6, 0, -3, -8, -6]);
      ctx.fillStyle = '#ff9a3a';
      ellipse(ctx, 0, 3, 1.4, 2.4);
      ctx.restore();
    }
  }
  // 갑판 한가운데 용암 사일로 (용암탄 발사점 0, -40)
  if (open < 0.3) {
    ctx.fillStyle = '#0a0808';
    ellipse(ctx, 0, -40, 12, 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, 0, -40, 11 + pulse * 3, 'rgba(255,120,30,0.95)', 0.9 * pulse);
    ctx.restore();
    ctx.strokeStyle = '#e8c02a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, -40, 13, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 갈라진 안쪽 단면 — 달아오른 강판 모서리
  if (open > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,${150 + Math.round(pulse * 80)},60,${open})`;
    ctx.lineWidth = 2;
    polyline(ctx, [0, -98, 0, 98]);
    ctx.restore();
  }
}

/** 2단계 용암 노심 (고리탄 발사점 0, +10) — 회전하는 격납 고리와 전류 */
function ignisReactor(ctx: CanvasRenderingContext2D, t: number, open: number, pulse: number) {
  const cy = 10;
  // 구덩이 안쪽 벽 — 배관과 늑재
  ctx.strokeStyle = 'rgba(255,120,40,0.35)';
  ctx.lineWidth = 1;
  for (let y = -90; y < 96; y += 10) polyline(ctx, [-30, y, 30, y]);
  // 노심에서 위아래로 뻗은 용암 도관
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pipe = ctx.createLinearGradient(0, -96, 0, 96);
  pipe.addColorStop(0, 'rgba(255,90,20,0.2)');
  pipe.addColorStop(0.5, 'rgba(255,200,90,0.95)');
  pipe.addColorStop(1, 'rgba(255,90,20,0.2)');
  ctx.fillStyle = pipe;
  ctx.fillRect(-4, -96, 8, 192);
  glowOrb(ctx, 0, cy, 40 + pulse * 8, 'rgba(255,120,30,0.7)', 0.7 * open);
  ctx.restore();
  const core = ctx.createRadialGradient(-4, cy - 4, 2, 0, cy, 18);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, '#fff0a0');
  core.addColorStop(0.75, '#ff7a1a');
  core.addColorStop(1, '#5a1004');
  ctx.fillStyle = core;
  ellipse(ctx, 0, cy, 16 + pulse * 1.5, 16 + pulse * 1.5);
  // 격납 고리 3개 — 각자 다른 축으로 돈다
  ctx.save();
  ctx.translate(0, cy);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 3 + t * 1.2);
    ctx.scale(1, 0.2 + 0.8 * Math.abs(Math.cos(t * (1.3 + i * 0.5) + i)));
    ctx.strokeStyle = i === 0 ? '#c9a45a' : '#ffb03a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + i * 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // 튀는 전류
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,240,200,0.85)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = Math.floor(t * 12 + i * 5) * 2.3 + i;
    const r1 = 26;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, cy + Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a + 0.3) * 20 + 3, cy + Math.sin(a + 0.3) * 20);
    ctx.lineTo(Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

/** 뒤쪽 용암 박격포 — 하늘을 향한 굵은 포구 (발사점 ±39, -75) */
function ignisMortar(
  ctx: CanvasRenderingContext2D,
  t: number,
  s: number,
  rage: boolean,
  pulse: number,
) {
  const x = s * 38;
  const y = -76;
  if (rage) {
    // 2단계 — 포탑이 날아가 불타는 자리만 남았다
    ctx.fillStyle = '#0a0808';
    ellipse(ctx, x, y, 13, 11);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, x, y, 12 + pulse * 3, 'rgba(255,110,30,0.9)', 0.8);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y - 4);
    ctx.scale(1, -1);
    drawThrust(ctx, 0, 0, 12, 24, t * 1.4 + s, '#fff0b0', '#ff4a1a');
    ctx.restore();
    return;
  }
  // 포탑 받침 — 팔각 장갑
  ctx.fillStyle = '#0a0808';
  ellipse(ctx, x + 1.5, y + 2, 17, 16);
  ctx.fillStyle = metal(ctx, x - 16, y - 16, x + 16, y + 16, '#9a928c', '#4a4442', '#141212');
  const oct: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    oct.push(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
  }
  poly(ctx, oct);
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1;
  polyline(ctx, [...oct, oct[0]!, oct[1]!]);
  // 위를 향한 굵은 포신 — 위에서 보면 두꺼운 고리
  ctx.fillStyle = metal(ctx, x - 10, y - 10, x + 10, y + 10, '#c0b8b0', '#6a625e', '#1a1616');
  ellipse(ctx, x, y, 10, 10);
  ctx.fillStyle = '#0a0606';
  ellipse(ctx, x, y, 6.5, 6.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, x, y, 9 + pulse * 3, 'rgba(255,120,30,0.95)', 0.9 * pulse);
  ctx.restore();
  rivets(
    ctx,
    [
      [x - 12, y],
      [x + 12, y],
      [x, y - 12],
      [x, y + 12],
    ],
    1.1,
  );
}

/** 우현 함교 + 굴뚝 (항모의 비대칭 섬) */
function ignisIsland(ctx: CanvasRenderingContext2D, t: number, rage: boolean, pulse: number) {
  const x0 = 34;
  // 굴뚝 연기 / 2단계는 불길
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.5 + i / 5) % 1;
    const r = 4 + k * 16;
    ctx.fillStyle = rage ? `rgba(80,40,30,${0.45 * (1 - k)})` : `rgba(60,56,54,${0.4 * (1 - k)})`;
    ellipse(ctx, 48 + k * 12 + Math.sin(t * 2 + i) * 3, -44 - k * 60, r, r * 0.85);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  poly(ctx, [x0 + 4, -36, 62, -32, 62, 10, x0 + 4, 8]);
  ctx.fillStyle = metal(ctx, x0, -40, 60, 6, '#a8a09a', '#5a5250', '#1a1616');
  poly(ctx, [x0, -40, 56, -36, 58, -6, 54, 6, x0, 4]);
  ctx.strokeStyle = '#0a0808';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // 함교 창 — 앞쪽 두 줄
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const on = Math.sin(t * 2 + r * 2 + c) > -0.7;
      ctx.fillStyle = on ? (rage ? '#ff6a4a' : '#ffd46a') : '#5a3a20';
      ctx.fillRect(x0 + 4 + c * 6, -4 + r * 4, 4, 2.4);
    }
  }
  // 굴뚝
  ctx.fillStyle = metal(ctx, 42, -40, 54, -26, '#7a2216', '#4a140c', '#1a0604');
  ctx.beginPath();
  ctx.roundRect(42, -42, 12, 14, 3);
  ctx.fill();
  ctx.fillStyle = '#0a0606';
  ellipse(ctx, 48, -40, 4.5, 2.8);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 48, -40, 6, 'rgba(255,120,30,0.9)', (rage ? 0.9 : 0.5) * pulse);
  ctx.restore();
  if (rage) {
    ctx.save();
    ctx.translate(48, -42);
    ctx.scale(1, -1);
    drawThrust(ctx, 0, 0, 9, 20, t * 1.5, '#fff0b0', '#ff4a1a');
    ctx.restore();
  }
  // 회전 레이더 + 안테나 마스트
  ctx.save();
  ctx.translate(44, -16);
  ctx.scale(Math.cos(t * (rage ? 6 : 3)), 1);
  ctx.fillStyle = metal(ctx, -9, -3, 9, 3, '#e0d8d0', '#8a827c', '#3a3434');
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c8c0b8';
  ctx.lineWidth = 1.2;
  polyline(ctx, [38, -24, 38, -46]);
  glowOrb(ctx, 38, -46, Math.floor(t * 2) % 2 ? 4 : 2, '#ff3a3a');
}

/** 뱃머리 — 충각과 화염 방사포. 2단계는 포문 장갑이 세 갈래로 벌어진다 (발사점 0, +118~122) */
function ignisProw(
  ctx: CanvasRenderingContext2D,
  t: number,
  open: number,
  firing: boolean,
  pulse: number,
) {
  const ny = 116 + open * 4;
  // 양옆 충각 날
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#0a0808';
    poly(ctx, [s * 22, 92, s * 34, 108, s * 20, 112]);
    ctx.fillStyle = metal(ctx, s * 20, 92, s * 34, 112, '#c0b8b0', '#6a625e', '#1a1616');
    poly(ctx, [s * 22, 94, s * 32, 107, s * 21, 109]);
  }
  // 포문 하우징
  ctx.fillStyle = metal(ctx, -16, 86, 16, 124, '#9a928c', '#4a4442', '#141212');
  poly(ctx, [-16, 86, 16, 86, 14, 112, 0, 122, -14, 112]);
  ctx.strokeStyle = '#c9a45a';
  ctx.lineWidth = 1;
  polyline(ctx, [-16, 86, 16, 86, 14, 112, 0, 122, -14, 112, -16, 86]);
  // 포문 안 — 화염 방사 중이면 달아오른다
  const heat = firing ? 1 : 0.35 + 0.2 * pulse;
  ctx.fillStyle = '#0a0606';
  ellipse(ctx, 0, ny, 9 + open * 3, 9 + open * 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, ny, (14 + open * 6) * (0.8 + heat * 0.4), 'rgba(255,130,40,0.95)', heat);
  ctx.restore();
  ctx.fillStyle = `rgba(255,${200 + Math.round(55 * heat)},${Math.round(140 * heat)},${0.5 + heat * 0.5})`;
  ellipse(ctx, 0, ny, 4 + open * 2, 4 + open * 2);
  // 포문 장갑 세 장 — 2단계에서 꽃잎처럼 벌어진다
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2;
    const spread = 4 + open * 9;
    ctx.save();
    ctx.translate(Math.cos(a) * spread, ny + Math.sin(a) * spread);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = metal(ctx, -7, -4, 7, 6, '#c0b8b0', '#5a5250', '#1a1616');
    poly(ctx, [-8, -2, 8, -2, 4, 6, -4, 6]);
    ctx.restore();
  }
  // 화염 방사 중 — 포문 앞의 아지랑이
  if (firing) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const q = (t * 3 + k / 3) % 1;
      ctx.strokeStyle = `rgba(255,200,120,${0.4 * (1 - q)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, ny + 6 + q * 20, 8 + q * 14, 3 + q * 4, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 1단계는 연기 재가 날리고, 2단계는 불티가 솟구친다 */
function ignisParticles(ctx: CanvasRenderingContext2D, t: number, rage: boolean) {
  ctx.save();
  if (rage) ctx.globalCompositeOperation = 'lighter';
  const n = rage ? 26 : 10;
  for (let i = 0; i < n; i++) {
    const k = (t * (rage ? 0.7 : 0.35) + hash(i)) % 1;
    const x = (hash(i + 100) - 0.5) * 260 + Math.sin(t * 1.5 + i) * 10;
    const y = 120 - k * 280;
    const a = Math.sin(k * Math.PI);
    if (rage) {
      ctx.fillStyle = `rgba(255,${150 + Math.round(hash(i + 7) * 100)},60,${a})`;
      ellipse(ctx, x, y, 1.8, 1.8);
    } else {
      ctx.fillStyle = `rgba(90,80,76,${0.5 * a})`;
      ellipse(ctx, x, y, 1.4, 1.4);
    }
  }
  ctx.restore();
}

/* =========================================================
 * Stage 4 — 궤도 요새 세라핌
 * ========================================================= */
const SERAPH_SCORCH: [number, number, number][] = [
  [-30, -24, 9],
  [28, 20, 8],
  [-14, 36, 7],
  [36, -30, 7],
  [-40, 10, 7],
  [10, -44, 6],
];

/** 후광 고리 반지름·기울기 (entities.ts Boss.podPos 와 같게) */
const SERAPH_RING_R = 118;
const SERAPH_RING_TILT = 0.42;

/**
 * 세라핌 — 백금빛 궤도 요새. 가운데 선체의 눈(렌즈)을 기울어진 후광 고리가 감싸고, 고리 위 포대 6기가 돈다.
 * 1단계: 좌우로 태양전지판 날개를 펼친 관측 형태, 렌즈는 조리개가 반쯤 닫혀 있다.
 * 2단계(강림): 전지판이 접혀 여섯 장의 금빛 칼날 날개가 되고, 고리가 둘로 갈라져 서로 반대로 돌며 렌즈가 활짝 열린다.
 */
export function drawSeraph(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const rage = b.phase === 2;
  const blades = rage ? 1 : b.morph;
  const pulse = 0.65 + 0.35 * Math.sin(t * (rage ? 7 : 3));
  const ringRot = t * (rage ? 1.1 : 0.5);

  ctx.save();
  ctx.translate(b.x, b.y);
  dropShadow(ctx, 22, 120, 170, 40);

  // 오라
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, 0, 190, rage ? 'rgba(255,220,140,0.2)' : 'rgba(110,210,255,0.18)', 0.12);
  ctx.restore();

  // 뒤쪽 고리 (선체 뒤로 지나가는 반쪽)
  seraphRing(ctx, t, ringRot, rage, 'back');
  if (rage) seraphSecondRing(ctx, t, 'back');

  // 날개 — 1단계 전지판이 2단계 칼날 날개로 바뀐다
  if (blades < 1) seraphPanels(ctx, t, 1 - blades);
  if (blades > 0) seraphBladeWings(ctx, t, blades, pulse);

  seraphHull(ctx, t, rage, pulse);

  // 앞쪽 고리
  seraphRing(ctx, t, ringRot, rage, 'front');
  if (rage) seraphSecondRing(ctx, t, 'front');

  scorch(ctx, SERAPH_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);
  hitFlash(ctx, b.flash, 100, 90);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/** 고리 위 포대 i 의 각도 */
function seraphPodAngle(ringRot: number, i: number) {
  return ringRot + (i * TAU) / 6;
}

function seraphRing(
  ctx: CanvasRenderingContext2D,
  t: number,
  ringRot: number,
  rage: boolean,
  half: 'front' | 'back',
) {
  const R = SERAPH_RING_R;
  const ry = R * SERAPH_RING_TILT;
  // 앞쪽 반 = 아래쪽(+y) 호, 뒤쪽 반 = 위쪽 호
  const [a0, a1] = half === 'front' ? [0, Math.PI] : [Math.PI, TAU];
  const arc = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, R, ry, 0, a0, a1);
  };
  ctx.lineCap = 'butt';
  arc();
  ctx.strokeStyle = '#2a3040';
  ctx.lineWidth = 13;
  ctx.stroke();
  arc();
  const band = ctx.createLinearGradient(0, -ry, 0, ry);
  band.addColorStop(0, '#f4f6fb');
  band.addColorStop(0.5, '#aeb6c8');
  band.addColorStop(1, '#6a7286');
  ctx.strokeStyle = band;
  ctx.lineWidth = 9;
  ctx.stroke();
  // 금빛 가운데 줄 + 흐르는 에너지
  arc();
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  arc();
  ctx.setLineDash([10, 18]);
  ctx.lineDashOffset = -t * (rage ? 120 : 50);
  ctx.strokeStyle = rage ? 'rgba(255,230,160,0.9)' : 'rgba(127,224,255,0.8)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // 마디 눈금
  ctx.strokeStyle = 'rgba(30,36,50,0.7)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * TAU + ringRot * 0.5;
    const s = Math.sin(a);
    if ((half === 'front') !== s > 0) continue;
    const x = Math.cos(a) * R;
    const y = s * ry;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
  }
  // 포대 6기 — 자기 쪽 반에 있을 때만 그린다 (앞쪽일수록 크다)
  for (let i = 0; i < 6; i++) {
    const a = seraphPodAngle(ringRot, i);
    const s = Math.sin(a);
    if ((half === 'front') !== s > 0) continue;
    const x = Math.cos(a) * R;
    const y = s * ry;
    const depth = 0.8 + 0.3 * (s + 1) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(depth, depth);
    ctx.fillStyle = metal(ctx, -9, -9, 9, 9, '#ffffff', '#b8c0d0', '#4a5266');
    ellipse(ctx, 0, 0, 9, 8);
    ctx.fillStyle = '#e6c46a';
    poly(ctx, [-6, -6, 6, -6, 4, -10, -4, -10]);
    ctx.fillStyle = '#1a1f2a';
    ellipse(ctx, 0, 2, 4, 4);
    glowOrb(ctx, 0, 2, 6, rage ? 'rgba(255,230,160,0.95)' : 'rgba(127,224,255,0.95)', 0.9);
    ctx.restore();
  }
}

/** 2단계 — 반대로 도는 더 큰 두 번째 고리 (비스듬히 기울어진 에너지 고리) */
function seraphSecondRing(ctx: CanvasRenderingContext2D, t: number, half: 'front' | 'back') {
  ctx.save();
  ctx.rotate(-0.3);
  const R = 140;
  const ry = R * 0.28;
  const [a0, a1] = half === 'front' ? [0, Math.PI] : [Math.PI, TAU];
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.ellipse(0, 0, R, ry, 0, a0, a1);
  ctx.strokeStyle = 'rgba(127,224,255,0.35)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, R, ry, 0, a0, a1);
  ctx.setLineDash([6, 10]);
  ctx.lineDashOffset = t * 140;
  ctx.strokeStyle = 'rgba(220,250,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  // 고리를 따라 도는 빛 구슬
  for (let i = 0; i < 4; i++) {
    const a = -t * 1.6 + (i * TAU) / 4;
    const s = Math.sin(a);
    if ((half === 'front') !== s > 0) continue;
    glowOrb(ctx, Math.cos(a) * R, s * ry, 9, 'rgba(255,255,255,0.95)', 1);
  }
  ctx.restore();
}

/** 1단계 태양전지판 — 트러스 팔에 위아래 두 장씩, 빛이 비스듬히 훑고 지나간다 */
function seraphPanels(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(Math.sin(t * 0.7) * 0.04);
    // 트러스 팔
    ctx.strokeStyle = '#8a92a4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(44, -3);
    ctx.lineTo(196, -3);
    ctx.moveTo(44, 3);
    ctx.lineTo(196, 3);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 48; x < 196; x += 10) {
      ctx.moveTo(x, -3);
      ctx.lineTo(x + 10, 3);
    }
    ctx.stroke();
    // 전지판 4장 (팔 위아래로 두 칸씩)
    for (const [x0, x1] of [
      [66, 126],
      [132, 192],
    ] as const) {
      for (const [y0, y1] of [
        [-40, -8],
        [8, 40],
      ] as const) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, '#2a4a8a');
        g.addColorStop(1, '#0c1a3a');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        // 셀 격자
        ctx.strokeStyle = 'rgba(140,190,255,0.35)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = x0 + 10; x < x1; x += 10) {
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
        }
        for (let y = y0 + 8; y < y1; y += 8) {
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.stroke();
        // 비스듬히 지나가는 반사광
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.clip();
        const sx = x0 - 60 + ((t * 70 + x0) % 220);
        const sheen = ctx.createLinearGradient(sx, y0, sx + 30, y1);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.5, 'rgba(200,230,255,0.35)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
        ctx.strokeStyle = '#e6c46a';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // 팔 끝 항법등
    const blink = Math.floor(t * 2 + (s > 0 ? 0.5 : 0)) % 2 === 0;
    glowOrb(ctx, 198, 0, blink ? 7 : 3, s > 0 ? 'rgba(80,255,140,0.95)' : 'rgba(255,60,60,0.95)');
    ctx.restore();
  }
  ctx.restore();
}

/** 2단계 칼날 날개 여섯 장 — 백금에서 금빛으로 물들고, 날 끝에 푸른 빛이 흐른다 */
function seraphBladeWings(ctx: CanvasRenderingContext2D, t: number, grow: number, pulse: number) {
  const wings: [number, number][] = [
    [-0.72, 150],
    [-0.12, 172],
    [0.5, 132],
  ];
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    for (const [k, [ang, len]] of wings.entries()) {
      ctx.save();
      ctx.translate(36, -6 + k * 6);
      ctx.rotate(ang + Math.sin(t * 1.8 + k) * 0.06);
      const L = len * (0.3 + 0.7 * grow);
      // 칼날 몸체 — 뿌리는 넓고 끝은 뾰족하다
      const shape = () => {
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.quadraticCurveTo(L * 0.55, -16, L, 0);
        ctx.quadraticCurveTo(L * 0.55, 9, 0, 7);
        ctx.closePath();
      };
      shape();
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#e8d8a8');
      g.addColorStop(1, '#c89a3a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#6a5428';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 가운데 홈
      ctx.strokeStyle = 'rgba(120,90,40,0.6)';
      ctx.beginPath();
      ctx.moveTo(6, -1);
      ctx.quadraticCurveTo(L * 0.5, -6, L * 0.9, 0);
      ctx.stroke();
      // 날 끝 에너지
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(127,224,255,${0.75 * pulse * grow})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(L * 0.2, -11);
      ctx.quadraticCurveTo(L * 0.55, -16, L, 0);
      ctx.stroke();
      glowOrb(ctx, L, 0, 8 * grow, 'rgba(200,245,255,0.9)', grow);
      ctx.restore();
      ctx.restore();
    }
    ctx.restore();
  }
}

function seraphHull(ctx: CanvasRenderingContext2D, t: number, rage: boolean, pulse: number) {
  const glow = rage ? '255,230,160' : '127,224,255';
  // 아래쪽 주포 첨탑 (플레이어 쪽으로 뻗음, 끝이 레이저 발사구)
  ctx.fillStyle = '#2a3040';
  poly(ctx, [-13, 30, 13, 30, 6, 64, -6, 64]);
  ctx.fillStyle = metal(ctx, -11, 30, 11, 62, '#ffffff', '#b8c0d0', '#5a6276');
  poly(ctx, [-11, 30, 11, 30, 5, 62, -5, 62]);
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 1;
  polyline(ctx, [-11, 40, 11, 40]);
  polyline(ctx, [-8, 52, 8, 52]);
  glowOrb(ctx, 0, 63, 9 + pulse * 3, `rgba(${glow},0.95)`, 0.9);
  // 위쪽 안테나 첨탑
  ctx.fillStyle = metal(ctx, -6, -76, 6, -40, '#ffffff', '#aeb6c8', '#4a5266');
  poly(ctx, [-7, -40, 7, -40, 2, -78, -2, -78]);
  ctx.strokeStyle = '#e6c46a';
  polyline(ctx, [-12, -60, 12, -60]);
  const blink = Math.floor(t * 1.5) % 2 === 0;
  glowOrb(ctx, 0, -80, blink ? 6 : 3, 'rgba(255,90,90,0.95)');

  // 팔각 선체
  const hull: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    hull.push(Math.cos(a) * 50, Math.sin(a) * 44);
  }
  ctx.fillStyle = '#1e2330';
  poly(
    ctx,
    hull.map((v) => v * 1.06),
  );
  ctx.fillStyle = metal(ctx, -50, -44, 50, 44, '#ffffff', '#c4cbd8', '#5a6276');
  poly(ctx, hull);
  // 장갑판 이음선 (어두운 선 + 밝은 선으로 홈 표현)
  for (const [color, d] of [
    ['rgba(30,36,50,0.55)', 0],
    ['rgba(255,255,255,0.5)', 1],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8;
      polyline(ctx, [
        Math.cos(a) * 30,
        Math.sin(a) * 27 + d,
        Math.cos(a) * 49,
        Math.sin(a) * 43 + d,
      ]);
    }
  }
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 1.4;
  polyline(ctx, [...hull, hull[0]!, hull[1]!]);
  // 옆구리 자세 제어 분사구
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#2a3040';
    ctx.fillRect(s * 50 - (s > 0 ? 0 : 6), -6, 6, 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 11 + s);
    drawSprite(ctx, glowSprite(`rgb(${glow})`, 4), s * 58, 0);
    ctx.restore();
  }

  // 렌즈 — 오목한 하우징
  ctx.fillStyle = '#0c1018';
  ellipse(ctx, 0, 0, 31, 31);
  ctx.strokeStyle = metal(ctx, -31, -31, 31, 31, '#ffffff', '#8a92a4', '#2a3040');
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 29, 0, TAU);
  ctx.stroke();
  // 렌즈를 도는 문자 고리 (눈금)
  ctx.save();
  ctx.rotate(-t * (rage ? 1.6 : 0.5));
  ctx.strokeStyle = `rgba(${glow},0.75)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    const inner = k % 3 === 0 ? 20 : 23;
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * 25.5, Math.sin(a) * 25.5);
  }
  ctx.stroke();
  ctx.restore();
  // 렌즈 빛
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, 0, rage ? 58 : 34, `rgba(${glow},0.6)`, 0.7 * pulse);
  ctx.restore();
  const core = ctx.createRadialGradient(-4, -4, 1, 0, 0, 16);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.45, rage ? '#fff2c0' : '#bff2ff');
  core.addColorStop(1, rage ? '#c88a2a' : '#2a7ab8');
  ctx.fillStyle = core;
  ellipse(ctx, 0, 0, 14 + pulse * 1.5, 14 + pulse * 1.5);

  if (!rage) {
    // 반쯤 닫힌 조리개 6장
    ctx.save();
    ctx.rotate(t * 0.3);
    for (let k = 0; k < 6; k++) {
      ctx.rotate(TAU / 6);
      ctx.fillStyle = metal(ctx, 0, -20, 10, -6, '#d8dee8', '#8a92a4', '#3a4152');
      poly(ctx, [0, -19, 14, -12, 9, -6, -2, -10]);
      ctx.strokeStyle = 'rgba(20,24,34,0.6)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // 활짝 열린 렌즈 — 십자 빛살
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(t * 0.4);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(TAU / 4);
      const g = ctx.createLinearGradient(0, 0, 0, -70);
      g.addColorStop(0, `rgba(255,255,255,${0.8 * pulse})`);
      g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g;
      poly(ctx, [-3, 0, 0, -70, 3, 0]);
    }
    ctx.restore();
  }
}
