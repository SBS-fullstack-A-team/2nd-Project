/**
 * 캣 블레이드 — 잡몹 6종 · 보스 3종 그리기 (Canvas 도형만 사용)
 * 원점: 땅 위의 적은 발 밑 가운데, 날아다니는 적은 몸 가운데. 오른쪽을 보는 모습으로 그린다.
 */
import type { EnemyKind } from './config';
import { drawGlow, pawPath, roundRect } from './render';
import { TAU, clamp, mixHex } from './util';

/** 피격 시 색을 하얗게 섞는 함수를 만든다 */
function tinter(flash: number) {
  if (flash <= 0.01) return (hex: string) => hex;
  const k = clamp(flash, 0, 1) * 0.8;
  return (hex: string) => mixHex(hex, '#ffffff', k);
}

/**
 * 그리는 동안 fill() 마다 외곽선을 함께 그린다 — 만화 스티커 같은 통일된 테두리.
 * 발광(drawGlow 는 drawImage)·'lighter' 합성·반투명 rgba() 덧칠(하이라이트·그림자)은 건너뛴다.
 */
function withOutline(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  draw: () => void,
) {
  const proto = Object.getPrototypeOf(ctx) as CanvasRenderingContext2D;
  const fill = proto.fill;
  if (typeof fill !== 'function') {
    draw();
    return;
  }
  const patched = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    (fill as (...a: unknown[]) => void).apply(this, args);
    if (this.globalCompositeOperation !== 'source-over') return;
    const fs = this.fillStyle;
    if (typeof fs === 'string' && fs.startsWith('rgba')) return;
    const ss = this.strokeStyle;
    const lw = this.lineWidth;
    const lj = this.lineJoin;
    this.strokeStyle = color;
    this.lineWidth = width;
    this.lineJoin = 'round';
    const first = args[0];
    if (first instanceof Path2D) this.stroke(first);
    else this.stroke();
    this.strokeStyle = ss;
    this.lineWidth = lw;
    this.lineJoin = lj;
  };
  const own = ctx as unknown as { fill: unknown };
  own.fill = patched;
  try {
    draw();
  } finally {
    delete own.fill;
  }
}

/** 패링 가능한 공격 예고 — 노란 십자 반짝임 */
export function drawGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color = '#fff27a',
  alpha = 1,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, size * 1.4, color, alpha * 0.8);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.14, y - size * 0.14);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.14, y + size * 0.14);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.14, y + size * 0.14);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.14, y - size * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 머리 위 기절 별 */
