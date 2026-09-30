/**
 * 그리기 함수 모음 — 이미지 파일 없이 Canvas API(그라디언트·패스·원호)로만 그린다.
 * 모든 기체는 위(-y)를 바라보는 기준으로 그리고, 적은 180도 돌려서 그린다.
 */
import { VIEW_H, VIEW_W, type AircraftId } from './config';

export const TAU = Math.PI * 2;

/* =========================================================
 * 발광 스프라이트 캐시 — 탄환마다 그라디언트를 새로 만들지 않도록 미리 그려 둔다
 * ========================================================= */
const spriteCache = new Map<string, HTMLCanvasElement>();

/** 가운데가 하얗게 빛나는 원형 탄 스프라이트 (크기 = r*4) */
export function glowSprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}|${r}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const size = Math.ceil(r * 4);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const mid = size / 2;
    const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.28, '#ffffff');
    grad.addColorStop(0.42, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  spriteCache.set(key, c);
  return c;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: HTMLCanvasElement,
  x: number,
  y: number,
) {
  ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
}

/* =========================================================
 * 추진 불꽃 — 길이가 매 프레임 흔들리는 가변 불꽃
 * ========================================================= */
export function drawThrust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  len: number,
  t: number,
  hot = '#ffe9a8',
  cold = '#ff6a1a',
) {
  const flicker = len * (0.75 + 0.25 * Math.sin(t * 47 + x) + Math.random() * 0.2);
  const grad = ctx.createLinearGradient(x, y, x, y + flicker);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, hot);
  grad.addColorStop(0.6, cold);
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.35, y + flicker * 0.6, x, y + flicker);
  ctx.quadraticCurveTo(x + w * 0.35, y + flicker * 0.6, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[], mirror = false) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const px = mirror ? -pts[i]! : pts[i]!;
    const py = pts[i + 1]!;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** 회전하는 프로펠러 (반투명 원판 + 날 2개) */
function propeller(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.fillStyle = 'rgba(230,230,230,0.25)';
  ellipse(ctx, x, y, r, r * 0.3);
  ctx.strokeStyle = 'rgba(40,40,40,0.8)';
  ctx.lineWidth = 1.5;
  const a = Math.cos(t * 60) * r;
  ctx.beginPath();
  ctx.moveTo(x - a, y);
  ctx.lineTo(x + a, y);
  ctx.stroke();
}

/* =========================================================
 * 플레이어 기체 3종
 * ========================================================= */
