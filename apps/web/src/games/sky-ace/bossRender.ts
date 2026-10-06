/**
 * 보스 5종 그리기 — 1단계와 2단계(변신 후)의 모습이 다르다.
 * 이미지 없이 그라디언트·패스만으로 입체감(명암, 리벳, 패널선, 발광부)을 낸다.
 * 모든 좌표는 보스 중심 기준이고, 보스의 앞쪽(플레이어 쪽)이 +y 다.
 */
import { TAU, drawSprite, drawThrust, ellipse, glowSprite, poly } from './render';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

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
  [-30, -30, 10],
  [34, 10, 9],
  [-12, 34, 8],
  [40, -40, 8],
  [-44, 8, 8],
  [8, -54, 7],
];

/** 등껍질 균열 (2단계에서 용암이 새어 나온다) */
const IGNIS_CRACKS: number[][] = [
  [-10, -60, -18, -40, -8, -22, -20, -4],
  [14, -58, 22, -36, 10, -18, 24, 2],
  [-40, -20, -28, -6, -40, 14],
  [42, -18, 30, 0, 44, 18],
  [-6, 20, 6, 34, -4, 50],
];

/**
 * 이그니스 — 흑요석 갑각을 두른 기계 화룡 (머리 = 플레이어 쪽 +y, 꼬리 = 위).
 * 1단계: 날개를 접고 등에 용암 박격포 두 문을 세운 갑각 형태, 입은 닫혀 틈으로 불빛이 샌다.
 * 2단계(해방): 갑각이 갈라져 가슴 용광로가 드러나고, 날개를 활짝 펴 불꽃 막이 타오르며 턱이 열린다.
 * breathing: 화염 숨결 중이면 입이 열리고 불빛이 강해진다
 */
export function drawIgnis(ctx: CanvasRenderingContext2D, b: BossLook, breathing: boolean) {
  const t = b.t;
  const rage = b.phase === 2;
  /** 날개 펼침 정도 — 변신 연출 동안 서서히 펼친다 */
  const unfurl = rage ? 1 : b.morph;
  const pulse = 0.6 + 0.4 * Math.sin(t * (rage ? 8 : 3));

  ctx.save();
  ctx.translate(b.x, b.y);
  dropShadow(ctx, 24, 116, 150 + unfurl * 40, 44);

  // 열기 오라
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowOrb(ctx, 0, 0, 170 + unfurl * 30, `rgba(255,80,20,${0.16 + unfurl * 0.1})`, 0.15);
  ctx.restore();

  ignisTail(ctx, t, rage);
  ignisWings(ctx, t, unfurl, pulse);
  ignisBody(ctx, rage, pulse);
  ignisHead(ctx, b, rage, pulse, breathing || rage);

  scorch(ctx, IGNIS_SCORCH, Math.max(0, (1 - b.hp) * 1.4), t);
  hitFlash(ctx, b.flash, 110, 90);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/** 꼬리 — 마디마다 등가시가 돋은 흑요석 꼬리가 좌우로 흔들리고, 끝에서 불꽃이 인다 */
function ignisTail(ctx: CanvasRenderingContext2D, t: number, rage: boolean) {
  const segs = 9;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const y = -56 - i * 15;
    const x = Math.sin(t * (rage ? 2.4 : 1.5) - i * 0.6) * i * 2.6;
    pts.push([x, y, 17 - i * 1.4]);
  }
  // 꼬리 끝 불꽃 (위쪽으로 타오름)
  const tip = pts[segs - 1]!;
  ctx.save();
  ctx.translate(tip[0], tip[1] - 6);
  ctx.scale(1, -1);
  drawThrust(ctx, 0, 0, 14, rage ? 40 : 26, t, '#fff0b0', '#ff4a1a');
  ctx.restore();
  for (let i = segs - 1; i >= 0; i--) {
    const [x, y, r] = pts[i]!;
    // 등가시
    ctx.fillStyle = '#120b09';
    poly(ctx, [x - r * 0.35, y - r * 0.2, x, y - r * 1.25, x + r * 0.35, y - r * 0.2]);
    ctx.fillStyle = 'rgba(255,120,40,0.55)';
    poly(ctx, [x - r * 0.1, y - r * 0.4, x, y - r * 1.15, x + r * 0.05, y - r * 0.4]);
    // 마디 껍질
    ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, '#5a4038', '#2a1c18', '#0e0907');
    ellipse(ctx, x, y, r, r * 0.72);
    // 마디 사이 용암 이음매
    ctx.strokeStyle = rage ? 'rgba(255,170,60,0.9)' : 'rgba(255,110,30,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 0.82, r * 0.25, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
}

