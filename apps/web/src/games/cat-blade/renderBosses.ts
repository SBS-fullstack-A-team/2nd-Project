/**
 * 캣 블레이드 — 보스 3종 그리기 (Canvas 도형만 사용)
 * 원점은 발 밑 가운데, 오른쪽을 보는 모습으로 그리고 facing 으로 좌우를 뒤집는다.
 * 부위마다 그라디언트 음영 + 만화풍 외곽선(withOutline) + 하이라이트를 겹쳐 입체감을 낸다.
 */
import { drawGlow, pawPath, roundRect } from './render';
import { drawGlint, drawStunStars, tinter, withOutline, type BossView } from './renderEnemies';
import { TAU, clamp } from './util';

/** 두 점을 잇는 끝이 둥근 사다리꼴 (팔다리) — 한 경로라 외곽선이 매끈하다 */
function limbPath(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, w1 / 2, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.arc(x2, y2, w2 / 2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

/** 이차 곡선 위의 점 */
function quadPt(t: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1,
  };
}

/* =========================================================
 * Stage 1 — 버려진 개집의 거대 들개 (Goliath Hound)
 * 근육질 늑대개: 갈기·가시 목줄·찢어진 귀·흉터, 2페이즈는 붉은 균열과 뼈 가시
 * ========================================================= */

interface HoundPal {
  fur: string;
  dark: string;
  light: string;
  belly: string;
  mane: string;
  nose: string;
  gum: string;
  eye: string;
}

const HOUND_P1: HoundPal = {
  fur: '#6e5a4c',
  dark: '#3a2c25',
  light: '#a48c7a',
  belly: '#4c3a31',
  mane: '#2e221c',
  nose: '#1a1210',
  gum: '#7a2030',
  eye: '#ffd23a',
};

const HOUND_P2: HoundPal = {
  fur: '#7e3428',
  dark: '#3a120e',
  light: '#c0604a',
  belly: '#4a1a14',
  mane: '#2a0a08',
  nose: '#1a0808',
  gum: '#a01828',
  eye: '#ff3a2a',
};

export function drawHound(ctx: CanvasRenderingContext2D, v: BossView) {
  withOutline(ctx, '#120806', 2.2, () => houndBody(ctx, v));
  if (v.stunned) drawStunStars(ctx, v.x + v.facing * 60, v.y - 160 * v.scale, v.t, 26);
}

function houndBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const rage = v.phase === 2;
  const base = rage ? HOUND_P2 : HOUND_P1;
  const P: HoundPal = {
    fur: c(base.fur),
    dark: c(base.dark),
    light: c(base.light),
    belly: c(base.belly),
    mane: c(base.mane),
    nose: c(base.nose),
    gum: c(base.gum),
    eye: base.eye,
  };
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);

  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, -76, 140, '#ff2a1a', 0.32 + Math.sin(v.t * 7) * 0.08);
    ctx.restore();
  }

  const moving = v.pose === 'walk' || v.pose === 'charge';
  const gait = v.t * (v.pose === 'charge' ? 20 : 8);
  const crouch = v.pose === 'crouch' || v.pose === 'leapPrep' ? 14 : v.pose === 'skid' ? 6 : 0;
  const rear = v.pose === 'rear' || v.pose === 'howl';
  const breathe = Math.sin(v.t * 3) * 1.2;

  ctx.save();
  if (rear) {
    ctx.translate(-50, 0);
    ctx.rotate(-0.42);
    ctx.translate(50, 0);
  } else if (v.pose === 'leap') {
    ctx.rotate(-0.22);
  } else if (v.pose === 'land') {
    ctx.scale(1.08, 0.9);
  } else if (v.pose === 'charge') {
    ctx.rotate(0.06);
  }

  const sY = -92 + crouch;
  const hY = -80 + crouch;
  // 먼 쪽 다리 (어둡게)
  houndLeg(ctx, P, true, 34, sY, gait + Math.PI, moving, true, crouch);
  houndLeg(ctx, P, false, -54, hY, gait, moving, true, crouch);
  houndTail(ctx, P, v, crouch, moving);
  ctx.save();
  ctx.translate(0, crouch + breathe * 0.5);
  houndTorso(ctx, P, v, rage);
  ctx.restore();
  // 가까운 쪽 다리
  houndLeg(ctx, P, false, -44, hY, gait + Math.PI, moving, false, crouch);
  houndLeg(ctx, P, true, 44, sY, gait, moving, false, crouch);
  houndHead(ctx, P, v, rage, crouch);
  ctx.restore();

  if (v.windup > 0) drawGlint(ctx, 140, -96 + crouch, 14 + v.windup * 14, '#fff27a', v.windup);
  ctx.restore();
}