export function drawPlayerPlane(
  ctx: CanvasRenderingContext2D,
  id: AircraftId,
  x: number,
  y: number,
  t: number,
  bank: number,
  color: string,
  accent: string,
) {
  ctx.save();
  ctx.translate(x, y);
  // 좌우로 움직일 때 살짝 기울어진 느낌 (가로로 약간 찌그러뜨림)
  ctx.scale(1 - Math.abs(bank) * 0.18, 1);
  const dark = shade(color, -55);
  const light = shade(color, 40);

  if (id === 'p38') {
    drawThrust(ctx, -11, 19, 5, 14, t);
    drawThrust(ctx, 11, 19, 5, 14, t);
    ctx.fillStyle = dark;
    poly(ctx, [-26, -1, 26, -1, 24, 6, -24, 6]);
    ctx.fillStyle = color;
    poly(ctx, [-25, -3, 25, -3, 23, 3, -23, 3]);
    // 쌍동 붐
    for (const bx of [-11, 11]) {
      ctx.fillStyle = dark;
      ellipse(ctx, bx, 2, 4.2, 18);
      ctx.fillStyle = light;
      ellipse(ctx, bx - 1, 0, 2, 14);
      propeller(ctx, bx, -17, 8, t);
    }
    ctx.fillStyle = dark;
    ctx.fillRect(-15, 15, 30, 4);
    // 중앙 조종석
    ctx.fillStyle = color;
    ellipse(ctx, 0, -3, 5, 12);
    ctx.fillStyle = accent;
    ellipse(ctx, 0, -6, 2.6, 5);
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, -0.8, -8, 0.9, 2);
  } else if (id === 'shinden') {
    // 엔진이 뒤에 달린 추진식 — 불꽃과 프로펠러가 꼬리에 있다
    drawThrust(ctx, 0, 23, 8, 18, t, '#fff1c2', '#ff8a1a');
    propeller(ctx, 0, 21, 11, t);
    ctx.fillStyle = dark;
    poly(ctx, [-4, 0, -25, 13, -24, 18, -4, 12]);
    poly(ctx, [-4, 0, -25, 13, -24, 18, -4, 12], true);
    ctx.fillStyle = color;
    poly(ctx, [-4, 1, -23, 13, -22, 16, -4, 10]);
    poly(ctx, [-4, 1, -23, 13, -22, 16, -4, 10], true);
    // 앞날개(카나드)
    ctx.fillStyle = dark;
    poly(ctx, [-3, -14, -11, -10, -10, -7, -3, -10]);
    poly(ctx, [-3, -14, -11, -10, -10, -7, -3, -10], true);
    ctx.fillStyle = color;
    ellipse(ctx, 0, 0, 5.5, 21);
    ctx.fillStyle = light;
    ellipse(ctx, -1.5, -2, 2, 16);
    ctx.fillStyle = accent;
    ellipse(ctx, 0, -2, 2.6, 5);
    // 수직 꼬리날개
    ctx.fillStyle = dark;
    ctx.fillRect(-21, 11, 3, 8);
    ctx.fillRect(18, 11, 3, 8);
  } else {
    drawThrust(ctx, 0, 18, 6, 15, t, '#eaffd0', '#48ff8a');
    ctx.fillStyle = dark;
    ellipse(ctx, 0, 1, 24, 7.5);
    ctx.fillStyle = color;
    ellipse(ctx, 0, 0, 23, 6);
    ctx.fillStyle = light;
    ellipse(ctx, -8, -1, 9, 2);
    ellipse(ctx, 8, -1, 9, 2);
    ctx.fillStyle = dark;
    ellipse(ctx, 0, 15, 10, 3.2);
    ctx.fillStyle = color;
    ellipse(ctx, 0, -2, 4.5, 19);
    ctx.fillStyle = accent;
    ellipse(ctx, 0, -3, 2.4, 5);
    ctx.fillStyle = '#e8e8e8';
    ellipse(ctx, 0, -20, 2.5, 2.5);
    propeller(ctx, 0, -22, 10, t);
  }
  ctx.restore();
}

/** P-38 지원 드론 */
export function drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  drawThrust(ctx, 0, 7, 4, 9, t, '#d9f6ff', '#3bb7ff');
  ctx.fillStyle = '#5b6b78';
  poly(ctx, [0, -9, 8, 5, 0, 2, -8, 5]);
  ctx.fillStyle = '#58c8ff';
  ellipse(ctx, 0, -1, 2.2, 3);
  ctx.restore();
}

/** 폭격기 편대 (P-38 필살기) — 크게 그려서 화면을 가르며 지나간다 */
export function drawBigBomber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  for (const ex of [-34, -18, 18, 34]) drawThrust(ctx, ex, 8, 5, 16, t);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ellipse(ctx, 14, 26, 56, 14);
  ctx.fillStyle = '#8b939c';
  poly(ctx, [-60, 0, 60, 0, 56, 8, -56, 8]);
  ctx.fillStyle = '#b8c0c8';
  poly(ctx, [-58, -2, 58, -2, 55, 4, -55, 4]);
  for (const ex of [-34, -18, 18, 34]) {
    ctx.fillStyle = '#6d757e';
    ellipse(ctx, ex, -2, 4, 9);
    propeller(ctx, ex, -11, 7, t);
  }
  ctx.fillStyle = '#a7afb8';
  ellipse(ctx, 0, 0, 7, 40);
  ctx.fillStyle = '#6d757e';
  poly(ctx, [-20, 34, 20, 34, 18, 39, -18, 39]);
  ctx.fillStyle = '#9fe3ff';
  ellipse(ctx, 0, -34, 4, 5);
  ctx.restore();
}

/* =========================================================
 * 일반 적 기체 (아래를 바라봄)
 * ========================================================= */
export type EnemyLook = 'fighter' | 'swooper' | 'gunship' | 'heavy';