/** 날개 뼈대 끝점 — 접힌 모양(1단계)과 펼친 모양(2단계) 사이를 보간 */
const IGNIS_WING_FOLD: [number, number][] = [
  [92, -66],
  [116, -32],
  [112, 4],
  [86, 28],
];
const IGNIS_WING_OPEN: [number, number][] = [
  [146, -104],
  [184, -50],
  [180, 4],
  [140, 48],
];

function ignisWings(ctx: CanvasRenderingContext2D, t: number, unfurl: number, pulse: number) {
  const shoulderX = 44;
  const shoulderY = -16;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    // 날갯짓 — 펼친 상태일수록 크게 펄럭인다
    const flap = Math.sin(t * 2.2) * (0.02 + unfurl * 0.05);
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(flap);
    const tips = IGNIS_WING_FOLD.map(([fx, fy], i) => {
      const [ox, oy] = IGNIS_WING_OPEN[i]!;
      return [fx + (ox - fx) * unfurl - shoulderX, fy + (oy - fy) * unfurl - shoulderY] as [
        number,
        number,
      ];
    });

    // 막 — 뼈대 끝 사이가 안쪽으로 오목하게 들어간다
    const membrane = () => {
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(tips[0]![0], tips[0]![1]);
      for (let i = 1; i < tips.length; i++) {
        const [px, py] = tips[i - 1]!;
        const [nx, ny] = tips[i]!;
        ctx.quadraticCurveTo((px + nx) * 0.36, (py + ny) * 0.36, nx, ny);
      }
      ctx.quadraticCurveTo(tips[3]![0] * 0.3, tips[3]![1] * 0.5 + 10, 0, 18);
      ctx.closePath();
    };
    // 1단계 — 흑요석 비늘 막 (바깥 가장자리는 용암 빛을 받아 붉게 빛난다)
    membrane();
    const dark = ctx.createLinearGradient(0, 0, 150, 0);
    dark.addColorStop(0, '#4a3029');
    dark.addColorStop(1, '#1a100c');
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,50,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 2단계 — 불꽃 막이 타오른다
    if (unfurl > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = unfurl * (0.75 + 0.25 * Math.sin(t * 9));
      membrane();
      const fire = ctx.createRadialGradient(0, 0, 10, 0, 0, 200);
      fire.addColorStop(0, 'rgba(255,230,140,0.85)');
      fire.addColorStop(0.35, 'rgba(255,120,30,0.6)');
      fire.addColorStop(1, 'rgba(200,20,10,0.05)');
      ctx.fillStyle = fire;
      ctx.fill();
      // 막을 타고 흐르는 불길 줄무늬
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,240,180,0.35)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        const r = ((t * 60 + k * 34) % 200) + 10;
        ctx.beginPath();
        ctx.arc(0, 0, r, -1.6, 1.3);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // 접힌 날개 비늘의 용암 결
      ctx.save();
      membrane();
      ctx.clip();
      ctx.strokeStyle = `rgba(255,100,30,${0.25 * pulse})`;
      ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, k * 22, -1.8, 1.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 뼈대 — 어깨에서 관절을 거쳐 끝의 발톱까지
    for (const [i, [tx, ty]] of tips.entries()) {
      const jx = tx * 0.45 + (i - 1.5) * 4;
      const jy = ty * 0.45 - 8;
      const g = ctx.createLinearGradient(0, 0, tx, ty);
      g.addColorStop(0, '#4a3830');
      g.addColorStop(1, '#16100d');
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      ctx.lineWidth = 7 - i;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(jx, jy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,160,90,0.25)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // 관절 마디
      ctx.fillStyle = '#5a4038';
      ellipse(ctx, jx, jy, 4, 4);
      // 발톱 — 끝이 달아오른다
      const a = Math.atan2(ty - jy, tx - jx);
      ctx.fillStyle = '#0e0907';
      poly(ctx, [
        tx + Math.cos(a + 1.4) * 4,
        ty + Math.sin(a + 1.4) * 4,
        tx + Math.cos(a) * 14,
        ty + Math.sin(a) * 14,
        tx + Math.cos(a - 1.4) * 4,
        ty + Math.sin(a - 1.4) * 4,
      ]);
      glowOrb(
        ctx,
        tx + Math.cos(a) * 9,
        ty + Math.sin(a) * 9,
        7,
        'rgba(255,150,50,0.9)',
        0.7 * pulse,
      );
    }
    // 어깨 관절 장갑
    ctx.fillStyle = metal(ctx, -14, -14, 14, 14, '#6a4c42', '#2e201b', '#120b09');
    ellipse(ctx, 0, 0, 15, 13);
    rivets(ctx, [
      [-6, -6],
      [6, -6],
      [0, 7],
    ]);
    ctx.restore();
  }
}

