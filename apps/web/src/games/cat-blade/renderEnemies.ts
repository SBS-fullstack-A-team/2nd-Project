/**
 * 캣 블레이드 — 잡몹 6종 · 보스 3종 그리기 (Canvas 도형만 사용)
 * 원점: 땅 위의 적은 발 밑 가운데, 날아다니는 적은 몸 가운데. 오른쪽을 보는 모습으로 그린다.
 */
import type { EnemyKind } from './config';
import { drawGlow, roundRect } from './render';
import { TAU, clamp, mixHex } from './util';

/** 피격 시 색을 하얗게 섞는 함수를 만든다 */
export function tinter(flash: number) {
  if (flash <= 0.01) return (hex: string) => hex;
  const k = clamp(flash, 0, 1) * 0.8;
  return (hex: string) => mixHex(hex, '#ffffff', k);
}

/**
 * 그리는 동안 fill() 마다 외곽선을 함께 그린다 — 만화 스티커 같은 통일된 테두리.
 * 발광(drawGlow 는 drawImage)·'lighter' 합성·반투명 rgba() 덧칠(하이라이트·그림자)은 건너뛴다.
 */
export function withOutline(
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