export function drawEnemyCraft(
  ctx: CanvasRenderingContext2D,
  kind: EnemyLook,
  x: number,
  y: number,
  angle: number,
  t: number,
  flash: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (kind === 'fighter') {
    drawThrust(ctx, 0, 13, 5, 10, t);
    ctx.fillStyle = flash ? '#ffffff' : '#3e5a3a';
    poly(ctx, [-16, -1, 16, -1, 14, 5, -14, 5]);
    ctx.fillStyle = flash ? '#ffffff' : '#5c7a4f';
    ellipse(ctx, 0, 0, 4, 13);
    ctx.fillStyle = flash ? '#ffffff' : '#3e5a3a';
    poly(ctx, [-7, 10, 7, 10, 6, 13, -6, 13]);
    ctx.fillStyle = '#d94a3a';
    ctx.fillRect(-13, 0, 3, 3);
    ctx.fillRect(10, 0, 3, 3);
    propeller(ctx, 0, -14, 7, t);
  } else if (kind === 'swooper') {
    drawThrust(ctx, 0, 12, 6, 12, t, '#f7d9ff', '#b44dff');
    ctx.fillStyle = flash ? '#ffffff' : '#4a3a6a';
    poly(ctx, [0, -14, 17, 8, 5, 5, 0, 12, -5, 5, -17, 8]);
    ctx.fillStyle = flash ? '#ffffff' : '#7a5ab0';
    poly(ctx, [0, -11, 6, 3, 0, 8, -6, 3]);
    ctx.fillStyle = '#ff6ad5';
    ellipse(ctx, 0, -3, 2, 3);
  } else if (kind === 'gunship') {
    drawThrust(ctx, -12, 18, 6, 14, t);
    drawThrust(ctx, 12, 18, 6, 14, t);
    ctx.fillStyle = flash ? '#ffffff' : '#50565e';
    poly(ctx, [-30, -2, 30, -2, 26, 9, -26, 9]);
    ctx.fillStyle = flash ? '#ffffff' : '#6f7780';
    for (const ex of [-12, 12]) ellipse(ctx, ex, 3, 5.5, 15);
    ctx.fillStyle = flash ? '#ffffff' : '#7f8892';
    ellipse(ctx, 0, 0, 9, 22);
    ctx.fillStyle = '#2a2d31';
    ellipse(ctx, 0, 4, 6, 6);
    ctx.fillStyle = '#ff4a3a';
    ellipse(ctx, 0, 4, 2.5, 2.5);
    for (const ex of [-12, 12]) propeller(ctx, ex, -13, 8, t);
  } else {
    for (const ex of [-40, -22, 22, 40]) drawThrust(ctx, ex, 14, 6, 16, t);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(ctx, 12, 26, 60, 18);
    ctx.fillStyle = flash ? '#ffffff' : '#4d4f3a';
    poly(ctx, [-66, -4, 66, -4, 60, 12, -60, 12]);
    ctx.fillStyle = flash ? '#ffffff' : '#6c6f50';
    poly(ctx, [-62, -5, 62, -5, 58, 5, -58, 5]);
    ctx.fillStyle = flash ? '#ffffff' : '#5b5e44';
    for (const ex of [-40, -22, 22, 40]) ellipse(ctx, ex, 0, 5, 12);
    ctx.fillStyle = flash ? '#ffffff' : '#7b7f5c';
    ellipse(ctx, 0, 0, 12, 44);
    ctx.fillStyle = flash ? '#ffffff' : '#4d4f3a';
    poly(ctx, [-24, 34, 24, 34, 22, 42, -22, 42]);
    // 포탑 2개
    ctx.fillStyle = '#2b2c22';
    ellipse(ctx, 0, -18, 6, 6);
    ellipse(ctx, 0, 18, 6, 6);
    ctx.fillStyle = '#ffb040';
    ellipse(ctx, 0, -18, 2.5, 2.5);
    ellipse(ctx, 0, 18, 2.5, 2.5);
    for (const ex of [-40, -22, 22, 40]) propeller(ctx, ex, -13, 9, t);
  }
  ctx.restore();
}

/* =========================================================
 * 보스 3종 — phase 2 는 모양이 바뀐다
 * ========================================================= */
export interface BossLook {
  x: number;
  y: number;
  t: number;
  phase: 1 | 2;
  flash: boolean;
  /** 0~1, 2단 변신 연출 진행도 */
  morph: number;
  /** Kraken 코어 개방 정도 0~1 */
  open: number;
}

