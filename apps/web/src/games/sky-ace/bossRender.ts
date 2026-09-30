/**
 * 보스 3종 그리기 — 1단계와 2단계(변신 후)의 모습이 다르다.
 * 이미지 없이 그라디언트·패스만으로 입체감(명암, 리벳, 패널선, 발광부)을 낸다.
 * 모든 좌표는 보스 중심 기준이고, 보스의 앞쪽(플레이어 쪽)이 +y 다.
 */
import { TAU, drawThrust, ellipse, poly } from './render';

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

/** 톱니바퀴 경로 */
function gearPath(ctx: CanvasRenderingContext2D, r: number, teeth: number, depth: number) {
  ctx.beginPath();
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + step * 0.15) * (r + depth), Math.sin(a + step * 0.15) * (r + depth));
    ctx.lineTo(Math.cos(a + step * 0.45) * (r + depth), Math.sin(a + step * 0.45) * (r + depth));
    ctx.lineTo(Math.cos(a + step * 0.6) * r, Math.sin(a + step * 0.6) * r);
  }
  ctx.closePath();
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

function goliathMech(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  dropShadow(ctx, 30, 80, 150, 40);

  // 찢어진 기낭 잔해 (양 끝에서 펄럭인다)
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    const f = Math.sin(t * 5) * 4;
    ctx.fillStyle = '#6e6246';
    poly(ctx, [
      96,
      -46,
      132,
      -38 + f,
      150,
      -14,
      138,
      -6 + f,
      146,
      8,
      130,
      20 - f,
      138,
      34,
      112,
      44,
      100,
      30,
      110,
      10,
      98,
      -8,
    ]);
    ctx.strokeStyle = '#2a1e10';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,30,0.5)';
    ellipse(ctx, 140, -10 + f, 3, 3);
    ellipse(ctx, 134, 26 - f, 2.5, 2.5);
    ctx.restore();
  }

  // 트러스 골격
  const beam = (y: number) => {
    const g = ctx.createLinearGradient(0, y - 6, 0, y + 6);
    g.addColorStop(0, '#2b2e35');
    g.addColorStop(0.5, '#7b818d');
    g.addColorStop(1, '#23252b');
    ctx.fillStyle = g;
    ctx.fillRect(-118, y - 5, 236, 10);
  };
  ctx.strokeStyle = '#5b606b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -110; x < 110; x += 22) {
    ctx.moveTo(x, -34);
    ctx.lineTo(x + 22, 34);
    ctx.moveTo(x + 22, -34);
    ctx.lineTo(x, 34);
  }
  ctx.stroke();
  beam(-34);
  beam(34);

  // 에너지 도관 (코어 → 포드)
  ctx.save();
  ctx.strokeStyle = '#ff4a9a';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.lineDashOffset = -t * 60;
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(-60, 0);
  ctx.bezierCurveTo(-40, -20, -20, -20, 0, 0);
  ctx.bezierCurveTo(20, -20, 40, -20, 60, 0);
  ctx.stroke();
  ctx.restore();

  // 기계 팔 (양옆 집게)
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(70 * s, 20);
    const swing = Math.sin(t * 2 + s) * 0.25;
    ctx.rotate(s * (0.5 + swing));
    ctx.fillStyle = '#3a3d45';
    ctx.fillRect(-5, 0, 10, 44);
    ctx.fillStyle = '#7a808c';
    ellipse(ctx, 0, 0, 8, 8);
    ellipse(ctx, 0, 44, 7, 7);
    ctx.translate(0, 44);
    ctx.rotate(-s * swing * 1.5);
    ctx.fillStyle = '#2b2d33';
    poly(ctx, [-3, 0, -12, 16, -6, 24, -2, 12]);
    poly(ctx, [3, 0, 12, 16, 6, 24, 2, 12]);
    ctx.restore();
  }

  // 포드 — 플레이어를 조준하는 포신
  for (const s of [-1, 1]) {
    const px = 60 * s;
    ctx.save();
    ctx.translate(px, 0);
    ctx.save();
    ctx.rotate(Math.PI);
    drawThrust(ctx, 0, 30, 14, 34, t, '#ffe0ff', '#ff3a8a');
    ctx.restore();
    const pod = ctx.createRadialGradient(-5, -6, 2, 0, 0, 22);
    pod.addColorStop(0, '#8a909c');
    pod.addColorStop(1, '#23252b');
    ctx.fillStyle = pod;
    ellipse(ctx, 0, 0, 17, 25);
    ctx.fillStyle = '#ff4a9a';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8 + i);
      ctx.fillRect(-10, -14 + i * 7, 20, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    barrel(ctx, px, 16, b.aim, 22, 6);
  }

  // 중앙 원자로 하우징
  const house = ctx.createLinearGradient(0, -44, 0, 44);
  house.addColorStop(0, '#4a4e58');
  house.addColorStop(1, '#1d1f25');
  ctx.fillStyle = house;
  poly(ctx, [-44, -18, -24, -42, 24, -42, 44, -18, 44, 18, 24, 42, -24, 42, -44, 18]);
  ctx.strokeStyle = '#101115';
  ctx.lineWidth = 2;
  ctx.stroke();
  rivets(ctx, [
    [-34, -20],
    [34, -20],
    [-34, 20],
    [34, 20],
    [0, -36],
    [0, 36],
  ]);
  // 회전 포탑 링
  ctx.save();
  ctx.rotate(t * 3);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillStyle = '#9aa0ab';
    ctx.fillRect(-3.5, 24, 7, 12);
    ctx.fillStyle = '#101115';
    ctx.fillRect(-2, 32, 4, 5);
  }
  ctx.strokeStyle = '#6a707b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // 코어
  const pulse = 1 + Math.sin(t * 7) * 0.12;
  glowOrb(ctx, 0, 0, 34 * pulse, 'rgba(255,60,150,0.7)');
  const core = ctx.createRadialGradient(-4, -4, 1, 0, 0, 18);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, '#ff8ac8');
  core.addColorStop(1, '#8a0a4a');
  ctx.fillStyle = core;
  ellipse(ctx, 0, 0, 17, 17);

  // 튀는 스파크
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const k = (t * 3 + i * 0.37) % 1;
    const a = i * 1.7 + Math.floor(t * 3 + i * 0.37) * 2.3;
    const r = 30 + k * 60;
    ctx.fillStyle = `rgba(255,200,240,${1 - k})`;
    ellipse(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.5, 2, 2);
  }
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