export function drawStunStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  r = 16,
) {
  ctx.save();
  ctx.fillStyle = '#ffe14a';
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + (i * TAU) / 3;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r * 0.35;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? 2 : 5;
      const aa = (k * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* =========================================================
 * 잡몹
 * ========================================================= */

export interface MinionView {
  kind: EnemyKind;
  x: number;
  y: number;
  facing: number;
  t: number;
  /** 공격 예고 진행도 0~1 (0 = 예고 없음) */
  windup: number;
  attacking: boolean;
  flash: number;
  stunned: boolean;
  /** 등장 연출 0~1 (1 = 완전히 나타남) */
  spawn: number;
  moving: boolean;
}

export function drawMinion(ctx: CanvasRenderingContext2D, v: MinionView) {
  ctx.save();
  ctx.translate(v.x, v.y);
  if (v.spawn < 1) {
    ctx.globalAlpha *= v.spawn;
    const s = 0.4 + v.spawn * 0.6;
    ctx.scale(s, s);
  }
  ctx.scale(v.facing, 1);
  const c = tinter(v.flash);
  const rim = v.kind === 'shade' || v.kind === 'wisp';
  withOutline(ctx, rim ? '#e0b8ff' : '#140c12', rim ? 1.2 : 1.6, () => drawMinionBody(ctx, v, c));
  ctx.restore();
}

function drawMinionBody(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  switch (v.kind) {
    case 'pup':
      drawPup(ctx, v, c);
      break;
    case 'crow':
      drawCrow(ctx, v, c);
      break;
    case 'ratbot':
      drawRatbot(ctx, v, c);
      break;
    case 'drone':
      drawDrone(ctx, v, c);
      break;
    case 'shade':
      drawShade(ctx, v, c);
      break;
    case 'wisp':
      drawWisp(ctx, v, c);
      break;
  }
}

type Tint = (hex: string) => string;

function drawPup(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  const run = v.moving || v.attacking ? Math.sin(v.t * 16) : 0;
  const crouch = v.windup > 0 ? 5 : 0;
  // 꼬리
  ctx.strokeStyle = c('#6a4028');
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-18, -20 + crouch);
  ctx.quadraticCurveTo(-30, -30 + Math.sin(v.t * 12) * 4, -28, -36);
  ctx.stroke();
  // 다리
  ctx.fillStyle = c('#5a3420');
  for (const [lx, ph] of [
    [-12, 0],
    [-6, Math.PI],
    [8, Math.PI],
    [14, 0],
  ] as const) {
    const sw = Math.sin(v.t * 16 + ph) * 5 * (run !== 0 ? 1 : 0);
    ctx.fillRect(lx + sw - 2.5, -12 + crouch * 0.5, 5, 12 - crouch * 0.5);
  }
  // 몸
  ctx.fillStyle = c('#8a5a3a');
  ctx.beginPath();
  ctx.ellipse(0, -20 + crouch, 21, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#b07a50');
  ctx.beginPath();
  ctx.ellipse(4, -15 + crouch, 12, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,200,0.22)';
  ctx.beginPath();
  ctx.ellipse(-4, -26 + crouch, 12, 3.5, -0.1, 0, TAU);
  ctx.fill();
  // 등 털 삐죽
  ctx.fillStyle = c('#6a4028');
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = -14 + i * 7;
    ctx.moveTo(bx, -29 + crouch);
    ctx.lineTo(bx + 2, -35 + crouch);
    ctx.lineTo(bx + 5, -29 + crouch);
  }
  ctx.fill();
  // 머리
  const hx = 20;
  const hy = -27 + crouch;
  ctx.fillStyle = c('#8a5a3a');
  ctx.beginPath();
  ctx.arc(hx, hy, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#b07a50');
  ctx.beginPath();
  ctx.ellipse(hx + 9, hy + 3, 7, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a1010';
  ctx.beginPath();
  ctx.arc(hx + 15, hy + 1, 2.4, 0, TAU);
  ctx.fill();
  // 처진 귀
  ctx.fillStyle = c('#4a2a18');
  ctx.beginPath();
  ctx.ellipse(hx - 5, hy - 2, 4, 8, 0.4, 0, TAU);
  ctx.fill();
  // 눈 (예고 중엔 빨갛게)
  ctx.fillStyle = v.windup > 0 ? '#ff2a2a' : '#ffe14a';
  ctx.beginPath();
  ctx.arc(hx + 4, hy - 3, 2, 0, TAU);
  ctx.fill();
  if (v.windup > 0 || v.attacking) {
    // 이빨
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(hx + 8, hy + 7);
    ctx.lineTo(hx + 10, hy + 11);
    ctx.lineTo(hx + 12, hy + 7);
    ctx.lineTo(hx + 14, hy + 11);
    ctx.lineTo(hx + 16, hy + 7);
    ctx.fill();
  }
  // 목줄
  ctx.fillStyle = c('#c8302a');
  ctx.fillRect(hx - 9, hy + 6, 8, 4);
  if (v.windup > 0) drawGlint(ctx, hx + 16, hy, 7 + v.windup * 7, '#fff27a', v.windup);
  if (v.stunned) drawStunStars(ctx, hx, hy - 16, v.t, 12);
}

function drawCrow(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  const flap = v.attacking ? -0.9 : Math.sin(v.t * (v.windup > 0 ? 26 : 14));
  ctx.fillStyle = c('#1c1428');
  // 날개 (뒤)
  ctx.save();
  ctx.rotate(-0.2 - flap * 0.6);
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.quadraticCurveTo(-14, -26, -30, -18);
  ctx.lineTo(-22, -10);
  ctx.lineTo(-26, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 몸
  ctx.fillStyle = c('#2a1e3a');
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 10, v.attacking ? 0.5 : 0, 0, TAU);
  ctx.fill();
  // 꼬리깃
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-26, -6);
  ctx.lineTo(-24, 4);
  ctx.closePath();
  ctx.fill();
  // 머리 · 부리
  ctx.beginPath();
  ctx.arc(13, -5, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#e8b030');
  ctx.beginPath();
  ctx.moveTo(18, -7);
  ctx.lineTo(28, -3);
  ctx.lineTo(18, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff3a3a';
  ctx.beginPath();
  ctx.arc(15, -7, 1.8, 0, TAU);
  ctx.fill();
  // 날개 (앞)
  ctx.fillStyle = c('#3a2a52');
  ctx.save();
  ctx.rotate(0.2 + flap * 0.7);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.quadraticCurveTo(-10, -28, -26, -22);
  ctx.lineTo(-18, -12);
  ctx.lineTo(-20, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (v.windup > 0) drawGlint(ctx, 26, -3, 6 + v.windup * 7, '#fff27a', v.windup);
  if (v.stunned) drawStunStars(ctx, 6, -20, v.t, 12);
}

function drawRatbot(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  // 바퀴
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(0, -8, 8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#6a7488';
  ctx.lineWidth = 2;
  const spin = v.t * (v.moving ? 14 : 2);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * TAU) / 3;
    ctx.moveTo(0, -8);
    ctx.lineTo(Math.cos(a) * 7, -8 + Math.sin(a) * 7);
  }
  ctx.stroke();
  // 몸통 (금속 돔)
  const g = ctx.createLinearGradient(0, -44, 0, -12);
  g.addColorStop(0, c('#c8d2e2'));
  g.addColorStop(1, c('#5a6478'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -24, 18, 15, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-6, -33, 8, 3, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,24,34,0.5)';
  ctx.fillRect(-14, -22, 28, 1.5);
  // 둥근 귀 판
  ctx.fillStyle = c('#8a96aa');
  ctx.beginPath();
  ctx.arc(-6, -40, 7, 0, TAU);
  ctx.arc(7, -40, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#ff9fb8');
  ctx.beginPath();
  ctx.arc(-6, -40, 3.5, 0, TAU);
  ctx.arc(7, -40, 3.5, 0, TAU);
  ctx.fill();
  // 주둥이 대포
  ctx.fillStyle = c('#4a5468');
  ctx.fillRect(12, -27, 14, 7);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(24, -26, 3, 5);
  // 눈 렌즈
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 9, -30, 7, v.windup > 0 ? '#ff3a3a' : '#ff8a3a', 0.9);
  ctx.restore();
  ctx.fillStyle = '#ff3a3a';
  ctx.beginPath();
  ctx.arc(9, -30, 2.6, 0, TAU);
  ctx.fill();
  // 안테나 꼬리
  ctx.strokeStyle = c('#6a7488');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, -22);
  ctx.quadraticCurveTo(-30, -20, -28, -40 + Math.sin(v.t * 6) * 3);
  ctx.stroke();
  if (v.windup > 0) drawGlint(ctx, 28, -24, 6 + v.windup * 7, '#fff27a', v.windup);
  if (v.stunned) drawStunStars(ctx, 0, -54, v.t, 12);
}

function drawDrone(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  // 프로펠러 팔
  ctx.strokeStyle = c('#5a6478');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-16, -6);
  ctx.lineTo(-22, -16);
  ctx.moveTo(16, -6);
  ctx.lineTo(22, -16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,220,255,0.45)';
  for (const px of [-22, 22]) {
    const w = Math.abs(Math.sin(v.t * 40 + px)) * 14 + 4;
    ctx.beginPath();
    ctx.ellipse(px, -17, w, 2, 0, 0, TAU);
    ctx.fill();
  }
  // 몸통
  const g = ctx.createLinearGradient(0, -14, 0, 14);
  g.addColorStop(0, c('#aab6cc'));
  g.addColorStop(1, c('#3a4458'));
  ctx.fillStyle = g;
  roundRect(ctx, -17, -11, 34, 22, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-6, -7, 8, 2.4, 0, 0, TAU);
  ctx.fill();
  // 쥐 귀
  ctx.fillStyle = c('#8a96aa');
  ctx.beginPath();
  ctx.arc(-8, -12, 5, 0, TAU);
  ctx.arc(8, -12, 5, 0, TAU);
  ctx.fill();
  // 카메라 눈
  ctx.fillStyle = '#0a1018';
  ctx.beginPath();
  ctx.arc(6, 0, 6, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 6, 0, 9, v.windup > 0 ? '#ff3a6a' : '#28f0ff', 0.95);
  ctx.restore();
  // 아래 총구
  ctx.fillStyle = c('#2a3040');
  ctx.fillRect(-3, 10, 6, 7);
  if (v.windup > 0) drawGlint(ctx, 0, 20, 6 + v.windup * 7, '#fff27a', v.windup);
  if (v.stunned) drawStunStars(ctx, 0, -26, v.t, 12);
}

function drawShade(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  // 보랏빛 그림자 오라
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 0, -26, 40, '#8a3aff', 0.6);
  drawGlow(ctx, 0, -26, 20, '#c88aff', 0.25);
  ctx.restore();
  const run = v.moving ? Math.sin(v.t * 14) : 0;
  ctx.fillStyle = c('#4e3080');
  // 다리
  ctx.fillRect(-7 + run * 4, -10, 5, 10);
  ctx.fillRect(3 - run * 4, -10, 5, 10);
  // 몸
  ctx.beginPath();
  ctx.ellipse(0, -20, 12, 12, 0, 0, TAU);
  ctx.fill();
  // 꼬리
  ctx.strokeStyle = c('#4e3080');
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, -16);
  ctx.quadraticCurveTo(-24, -20, -20 + Math.sin(v.t * 5) * 4, -38);
  ctx.stroke();
  // 머리 · 귀
  ctx.beginPath();
  ctx.arc(5, -36, 11, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,150,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -20, 12, 12, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = c('#4e3080');
  ctx.beginPath();
  ctx.moveTo(-4, -42);
  ctx.lineTo(-2, -56);
  ctx.lineTo(5, -45);
  ctx.moveTo(6, -46);
  ctx.lineTo(14, -56);
  ctx.lineTo(15, -42);
  ctx.fill();
  // 붉은 눈
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ex of [7, 13]) drawGlow(ctx, ex, -37, 5, '#ff2a4a', 0.95);
  ctx.restore();
  ctx.fillStyle = '#ff6a7a';
  for (const ex of [7, 13]) {
    ctx.beginPath();
    ctx.ellipse(ex, -37, 1.6, 2.4, 0, 0, TAU);
    ctx.fill();
  }
  // 칼
  const ang = v.attacking ? 0.2 : v.windup > 0 ? -2.2 : 0.9;
  ctx.save();
  ctx.translate(8, -24);
  ctx.rotate(ang);
  ctx.fillStyle = '#2a1a3a';
  ctx.fillRect(-4, -1.5, 8, 3);
  ctx.fillStyle = '#c8a8ff';
  ctx.beginPath();
  ctx.moveTo(4, -1.5);
  ctx.lineTo(30, -0.5);
  ctx.lineTo(33, 0.8);
  ctx.lineTo(4, 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (v.windup > 0) {
    const gx = 8 + Math.cos(ang) * 30;
    const gy = -24 + Math.sin(ang) * 30;
    drawGlint(ctx, gx, gy, 6 + v.windup * 8, '#fff27a', v.windup);
  }
  if (v.stunned) drawStunStars(ctx, 5, -60, v.t, 12);
}

function drawWisp(ctx: CanvasRenderingContext2D, v: MinionView, c: Tint) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 0, 0, 34, '#b44aff', 0.6);
  // 흔들리는 불꽃 꼬리
  for (let i = 0; i < 5; i++) {
    const tx = -6 - i * 5 + Math.sin(v.t * 8 + i) * 3;
    const ty = 4 + i * 4;
    drawGlow(ctx, tx, ty, 12 - i * 1.6, i % 2 ? '#ff4adf' : '#8a4aff', 0.7);
  }
  ctx.restore();
  ctx.fillStyle = c('#d8b0ff');
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#f6eaff');
  ctx.beginPath();
  ctx.arc(-3, -4, 6, 0, TAU);
  ctx.fill();
  // 얼굴
  ctx.fillStyle = '#2a0a3a';
  ctx.beginPath();
  ctx.ellipse(2, -1, 2, 3.2, 0, 0, TAU);
  ctx.ellipse(8, -1, 2, 3.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5, 6, v.windup > 0 ? 3 : 2, v.windup > 0 ? 3 : 1.4, 0, 0, TAU);
  ctx.fill();
  if (v.windup > 0) drawGlint(ctx, 16, 0, 6 + v.windup * 8, '#fff27a', v.windup);
  if (v.stunned) drawStunStars(ctx, 0, -22, v.t, 12);
}