export function drawGoliath(ctx: CanvasRenderingContext2D, b: BossLook) {
  const { x, y, t } = b;
  ctx.save();
  ctx.translate(x, y);
  // 엔진 포드 불꽃 (비행선이라 위로 전진 — 뒤쪽 = 화면 위)
  if (b.phase === 1) {
    ctx.save();
    ctx.rotate(Math.PI);
    for (const ex of [-92, 92]) drawThrust(ctx, ex, 30, 10, 26, t);
    ctx.restore();
    // 기낭 (비행선 풍선)
    const env = ctx.createLinearGradient(-150, 0, 150, 0);
    env.addColorStop(0, '#5a4a3a');
    env.addColorStop(0.5, b.flash ? '#ffffff' : '#9c8468');
    env.addColorStop(1, '#5a4a3a');
    ctx.fillStyle = env;
    ellipse(ctx, 0, 0, 150, 58);
    ctx.strokeStyle = 'rgba(40,28,18,0.6)';
    ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(i) * 34 + 2, 58, 0, -Math.PI / 2, Math.PI / 2, i < 0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ellipse(ctx, -30, -24, 90, 14);
    // 엔진 포드 + 레이저 포
    for (const ex of [-92, 92]) {
      ctx.fillStyle = '#403a34';
      ellipse(ctx, ex, 0, 16, 34);
      ctx.fillStyle = '#ff4040';
      ellipse(ctx, ex, 28, 6, 6);
      ctx.fillStyle = '#ffd0d0';
      ellipse(ctx, ex, 28, 2.5, 2.5);
    }
    // 곤돌라
    ctx.fillStyle = b.flash ? '#ffffff' : '#3a3a42';
    ellipse(ctx, 0, 30, 28, 18);
    ctx.fillStyle = '#ffcc55';
    for (let i = -2; i <= 2; i++) ellipse(ctx, i * 9, 30, 2.5, 3);
  } else {
    // 장갑이 떨어져 나간 메카 골격
    ctx.save();
    ctx.rotate(Math.PI);
    for (const ex of [-60, 60]) drawThrust(ctx, ex, 40, 12, 30, t, '#ffe0ff', '#ff3a8a');
    ctx.restore();
    ctx.strokeStyle = '#5c5f66';
    ctx.lineWidth = 6;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 30, -40);
      ctx.lineTo(i * 22, 40);
      ctx.stroke();
    }
    ctx.fillStyle = b.flash ? '#ffffff' : '#474a52';
    poly(ctx, [-120, -10, -70, -44, 70, -44, 120, -10, 90, 30, -90, 30]);
    ctx.fillStyle = '#2d2f35';
    poly(ctx, [-70, -20, 70, -20, 50, 20, -50, 20]);
    // 회전 포탑 링
    ctx.save();
    ctx.rotate(t * 3);
    ctx.fillStyle = '#8a8f99';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      ctx.fillRect(-4, 26, 8, 14);
    }
    ctx.restore();
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, '#ff4a8a');
    core.addColorStop(1, 'rgba(120,0,40,0.9)');
    ctx.fillStyle = core;
    ellipse(ctx, 0, 0, 24, 24);
    for (const ex of [-60, 60]) {
      ctx.fillStyle = '#35373d';
      ellipse(ctx, ex, 0, 14, 22);
      ctx.fillStyle = '#ff4a8a';
      ellipse(ctx, ex, 16, 4, 4);
    }
  }
  morphFlash(ctx, b.morph);
  ctx.restore();
}