export function drawKraken(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const rage = b.phase === 2;
  ctx.save();
  ctx.translate(b.x, b.y);

  // 물결 링과 물보라
  ctx.strokeStyle = 'rgba(200,235,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.ellipse(0, 0, 160 + k * 70, 76 + k * 34, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + t * 0.5;
    ctx.fillStyle = 'rgba(235,248,255,0.45)';
    ellipse(ctx, Math.cos(a) * 158, Math.sin(a) * 72, 12 + Math.sin(t * 4 + i) * 5, 5);
  }

  // 촉수 — 마디가 있는 살덩이, 끝에 포구
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1;
    const k = i % 3;
    const bx = s * (60 + k * 32);
    const segs = 11;
    for (let j = segs; j >= 0; j--) {
      const q = j / segs;
      const wob = Math.sin(t * 2.4 + i - q * 2.5) * 18 * q;
      const x = bx + s * Math.sin(q * Math.PI) * 22 + wob * 0.8;
      const y = 20 + q * (96 + k * 10);
      const r = 15 - k * 2 - q * 7;
      ctx.fillStyle = rage ? (j % 2 ? '#6a2440' : '#7c2c4c') : j % 2 ? '#1f4a52' : '#255862';
      ellipse(ctx, x, y, r, r);
      if (j % 2 === 0 && j > 0) {
        ctx.fillStyle = rage ? '#ffb0c8' : '#a8e0e0';
        ellipse(ctx, x - s * r * 0.4, y, 1.6, 1.6);
      }
      if (j === segs) glowOrb(ctx, x, y + 3, 8, rage ? '#ff5a8a' : '#5ad0ff');
    }
  }

  // 선체 — 바깥 장갑
  const outer = [-150, -20, -110, -66, 110, -66, 150, -20, 150, 20, 110, 62, -110, 62, -150, 20];
  const og = ctx.createLinearGradient(0, -66, 0, 62);
  og.addColorStop(0, '#3d4a54');
  og.addColorStop(1, '#1b232a');
  ctx.fillStyle = og;
  poly(ctx, outer);
  ctx.strokeStyle = '#0d1216';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 안쪽 갑판
  const deck = ctx.createLinearGradient(0, -56, 0, 52);
  deck.addColorStop(0, '#6a7a86');
  deck.addColorStop(0.5, '#56646f');
  deck.addColorStop(1, '#3a4650');
  ctx.fillStyle = deck;
  poly(ctx, [-138, -16, -104, -56, 104, -56, 138, -16, 138, 16, 104, 52, -104, 52, -138, 16]);
  // 갑판 패널선
  ctx.strokeStyle = 'rgba(15,20,25,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -126; x <= 126; x += 18) {
    ctx.moveTo(x, -52);
    ctx.lineTo(x, 48);
  }
  ctx.moveTo(-136, 0);
  ctx.lineTo(136, 0);
  ctx.stroke();
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
  for (let x = -100; x <= 100; x += 20) rv.push([x, -61], [x, 57]);
  rivets(ctx, rv);

  // 함교 + 회전 레이더
  ctx.save();
  ctx.translate(0, -48);
  const tower = ctx.createLinearGradient(-26, 0, 26, 0);
  tower.addColorStop(0, '#2a333a');
  tower.addColorStop(0.5, '#7a8a96');
  tower.addColorStop(1, '#232b31');
  ctx.fillStyle = tower;
  poly(ctx, [-26, -10, 26, -10, 20, 12, -20, 12]);
  ctx.fillStyle = '#9fe8ff';
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 9 - 3, -4, 6, 3);
  ctx.strokeStyle = '#c8d4dc';
  ctx.lineWidth = 3;
  const ra = t * 3;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(ra) * 16, -16 - Math.sin(ra) * 4);
  ctx.lineTo(Math.cos(ra) * 16, -16 + Math.sin(ra) * 4);
  ctx.stroke();
  ctx.restore();

  // 미사일 사일로 4개
  for (const mx of [-112, -70, 70, 112]) {
    ctx.fillStyle = '#1a2126';
    ctx.fillRect(mx - 13, -34, 26, 34);
    ctx.strokeStyle = '#5a6670';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 13, -34, 26, 34);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = '#3a454e';
        ctx.fillRect(mx - 10 + c * 11, -31 + r * 11, 9, 9);
        ctx.fillStyle = '#ff8a2a';
        ellipse(ctx, mx - 5.5 + c * 11, -26.5 + r * 11, 2, 2);
      }
    }
    const lit = Math.floor(t * 3 + mx) % 3 === 0;
    glowOrb(ctx, mx, -38, lit ? 6 : 3, '#ffae3a');
  }

  // 조준 포탑 (앞쪽 모서리)
  for (const tx of [-112, 112]) {
    barrel(ctx, tx - 4, 30, b.aim, 24, 4);
    barrel(ctx, tx + 4, 30, b.aim, 24, 4);
    const tg = ctx.createRadialGradient(tx - 4, 26, 1, tx, 30, 15);
    tg.addColorStop(0, '#9aa6b0');
    tg.addColorStop(1, '#2a333a');
    ctx.fillStyle = tg;
    ellipse(ctx, tx, 30, 14, 14);
    ctx.fillStyle = '#1a2126';
    ellipse(ctx, tx, 30, 5, 5);
  }

  // 손상
  scorch(ctx, KRAKEN_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);

  // 코어 — 조개껍데기 같은 장갑문이 좌우로 열린다
  const open = b.open * 36;
  ctx.fillStyle = '#060a0e';
  ctx.fillRect(-40, -26, 80, 68);
  const eyeColor = rage ? '#ff3a5a' : '#3ad0ff';
  glowOrb(ctx, 0, 8, 30 + open * 0.6 + Math.sin(t * 5) * 3, eyeColor, 0.9);
  // 홍채 링 + 플레이어를 보는 동공
  ctx.save();
  ctx.translate(0, 8);
  ctx.rotate(t * (rage ? 2 : 0.8));
  ctx.strokeStyle = rage ? 'rgba(255,200,210,0.8)' : 'rgba(200,245,255,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
  }
  ctx.restore();
  const px = Math.cos(b.aim) * 5;
  const py = 8 + Math.sin(b.aim) * 5;
  ctx.fillStyle = '#0a0004';
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(0.45, 1);
  ellipse(ctx, 0, 0, 8, 8);
  ctx.restore();
  // 장갑문
  for (const s of [-1, 1]) {
    const dx = s === -1 ? -40 - open : open;
    const dg = ctx.createLinearGradient(dx, 0, dx + 40, 0);
    dg.addColorStop(0, s === -1 ? '#27313a' : '#4e5d69');
    dg.addColorStop(1, s === -1 ? '#4e5d69' : '#27313a');
    ctx.fillStyle = dg;
    ctx.fillRect(dx, -26, 40, 68);
    ctx.strokeStyle = '#0d1216';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, -26, 40, 68);
    // 문 안쪽 가장자리 줄무늬
    const edge = s === -1 ? dx + 34 : dx;
    for (let y = -24; y < 40; y += 8) {
      ctx.fillStyle = (y / 8) % 2 === 0 ? '#e8c02a' : '#1a1a1a';
      ctx.fillRect(edge, y, 6, 8);
    }
    rivets(ctx, [
      [dx + 8, -18],
      [dx + 32, -18],
      [dx + 8, 34],
      [dx + 32, 34],
    ]);
  }
  // 닫혀 있어도 틈으로 빛이 샌다
  if (b.open < 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = eyeColor;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
    ctx.fillRect(-1.5, -26, 3, 68);
    ctx.restore();
  }

  hitFlash(ctx, b.flash, 150, 66);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/* =========================================================
 * Stage 3 — 시공간 메카 크로노스
 * ========================================================= */