/* =========================================================
 * 보스
 * ========================================================= */

export interface BossView {
  x: number;
  y: number;
  facing: number;
  t: number;
  pose: string;
  /** 현재 자세를 취한 지 몇 초 */
  poseT: number;
  phase: 1 | 2;
  flash: number;
  /** 공격 예고 0~1 (패링 가능한 공격이면 반짝임) */
  windup: number;
  scale: number;
  alpha: number;
  stunned: boolean;
}

/* ---------------- 1스테이지: 거대 들개 ---------------- */

export function drawHound(ctx: CanvasRenderingContext2D, v: BossView) {
  withOutline(ctx, '#140806', 2.4, () => drawHoundBody(ctx, v));
}

function drawHoundBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const rage = v.phase === 2;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);

  if (rage) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + Math.sin(v.t * 8) * 0.15;
    drawGlow(ctx, 0, -60, 120, '#ff2a2a', pulse * 0.55);
    ctx.restore();
  }

  const moving = v.pose === 'walk' || v.pose === 'charge';
  const runSpeed = v.pose === 'charge' ? 22 : 9;
  const crouch = v.pose === 'crouch' || v.pose === 'leapPrep' ? 12 : 0;
  const rear = v.pose === 'rear' || v.pose === 'howl' ? 1 : 0;

  ctx.save();
  // 뒷발로 일어서기
  if (rear) {
    ctx.translate(-40, 0);
    ctx.rotate(-0.38);
    ctx.translate(40, 0);
  }
  if (v.pose === 'leap') ctx.rotate(-0.25);
  if (v.pose === 'land') ctx.scale(1.08, 0.9);

  // 꼬리
  ctx.strokeStyle = c('#3a2a26');
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  const wag = Math.sin(v.t * (moving ? 14 : 4)) * 10;
  ctx.beginPath();
  ctx.moveTo(-62, -70 + crouch);
  ctx.quadraticCurveTo(-90, -80 + wag, -100, -110 + wag);
  ctx.stroke();

  // 다리 4개
  const legs: [number, number, string][] = [
    [-48, 0, '#2e221e'],
    [30, Math.PI, '#2e221e'],
    [-36, Math.PI, '#3e2e28'],
    [44, 0, '#3e2e28'],
  ];
  for (const [lx, ph, col] of legs) {
    const sw = moving ? Math.sin(v.t * runSpeed + ph) * 14 : 0;
    const lift = moving ? Math.max(0, Math.cos(v.t * runSpeed + ph)) * 8 : 0;
    ctx.fillStyle = c(col);
    ctx.save();
    ctx.translate(lx, -44 + crouch);
    ctx.rotate(sw * 0.02);
    roundRect(ctx, -9, 0, 18, 44 - crouch - lift, 7);
    ctx.fill();
    // 발톱
    ctx.fillStyle = '#d8d0c0';
    for (const cx of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(cx - 2, 44 - crouch - lift);
      ctx.lineTo(cx + 3, 44 - crouch - lift + 4);
      ctx.lineTo(cx + 2, 44 - crouch - lift - 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 몸통
  const bodyG = ctx.createLinearGradient(0, -110, 0, -30);
  bodyG.addColorStop(0, c(rage ? '#5a2a26' : '#5a4a44'));
  bodyG.addColorStop(1, c(rage ? '#2a1010' : '#2e2420'));
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(-4, -66 + crouch, 70, 34, 0, 0, TAU);
  ctx.fill();
  // 등 갈기 (뾰족한 털)
  ctx.fillStyle = c(rage ? '#3a1414' : '#2a201c');
  ctx.beginPath();
  ctx.moveTo(-60, -84 + crouch);
  for (let i = 0; i <= 8; i++) {
    const x = -60 + i * 13;
    const spike = i % 2 === 0 ? 0 : -18 - (rage ? 6 : 0) - Math.sin(v.t * 6 + i) * 2;
    ctx.lineTo(x, -96 + crouch + spike);
  }
  ctx.lineTo(48, -84 + crouch);
  ctx.closePath();
  ctx.fill();
  // 흉터 · 핏줄
  ctx.strokeStyle = rage ? 'rgba(255,60,60,0.85)' : 'rgba(20,10,10,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-30, -78 + crouch);
  ctx.lineTo(-10, -58 + crouch);
  ctx.moveTo(-20, -82 + crouch);
  ctx.lineTo(0, -62 + crouch);
  if (rage) {
    ctx.moveTo(10, -80 + crouch);
    ctx.lineTo(20, -66 + crouch);
    ctx.lineTo(14, -54 + crouch);
  }
  ctx.stroke();
  // 털 결
  ctx.strokeStyle = rage ? 'rgba(255,120,100,0.28)' : 'rgba(210,190,170,0.25)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const fx = -62 + ((i * 37) % 118);
    const fy = -86 + ((i * 23) % 44) + crouch;
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx - 4, fy + 4, fx - 10, fy + 5);
  }
  ctx.stroke();
  // 어깨 근육 하이라이트 · 배 그림자
  ctx.fillStyle = 'rgba(255,240,220,0.1)';
  ctx.beginPath();
  ctx.ellipse(30, -80 + crouch, 24, 12, -0.3, 0, TAU);
  ctx.ellipse(-36, -80 + crouch, 20, 10, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(-4, -40 + crouch, 56, 9, 0, 0, TAU);
  ctx.fill();

  // 머리
  const open =
    v.pose === 'bark' || v.pose === 'howl' || v.pose === 'bite' || v.pose === 'charge'
      ? 1
      : v.pose === 'crouch'
        ? 0.4
        : 0;
  ctx.save();
  ctx.translate(58, -84 + crouch * 1.3);
  if (rear) ctx.rotate(-0.25);
  // 가시 목줄
  ctx.fillStyle = c('#7a1a1a');
  ctx.fillRect(-22, 10, 18, 26);
  ctx.fillStyle = '#d8d8d8';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-20 + i * 6, 10);
    ctx.lineTo(-17 + i * 6, 2);
    ctx.lineTo(-14 + i * 6, 10);
    ctx.fill();
  }
  // 머리통
  ctx.fillStyle = c(rage ? '#4a2220' : '#4a3a34');
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 26, 0, 0, TAU);
  ctx.fill();
  // 찢어진 귀
  ctx.fillStyle = c('#2a201c');
  ctx.beginPath();
  ctx.moveTo(-18, -16);
  ctx.lineTo(-24, -44);
  ctx.lineTo(-12, -36);
  ctx.lineTo(-4, -22);
  ctx.closePath();
  ctx.moveTo(2, -20);
  ctx.lineTo(8, -46);
  ctx.lineTo(14, -38);
  ctx.lineTo(18, -18);
  ctx.closePath();
  ctx.fill();
  // 위턱 주둥이
  ctx.fillStyle = c(rage ? '#5a2a26' : '#5a4a44');
  ctx.save();
  ctx.rotate(-open * 0.28);
  roundRect(ctx, 10, -10, 42, 18, 8);
  ctx.fill();
  ctx.fillStyle = '#141010';
  ctx.beginPath();
  ctx.ellipse(50, -5, 6, 5, 0, 0, TAU);
  ctx.fill();
  // 윗니
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(16 + i * 7, 8);
    ctx.lineTo(19 + i * 7, 15);
    ctx.lineTo(22 + i * 7, 8);
    ctx.fill();
  }
  ctx.restore();
  // 아래턱
  ctx.save();
  ctx.rotate(open * 0.38);
  ctx.fillStyle = c(rage ? '#3a1a18' : '#3a2e2a');
  roundRect(ctx, 8, 6, 38, 12, 6);
  ctx.fill();
  if (open > 0) {
    ctx.fillStyle = '#8a1a2a';
    ctx.fillRect(12, 4, 30, 4);
    // 흐르는 침
    ctx.strokeStyle = 'rgba(220,240,255,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(30, 12);
    ctx.quadraticCurveTo(31, 18 + Math.sin(v.t * 5) * 2, 29, 24 + Math.sin(v.t * 5) * 3);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(14 + i * 8, 7);
    ctx.lineTo(17 + i * 8, 0);
    ctx.lineTo(20 + i * 8, 7);
    ctx.fill();
  }
  ctx.restore();
  // 눈
  const eyeCol = rage ? '#ff2a2a' : '#ffd23a';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 14, -8, rage ? 18 : 12, eyeCol, 0.95);
  if (rage) {
    // 눈에서 흐르는 붉은 잔광
    ctx.strokeStyle = 'rgba(255,40,40,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, -8);
    ctx.lineTo(-10 - Math.sin(v.t * 10) * 4, -14);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#fff6d0';
  ctx.beginPath();
  ctx.ellipse(14, -8, 5, 3.4, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a0a0a';
  ctx.beginPath();
  ctx.ellipse(15, -8, 1.6, 3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // 예고 반짝임 (패링 가능한 돌진·물기)
  if (v.windup > 0) drawGlint(ctx, 112, -84 + crouch, 14 + v.windup * 14, '#fff27a', v.windup);
  ctx.restore();

  if (v.stunned) drawStunStars(ctx, v.x + v.facing * 50, v.y - 140 * v.scale, v.t, 26);
}

/* ---------------- 2스테이지: 강철 레이저 로봇 쥐 ---------------- */

export function drawMechaRat(ctx: CanvasRenderingContext2D, v: BossView) {
  withOutline(ctx, '#0c1018', 2.2, () => drawMechaRatBody(ctx, v));
}

function drawMechaRatBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const od = v.phase === 2;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);

  // 추진기 불꽃 (바닥 쪽)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const thr = 0.7 + Math.sin(v.t * 30) * 0.3;
  for (const tx of [-34, 26]) {
    drawGlow(ctx, tx, -4, 20 * thr, od ? '#ff7a2a' : '#28c8ff', 0.85);
    drawGlow(ctx, tx, 10, 14 * thr, od ? '#ffd23a' : '#9af0ff', 0.6);
  }
  if (od) drawGlow(ctx, 0, -50, 110, '#ff3a2a', 0.25 + Math.sin(v.t * 6) * 0.08);
  ctx.restore();

  // 기계 꼬리 (마디)
  const tailStab = v.pose === 'thrust' ? 1 : 0;
  ctx.strokeStyle = c('#4a5468');
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-56, -36);
  for (let i = 1; i <= 6; i++) {
    const x = -56 - i * 12;
    const y = -36 - i * 8 + Math.sin(v.t * 4 + i * 0.8) * 5;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = c('#8a96aa');
  for (let i = 1; i <= 6; i++) {
    const x = -56 - i * 12;
    const y = -36 - i * 8 + Math.sin(v.t * 4 + i * 0.8) * 5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
  }

  // 미사일 포드 (등)
  const podOpen = v.pose === 'pods' ? Math.min(1, v.poseT * 4) : 0;
  ctx.save();
  ctx.translate(-14, -92);
  ctx.fillStyle = c('#3a4458');
  roundRect(ctx, -26, -18 - podOpen * 10, 52, 22, 4);
  ctx.fill();
  ctx.fillStyle = '#141820';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-14 + i * 14, -8 - podOpen * 10, 4.5, 0, TAU);
    ctx.fill();
  }
  if (podOpen > 0) {
    ctx.fillStyle = '#ff4a3a';
    for (let i = 0; i < 3; i++) ctx.fillRect(-16 + i * 14, -16 - podOpen * 10, 4, 6);
  }
  ctx.restore();

  // 몸통 (장갑판 캡슐)
  const g = ctx.createLinearGradient(0, -100, 0, -16);
  g.addColorStop(0, c('#dfe6f2'));
  g.addColorStop(0.45, c(od ? '#a8806a' : '#8a96aa'));
  g.addColorStop(1, c('#2e3646'));
  ctx.fillStyle = g;
  roundRect(ctx, -60, -86, 108, 64, 30);
  ctx.fill();
  // 금속 광택
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-18, -80, 30, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-24, -72, 18, 2.2, 0, 0, TAU);
  ctx.fill();
  // 냉각 통풍구 (빛나는 틈)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const vy = -62 + i * 9;
    ctx.fillStyle = od ? 'rgba(255,140,60,0.8)' : 'rgba(60,220,255,0.7)';
    ctx.fillRect(-54, vy, 14, 3);
    drawGlow(
      ctx,
      -47,
      vy + 1.5,
      9,
      od ? '#ff7a2a' : '#28c8ff',
      0.35 + Math.sin(v.t * 6 + i) * 0.15,
    );
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,24,34,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-30, -84);
  ctx.lineTo(-30, -24);
  ctx.moveTo(10, -84);
  ctx.lineTo(10, -24);
  ctx.stroke();
  // 리벳
  ctx.fillStyle = 'rgba(30,34,44,0.7)';
  for (const [rx, ry] of [
    [-44, -74],
    [-44, -34],
    [-18, -74],
    [-18, -34],
    [24, -74],
    [24, -34],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, TAU);
    ctx.fill();
  }
  // 가슴 코어
  const coreCol = od ? '#ff5a2a' : '#28f0ff';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, -10, -54, v.pose === 'core' ? 34 : 20, coreCol, 0.9);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-10, -54, 5, 0, TAU);
  ctx.fill();

  // 다리 (짧은 기계 다리 · 공중에선 접힌다)
  ctx.fillStyle = c('#3a4458');
  for (const lx of [-40, 22]) {
    roundRect(ctx, lx - 7, -26, 14, 18, 4);
    ctx.fill();
  }

  // 머리
  ctx.save();
  ctx.translate(46 + tailStab * 14, -62);
  // 동그란 귀 (접시 안테나)
  ctx.fillStyle = c('#aab6cc');
  ctx.beginPath();
  ctx.arc(-10, -30, 16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#ff9fb8');
  ctx.beginPath();
  ctx.arc(-10, -30, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c('#5a6478');
  ctx.beginPath();
  ctx.arc(-10, -30, 3, 0, TAU);
  ctx.fill();
  // 뾰족한 주둥이 (드릴)
  const hg = ctx.createLinearGradient(0, -20, 0, 20);
  hg.addColorStop(0, c('#dfe6f2'));
  hg.addColorStop(1, c('#5a6478'));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-14, -20);
  ctx.quadraticCurveTo(20, -18, 50 + tailStab * 20, 2);
  ctx.quadraticCurveTo(20, 18, -14, 18);
  ctx.closePath();
  ctx.fill();
  // 드릴 끝 회전 줄무늬
  ctx.strokeStyle = 'rgba(30,34,44,0.6)';
  ctx.lineWidth = 2;
  const spin = (v.t * (v.pose === 'thrust' ? 40 : 4)) % 8;
  for (let i = 0; i < 4; i++) {
    const x = 18 + i * 8 + spin;
    if (x > 46 + tailStab * 20) continue;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.lineTo(x + 4, 8);
    ctx.stroke();
  }
  // 바이저 눈
  ctx.fillStyle = '#0a0e16';
  roundRect(ctx, -4, -12, 26, 9, 4);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const eye = v.pose === 'charge' || v.pose === 'fire' ? '#ff2a4a' : od ? '#ffa02a' : '#ff3a3a';
  drawGlow(ctx, 12, -8, v.pose === 'charge' ? 26 : 14, eye, 0.95);
  ctx.restore();
  ctx.fillStyle = '#ffd0d0';
  ctx.fillRect(6, -9, 12, 2.5);
  // 수염 안테나
  ctx.strokeStyle = c('#c8d2e2');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const dy of [-2, 3, 8]) {
    ctx.moveTo(36, dy * 0.5);
    ctx.lineTo(62, dy * 2.2 - 4);
  }
  ctx.stroke();
  ctx.restore();

  if (v.windup > 0)
    drawGlint(ctx, 100 + tailStab * 34, -60, 14 + v.windup * 14, '#fff27a', v.windup);

  // 과부하 스파크
  if (od) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,220,120,0.9)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      if (Math.sin(v.t * 23 + i * 5) < 0.6) continue;
      const sx = -40 + i * 50;
      ctx.beginPath();
      ctx.moveTo(sx, -86);
      ctx.lineTo(sx + 6, -100);
      ctx.lineTo(sx - 2, -104);
      ctx.lineTo(sx + 5, -118);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  if (v.stunned) drawStunStars(ctx, v.x, v.y - 150 * v.scale, v.t, 28);
}