export function drawKraken(ctx: CanvasRenderingContext2D, b: BossLook) {
  const { x, y, t } = b;
  ctx.save();
  ctx.translate(x, y);
  // 물보라
  ctx.fillStyle = 'rgba(220,240,255,0.25)';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + t * 0.6;
    ellipse(ctx, Math.cos(a) * 160, Math.sin(a) * 76, 14 + Math.sin(t * 3 + i) * 4, 6);
  }
  // 촉수 모양 포신 6개
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const k = i % 3;
    const bx = side * (60 + k * 32);
    ctx.strokeStyle = b.phase === 2 ? '#6a2a3a' : '#2a4a5a';
    ctx.lineWidth = 12 - k * 2;
    ctx.beginPath();
    ctx.moveTo(bx, 20);
    const wob = Math.sin(t * 2.4 + i) * 16;
    ctx.quadraticCurveTo(bx + side * 20 + wob, 70, bx + wob * 0.6, 100 + k * 8);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // 팔각형 갑판
  const deck = ctx.createLinearGradient(0, -70, 0, 70);
  deck.addColorStop(0, b.flash ? '#ffffff' : '#51606b');
  deck.addColorStop(1, b.flash ? '#ffffff' : '#2d3840');
  ctx.fillStyle = deck;
  poly(ctx, [-150, -20, -110, -66, 110, -66, 150, -20, 150, 20, 110, 62, -110, 62, -150, 20]);
  ctx.strokeStyle = '#1b2329';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 미사일 발사대 4개
  for (const mx of [-112, -70, 70, 112]) {
    ctx.fillStyle = '#20282e';
    ctx.fillRect(mx - 10, -30, 20, 30);
    ctx.fillStyle = '#ffae3a';
    for (let r = 0; r < 3; r++) ctx.fillRect(mx - 6, -26 + r * 9, 12, 4);
  }
  // 코어 — 2단계에 좌우 장갑이 열린다
  const open = b.open * 34;
  const glow = ctx.createRadialGradient(0, 8, 2, 0, 8, 40);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.35, b.phase === 2 ? '#ff3a5a' : '#3ad0ff');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ellipse(ctx, 0, 8, 26 + open * 0.5, 26 + open * 0.5);
  ctx.fillStyle = b.flash ? '#ffffff' : '#3b4852';
  ctx.fillRect(-40 - open, -24, 40, 64);
  ctx.fillRect(0 + open, -24, 40, 64);
  ctx.strokeStyle = '#1b2329';
  ctx.strokeRect(-40 - open, -24, 40, 64);
  ctx.strokeRect(0 + open, -24, 40, 64);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

export function drawChronos(ctx: CanvasRenderingContext2D, b: BossLook) {
  const { x, y, t } = b;
  const rage = b.phase === 2;
  ctx.save();
  ctx.translate(x, y);
  // 시계 톱니 링 (두 개가 서로 반대로 회전)
  for (const [r, dir, teeth] of [
    [105, 1, 24],
    [80, -1.6, 18],
  ] as const) {
    ctx.save();
    ctx.rotate(t * 0.6 * dir * (rage ? 3 : 1));
    ctx.strokeStyle = rage ? '#ff5a3a' : '#c8a8ff';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rage ? '#ff8a5a' : '#e0d0ff';
    for (let i = 0; i < teeth; i++) {
      ctx.rotate(TAU / teeth);
      ctx.fillRect(-3, r - 2, 6, 10);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // 몸체
  const body = ctx.createRadialGradient(0, -10, 10, 0, 0, 80);
  body.addColorStop(0, b.flash ? '#ffffff' : rage ? '#7a2a3a' : '#4a3a7a');
  body.addColorStop(1, b.flash ? '#ffffff' : rage ? '#2a0a14' : '#1a1430');
  ctx.fillStyle = body;
  poly(ctx, [0, -78, 52, -40, 66, 20, 30, 70, -30, 70, -66, 20, -52, -40]);
  // 어깨 날개 — 광란 모드에서 가시가 돋는다
  ctx.fillStyle = rage ? '#b8323a' : '#6a5aa8';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(Math.sin(t * (rage ? 8 : 2)) * 0.08);
    poly(ctx, [50, -30, 128, -58, 110, -10, 138, 12, 64, 20]);
    if (rage) poly(ctx, [120, -50, 160, -80, 132, -30]);
    ctx.restore();
  }
  // 시계 문자판 코어 + 바늘
  ctx.fillStyle = '#0c0a18';
  ellipse(ctx, 0, 0, 30, 30);
  ctx.strokeStyle = rage ? '#ffb070' : '#e8dcff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
    ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  const h = t * (rage ? 9 : 1.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(h) * 16, Math.sin(h) * 16);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(h * 12) * 24, Math.sin(h * 12) * 24);
  ctx.stroke();
  // 눈
  ctx.fillStyle = rage ? '#ff2a2a' : '#8af0ff';
  ellipse(ctx, -22, -46, 7, 4);
  ellipse(ctx, 22, -46, 7, 4);
  morphFlash(ctx, b.morph);
  ctx.restore();
}

/** 변신 중 하얗게 번쩍이는 원 */
function morphFlash(ctx: CanvasRenderingContext2D, morph: number) {
  if (morph <= 0) return;
  const a = Math.sin(morph * Math.PI);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ellipse(ctx, 0, 0, 200, 200);
}

/* =========================================================
 * 스크롤 배경 — 스테이지마다 다른 분위기
 * ========================================================= */