const CHRONOS_CRACKS: number[][] = [
  [-20, -60, -8, -40, -18, -20, -4, 0],
  [30, -50, 18, -30, 34, -10],
  [-44, 10, -26, 26, -34, 50],
  [40, 20, 22, 40, 30, 62],
];

export function drawChronos(ctx: CanvasRenderingContext2D, b: BossLook) {
  const t = b.t;
  const rage = b.phase === 2;
  const main = rage ? '#ff5a3a' : '#b88aff';
  const gold = rage ? '#ffb05a' : '#e8c86a';
  ctx.save();
  ctx.translate(b.x, b.y);

  dropShadow(ctx, 30, 110, 130, 40);

  // 오라
  const aura = ctx.createRadialGradient(0, 0, 30, 0, 0, 170);
  aura.addColorStop(0, rage ? 'rgba(255,60,30,0.35)' : 'rgba(150,90,255,0.3)');
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ellipse(ctx, 0, 0, 170, 170);

  // 뒤쪽 시계판 링 (로마 숫자 대신 굵고 가는 눈금)
  ctx.save();
  ctx.rotate(t * 0.4 * (rage ? 4 : 1));
  ctx.strokeStyle = main;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (major ? 101 : 104), Math.sin(a) * (major ? 101 : 104));
    ctx.lineTo(Math.cos(a) * 111, Math.sin(a) * 111);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = gold;
      ellipse(ctx, Math.cos(a) * 120, Math.sin(a) * 120, 3.5, 3.5);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // 반대로 도는 톱니바퀴 2개
  for (const [gx, gy, r, dir] of [
    [-62, -44, 26, 1],
    [62, -44, 26, -1],
  ] as const) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(t * dir * (rage ? 4 : 1.2));
    const gg = ctx.createRadialGradient(-6, -6, 2, 0, 0, r + 6);
    gg.addColorStop(0, '#fff2c0');
    gg.addColorStop(1, rage ? '#8a3a1a' : '#8a6a2a');
    ctx.fillStyle = gg;
    gearPath(ctx, r, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#1a1428';
    ellipse(ctx, 0, 0, r * 0.4, r * 0.4);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.fillRect(-2, r * 0.4, 4, r * 0.45);
    }
    ctx.restore();
  }

  // 진자 — 몸 아래에서 흔들린다
  const swing = Math.sin(t * (rage ? 5 : 2)) * 0.5;
  ctx.save();
  ctx.translate(0, 50);
  ctx.rotate(swing);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 64);
  ctx.stroke();
  const bob = ctx.createRadialGradient(-5, 60, 2, 0, 66, 16);
  bob.addColorStop(0, '#fffbe0');
  bob.addColorStop(1, gold);
  ctx.fillStyle = bob;
  ellipse(ctx, 0, 66, 14, 14);
  glowOrb(ctx, 0, 66, 8, main);
  ctx.restore();

  // 시곗바늘 날개 (양옆 3장씩)
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    const flap = Math.sin(t * (rage ? 9 : 2)) * 0.07;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(46, -20 + i * 14);
      ctx.rotate(-0.55 + i * 0.35 + flap * (i + 1));
      const len = 100 - i * 18;
      const wg = ctx.createLinearGradient(0, -6, 0, 6);
      wg.addColorStop(0, rage ? '#5a1a1a' : '#2a2050');
      wg.addColorStop(0.5, rage ? '#c8402a' : '#6a58b0');
      wg.addColorStop(1, rage ? '#3a0a0a' : '#1a1438');
      ctx.fillStyle = wg;
      poly(ctx, [0, -6, len * 0.7, -8, len, 0, len * 0.7, 8, 0, 6]);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = main;
      ellipse(ctx, len * 0.55, 0, 3, 3);
      if (rage) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,140,60,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(len * 0.7, -8);
        ctx.lineTo(len, 0);
        ctx.lineTo(len * 0.7, 8);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // 몸체 장갑
  const body = ctx.createLinearGradient(-60, -70, 60, 70);
  body.addColorStop(0, rage ? '#6a1e28' : '#4a3a86');
  body.addColorStop(0.5, rage ? '#3a0c14' : '#2a2058');
  body.addColorStop(1, rage ? '#1a0408' : '#120e2a');
  ctx.fillStyle = body;
  const shape = [0, -72, 46, -46, 60, 8, 34, 62, -34, 62, -60, 8, -46, -46];
  poly(ctx, shape);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 안쪽 장식선
  ctx.strokeStyle = rage ? 'rgba(255,150,90,0.4)' : 'rgba(220,200,255,0.35)';
  ctx.lineWidth = 1;
  poly(ctx, [0, -60, 36, -40, 48, 6, 28, 52, -28, 52, -48, 6, -36, -40]);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.stroke();
  // 어깨 장갑
  for (const s of [-1, 1]) {
    const sg = ctx.createRadialGradient(46 * s - 4, -40, 2, 46 * s, -36, 20);
    sg.addColorStop(0, '#fff2c0');
    sg.addColorStop(1, gold);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(46 * s, -36, 18, 13, s * 0.4, 0, TAU);
    ctx.fill();
    if (rage) {
      ctx.fillStyle = '#ff6a3a';
      poly(ctx, [40 * s, -46, 70 * s, -78, 56 * s, -40]);
      poly(ctx, [54 * s, -34, 86 * s, -50, 62 * s, -26]);
    }
  }

  // 광란 — 갈라진 틈에서 빛이 샌다
  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,${140 + Math.floor(Math.sin(t * 12) * 60)},60,0.9)`;
    ctx.lineWidth = 2.5;
    for (const c of CHRONOS_CRACKS) {
      ctx.beginPath();
      for (let i = 0; i < c.length; i += 2) {
        if (i === 0) ctx.moveTo(c[i]!, c[i + 1]!);
        else ctx.lineTo(c[i]!, c[i + 1]!);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 모래시계 문양
  ctx.save();
  ctx.translate(0, 38);
  ctx.fillStyle = gold;
  ctx.fillRect(-10, -14, 20, 3);
  ctx.fillRect(-10, 11, 20, 3);
  ctx.fillStyle = 'rgba(200,230,255,0.25)';
  poly(ctx, [-8, -11, 8, -11, 1, 0, 8, 11, -8, 11, -1, 0]);
  const sand = (t * 0.25) % 1;
  ctx.fillStyle = main;
  poly(ctx, [-8 * (1 - sand), -11 + 11 * sand, 8 * (1 - sand), -11 + 11 * sand, 0, 0]);
  poly(ctx, [-8 * sand, 11 - 11 * sand, 8 * sand, 11 - 11 * sand, 8, 11, -8, 11]);
  ctx.fillRect(-0.8, 0, 1.6, 11);
  ctx.restore();

  // 시계 문자판 코어 + 바늘
  glowOrb(ctx, 0, -6, 44, rage ? 'rgba(255,90,40,0.6)' : 'rgba(170,120,255,0.55)');
  const face = ctx.createRadialGradient(-6, -12, 2, 0, -6, 30);
  face.addColorStop(0, '#2a2240');
  face.addColorStop(1, '#07050e');
  ctx.fillStyle = face;
  ellipse(ctx, 0, -6, 28, 28);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -6, 28, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rage ? '#ffd0a0' : '#efe4ff';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, -6 + Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * 25, -6 + Math.sin(a) * 25);
    ctx.stroke();
  }
  const h = t * (rage ? 9 : 1.5);
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(Math.cos(h) * 13, -6 + Math.sin(h) * 13);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = main;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(Math.cos(h * 12) * 22, -6 + Math.sin(h * 12) * 22);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = gold;
  ellipse(ctx, 0, -6, 3.5, 3.5);

  // 머리 — 왕관 뿔 + 바이저 눈
  ctx.fillStyle = gold;
  poly(ctx, [-18, -62, -24, -86, -10, -70, 0, -92, 10, -70, 24, -86, 18, -62]);
  ctx.fillStyle = '#0a0814';
  poly(ctx, [-26, -56, 26, -56, 20, -44, -20, -44]);
  const eye = rage ? '#ff2a2a' : '#8af0ff';
  glowOrb(ctx, -11, -50, 9, eye);
  glowOrb(ctx, 11, -50, 9, eye);
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, -11, -50, 3, 1.6);
  ellipse(ctx, 11, -50, 3, 1.6);

  hitFlash(ctx, b.flash, 90, 90);
  morphFlash(ctx, b.morph);
  ctx.restore();
}
