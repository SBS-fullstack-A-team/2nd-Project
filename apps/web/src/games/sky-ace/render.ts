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

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

export function poly(ctx: CanvasRenderingContext2D, pts: number[], mirror = false) {
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
export function propeller(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
) {
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
  } else if (id === 'phoenix') {
    drawPhoenixJet(ctx, t, color, accent);
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

/**
 * XF-0 피닉스 — 숨은 기체. 백금 동체에 금빛 테두리를 두른 전진익 제트기.
 * 뒤로 흐르는 불새 날개 오라, 쌍발 청백색 애프터버너, 회전하는 날개 끝 광점.
 */
function drawPhoenixJet(ctx: CanvasRenderingContext2D, t: number, color: string, accent: string) {
  const gold = accent;
  const deep = '#2a1840';

  // 1) 뒤로 흐르는 불새 날개 오라 (가산 혼합)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flap = Math.sin(t * 6) * 3;
  for (const side of [-1, 1]) {
    const g = ctx.createLinearGradient(0, 0, side * 40, 26);
    g.addColorStop(0, 'rgba(255,215,90,0.7)');
    g.addColorStop(0.45, 'rgba(255,120,50,0.45)');
    g.addColorStop(1, 'rgba(255,60,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(side * 6, -2);
    ctx.quadraticCurveTo(side * 34, -8 + flap, side * 44, 18 + flap);
    ctx.quadraticCurveTo(side * 28, 12, side * 22, 26 + flap * 0.5);
    ctx.quadraticCurveTo(side * 14, 16, side * 4, 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 2) 쌍발 애프터버너 (청백색 + 금빛 꼬리)
  drawThrust(ctx, -5, 21, 6, 22, t, '#e6f4ff', '#ffb02e');
  drawThrust(ctx, 5, 21, 6, 22, t + 0.37, '#e6f4ff', '#ffb02e');

  // 3) 꼬리날개 (바깥으로 기운 V 꼬리)
  ctx.fillStyle = deep;
  poly(ctx, [-6, 10, -15, 22, -12, 24, -4, 17]);
  poly(ctx, [-6, 10, -15, 22, -12, 24, -4, 17], true);
  ctx.fillStyle = gold;
  poly(ctx, [-7, 12, -14, 21, -12.5, 22, -5.5, 16]);
  poly(ctx, [-7, 12, -14, 21, -12.5, 22, -5.5, 16], true);

  // 4) 주익 — 앞으로 꺾인 전진익: 어두운 테두리 → 백금 → 금빛 앞전
  ctx.fillStyle = deep;
  poly(ctx, [-4, -6, -27, 4, -29, 12, -20, 10, -5, 12]);
  poly(ctx, [-4, -6, -27, 4, -29, 12, -20, 10, -5, 12], true);
  const wing = ctx.createLinearGradient(0, -6, 0, 12);
  wing.addColorStop(0, '#ffffff');
  wing.addColorStop(1, shade(color, -40));
  ctx.fillStyle = wing;
  poly(ctx, [-4, -4, -26, 5, -27, 10, -19, 8.5, -5, 10]);
  poly(ctx, [-4, -4, -26, 5, -27, 10, -19, 8.5, -5, 10], true);
  ctx.fillStyle = gold;
  poly(ctx, [-4, -4, -26, 5, -25, 6.6, -4, -1.6]);
  poly(ctx, [-4, -4, -26, 5, -25, 6.6, -4, -1.6], true);

  // 5) 카나드 (앞쪽 작은 날개)
  ctx.fillStyle = gold;
  poly(ctx, [-3, -13, -11, -9, -10, -6.5, -3, -9]);
  poly(ctx, [-3, -13, -11, -9, -10, -6.5, -3, -9], true);

  // 6) 동체 — 백금 그라디언트 + 가운데 금빛 줄무늬
  ctx.fillStyle = deep;
  ellipse(ctx, 0, 1, 6.2, 23);
  const body = ctx.createLinearGradient(-6, 0, 6, 0);
  body.addColorStop(0, shade(color, -60));
  body.addColorStop(0.45, '#ffffff');
  body.addColorStop(1, shade(color, -50));
  ctx.fillStyle = body;
  ellipse(ctx, 0, 0, 5.2, 22);
  ctx.fillStyle = gold;
  ctx.fillRect(-0.9, 4, 1.8, 15);

  // 7) 조종석 — 보랏빛 유리에 흐르는 하이라이트
  const glass = ctx.createLinearGradient(0, -14, 0, -2);
  glass.addColorStop(0, '#ff7ad9');
  glass.addColorStop(1, '#5a2bd6');
  ctx.fillStyle = glass;
  ellipse(ctx, 0, -8, 2.8, 6.5);
  ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(t * 4)})`;
  ellipse(ctx, -0.9, -10, 0.9, 2.6);

  // 8) 기수 끝과 날개 끝의 광점 (가산 혼합으로 반짝임)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.7 + 0.3 * Math.sin(t * 10);
  drawSprite(ctx, glowSprite('#ffb02e', 3), 0, -22);
  for (const side of [-1, 1]) {
    ctx.globalAlpha = pulse;
    drawSprite(ctx, glowSprite(side < 0 ? '#ff5aa8' : '#5ad8ff', 2.5), side * 28, 10);
  }
  ctx.restore();
}

/**
 * 불사조 (피닉스 필살기) — 날개를 펄럭이며 화면을 가로지르는 거대한 화염 새.
 * s = 크기 배율, flap = 날갯짓 위상
 */
export function drawFirebird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const flap = Math.sin(t * 9);

  // 몸 주위 후광
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
  halo.addColorStop(0, 'rgba(255,230,150,0.7)');
  halo.addColorStop(0.4, 'rgba(255,120,40,0.3)');
  halo.addColorStop(1, 'rgba(255,40,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, TAU);
  ctx.fill();

  // 날개 — 깃털 5겹을 바깥에서 안쪽으로 겹쳐 그린다
  for (const side of [-1, 1]) {
    for (let f = 0; f < 5; f++) {
      const k = 1 - f * 0.17;
      const tipX = side * (190 * k);
      const tipY = -60 * k + flap * 40 * k + f * 6;
      const g = ctx.createLinearGradient(0, 0, tipX, tipY);
      g.addColorStop(0, 'rgba(255,250,220,0.9)');
      g.addColorStop(0.35, f % 2 ? 'rgba(255,170,40,0.75)' : 'rgba(255,110,30,0.75)');
      g.addColorStop(1, 'rgba(255,40,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(side * 8, -6);
      ctx.quadraticCurveTo(side * 80 * k, tipY - 30, tipX, tipY);
      ctx.quadraticCurveTo(side * 110 * k, tipY + 40 + f * 4, side * 10, 18);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 꼬리 깃 — 아래로 길게 늘어지며 일렁인다
  for (let i = -2; i <= 2; i++) {
    const sway = Math.sin(t * 7 + i) * 14;
    const g = ctx.createLinearGradient(0, 10, i * 18 + sway, 170);
    g.addColorStop(0, 'rgba(255,220,120,0.85)');
    g.addColorStop(0.5, 'rgba(255,90,60,0.5)');
    g.addColorStop(1, 'rgba(160,60,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, 14);
    ctx.quadraticCurveTo(i * 10 - 12, 90, i * 22 + sway, 170 - Math.abs(i) * 18);
    ctx.quadraticCurveTo(i * 10 + 12, 90, 6, 14);
    ctx.closePath();
    ctx.fill();
  }

  // 몸통과 머리
  ctx.fillStyle = 'rgba(255,245,210,0.95)';
  ellipse(ctx, 0, 4, 12, 30);
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, 0, -32, 9, 11);
  // 부리
  ctx.fillStyle = 'rgba(255,200,80,0.95)';
  poly(ctx, [-4, -40, 0, -54, 4, -40]);
  // 머리 볏
  ctx.fillStyle = 'rgba(255,120,40,0.8)';
  for (const c of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(c * 4, -38);
    ctx.quadraticCurveTo(c * 10, -58 + Math.sin(t * 12 + c) * 4, c * 14, -62);
    ctx.quadraticCurveTo(c * 6, -50, c * 2, -36);
    ctx.fill();
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