/* ---------------- 3스테이지: 타락한 고양이 왕 ---------------- */

export function drawCatKing(ctx: CanvasRenderingContext2D, v: BossView) {
  // 어두운 몸이 배경에 묻히지 않도록 밝은 테두리 (림 라이트)
  withOutline(ctx, v.phase === 2 ? '#ff9ac8' : '#c8a0ff', 1.6, () => drawCatKingBody(ctx, v));
}

function drawCatKingBody(ctx: CanvasRenderingContext2D, v: BossView) {
  const c = tinter(v.flash);
  const fin = v.phase === 2;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.globalAlpha *= v.alpha;
  ctx.scale(v.facing * v.scale, v.scale);

  // 오라
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 0, -64, fin ? 120 : 70, fin ? '#ff2a6a' : '#7a2aff', fin ? 0.5 : 0.35);
  if (v.pose === 'stance') drawGlow(ctx, 10, -64, 80, '#5ab0ff', 0.55 + Math.sin(v.t * 20) * 0.1);
  ctx.restore();

  // 최종 변신 — 그림자 날개 + 떠다니는 환영검
  if (fin) {
    ctx.save();
    ctx.fillStyle = 'rgba(40,0,40,0.75)';
    for (const dir of [-1, 1]) {
      const flap = Math.sin(v.t * 3) * 0.12;
      ctx.save();
      ctx.translate(-10, -88);
      ctx.rotate(dir * (0.25 + flap) - 0.2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-50, -70, -110, -60);
      ctx.lineTo(-86, -36);
      ctx.lineTo(-102, -18);
      ctx.lineTo(-74, -10);
      ctx.lineTo(-84, 12);
      ctx.quadraticCurveTo(-30, 0, 0, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const run = v.pose === 'run' ? Math.sin(v.t * 16) : 0;
  const lean =
    v.pose === 'slash0' || v.pose === 'slash1'
      ? 0.18
      : v.pose === 'windup'
        ? -0.14
        : v.pose === 'run'
          ? 0.2
          : 0;

  // 망토 (뒤)
  ctx.fillStyle = c(fin ? '#5a0a2a' : '#6a0a2a');
  const wave = Math.sin(v.t * 5) * 6;
  ctx.beginPath();
  ctx.moveTo(-6, -96);
  ctx.quadraticCurveTo(-34 - wave, -60, -44 - wave * 1.5, -4);
  ctx.lineTo(-30, -10);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-10, -8);
  ctx.quadraticCurveTo(0, -50, 8, -92);
  ctx.closePath();
  ctx.fill();
  // 망토 안감 (붉은 그라디언트)
  const lining = ctx.createLinearGradient(-30, -90, -20, 0);
  lining.addColorStop(0, c(fin ? '#c8205a' : '#b81a3a'));
  lining.addColorStop(1, c('#3a0614'));
  ctx.fillStyle = lining;
  ctx.beginPath();
  ctx.moveTo(-4, -92);
  ctx.quadraticCurveTo(-22 - wave * 0.6, -60, -28 - wave, -8);
  ctx.lineTo(-20, -4);
  ctx.quadraticCurveTo(-10, -50, 2, -90);
  ctx.closePath();
  ctx.fill();
  // 금색 망토 끝단
  ctx.strokeStyle = c('#e8b83a');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-44 - wave * 1.5, -4);
  ctx.lineTo(-30, -10);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-10, -8);
  ctx.stroke();

  ctx.save();
  ctx.rotate(lean);
  // 다리
  ctx.fillStyle = c('#1a1022');
  ctx.save();
  ctx.translate(-8, -40);
  ctx.rotate(run * 0.4);
  roundRect(ctx, -5, 0, 10, 40, 4);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(6, -40);
  ctx.rotate(-run * 0.4);
  roundRect(ctx, -5, 0, 10, 40, 4);
  ctx.fill();
  ctx.restore();
  // 몸 (갑옷)
  const bg = ctx.createLinearGradient(0, -100, 0, -36);
  bg.addColorStop(0, c('#3a2a4a'));
  bg.addColorStop(1, c('#1a1022'));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-16, -96);
  ctx.lineTo(18, -96);
  ctx.lineTo(14, -38);
  ctx.lineTo(-14, -38);
  ctx.closePath();
  ctx.fill();
  // 금장 띠 · 어깨
  ctx.fillStyle = c('#d4a63a');
  ctx.fillRect(-14, -52, 28, 4);
  ctx.beginPath();
  ctx.ellipse(-12, -94, 10, 6, -0.3, 0, TAU);
  ctx.ellipse(14, -94, 10, 6, 0.3, 0, TAU);
  ctx.fill();
  // 꼬리
  ctx.strokeStyle = c('#1a1022');
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, -44);
  ctx.quadraticCurveTo(-36, -40, -34 + Math.sin(v.t * 3) * 5, -70);
  ctx.stroke();

  // 가슴 문장 (금빛 발자국)
  ctx.fillStyle = c('#e8b83a');
  pawPath(ctx, 1, -72, 5);
  ctx.fill();
  // 하얀 털 목도리
  ctx.fillStyle = c('#e8dff5');
  ctx.beginPath();
  // 털 뭉치가 겹쳐 하나의 목도리가 되도록 촘촘히
  ctx.moveTo(-14, -96);
  for (let i = 0; i <= 8; i++) {
    const fx = -14 + i * 4;
    ctx.quadraticCurveTo(fx + 2, -88 - (i % 2) * 3, fx + 4, -96);
  }
  ctx.quadraticCurveTo(14, -104, 4, -106);
  ctx.quadraticCurveTo(-8, -104, -14, -96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(120,90,160,0.35)';
  ctx.beginPath();
  ctx.ellipse(4, -94, 16, 3, 0, 0, TAU);
  ctx.fill();

  // 머리
  ctx.save();
  ctx.translate(6, -114);
  ctx.fillStyle = c('#241830');
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, TAU);
  ctx.fill();
  // 귀
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-12, -30);
  ctx.lineTo(-2, -14);
  ctx.moveTo(4, -15);
  ctx.lineTo(14, -30);
  ctx.lineTo(16, -5);
  ctx.fill();
  // 하얀 얼굴 무늬
  ctx.fillStyle = c('#d8d0e8');
  ctx.beginPath();
  ctx.ellipse(9, 6, 8, 6, 0, 0, TAU);
  ctx.fill();
  // 눈
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ex of [4, 13]) drawGlow(ctx, ex, -3, fin ? 9 : 6, fin ? '#ff2a4a' : '#ff4adf', 1);
  ctx.restore();
  ctx.fillStyle = '#ffe0f0';
  for (const ex of [4, 13]) {
    ctx.beginPath();
    ctx.moveTo(ex - 3.5, -3);
    ctx.lineTo(ex + 3.5, -5);
    ctx.lineTo(ex + 2, -1);
    ctx.closePath();
    ctx.fill();
  }
  // 왕관
  ctx.fillStyle = c('#e8b83a');
  ctx.beginPath();
  ctx.moveTo(-12, -14);
  ctx.lineTo(-10, -30);
  ctx.lineTo(-4, -20);
  ctx.lineTo(2, -34);
  ctx.lineTo(8, -20);
  ctx.lineTo(14, -30);
  ctx.lineTo(15, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff2a4a';
  ctx.beginPath();
  ctx.arc(2, -20, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 팔 + 장검
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
  ctx.translate(10, -84);
  ctx.strokeStyle = c('#241830');
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const hx = Math.cos(ang * 0.5) * 16;
  const hy = Math.sin(ang * 0.5) * 12 + 6;
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.fillStyle = '#1a0a1a';
  ctx.fillRect(-10, -2.5, 14, 5);
  ctx.fillStyle = '#d4a63a';
  ctx.fillRect(3, -6, 3, 12);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    drawGlow(ctx, 16 + i * 14, 0, 9, fin ? '#ff2a6a' : '#9a4aff', 0.45);
  }
  ctx.restore();
  const sg = ctx.createLinearGradient(0, -3, 0, 3);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(1, fin ? '#ff8aaa' : '#c8a8ff');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(6, -2.5);
  ctx.lineTo(66, -1.5);
  ctx.lineTo(72, 1);
  ctx.lineTo(6, 2.5);
  ctx.closePath();
  ctx.fill();
  if (v.windup > 0) drawGlint(ctx, 70, 0, 14 + v.windup * 12, '#fff27a', v.windup);
  ctx.restore();
  ctx.restore();

  // 환영검 4자루가 몸 주위를 돈다
  if (fin) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const a = v.t * 1.6 + (i * TAU) / 4;
      const sx = Math.cos(a) * 62;
      const sy = -70 + Math.sin(a) * 26;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, 18, '#ff2a6a', 0.45);
      ctx.fillStyle = 'rgba(255,170,200,0.85)';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(3, 10);
      ctx.lineTo(-3, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();

  if (v.stunned) drawStunStars(ctx, v.x + v.facing * 6, v.y - 150 * v.scale, v.t, 22);
}