interface Deco {
  x: number;
  y: number;
  s: number;
  v: number;
  k: number;
}

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export class StageBackground {
  private scroll = 0;
  private near: Deco[] = [];
  private far: Deco[] = [];
  private stage = 1;

  constructor() {
    this.reset(1);
  }

  reset(stage: number) {
    this.stage = stage;
    this.near = Array.from({ length: 7 }, () => this.makeDeco(rnd(-VIEW_H, VIEW_H), true));
    this.far = Array.from({ length: stage === 3 ? 90 : 14 }, () =>
      this.makeDeco(rnd(-VIEW_H, VIEW_H), false),
    );
  }

  private makeDeco(y: number, near: boolean): Deco {
    return {
      x: rnd(-40, VIEW_W + 40),
      y,
      s: near ? rnd(0.8, 1.6) : rnd(0.4, 1),
      v: near ? rnd(90, 130) : rnd(30, 55),
      k: Math.random(),
    };
  }

  update(dt: number, speed = 1) {
    this.scroll += dt * 60 * speed;
    for (const list of [this.near, this.far]) {
      for (let i = 0; i < list.length; i++) {
        const d = list[i]!;
        d.y += d.v * dt * speed;
        if (d.y > VIEW_H + 120) list[i] = this.makeDeco(-120, list === this.near);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    if (this.stage === 1) this.drawSky(ctx);
    else if (this.stage === 2) this.drawSea(ctx, t);
    else this.drawRift(ctx, t);
  }

  private drawSky(ctx: CanvasRenderingContext2D) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#5f86b8');
    g.addColorStop(1, '#8cb3d6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 멀리 보이는 들판 조각
    for (const d of this.far) {
      ctx.fillStyle = d.k > 0.5 ? 'rgba(90,130,80,0.35)' : 'rgba(150,140,90,0.3)';
      ctx.fillRect(d.x, d.y, 70 * d.s, 44 * d.s);
    }
    // 가까운 구름
    for (const d of this.near) this.cloud(ctx, d.x, d.y, d.s, 'rgba(255,255,255,0.75)');
  }

  private drawSea(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#15324f');
    g.addColorStop(1, '#1f5a78');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = 'rgba(180,220,255,0.18)';
    ctx.lineWidth = 2;
    const off = this.scroll % 40;
    for (let y = -40 + off; y < VIEW_H; y += 40) {
      ctx.beginPath();
      for (let x = 0; x <= VIEW_W; x += 20) {
        const yy = y + Math.sin(x * 0.05 + t * 2 + y * 0.1) * 5;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (const d of this.far) {
      ctx.fillStyle = 'rgba(230,245,255,0.35)';
      ctx.fillRect(d.x, d.y, 18 * d.s, 3);
    }
    for (const d of this.near) this.cloud(ctx, d.x, d.y, d.s * 0.8, 'rgba(200,215,230,0.35)');
  }

  private drawRift(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0a0620');
    g.addColorStop(1, '#2a0f40');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 시공간 격자
    ctx.strokeStyle = 'rgba(160,110,255,0.14)';
    ctx.lineWidth = 1;
    const off = this.scroll % 48;
    for (let y = -48 + off; y < VIEW_H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW_W, y);
      ctx.stroke();
    }
    for (let x = 0; x <= VIEW_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t + x) * 4, 0);
      ctx.lineTo(x - Math.sin(t + x) * 4, VIEW_H);
      ctx.stroke();
    }
    for (const d of this.far) {
      ctx.fillStyle = d.k > 0.8 ? '#ffd0ff' : '#b8c8ff';
      ctx.fillRect(d.x, d.y, 2 * d.s, 2 * d.s + d.v * 0.05);
    }
    for (const d of this.near) {
      const r = 60 * d.s;
      const neb = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      neb.addColorStop(0, d.k > 0.5 ? 'rgba(255,80,200,0.18)' : 'rgba(80,160,255,0.18)');
      neb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb;
      ellipse(ctx, d.x, d.y, r, r);
    }
  }

  private cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
    ctx.fillStyle = color;
    ellipse(ctx, x, y, 44 * s, 20 * s);
    ellipse(ctx, x - 30 * s, y + 6 * s, 28 * s, 14 * s);
    ellipse(ctx, x + 34 * s, y + 4 * s, 30 * s, 15 * s);
  }
}
