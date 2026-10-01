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