function ignisBody(ctx: CanvasRenderingContext2D, rage: boolean, pulse: number) {
  const rx = 64;
  const ry = 74;
  const cy = -6;
  // 갑각 본체
  ctx.fillStyle = '#0b0706';
  ellipse(ctx, 0, cy, rx + 3, ry + 3);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
  ctx.clip();
  // 판 사이 틈으로 보이는 용암 — 먼저 깔고 그 위에 육각 판을 얹는다
  const lava = ctx.createRadialGradient(0, cy + 10, 4, 0, cy, ry);
  lava.addColorStop(0, rage ? '#fff0b0' : '#ffb03a');
  lava.addColorStop(0.5, rage ? '#ff7a1a' : '#c8400c');
  lava.addColorStop(1, '#3a0e04');
  ctx.fillStyle = lava;
  ctx.fillRect(-rx, cy - ry, rx * 2, ry * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.45 - pulse * 0.3})`;
  ctx.fillRect(-rx, cy - ry, rx * 2, ry * 2);
  // 육각 갑판 — 판 사이 틈에서 용암 빛이 샌다
  const hexR = 15;
  const hw = hexR * Math.sqrt(3);
  for (let row = -6; row <= 6; row++) {
    for (let col = -4; col <= 4; col++) {
      const hx = col * hw + (row % 2 ? hw / 2 : 0);
      const hy = cy + row * hexR * 1.5;
      if ((hx / rx) ** 2 + ((hy - cy) / ry) ** 2 > 1.1) continue;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6;
        const px = hx + Math.cos(a) * (hexR - 1.5);
        const py = hy + Math.sin(a) * (hexR - 1.5);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // 판마다 왼쪽 위가 밝다
      const g = ctx.createLinearGradient(hx - hexR, hy - hexR, hx + hexR, hy + hexR);
      g.addColorStop(0, '#5a4038');
      g.addColorStop(1, '#1a110e');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  // 갑각 가장자리의 그림자 (둥근 입체감)
  const rim = ctx.createRadialGradient(-18, cy - 24, ry * 0.3, 0, cy, ry);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = rim;
  ctx.fillRect(-rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();

  // 등줄기 가시
  for (let i = 0; i < 6; i++) {
    const y = cy - ry + 18 + i * 20;
    const s = 9 - Math.abs(i - 2.5) * 1.2;
    ctx.fillStyle = '#120b09';
    poly(ctx, [-s * 0.6, y + s * 0.4, 0, y - s * 1.2, s * 0.6, y + s * 0.4]);
    ctx.fillStyle = 'rgba(255,140,60,0.5)';
    poly(ctx, [-s * 0.15, y, 0, y - s * 1.05, s * 0.1, y]);
  }

  if (!rage) {
    // 등의 용암 박격포 두 문 — 꼬리 쪽(뒤)으로 비스듬히 솟은 포신
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 30, -50);
      ctx.rotate(s * 0.35);
      // 포가
      ctx.fillStyle = metal(ctx, -14, -8, 14, 10, '#7a5a4e', '#3a2822', '#120b09');
      poly(ctx, [-14, 10, 14, 10, 10, -4, -10, -4]);
      rivets(
        ctx,
        [
          [-9, 5],
          [9, 5],
        ],
        1.1,
      );
      // 포신
      ctx.fillStyle = metal(ctx, -6, -26, 6, -2, '#6a4c42', '#2e201b', '#0e0907');
      ctx.fillRect(-6, -26, 12, 24);
      ctx.fillStyle = '#0b0706';
      ctx.fillRect(-7.5, -28, 15, 4);
      ctx.fillRect(-6.5, -16, 13, 2);
      // 포구 — 용암이 끓는다
      glowOrb(ctx, 0, -27, 8 + pulse * 2, 'rgba(255,120,30,0.95)', 0.9 * pulse);
      ctx.restore();
    }
    // 가슴 장갑판 — 닫혀 있다
    ctx.fillStyle = metal(ctx, -22, 4, 22, 44, '#6a4c42', '#2e201b', '#120b09');
    poly(ctx, [-26, 6, 26, 6, 18, 40, 0, 50, -18, 40]);
    ctx.strokeStyle = `rgba(255,120,30,${0.5 * pulse})`;
    ctx.lineWidth = 1.5;
    polyline(ctx, [-26, 6, 26, 6, 18, 40, 0, 50, -18, 40, -26, 6]);
    polyline(ctx, [0, 6, 0, 50]);
  } else {
    // 갈라진 갑각의 균열
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    for (const c of IGNIS_CRACKS) {
      ctx.strokeStyle = 'rgba(255,90,20,0.5)';
      ctx.lineWidth = 6;
      polyline(ctx, c);
      ctx.strokeStyle = `rgba(255,${200 + Math.round(pulse * 50)},140,0.95)`;
      ctx.lineWidth = 2;
      polyline(ctx, c);
    }
    ctx.restore();
    // 떨어져 나간 박격포 자리 — 부러진 포가만 남았다
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 30, -50);
      ctx.rotate(s * 0.35);
      ctx.fillStyle = '#1a110e';
      poly(ctx, [-14, 10, 14, 10, 9, 0, 3, 4, -2, -2, -10, 1]);
      ctx.restore();
    }
    // 드러난 가슴 용광로
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, 0, 22, 54 + pulse * 8, 'rgba(255,120,30,0.6)', 0.6);
    ctx.restore();
    const core = ctx.createRadialGradient(-3, 18, 2, 0, 22, 22);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#fff0a0');
    core.addColorStop(0.7, '#ff7a1a');
    core.addColorStop(1, '#5a1004');
    ctx.fillStyle = core;
    ellipse(ctx, 0, 22, 19 + pulse * 1.5, 22 + pulse * 1.5);
    // 용광로를 감싼 부서진 갈비 장갑
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#1a110e';
        poly(ctx, [
          s * 18,
          4 + k * 13,
          s * 34,
          8 + k * 13,
          s * 30,
          14 + k * 13,
          s * 16,
          11 + k * 13,
        ]);
      }
    }
  }
}

function ignisHead(
  ctx: CanvasRenderingContext2D,
  b: BossLook,
  rage: boolean,
  pulse: number,
  open: boolean,
) {
  const t = b.t;
  // 고개 방향 — 플레이어 쪽으로 살짝 돌린다 (목도 따라 휜다)
  const turn = clamp(b.aim - Math.PI / 2, -0.4, 0.4);
  // 목 — 겹친 비늘 마디 4개
  for (let i = 3; i >= 0; i--) {
    const y = 52 + i * 11;
    const x = -Math.sin(turn) * i * 4;
    ctx.fillStyle = metal(ctx, x - 17, y - 10, x + 17, y + 10, '#5a4038', '#2a1c18', '#0e0907');
    ellipse(ctx, x, y, 18 - i * 1.4, 10);
    ctx.strokeStyle = 'rgba(255,110,30,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14 - i, 4, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // 목덜미 가시
    ctx.fillStyle = '#120b09';
    poly(ctx, [x - 4, y - 6, x, y - 15, x + 4, y - 6]);
  }

  ctx.save();
  ctx.translate(-Math.sin(turn) * 16, 92);
  ctx.rotate(turn);
  ctx.scale(1.3, 1.3);
  const jaw = open ? 0.28 + Math.sin(t * 14) * 0.04 : 0;

  // 뿔 — 뒤로 휘어진 한 쌍
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#120b09';
    ctx.beginPath();
    ctx.moveTo(s * 10, -2);
    ctx.quadraticCurveTo(s * 34, -6, s * 40, -40);
    ctx.quadraticCurveTo(s * 28, -14, s * 16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,140,60,${rage ? 0.85 : 0.45})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s * 12, -2);
    ctx.quadraticCurveTo(s * 33, -6, s * 40, -40);
    ctx.stroke();
  }

  // 아래턱 — 숨결을 뿜을 때 벌어진다
  ctx.save();
  ctx.translate(0, 10);
  ctx.scale(1, 1 + jaw * 1.6);
  ctx.fillStyle = '#1e1411';
  poly(ctx, [-15, 0, 15, 0, 9, 22, 0, 27, -9, 22]);
  ctx.restore();

  if (open) {
    // 벌어진 입 안 — 끓는 용암
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(ctx, 0, 26 + jaw * 14, 22 + pulse * 6, 'rgba(255,140,40,0.95)', 1);
    ctx.restore();
    ctx.fillStyle = '#fff0b0';
    ellipse(ctx, 0, 18 + jaw * 12, 6, 4 + jaw * 10);
    // 이빨
    ctx.fillStyle = '#e8d8c8';
    for (const x of [-9, -4, 4, 9]) {
      poly(ctx, [x - 1.6, 12, x, 18 + jaw * 6, x + 1.6, 12]);
    }
  }

  // 위턱·두개골 — 쐐기 모양
  const skull = [-22, -8, 22, -8, 19, 12, 10, 32, 0, 38, -10, 32, -19, 12];
  ctx.fillStyle = '#0b0706';
  poly(
    ctx,
    skull.map((v, i) => (i % 2 ? v + 1.5 : v * 1.06)),
  );
  ctx.fillStyle = metal(ctx, -22, -8, 22, 38, '#6a4c42', '#2e201b', '#0e0907');
  poly(ctx, skull);
  // 콧등 능선과 눈썹뼈
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  polyline(ctx, [0, -6, 0, 34]);
  ctx.fillStyle = '#120b09';
  for (const s of [-1, 1]) poly(ctx, [s * 4, 2, s * 20, -2, s * 18, 6, s * 6, 8]);
  // 눈 — 1단계는 주황 틈, 2단계는 하얗게 이글거린다
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowOrb(
      ctx,
      s * 11,
      9,
      rage ? 10 : 7,
      rage ? 'rgba(255,240,180,0.95)' : 'rgba(255,140,40,0.9)',
      1,
    );
    ctx.restore();
    ctx.fillStyle = rage ? '#ffffff' : '#ffc060';
    poly(ctx, [s * 5, 9, s * 16, 6, s * 14, 11]);
  }
  // 콧구멍 불빛
  for (const s of [-1, 1]) {
    glowOrb(ctx, s * 5, 33, 4 + pulse * 2, 'rgba(255,120,30,0.9)', 0.6);
  }
  if (!open) {
    // 닫힌 입 틈으로 새는 불빛
    ctx.strokeStyle = `rgba(255,150,50,${0.55 + 0.35 * pulse})`;
    ctx.lineWidth = 1.6;
    polyline(ctx, [-14, 20, -6, 25, 0, 26, 6, 25, 14, 20]);
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