function houndLeg(
  ctx: CanvasRenderingContext2D,
  P: HoundPal,
  front: boolean,
  x: number,
  jy: number,
  gait: number,
  moving: boolean,
  far: boolean,
  crouch: number,
) {
  const sw = moving ? Math.sin(gait) : 0;
  const lift = moving ? Math.max(0, Math.cos(gait)) * 12 : 0;
  const g = ctx.createLinearGradient(0, jy - 10, 0, 0);
  g.addColorStop(0, far ? P.dark : P.light);
  g.addColorStop(0.45, far ? P.dark : P.fur);
  g.addColorStop(1, P.dark);
  ctx.fillStyle = g;
  let j1x: number;
  let j1y: number;
  let j2x: number;
  let j2y: number;
  if (front) {
    j1x = x + 2 + sw * 12;
    j1y = jy + 40 - crouch * 0.4;
    j2x = x + 4 + sw * 26;
    j2y = -16 - lift;
    limbPath(ctx, x, jy, j1x, j1y, 36, 20);
    ctx.fill();
    limbPath(ctx, j1x, j1y, j2x, j2y, 19, 13);
    ctx.fill();
  } else {
    // 뒷다리 — 무릎은 앞으로, 발목(비절)은 뒤로 꺾인다
    j1x = x + 16 + sw * 10;
    j1y = jy + 30 - crouch * 0.3;
    j2x = x - 6 + sw * 24;
    j2y = -26 - lift;
    limbPath(ctx, x, jy, j1x, j1y, 38, 22);
    ctx.fill();
    limbPath(ctx, j1x, j1y, j2x, j2y, 20, 13);
    ctx.fill();
  }
  const px = j2x + (front ? 10 : 14);
  const py = -7 - lift * 0.6;
  limbPath(ctx, j2x, j2y, px, py, 13, 14);
  ctx.fill();
  // 발 + 발톱
  ctx.fillStyle = far ? P.dark : P.fur;
  ctx.beginPath();
  ctx.ellipse(px + 3, py + 1, 11, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8e0cc';
  for (let k = 0; k < 3; k++) {
    const cx = px + 6 + k * 3.6;
    ctx.beginPath();
    ctx.moveTo(cx - 2, py + 3);
    ctx.quadraticCurveTo(cx + 4, py + 3.5, cx + 5, py + 7.5);
    ctx.lineTo(cx, py + 6);
    ctx.closePath();
    ctx.fill();
  }
  if (!far) {
    // 허벅지·어깨 근육 하이라이트
    ctx.fillStyle = 'rgba(255,236,214,0.13)';
    ctx.beginPath();
    ctx.ellipse(x + (front ? -2 : 6), jy + 8, 9, 17, 0.25, 0, TAU);
    ctx.fill();
  }
}

function houndTail(
  ctx: CanvasRenderingContext2D,
  P: HoundPal,
  v: BossView,
  crouch: number,
  moving: boolean,
) {
  const wag = Math.sin(v.t * (moving ? 12 : 3)) * (moving ? 9 : 4);
  const x0 = -72;
  const y0 = -76 + crouch;
  const cx = -116;
  const cy = -86 + wag;
  const x1 = -106;
  const y1 = -128 + wag;
  const n = 8;
  const sideA: { x: number; y: number }[] = [];
  const sideB: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = quadPt(t, x0, y0, cx, cy, x1, y1);
    const q = quadPt(Math.min(1, t + 0.02), x0, y0, cx, cy, x1, y1);
    const a = Math.atan2(q.y - p.y, q.x - p.x);
    const w = 18 * (1 - t) + 5;
    // 위쪽 가장자리는 털이 삐죽삐죽
    const jag = i % 2 === 1 ? 1.7 : 1;
    sideA.push({
      x: p.x + Math.cos(a - Math.PI / 2) * (w / 2) * jag,
      y: p.y + Math.sin(a - Math.PI / 2) * (w / 2) * jag,
    });
    sideB.push({
      x: p.x + Math.cos(a + Math.PI / 2) * (w / 2),
      y: p.y + Math.sin(a + Math.PI / 2) * (w / 2),
    });
  }
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, P.fur);
  g.addColorStop(1, P.mane);
  ctx.fillStyle = g;
  ctx.beginPath();
  sideA.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineTo(x1 - 2, y1 - 8);
  for (let i = sideB.length - 1; i >= 0; i--) {
    const p = sideB[i];
    if (p) ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

function houndTorso(ctx: CanvasRenderingContext2D, P: HoundPal, v: BossView, rage: boolean) {
  // 몸통 — 어깨가 솟고 허리가 잘록한 실루엣
  const g = ctx.createLinearGradient(0, -122, 0, -42);
  g.addColorStop(0, P.light);
  g.addColorStop(0.45, P.fur);
  g.addColorStop(1, P.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-78, -74);
  ctx.bezierCurveTo(-72, -100, -32, -100, 0, -104);
  ctx.bezierCurveTo(26, -110, 50, -118, 66, -100);
  ctx.bezierCurveTo(78, -86, 74, -60, 56, -50);
  ctx.bezierCurveTo(36, -42, 14, -50, -10, -52);
  ctx.bezierCurveTo(-36, -54, -64, -50, -78, -62);
  ctx.closePath();
  ctx.fill();

  // 배 아래 늘어진 털
  ctx.fillStyle = P.belly;
  ctx.beginPath();
  ctx.moveTo(44, -52);
  for (let i = 0; i <= 10; i++) {
    const x = 44 - i * 9.5;
    const y = -50 + i * -0.4 + (i % 2 === 1 ? 9 : 0);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(-52, -60);
  ctx.quadraticCurveTo(-4, -58, 44, -58);
  ctx.closePath();
  ctx.fill();

  // 갈비뼈 · 근육 음영
  ctx.strokeStyle = 'rgba(20,10,8,0.35)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const rx = -24 + i * 11;
    ctx.moveTo(rx, -88 + i);
    ctx.quadraticCurveTo(rx + 6, -74, rx + 2, -60);
  }
  ctx.moveTo(48, -100);
  ctx.quadraticCurveTo(30, -84, 40, -62);
  ctx.moveTo(-50, -90);
  ctx.quadraticCurveTo(-64, -76, -56, -60);
  ctx.stroke();

  // 털 결
  ctx.strokeStyle = rage ? 'rgba(255,140,110,0.25)' : 'rgba(220,200,180,0.22)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 22; i++) {
    const fx = -66 + ((i * 41) % 124);
    const fy = -96 + ((i * 29) % 40);
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx - 5, fy + 3, fx - 11, fy + 4);
  }
  ctx.stroke();

  // 흉터 (밝은 선)
  ctx.strokeStyle = 'rgba(230,200,180,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-36, -92);
  ctx.lineTo(-18, -70);
  ctx.moveTo(-28, -94);
  ctx.lineTo(-10, -73);
  ctx.moveTo(-20, -96);
  ctx.lineTo(-3, -76);
  ctx.stroke();

  // 등 하이라이트
  ctx.fillStyle = 'rgba(255,240,224,0.12)';
  ctx.beginPath();
  ctx.ellipse(-10, -96, 50, 6, -0.05, 0, TAU);
  ctx.fill();

  // 어깨·목 갈기 (뾰족한 털 덩어리)
  ctx.fillStyle = P.mane;
  ctx.beginPath();
  ctx.moveTo(-8, -98);
  const spikes: [number, number][] = [
    [-2, -116],
    [8, -104],
    [16, -126],
    [26, -110],
    [34, -132],
    [44, -114],
    [52, -128],
    [60, -110],
    [70, -118],
    [72, -98],
    [80, -88],
  ];
  for (const [sx, sy] of spikes) ctx.lineTo(sx, sy - (rage ? 4 : 0));
  ctx.lineTo(70, -72);
  ctx.quadraticCurveTo(40, -96, -8, -94);
  ctx.closePath();
  ctx.fill();
  // 등 털 삐죽
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const bx = -70 + i * 11;
    const by = -88 - Math.sin((i / 5) * Math.PI) * 10;
    ctx.moveTo(bx - 5, by + 4);
    ctx.lineTo(bx - 1, by - 9);
    ctx.lineTo(bx + 5, by + 4);
  }
  ctx.fill();

  if (rage) {
    // 등에서 솟은 뼈 가시
    ctx.fillStyle = '#e8dcc8';
    for (const [bx, by, h] of [
      [-48, -96, 18],
      [-30, -100, 24],
      [-12, -103, 20],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(bx - 5, by + 4);
      ctx.quadraticCurveTo(bx - 2, by - h * 0.6, bx + 3, by - h);
      ctx.quadraticCurveTo(bx + 4, by - h * 0.4, bx + 6, by + 4);
      ctx.closePath();
      ctx.fill();
    }
    // 몸에서 새어 나오는 붉은 균열
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(v.t * 9) * 0.25;
    ctx.strokeStyle = `rgba(255,90,40,${pulse})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-60, -80);
    ctx.lineTo(-48, -70);
    ctx.lineTo(-52, -60);
    ctx.moveTo(6, -92);
    ctx.lineTo(16, -80);
    ctx.lineTo(10, -66);
    ctx.lineTo(18, -56);
    ctx.moveTo(30, -100);
    ctx.lineTo(38, -88);
    ctx.stroke();
    drawGlow(ctx, 14, -78, 22, '#ff4a1a', pulse * 0.6);
    drawGlow(ctx, -52, -70, 18, '#ff4a1a', pulse * 0.5);
    ctx.restore();
    // 등에서 피어오르는 김
    ctx.fillStyle = 'rgba(255,200,180,0.12)';
    for (let i = 0; i < 4; i++) {
      const k = (v.t * 0.8 + i * 0.25) % 1;
      ctx.beginPath();
      ctx.arc(-40 + i * 22, -106 - k * 40, 6 + k * 10, 0, TAU);
      ctx.fill();
    }
  }
}

function houndHead(
  ctx: CanvasRenderingContext2D,
  P: HoundPal,
  v: BossView,
  rage: boolean,
  crouch: number,
) {
  const open =
    v.pose === 'bark' || v.pose === 'howl' || v.pose === 'bite' || v.pose === 'charge'
      ? 1
      : v.pose === 'crouch' || v.pose === 'leapPrep'
        ? 0.35
        : 0.08;
  let tilt: number;
  if (v.pose === 'rear' || v.pose === 'howl') tilt = -0.35;
  else if (v.pose === 'crouch' || v.pose === 'leapPrep') tilt = 0.18;
  else if (v.pose === 'charge') tilt = 0.12;
  else tilt = Math.sin(v.t * 2) * 0.03;

  ctx.save();
  ctx.translate(64, -100 + crouch * 1.2);
  ctx.rotate(tilt);
  ctx.scale(0.88, 0.88);

  // 먼 쪽 귀
  houndEar(ctx, -6, -18, P.dark, -0.35, false);

  // 가시 목줄 + 끊어진 사슬
  ctx.save();
  ctx.translate(-12, 10);
  ctx.rotate(-0.25);
  const cg = ctx.createLinearGradient(-12, 0, 12, 0);
  cg.addColorStop(0, '#4a0e12');
  cg.addColorStop(0.5, '#8a1e22');
  cg.addColorStop(1, '#4a0e12');
  ctx.fillStyle = cg;
  roundRect(ctx, -12, -18, 22, 40, 7);
  ctx.fill();
  // 금속 징 (목줄 위에 박힌 작은 원뿔)
  for (let i = 0; i < 4; i++) {
    const sy = -12 + i * 10;
    ctx.fillStyle = '#9aa2ae';
    ctx.beginPath();
    ctx.moveTo(-3, sy - 3);
    ctx.lineTo(-9, sy);
    ctx.lineTo(-3, sy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(-4, sy - 1, 0.9, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#9aa0a8';
  ctx.lineWidth = 2.4;
  const swing = Math.sin(v.t * 3) * 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(-6 + swing * (i / 3), 34 + i * 9, 3.2, 5, 0.3 * (i % 2 ? 1 : -1), 0, TAU);
    ctx.stroke();
  }

  // 아래턱
  ctx.save();
  ctx.translate(14, 6);
  ctx.rotate(open * 0.45);
  ctx.fillStyle = P.dark;
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(48, 0);
  ctx.quadraticCurveTo(56, 3, 50, 9);
  ctx.lineTo(8, 16);
  ctx.quadraticCurveTo(-6, 12, -2, -2);
  ctx.closePath();
  ctx.fill();
  if (open > 0.3) {
    ctx.fillStyle = P.gum;
    ctx.beginPath();
    ctx.moveTo(4, -2);
    ctx.lineTo(46, 0);
    ctx.lineTo(44, 4);
    ctx.lineTo(6, 4);
    ctx.closePath();
    ctx.fill();
    // 혀
    ctx.fillStyle = '#d0587a';
    ctx.beginPath();
    ctx.ellipse(26, 1, 17, 4, 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 5; i++) {
    const tx = 12 + i * 7.5;
    const big = i === 4;
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx + 2, big ? -10 : -5);
    ctx.lineTo(tx + 4, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 입 안 (위·아래턱 사이)
  if (open > 0.3) {
    ctx.fillStyle = '#2a0408';
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.lineTo(70, 4);
    ctx.lineTo(60, 6 + open * 22);
    ctx.closePath();
    ctx.fill();
  }

  // 머리통 + 위턱
  ctx.save();
  ctx.translate(14, 6);
  ctx.rotate(-open * 0.16);
  ctx.translate(-14, -6);
  const hg = ctx.createRadialGradient(14, -18, 4, 24, -6, 60);
  hg.addColorStop(0, P.light);
  hg.addColorStop(0.5, P.fur);
  hg.addColorStop(1, P.dark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-18, 4);
  ctx.bezierCurveTo(-22, -18, -8, -32, 12, -31);
  ctx.bezierCurveTo(26, -31, 34, -22, 44, -16);
  ctx.bezierCurveTo(56, -14, 68, -12, 78, -8);
  ctx.quadraticCurveTo(86, -6, 84, 2);
  ctx.lineTo(66, 8);
  ctx.bezierCurveTo(46, 10, 30, 8, 16, 12);
  ctx.bezierCurveTo(4, 16, -10, 16, -18, 4);
  ctx.closePath();
  ctx.fill();
  // 볼 털
  ctx.fillStyle = P.fur;
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.lineTo(-24, 10);
  ctx.lineTo(-12, 9);
  ctx.lineTo(-18, 18);
  ctx.lineTo(-4, 13);
  ctx.lineTo(-2, 20);
  ctx.lineTo(8, 12);
  ctx.closePath();
  ctx.fill();
  // 주둥이 옆면 음영 · 윗면 하이라이트
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.quadraticCurveTo(60, -2, 80, 0);
  ctx.lineTo(66, 7);
  ctx.quadraticCurveTo(50, 8, 40, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,224,0.18)';
  ctx.beginPath();
  ctx.ellipse(58, -11, 16, 2.6, 0.12, 0, TAU);
  ctx.fill();
  // 윗니 · 송곳니
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 6; i++) {
    const tx = 24 + i * 8;
    const fang = i === 5 || i === 1;
    ctx.beginPath();
    ctx.moveTo(tx, 8);
    ctx.lineTo(tx + 2.4, fang ? 20 : 13);
    ctx.lineTo(tx + 4.8, 8);
    ctx.closePath();
    ctx.fill();
  }
  // 코
  ctx.fillStyle = P.nose;
  ctx.beginPath();
  ctx.ellipse(80, -4, 7, 5.5, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(78, -7, 2.6, 1.3, 0.2, 0, TAU);
  ctx.fill();
  // 수염 자리 점
  ctx.fillStyle = 'rgba(20,10,8,0.6)';
  for (const [dx, dy] of [
    [62, -2],
    [66, -4],
    [64, 1],
    [70, -1],
  ] as const) {
    ctx.beginPath();
    ctx.arc(dx, dy, 0.9, 0, TAU);
    ctx.fill();
  }
  // 눈썹뼈
  ctx.fillStyle = P.mane;
  ctx.beginPath();
  ctx.moveTo(16, -22);
  ctx.quadraticCurveTo(30, -31, 44, -19);
  ctx.lineTo(40, -15);
  ctx.quadraticCurveTo(29, -22, 18, -17);
  ctx.closePath();
  ctx.fill();
  // 눈 — 아몬드 모양 + 세로 동공 + 발광
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 31, -13, rage ? 22 : 15, P.eye, 0.9);
  if (rage) {
    ctx.strokeStyle = 'rgba(255,60,40,0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, -13);
    ctx.quadraticCurveTo(10, -18 - Math.sin(v.t * 10) * 3, -14, -14);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#fff4c0';
  ctx.beginPath();
  ctx.moveTo(22, -13);
  ctx.quadraticCurveTo(31, -20, 40, -13);
  ctx.quadraticCurveTo(31, -8, 22, -13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.eye;
  ctx.beginPath();
  ctx.ellipse(31.5, -13.3, 4.6, 3.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#140604';
  ctx.beginPath();
  ctx.ellipse(32, -13.3, 1.2, 3.2, 0, 0, TAU);
  ctx.fill();
  // 눈을 가로지르는 흉터
  ctx.strokeStyle = 'rgba(240,210,190,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(26, -26);
  ctx.lineTo(36, -2);
  ctx.stroke();
  ctx.restore();

  // 가까운 쪽 귀 (한쪽이 찢어짐)
  houndEar(ctx, 2, -22, P.fur, 0.12 + (v.pose === 'bark' ? -0.25 : 0), true);

  // 침
  if (open > 0.8) {
    ctx.strokeStyle = 'rgba(220,240,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, 12);
    ctx.quadraticCurveTo(41, 20 + Math.sin(v.t * 5) * 2, 39, 28 + Math.sin(v.t * 5) * 3);
    ctx.stroke();
  }
  ctx.restore();
}

function houndEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  rot: number,
  torn: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.quadraticCurveTo(-14, -18, -4, -40);
  if (torn) {
    // 끝이 물어뜯긴 귀
    ctx.lineTo(0, -32);
    ctx.lineTo(4, -36);
  }
  ctx.quadraticCurveTo(8, -20, 12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a1a1a';
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.quadraticCurveTo(-7, -14, -2, -28);
  ctx.quadraticCurveTo(4, -14, 6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* =========================================================
 * Stage 2 — 강철 레이저 로봇 쥐 (Mecha Rat Prime)
 * 장갑 선체·레이더 귀·바이저·드릴 코·미사일 포드·리액터, 2페이즈는 과부하로 이음매가 달아오른다
 * ========================================================= */

interface RatPal {
  hull: string;
  hullMid: string;
  hullDark: string;
  plate: string;
  plateLight: string;
  glow: string;
  eye: string;
}

const RAT_P1: RatPal = {
  hull: '#e4ebf6',
  hullMid: '#9aa6be',
  hullDark: '#28304a',
  plate: '#5c6884',
  plateLight: '#8a98b8',
  glow: '#28e0ff',
  eye: '#ff2a3a',
};

const RAT_P2: RatPal = {
  hull: '#f2dccc',
  hullMid: '#b48870',
  hullDark: '#3a2420',
  plate: '#7a5246',
  plateLight: '#a8786a',
  glow: '#ff7a2a',
  eye: '#ff8a1a',
};

export function drawMechaRat(ctx: CanvasRenderingContext2D, v: BossView) {
  // 엔진 불꽃은 외곽선 없이 먼저
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);
  const od = v.phase === 2;
  ctx.globalCompositeOperation = 'lighter';
  const thr = 0.7 + Math.sin(v.t * 30) * 0.3;
  for (const tx of [-40, 24]) {
    drawGlow(ctx, tx, -10, 24 * thr, od ? '#ff7a2a' : '#28c8ff', 0.85);
    drawGlow(ctx, tx, 6, 16 * thr, od ? '#ffd23a' : '#b4f4ff', 0.65);
  }
  if (od) drawGlow(ctx, -6, -60, 120, '#ff3a1a', 0.22 + Math.sin(v.t * 6) * 0.07);
  ctx.restore();

  withOutline(ctx, '#0a0e18', 2, () => ratBody(ctx, v));
  if (v.stunned) drawStunStars(ctx, v.x, v.y - 160 * v.scale, v.t, 28);
}

function ratBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const od = v.phase === 2;
  const b = od ? RAT_P2 : RAT_P1;
  const P: RatPal = {
    hull: c(b.hull),
    hullMid: c(b.hullMid),
    hullDark: c(b.hullDark),
    plate: c(b.plate),
    plateLight: c(b.plateLight),
    glow: b.glow,
    eye: b.eye,
  };
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);
  const thrust = v.pose === 'thrust' ? 1 : 0;
  const tilt = v.pose === 'move' ? 0.05 : v.pose === 'thrust' ? 0.08 : 0;
  ctx.rotate(tilt);

  ratTail(ctx, P, v);

  // 후방 엔진 블록 + 배기구
  const eg = ctx.createLinearGradient(-90, -80, -90, -34);
  eg.addColorStop(0, P.plateLight);
  eg.addColorStop(1, P.hullDark);
  ctx.fillStyle = eg;
  roundRect(ctx, -90, -82, 26, 48, 6);
  ctx.fill();
  ctx.fillStyle = P.hullDark;
  for (let i = 0; i < 3; i++) {
    roundRect(ctx, -98, -76 + i * 14, 12, 9, 3);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    drawGlow(ctx, -100, -71.5 + i * 14, 8 + Math.sin(v.t * 20 + i) * 2, P.glow, 0.6);
  }
  ctx.restore();

  // 미사일 포드 (등) — 해치가 열린다
  const podOpen = v.pose === 'pods' ? Math.min(1, v.poseT * 4) : 0;
  ctx.save();
  ctx.translate(-22, -100);
  const pg = ctx.createLinearGradient(0, -26, 0, 0);
  pg.addColorStop(0, P.plateLight);
  pg.addColorStop(1, P.plate);
  ctx.fillStyle = pg;
  roundRect(ctx, -30, -24, 58, 26, 5);
  ctx.fill();
  ctx.fillStyle = P.hullDark;
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-16 + i * 15, -16 + r * 9, 4, 0, TAU);
      ctx.fill();
    }
  }
  if (podOpen > 0) {
    // 미사일 머리
    ctx.fillStyle = '#ff4a3a';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-20 + i * 15, -18);
      ctx.lineTo(-16 + i * 15, -18 - podOpen * 10);
      ctx.lineTo(-12 + i * 15, -18);
      ctx.closePath();
      ctx.fill();
    }
  }
  // 해치 덮개
  ctx.save();
  ctx.translate(-30, -24);
  ctx.rotate(-podOpen * 1.1);
  ctx.fillStyle = P.hullMid;
  roundRect(ctx, 0, -6, 58, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#ffcc2a';
  ctx.fillRect(8, -4.5, 10, 2);
  ctx.fillRect(40, -4.5, 10, 2);
  ctx.restore();
  ctx.restore();

  // 안테나 + 점멸등
  ctx.strokeStyle = P.hullDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(28, -100);
  ctx.lineTo(34, -134);
  ctx.stroke();
  if (Math.sin(v.t * 6) > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 34, -134, 10, '#ff3a3a', 0.95);
    ctx.restore();
  }

  // 먼 쪽 집게팔
  ratArm(ctx, P, v, 34, -38, true);

  // 선체
  const hg = ctx.createLinearGradient(0, -104, 0, -22);
  hg.addColorStop(0, P.hull);
  hg.addColorStop(0.32, P.hullMid);
  hg.addColorStop(0.7, P.plate);
  hg.addColorStop(1, P.hullDark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-72, -40);
  ctx.lineTo(-68, -80);
  ctx.quadraticCurveTo(-62, -102, -38, -104);
  ctx.lineTo(24, -104);
  ctx.quadraticCurveTo(46, -102, 56, -86);
  ctx.lineTo(62, -50);
  ctx.quadraticCurveTo(60, -30, 42, -24);
  ctx.lineTo(-58, -24);
  ctx.quadraticCurveTo(-72, -26, -72, -40);
  ctx.closePath();
  ctx.fill();

  // 경고 줄무늬 띠 (선체 안쪽만)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-72, -40);
  ctx.lineTo(-68, -80);
  ctx.quadraticCurveTo(-62, -102, -38, -104);
  ctx.lineTo(24, -104);
  ctx.quadraticCurveTo(46, -102, 56, -86);
  ctx.lineTo(62, -50);
  ctx.quadraticCurveTo(60, -30, 42, -24);
  ctx.lineTo(-58, -24);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,204,42,0.95)';
  ctx.fillRect(-80, -42, 150, 8);
  ctx.fillStyle = 'rgba(20,20,24,0.95)';
  for (let x = -80; x < 70; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -42);
    ctx.lineTo(x + 6, -42);
    ctx.lineTo(x + 2, -34);
    ctx.lineTo(x - 4, -34);
    ctx.closePath();
    ctx.fill();
  }
  // 윗면 광택
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-14, -98, 44, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-20, -90, 30, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 패널 이음매
  ctx.strokeStyle = od ? 'rgba(255,120,40,0.9)' : 'rgba(16,20,32,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-40, -102);
  ctx.lineTo(-44, -44);
  ctx.moveTo(10, -104);
  ctx.lineTo(12, -44);
  ctx.moveTo(-70, -62);
  ctx.lineTo(60, -62);
  ctx.moveTo(40, -100);
  ctx.lineTo(44, -44);
  ctx.stroke();
  if (od) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, -42, -70, 16, '#ff7a2a', 0.5);
    drawGlow(ctx, 12, -80, 14, '#ff7a2a', 0.45);
    ctx.restore();
  }

  // 측면 장갑판 + 리벳
  const ag = ctx.createLinearGradient(0, -90, 0, -48);
  ag.addColorStop(0, P.plateLight);
  ag.addColorStop(1, P.plate);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.moveTo(-58, -88);
  ctx.lineTo(-4, -90);
  ctx.lineTo(2, -52);
  ctx.lineTo(-54, -48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(20,24,36,0.75)';
  for (const [rx, ry] of [
    [-52, -84],
    [-10, -85],
    [-50, -53],
    [-4, -56],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.font = '900 8px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(20,24,36,0.7)';
  ctx.fillText('MRP-01', 14, -70);

  // 리액터 코어 (회전 날개)
  const rx = -28;
  const ry = -69;
  ctx.fillStyle = P.hullDark;
  ctx.beginPath();
  ctx.arc(rx, ry, 15, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, rx, ry, v.pose === 'core' ? 40 : 24, P.glow, 0.95);
  ctx.translate(rx, ry);
  ctx.rotate(v.t * (od ? 9 : 5));
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 3; i++) {
    ctx.rotate(TAU / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6, -4, 10, -1);
    ctx.lineTo(9, 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = P.plateLight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rx, ry, 13, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(rx - 4, ry - 6, 5, 2.4, -0.5, 0, TAU);
  ctx.fill();

  // 호버 패드
  for (const px of [-40, 24]) {
    ctx.fillStyle = P.hullDark;
    ctx.beginPath();
    ctx.ellipse(px, -22, 17, 6, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = od ? 'rgba(255,140,60,0.9)' : 'rgba(80,230,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, -20, 12, 3.4, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // 가까운 쪽 집게팔
  ratArm(ctx, P, v, 42, -34, false);

  ratHead(ctx, P, v, thrust, od);

  if (od) {
    // 과부하 스파크
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,230,140,0.95)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      if (Math.sin(v.t * 23 + i * 5) < 0.55) continue;
      const sx = -50 + i * 40;
      ctx.beginPath();
      ctx.moveTo(sx, -102);
      ctx.lineTo(sx + 6, -114);
      ctx.lineTo(sx - 2, -118);
      ctx.lineTo(sx + 5, -132);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (v.windup > 0) drawGlint(ctx, 128 + thrust * 30, -66, 14 + v.windup * 14, '#fff27a', v.windup);
  ctx.restore();
}

function ratTail(ctx: CanvasRenderingContext2D, P: RatPal, v: BossView) {
  const n = 9;
  let px = -74;
  let py = -42;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = -74 - i * 11;
    const y = -42 - i * 6 + Math.sin(v.t * 4 + i * 0.7) * 5 * k - k * k * 20;
    const a = Math.atan2(y - py, x - px);
    ctx.save();
    ctx.translate((x + px) / 2, (y + py) / 2);
    ctx.rotate(a);
    const s = 1 - k * 0.45;
    ctx.fillStyle = i % 2 ? P.plate : P.plateLight;
    roundRect(ctx, -7 * s, -5.5 * s, 14 * s, 11 * s, 3);
    ctx.fill();
    ctx.restore();
    px = x;
    py = y;
  }
  // 꼬리 끝 드릴
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI + 0.5);
  ctx.fillStyle = P.hullMid;
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(16, 0);
  ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ratArm(
  ctx: CanvasRenderingContext2D,
  P: RatPal,
  v: BossView,
  sx: number,
  sy: number,
  far: boolean,
) {
  const sw = Math.sin(v.t * 2.4 + (far ? 1 : 0)) * 3;
  const ex = sx + 14;
  const ey = sy + 14 + sw;
  const hx = ex + 14;
  const hy = ey - 6;
  ctx.fillStyle = far ? P.hullDark : P.plate;
  limbPath(ctx, sx, sy, ex, ey, 9, 7);
  ctx.fill();
  limbPath(ctx, ex, ey, hx, hy, 7, 6);
  ctx.fill();
  // 세 갈래 집게
  ctx.fillStyle = far ? P.hullDark : P.hullMid;
  for (const a of [-0.6, 0, 0.6]) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a - 0.3);
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(10, -1);
    ctx.lineTo(12, 2);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function ratHead(
  ctx: CanvasRenderingContext2D,
  P: RatPal,
  v: BossView,
  thrust: number,
  od: boolean,
) {
  const open = v.pose === 'charge' || v.pose === 'fire' ? 0.6 : v.pose === 'pods' ? 0.25 : 0;
  ctx.save();
  ctx.translate(54 + thrust * 16, -70);

  // 목 케이블
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#141a28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-10, 4 + i * 5);
    ctx.quadraticCurveTo(-20, 14 + i * 4, -30 - i * 4, 16 + i * 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,180,210,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // 먼 쪽 귀 (레이더 접시)
  ctx.fillStyle = P.hullDark;
  ctx.beginPath();
  ctx.arc(-10, -30, 17, 0, TAU);
  ctx.fill();

  // 아래턱
  ctx.save();
  ctx.translate(4, 10);
  ctx.rotate(open * 0.4);
  ctx.fillStyle = P.plate;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(48, 0);
  ctx.lineTo(42, 10);
  ctx.lineTo(2, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dfe6f2';
  for (let i = 0; i < 5; i++) ctx.fillRect(10 + i * 7, -2, 4, 4);
  ctx.restore();
  if (open > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 30, 12, 20 * open + 6, P.eye, 0.7);
    ctx.restore();
  }

  // 머리 외피
  const hg = ctx.createLinearGradient(0, -30, 0, 16);
  hg.addColorStop(0, P.hull);
  hg.addColorStop(0.5, P.hullMid);
  hg.addColorStop(1, P.plate);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-18, -22);
  ctx.lineTo(18, -28);
  ctx.quadraticCurveTo(40, -24, 58, -6);
  ctx.lineTo(60, 2);
  ctx.lineTo(54, 8);
  ctx.quadraticCurveTo(28, 14, -4, 14);
  ctx.quadraticCurveTo(-20, 12, -20, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(16, -23, 18, 2.4, -0.08, 0, TAU);
  ctx.fill();
  // 볼 통풍구
  ctx.strokeStyle = 'rgba(16,20,32,0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(-8 + i * 5, 0);
    ctx.lineTo(-4 + i * 5, 8);
  }
  ctx.stroke();

  // 바이저 + 스캔 불빛
  ctx.fillStyle = '#080c14';
  ctx.beginPath();
  ctx.moveTo(6, -17);
  ctx.lineTo(46, -10);
  ctx.lineTo(44, -3);
  ctx.lineTo(6, -8);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const charging = v.pose === 'charge' || v.pose === 'fire';
  const scan = charging ? 0.85 : (Math.sin(v.t * 3) + 1) / 2;
  const sx = 10 + scan * 30;
  drawGlow(ctx, sx, -10 + scan * 1.2, charging ? 28 : 15, od ? '#ffa02a' : P.eye, 0.95);
  ctx.fillStyle = 'rgba(255,190,190,0.9)';
  ctx.fillRect(sx - 5, -11 + scan * 1.2, 10, 2);
  ctx.restore();

  // 드릴 코
  const dl = 22 + thrust * 24;
  const dg = ctx.createLinearGradient(56, -8, 56, 8);
  dg.addColorStop(0, '#f4f8ff');
  dg.addColorStop(1, '#5a6478');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.moveTo(54, -8);
  ctx.lineTo(56 + dl, 0);
  ctx.lineTo(54, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,36,0.6)';
  ctx.lineWidth = 1.4;
  const spin = (v.t * (thrust ? 50 : 4)) % 7;
  ctx.beginPath();
  for (let x = 58 + spin; x < 54 + dl; x += 7) {
    const h = 8 * (1 - (x - 54) / dl);
    ctx.moveTo(x, -h);
    ctx.lineTo(x + 3, h);
  }
  ctx.stroke();

  // 수염 안테나
  ctx.strokeStyle = '#c8d2e2';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const dy of [-3, 1, 5]) {
    ctx.moveTo(46, dy * 0.4);
    ctx.quadraticCurveTo(62, dy * 1.4 - 4, 76, dy * 2.6 - 8);
  }
  ctx.stroke();

  // 가까운 쪽 귀 — 레이더 접시 (안쪽 원이 돌아간다)
  ctx.save();
  ctx.translate(-2, -34);
  const eg = ctx.createRadialGradient(-6, -6, 2, 0, 0, 22);
  eg.addColorStop(0, P.hull);
  eg.addColorStop(1, P.plate);
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#16233c';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = od ? 'rgba(255,140,60,0.7)' : 'rgba(60,220,255,0.6)';
  ctx.lineWidth = 1.2;
  for (const r of [5, 9.5]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
  }
  const a = v.t * 3;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = P.hullMid;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/* =========================================================
 * Stage 3 — 타락한 고양이 왕 (Shadow Cat King)
 * 갑주·털 망토·왕관·장검, 2페이즈는 깃털 그림자 날개·어둠의 후광·환영검
 * ========================================================= */

interface KingPal {
  fur: string;
  furLight: string;
  armor: string;
  armorLight: string;
  armorDark: string;
  gold: string;
  goldDark: string;
  cape: string;
  capeIn: string;
  mask: string;
  eye: string;
  blade: string;
}

const KING_P1: KingPal = {
  fur: '#2c2040',
  furLight: '#54407a',
  armor: '#3e2e5c',
  armorLight: '#7a64a8',
  armorDark: '#160e24',
  gold: '#f0c24a',
  goldDark: '#8a6414',
  cape: '#6a0a2a',
  capeIn: '#c41e44',
  mask: '#e6dcf4',
  eye: '#ff4adf',
  blade: '#c8a8ff',
};

const KING_P2: KingPal = {
  fur: '#22142e',
  furLight: '#4a2a5a',
  armor: '#3a1a3a',
  armorLight: '#7a3a6a',
  armorDark: '#14060f',
  gold: '#ffb43a',
  goldDark: '#8a4a10',
  cape: '#4a0620',
  capeIn: '#e8205a',
  mask: '#f0d8e8',
  eye: '#ff2a4a',
  blade: '#ff8aaa',
};

export function drawCatKing(ctx: CanvasRenderingContext2D, v: BossView) {
  const fin = v.phase === 2;
  // 오라 · 날개 · 후광은 외곽선 없이
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 0, -70, fin ? 130 : 80, fin ? '#ff2a6a' : '#7a2aff', fin ? 0.45 : 0.32);
  if (v.pose === 'stance') drawGlow(ctx, 14, -72, 86, '#5ab0ff', 0.55 + Math.sin(v.t * 20) * 0.1);
  ctx.restore();
  if (fin) kingWings(ctx, v);
  ctx.restore();

  withOutline(ctx, '#05020a', 1.8, () => kingBody(ctx, v));
  if (v.stunned) drawStunStars(ctx, v.x + v.facing * 6, v.y - 168 * v.scale, v.t, 22);
}

function kingWings(ctx: CanvasRenderingContext2D, v: BossView) {
  const flap = Math.sin(v.t * 2.6) * 0.1;
  for (const [side, alpha] of [
    [-1, 0.75],
    [1, 0.95],
  ] as const) {
    ctx.save();
    ctx.translate(-8 + side * 4, -100);
    ctx.rotate(side * 0.12 + flap * side);
    ctx.globalAlpha *= alpha;
    for (let i = 0; i < 7; i++) {
      const a = -2.75 + i * 0.22 + flap;
      const len = 70 + i * 9 - (i > 4 ? (i - 4) * 14 : 0);
      ctx.save();
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(30,6,30,0.95)');
      g.addColorStop(0.7, 'rgba(70,10,50,0.9)');
      g.addColorStop(1, 'rgba(255,40,110,0.85)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(len * 0.5, -12, len, 0);
      ctx.quadraticCurveTo(len * 0.5, 9, 0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,170,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(len * 0.92, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function kingBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const fin = v.phase === 2;
  const b = fin ? KING_P2 : KING_P1;
  const P: KingPal = {
    fur: c(b.fur),
    furLight: c(b.furLight),
    armor: c(b.armor),
    armorLight: c(b.armorLight),
    armorDark: c(b.armorDark),
    gold: c(b.gold),
    goldDark: c(b.goldDark),
    cape: c(b.cape),
    capeIn: c(b.capeIn),
    mask: c(b.mask),
    eye: b.eye,
    blade: b.blade,
  };
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);

  const run = v.pose === 'run' ? Math.sin(v.t * 16) : 0;
  const lean =
    v.pose === 'slash0' || v.pose === 'slash1'
      ? 0.16
      : v.pose === 'windup'
        ? -0.12
        : v.pose === 'run'
          ? 0.2
          : v.pose === 'stance'
            ? 0.06
            : 0;
  const breathe = Math.sin(v.t * 2.4) * 0.8;

  kingCape(ctx, P, v);

  ctx.save();
  ctx.rotate(lean);

  // 꼬리 + 금 고리
  ctx.lineCap = 'round';
  const tailPath = () => {
    ctx.beginPath();
    ctx.moveTo(-12, -50);
    ctx.bezierCurveTo(-40, -44, -46, -70, -30 + Math.sin(v.t * 2.5) * 6, -86);
  };
  tailPath();
  ctx.strokeStyle = '#05020a';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = P.fur;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = P.gold;
  ctx.beginPath();
  ctx.ellipse(-40, -60, 4.5, 2.6, 0.9, 0, TAU);
  ctx.fill();

  // 먼 쪽 다리
  kingLeg(ctx, P, -6, -54, -run * 0.45, true);

  // 몸통 (흉갑)
  ctx.save();
  ctx.translate(0, breathe);
  const tg = ctx.createLinearGradient(-20, -108, 20, -56);
  tg.addColorStop(0, P.armorLight);
  tg.addColorStop(0.45, P.armor);
  tg.addColorStop(1, P.armorDark);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-18, -106);
  ctx.lineTo(20, -106);
  ctx.quadraticCurveTo(26, -82, 15, -58);
  ctx.lineTo(-14, -58);
  ctx.quadraticCurveTo(-24, -82, -18, -106);
  ctx.closePath();
  ctx.fill();
  // 흉갑 금 세공
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(1, -102);
  ctx.quadraticCurveTo(-10, -92, -6, -80);
  ctx.quadraticCurveTo(-2, -72, 1, -64);
  ctx.moveTo(1, -102);
  ctx.quadraticCurveTo(12, -92, 8, -80);
  ctx.quadraticCurveTo(4, -72, 1, -64);
  ctx.moveTo(-14, -92);
  ctx.quadraticCurveTo(-8, -86, -12, -78);
  ctx.moveTo(16, -92);
  ctx.quadraticCurveTo(10, -86, 14, -78);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.ellipse(-8, -96, 6, 10, 0.3, 0, TAU);
  ctx.fill();
  // 가슴 보석
  ctx.fillStyle = '#ff2a4a';
  ctx.beginPath();
  ctx.moveTo(1, -90);
  ctx.lineTo(6, -84);
  ctx.lineTo(1, -77);
  ctx.lineTo(-4, -84);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 1, -84, 12, '#ff2a4a', 0.7 + Math.sin(v.t * 4) * 0.2);
  ctx.restore();
  // 허리띠 + 발자국 버클
  const bg = ctx.createLinearGradient(0, -62, 0, -54);
  bg.addColorStop(0, P.gold);
  bg.addColorStop(1, P.goldDark);
  ctx.fillStyle = bg;
  roundRect(ctx, -16, -62, 33, 8, 2);
  ctx.fill();
  ctx.fillStyle = P.armorDark;
  pawPath(ctx, 1, -58, 3.4);
  ctx.fill();
  ctx.restore();

  // 허리 갑옷 자락 (태싯)
  for (const [tx, w, rot] of [
    [-13, 11, 0.12],
    [-1, 12, 0],
    [11, 11, -0.12],
  ] as const) {
    ctx.save();
    ctx.translate(tx, -54);
    ctx.rotate(rot - run * 0.06);
    const pg = ctx.createLinearGradient(0, 0, 0, 20);
    pg.addColorStop(0, P.armorLight);
    pg.addColorStop(1, P.armorDark);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 2 - 1, 18);
    ctx.lineTo(0, 22);
    ctx.lineTo(-w / 2 + 1, 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 1, 18);
    ctx.lineTo(0, 22);
    ctx.lineTo(-w / 2 + 1, 18);
    ctx.stroke();
    ctx.restore();
  }

  // 가까운 쪽 다리
  kingLeg(ctx, P, 6, -54, run * 0.45, false);

  // 먼 쪽 어깨 갑옷
  kingPauldron(ctx, P, -14, -102, true);

  // 털 목도리
  ctx.fillStyle = P.mask;
  ctx.beginPath();
  ctx.moveTo(-16, -100);
  for (let i = 0; i <= 9; i++) {
    const fx = -16 + i * 4;
    ctx.quadraticCurveTo(fx + 2, -92 - (i % 2) * 3, fx + 4, -100);
  }
  ctx.quadraticCurveTo(16, -110, 4, -112);
  ctx.quadraticCurveTo(-10, -110, -16, -100);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(110,80,150,0.35)';
  ctx.beginPath();
  ctx.ellipse(4, -98, 17, 2.6, 0, 0, TAU);
  ctx.fill();

  kingHead(ctx, P, v, fin);

  // 가까운 쪽 어깨 갑옷 + 팔 + 장검
  kingArm(ctx, P, v, fin);
  kingPauldron(ctx, P, 16, -102, false);

  ctx.restore();

  // 2페이즈 — 몸 주위를 도는 환영검 4자루
  if (fin) {
    for (let i = 0; i < 4; i++) {
      const a = v.t * 1.6 + (i * TAU) / 4;
      const sx = Math.cos(a) * 66;
      const sy = -76 + Math.sin(a) * 28;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + Math.PI / 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, 22, '#ff2a6a', 0.45);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,190,215,0.92)';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(3.4, -4, 2.4, 10);
      ctx.lineTo(-2.4, 10);
      ctx.quadraticCurveTo(-3.4, -4, 0, -22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c('#ffb43a');
      ctx.fillRect(-5, 10, 10, 2.4);
      ctx.fillStyle = c('#2a0a1a');
      ctx.fillRect(-1.6, 12.4, 3.2, 7);
      ctx.restore();
    }
  }

  ctx.restore();
}

function kingCape(ctx: CanvasRenderingContext2D, P: KingPal, v: BossView) {
  const wave = Math.sin(v.t * 4) * 6;
  const wave2 = Math.sin(v.t * 4 + 1.4) * 5;
  const run = v.pose === 'run' ? 14 : 0;
  // 바깥 천
  const g = ctx.createLinearGradient(0, -108, -30, 0);
  g.addColorStop(0, P.cape);
  g.addColorStop(1, '#1a0410');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-10, -106);
  ctx.quadraticCurveTo(-40 - wave - run, -66, -58 - wave * 1.4 - run * 1.5, -4);
  // 찢어진 끝단
  const pts: [number, number][] = [
    [-50, -12],
    [-44, -2],
    [-36, -10],
    [-28, 0],
    [-20, -9],
    [-12, -2],
  ];
  for (const [px, py] of pts) ctx.lineTo(px - wave2 * 0.6 - run * 0.8, py);
  ctx.quadraticCurveTo(-4, -50, 12, -104);
  ctx.closePath();
  ctx.fill();
  // 안감
  const lg = ctx.createLinearGradient(-30, -96, -24, -4);
  lg.addColorStop(0, P.capeIn);
  lg.addColorStop(1, '#3a0614');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(-6, -100);
  ctx.quadraticCurveTo(-26 - wave * 0.6 - run * 0.6, -62, -32 - wave - run, -10);
  ctx.lineTo(-22 - wave2 * 0.6 - run * 0.8, -6);
  ctx.quadraticCurveTo(-12, -52, 4, -100);
  ctx.closePath();
  ctx.fill();
  // 금색 끝단
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58 - wave * 1.4 - run * 1.5, -4);
  for (const [px, py] of pts) ctx.lineTo(px - wave2 * 0.6 - run * 0.8, py);
  ctx.stroke();
}

function kingLeg(
  ctx: CanvasRenderingContext2D,
  P: KingPal,
  x: number,
  y: number,
  swing: number,
  far: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  // 허벅지
  ctx.fillStyle = far ? P.armorDark : P.fur;
  limbPath(ctx, 0, 0, 0, 24, 14, 11);
  ctx.fill();
  // 정강이 갑옷
  const g = ctx.createLinearGradient(-6, 24, 6, 24);
  g.addColorStop(0, far ? P.armorDark : P.armorLight);
  g.addColorStop(1, P.armorDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-6, 22);
  ctx.lineTo(7, 22);
  ctx.lineTo(5, 46);
  ctx.lineTo(-5, 46);
  ctx.closePath();
  ctx.fill();
  // 무릎 보호대
  ctx.fillStyle = far ? P.goldDark : P.gold;
  ctx.beginPath();
  ctx.ellipse(1, 23, 6, 4, 0, 0, TAU);
  ctx.fill();
  // 뾰족한 장화
  ctx.fillStyle = P.armorDark;
  ctx.beginPath();
  ctx.moveTo(-6, 44);
  ctx.lineTo(6, 44);
  ctx.quadraticCurveTo(16, 48, 20, 52);
  ctx.lineTo(-6, 54);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function kingPauldron(
  ctx: CanvasRenderingContext2D,
  P: KingPal,
  x: number,
  y: number,
  far: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(far ? -0.3 : 0.25);
  for (let i = 2; i >= 0; i--) {
    const g = ctx.createLinearGradient(0, -8 + i * 5, 0, 6 + i * 5);
    g.addColorStop(0, far ? P.armor : P.armorLight);
    g.addColorStop(1, P.armorDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, i * 5, 13 - i, 8, 0, Math.PI, TAU);
    ctx.lineTo(13 - i, i * 5 + 2);
    ctx.quadraticCurveTo(0, i * 5 + 6, -13 + i, i * 5 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(13 - i, i * 5 + 2);
    ctx.quadraticCurveTo(0, i * 5 + 6, -13 + i, i * 5 + 2);
    ctx.stroke();
  }
  // 어깨 가시
  ctx.fillStyle = P.gold;
  ctx.beginPath();
  ctx.moveTo(-4, -7);
  ctx.lineTo(0, -16);
  ctx.lineTo(4, -7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function kingHead(ctx: CanvasRenderingContext2D, P: KingPal, v: BossView, fin: boolean) {
  ctx.save();
  ctx.translate(6, -124);

  if (fin) {
    // 어둠의 불꽃 후광
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const spin = v.t * 1.2;
    ctx.strokeStyle = 'rgba(255,60,120,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-4, -10, 30, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = spin + (i * TAU) / 10;
      drawGlow(ctx, -4 + Math.cos(a) * 30, -10 + Math.sin(a) * 30, 9, '#ff2a6a', 0.55);
    }
    ctx.restore();
  }

  // 먼 쪽 귀
  ctx.fillStyle = P.armorDark;
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-16, -34);
  ctx.lineTo(-2, -16);
  ctx.closePath();
  ctx.fill();

  // 머리 (볼 털이 삐죽한 날렵한 고양이 얼굴)
  const hg = ctx.createRadialGradient(-4, -12, 2, 2, -2, 26);
  hg.addColorStop(0, P.furLight);
  hg.addColorStop(0.55, P.fur);
  hg.addColorStop(1, P.armorDark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-17, -2);
  ctx.quadraticCurveTo(-17, -18, -4, -21);
  ctx.quadraticCurveTo(12, -23, 19, -12);
  ctx.quadraticCurveTo(25, -6, 25, 2);
  ctx.quadraticCurveTo(23, 10, 13, 12);
  ctx.lineTo(7, 17);
  ctx.lineTo(2, 12);
  ctx.lineTo(-5, 17);
  ctx.lineTo(-9, 10);
  ctx.lineTo(-18, 13);
  ctx.lineTo(-15, 4);
  ctx.closePath();
  ctx.fill();

  // 하얀 얼굴 무늬
  ctx.fillStyle = P.mask;
  ctx.beginPath();
  ctx.moveTo(5, -4);
  ctx.quadraticCurveTo(15, -9, 23, -2);
  ctx.quadraticCurveTo(23, 8, 13, 11);
  ctx.quadraticCurveTo(5, 8, 5, -4);
  ctx.closePath();
  ctx.fill();
  // 코 · 입 · 송곳니
  ctx.fillStyle = '#3a1022';
  ctx.beginPath();
  ctx.moveTo(21, -1);
  ctx.lineTo(25, -1);
  ctx.lineTo(23, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a0818';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(23, 2);
  ctx.quadraticCurveTo(20, 6, 14, 5);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(16, 5);
  ctx.lineTo(17.5, 9);
  ctx.lineTo(19, 5.4);
  ctx.closePath();
  ctx.fill();

  // 눈 — 날카롭게 빛나는 눈
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 10, -8, fin ? 14 : 10, P.eye, 1);
  if (fin) {
    ctx.strokeStyle = 'rgba(255,60,90,0.7)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.quadraticCurveTo(-8, -12 - Math.sin(v.t * 8) * 2, -26, -8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#fff0f8';
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.lineTo(16, -12);
  ctx.lineTo(13, -5);
  ctx.quadraticCurveTo(7, -5, 3, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.eye;
  ctx.beginPath();
  ctx.ellipse(10.5, -8.4, 3.2, 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#12020a';
  ctx.beginPath();
  ctx.ellipse(11, -8.4, 0.9, 2.4, 0, 0, TAU);
  ctx.fill();
  // 눈썹
  ctx.strokeStyle = '#05020a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -14);
  ctx.lineTo(16, -14.5);
  ctx.stroke();
  // 긴 수염
  ctx.strokeStyle = 'rgba(230,220,250,0.7)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const dy of [-1, 2, 5]) {
    ctx.moveTo(20, 3 + dy * 0.4);
    ctx.quadraticCurveTo(32, 1 + dy, 44, 4 + dy * 2.4);
  }
  ctx.stroke();

  // 가까운 쪽 귀 + 금 귀걸이
  ctx.fillStyle = P.fur;
  ctx.beginPath();
  ctx.moveTo(-6, -18);
  ctx.lineTo(4, -40);
  ctx.lineTo(10, -19);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.capeIn;
  ctx.beginPath();
  ctx.moveTo(-1, -19);
  ctx.lineTo(4, -32);
  ctx.lineTo(7, -19);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-3, -20, 2.6, 0, TAU);
  ctx.stroke();

  // 왕관
  const cg = ctx.createLinearGradient(0, -38, 0, -18);
  cg.addColorStop(0, '#fff2b0');
  cg.addColorStop(0.5, P.gold);
  cg.addColorStop(1, P.goldDark);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-14, -16);
  ctx.lineTo(-13, -32);
  ctx.lineTo(-7, -22);
  ctx.lineTo(-1, -38);
  ctx.lineTo(5, -22);
  ctx.lineTo(11, -33);
  ctx.lineTo(15, -16);
  ctx.quadraticCurveTo(0, -12, -14, -16);
  ctx.closePath();
  ctx.fill();
  for (const [gx, gy, col] of [
    [-1, -24, '#ff2a4a'],
    [-9, -20, '#5ab0ff'],
    [8, -20, '#5ab0ff'],
  ] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(gx, gy, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-6, -28, 1.4, 4, 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function kingArm(ctx: CanvasRenderingContext2D, P: KingPal, v: BossView, fin: boolean) {
  let ang = 0.9;
  switch (v.pose) {
    case 'windup':
      ang = -2.3;
      break;
    case 'slash0':
      ang = -2.3 + Math.min(1, v.poseT * 9) * 3.3;
      break;
    case 'slash1':
      ang = 1.0 - Math.min(1, v.poseT * 9) * 3.2;
      break;
    case 'stance':
      ang = -0.15;
      break;
    case 'throw':
      ang = -0.6;
      break;
    case 'cast':
      ang = -1.57;
      break;
    case 'run':
      ang = 1.9;
      break;
  }
  ctx.save();
  ctx.translate(12, -98);
  const ex = Math.cos(ang * 0.5) * 12;
  const ey = Math.sin(ang * 0.5) * 9 + 8;
  const hx = ex + Math.cos(ang * 0.8) * 10;
  const hy = ey + Math.sin(ang * 0.8) * 8;
  ctx.fillStyle = P.armor;
  limbPath(ctx, 0, 0, ex, ey, 11, 9);
  ctx.fill();
  ctx.fillStyle = P.armorLight;
  limbPath(ctx, ex, ey, hx, hy, 9, 8);
  ctx.fill();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  // 칼 손잡이 (마름모 감기)
  ctx.fillStyle = '#1a0a1a';
  roundRect(ctx, -14, -2.6, 18, 5.2, 2);
  ctx.fill();
  ctx.fillStyle = P.gold;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-11 + i * 5, 0);
    ctx.lineTo(-9 + i * 5, -2);
    ctx.lineTo(-7 + i * 5, 0);
    ctx.lineTo(-9 + i * 5, 2);
    ctx.closePath();
    ctx.fill();
  }
  // 코등이
  ctx.fillStyle = P.gold;
  ctx.beginPath();
  ctx.ellipse(5, 0, 2.6, 7, 0, 0, TAU);
  ctx.fill();
  // 칼날 발광
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++)
    drawGlow(ctx, 16 + i * 15, -0.5 - i * 0.3, 10, fin ? '#ff2a6a' : '#9a4aff', 0.42);
  ctx.restore();
  // 휘어진 장검
  const sg = ctx.createLinearGradient(0, -3, 0, 3);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(1, fin ? '#ff8aaa' : P.blade);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(7, -2.6);
  ctx.quadraticCurveTo(46, -6, 86, -3.4);
  ctx.lineTo(92, -1);
  ctx.quadraticCurveTo(46, -0.5, 7, 2.6);
  ctx.closePath();
  ctx.fill();
  // 칼날 무늬 (하몬)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(10, 0.5);
  for (let x = 14; x < 84; x += 6) ctx.quadraticCurveTo(x - 3, -1.5, x, 0.2 - (x / 84) * 1.6);
  ctx.stroke();
  if (v.windup > 0) drawGlint(ctx, 90, -1, 14 + v.windup * 12, '#fff27a', clamp(v.windup, 0, 1));
  ctx.restore();
}
