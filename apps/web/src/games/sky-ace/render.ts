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

/**
 * 파워 최대(5단계) 오라 — 기체 둘레를 도는 빛 고리와 맴도는 불티.
 * 기체보다 먼저(아래에) 그린다
 */
export function drawMaxPowerAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.75 + 0.25 * Math.sin(t * 6);
  ctx.globalAlpha = 0.55 * pulse;
  drawSprite(ctx, glowSprite(color, 16), 0, 2);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const [r, speed, len] of [
    [27, 2.4, 1.3],
    [31, -1.7, 0.9],
  ] as const) {
    for (let k = 0; k < 2; k++) {
      const a = t * speed + k * Math.PI;
      ctx.beginPath();
      ctx.ellipse(0, 2, r, r * 0.82, 0, a, a + len);
      ctx.stroke();
    }
  }
  // 맴도는 불티 3개
  for (let k = 0; k < 3; k++) {
    const a = t * 3.1 + (k * TAU) / 3;
    ctx.globalAlpha = 0.9;
    drawSprite(ctx, glowSprite('#fff2c0', 2.4), Math.cos(a) * 29, 2 + Math.sin(a) * 24);
  }
  ctx.restore();
}

/* =========================================================
 * 일반 적 기체 (아래를 바라봄)
 * ========================================================= */
export type EnemyLook = 'fighter' | 'swooper' | 'gunship' | 'heavy' | 'lancer' | 'mine';

/** charge: lancer 는 조준 충전 정도, mine 은 폭발 직전 깜빡임 정도 (0~1) */
export function drawEnemyCraft(
  ctx: CanvasRenderingContext2D,
  kind: EnemyLook,
  x: number,
  y: number,
  angle: number,
  t: number,
  flash: boolean,
  charge = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (kind === 'lancer') {
    drawLancer(ctx, t, flash, charge);
    ctx.restore();
    return;
  }
  if (kind === 'mine') {
    drawMine(ctx, t, flash, charge);
    ctx.restore();
    return;
  }
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

/**
 * 랜서 — 진홍색 전진익 요격기. 기수 끝의 조준 장치가 충전될수록 밝아지고
 * 기수 방향으로 조준선이 뻗는다 (기수 = -y)
 */
function drawLancer(ctx: CanvasRenderingContext2D, t: number, flash: boolean, charge: number) {
  drawThrust(ctx, -4, 13, 4, 12, t, '#ffd6e6', '#ff3a7a');
  drawThrust(ctx, 4, 13, 4, 12, t + 0.3, '#ffd6e6', '#ff3a7a');
  const hull = flash ? '#ffffff' : '#7a1f35';
  const dark = flash ? '#ffffff' : '#3a0c18';
  // 앞으로 꺾인 날개
  ctx.fillStyle = dark;
  poly(ctx, [-3, 2, -19, -6, -17, 2, -5, 10]);
  poly(ctx, [-3, 2, -19, -6, -17, 2, -5, 10], true);
  ctx.fillStyle = hull;
  poly(ctx, [-3, 3, -17, -4, -16, 1, -5, 8]);
  poly(ctx, [-3, 3, -17, -4, -16, 1, -5, 8], true);
  // 날개 끝 발광 줄
  ctx.fillStyle = '#ff4a7a';
  poly(ctx, [-17, -4, -19, -6, -18, -2]);
  poly(ctx, [-17, -4, -19, -6, -18, -2], true);
  // 꼬리날개
  ctx.fillStyle = dark;
  poly(ctx, [-4, 8, -9, 15, -6, 15, -2, 10]);
  poly(ctx, [-4, 8, -9, 15, -6, 15, -2, 10], true);
  // 동체 — 길고 뾰족한 창 모양
  const g = ctx.createLinearGradient(-5, 0, 5, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.5, flash ? '#ffffff' : '#c2405e');
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  poly(ctx, [0, -20, 5, -4, 4, 12, -4, 12, -5, -4]);
  // 조종석
  ctx.fillStyle = '#1a0610';
  ellipse(ctx, 0, -3, 2.2, 4.5);
  ctx.fillStyle = 'rgba(255,170,200,0.6)';
  ellipse(ctx, -0.7, -5, 0.8, 1.8);
  // 조준 충전
  if (charge > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = charge;
    drawSprite(ctx, glowSprite('#ff4a7a', 4 + charge * 6), 0, -21);
    // 조준선 — 충전이 거의 끝나면 깜빡인다
    const blink = charge > 0.85 ? (Math.floor(t * 20) % 2 === 0 ? 1 : 0.3) : 0.6;
    ctx.globalAlpha = charge * 0.35 * blink;
    ctx.fillStyle = '#ff4a7a';
    ctx.fillRect(-0.6, -400, 1.2, 380);
    ctx.restore();
  }
}

/**
 * 기뢰 — 가시 달린 강철 구체. 가운데 경고등이 천천히 깜빡이다가
 * 터지기 직전에는 빠르게 깜빡이며 붉은 고리가 부풀어 오른다
 */
function drawMine(ctx: CanvasRenderingContext2D, t: number, flash: boolean, charge: number) {
  if (charge > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + charge * 0.5;
    drawSprite(ctx, glowSprite('#ff3a3a', 12 + charge * 10), 0, 0);
    ctx.strokeStyle = `rgba(255,90,90,${0.8 * charge})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + charge * 14, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  // 가시 8개
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 8);
    ctx.fillStyle = flash ? '#ffffff' : '#5a606a';
    poly(ctx, [-2.4, -9, 0, -17, 2.4, -9]);
    ctx.fillStyle = flash ? '#ffffff' : '#c8ccd4';
    ellipse(ctx, 0, -16.5, 1.4, 1.4);
    ctx.restore();
  }
  // 본체
  const body = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
  body.addColorStop(0, flash ? '#ffffff' : '#8a909c');
  body.addColorStop(0.6, flash ? '#ffffff' : '#3a3f48');
  body.addColorStop(1, '#14161a');
  ctx.fillStyle = body;
  ellipse(ctx, 0, 0, 11, 11);
  // 적도 이음매
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 3.5, 0, 0, TAU);
  ctx.stroke();
  // 경고등
  const rate = charge > 0 ? 18 : 3;
  const on = Math.sin(t * rate) > 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawSprite(ctx, glowSprite(on ? '#ff3a3a' : '#7a1a1a', on ? 5 : 3), 0, 0);
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

  /** stage: 1 구름 · 2 바다 · 3 화산 · 4 궤도 · 5 시공의 균열 */
  reset(stage: number) {
    this.stage = stage;
    const counts: Record<number, [number, number]> = {
      1: [7, 14],
      2: [7, 14],
      3: [9, 26],
      4: [6, 110],
      5: [7, 90],
    };
    const [nearN, farN] = counts[stage] ?? [7, 14];
    this.near = Array.from({ length: nearN }, () => this.makeDeco(rnd(-VIEW_H, VIEW_H), true));
    this.far = Array.from({ length: farN }, () => this.makeDeco(rnd(-VIEW_H, VIEW_H), false));
  }

  private makeDeco(y: number, near: boolean): Deco {
    const d: Deco = {
      x: rnd(-40, VIEW_W + 40),
      y,
      s: near ? rnd(0.8, 1.6) : rnd(0.4, 1),
      v: near ? rnd(90, 130) : rnd(30, 55),
      k: Math.random(),
    };
    if (this.stage === 3 && !near) {
      // 화산 — 먼 쪽 장식은 땅에 박힌 분화구라 땅과 같은 속도로 흐른다
      d.v = 60;
      d.s = rnd(0.5, 1.4);
    } else if (this.stage === 4) {
      // 궤도 — 별은 아주 느리게, 잔해는 조금 빠르게
      d.v = near ? rnd(70, 110) : rnd(8, 22);
    }
    return d;
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
    else if (this.stage === 3) this.drawVolcano(ctx, t);
    else if (this.stage === 4) this.drawOrbit(ctx, t);
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

  /**
   * 화산 지대 — 검은 현무암 대지 위로 용암 강 두 줄이 굽이쳐 흐른다.
   * 적탄(주황·빨강)이 묻히지 않게 용암은 화면 양쪽으로 비키고 밝기를 눌러 둔다.
   */
  private drawVolcano(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0f0706');
    g.addColorStop(1, '#1a0c08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 땅에 박힌 분화구·바위
    for (const d of this.far) {
      const r = 22 * d.s;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ellipse(ctx, d.x, d.y, r, r * 0.8);
      ctx.strokeStyle = 'rgba(120,60,40,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - 1, r, r * 0.8, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      if (d.k > 0.75) {
        // 몇몇 분화구 바닥에는 용암이 고여 있다
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + d.x);
        ctx.fillStyle = `rgba(255,90,20,${0.25 + pulse * 0.2})`;
        ellipse(ctx, d.x, d.y + 1, r * 0.45, r * 0.32);
      }
    }

    // 용암 강 — 화면 좌표 y 를 땅 좌표(y - scroll)로 바꿔 굽이를 계산하므로 땅과 함께 흐른다
    const river = (cx: number, amp: number, phase: number) => {
      const pts: [number, number][] = [];
      for (let y = -20; y <= VIEW_H + 20; y += 10) {
        const wy = y - this.scroll;
        const x =
          cx + Math.sin(wy * 0.008 + phase) * amp + Math.sin(wy * 0.021 + phase * 2) * amp * 0.3;
        pts.push([x, y]);
      }
      const path = () => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      };
      ctx.lineJoin = 'round';
      path();
      ctx.strokeStyle = '#241008';
      ctx.lineWidth = 24;
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      path();
      ctx.strokeStyle = 'rgba(170,40,8,0.32)';
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,90,20,0.32)';
      ctx.lineWidth = 7;
      ctx.stroke();
      // 흐르는 밝은 결 — 점선을 아래로 흘린다
      ctx.setLineDash([12, 26]);
      ctx.lineDashOffset = -this.scroll * 1.8;
      ctx.strokeStyle = `rgba(255,200,110,${0.22 + 0.08 * Math.sin(t * 5 + phase)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };
    river(VIEW_W * 0.1, 36, 0);
    river(VIEW_W * 0.9, 40, 2.4);

    // 떠오르는 불씨
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) {
      const k = (((t * (0.08 + (i % 5) * 0.015) + i * 0.137) % 1) + 1) % 1;
      const x = ((i * 97.3) % VIEW_W) + Math.sin(t * 1.3 + i) * 12;
      const y = VIEW_H * (1 - k);
      ctx.globalAlpha = 0.6 * Math.sin(k * Math.PI);
      drawSprite(ctx, glowSprite(i % 3 === 0 ? '#ffd27a' : '#ff7a2a', 2), x, y);
    }
    ctx.restore();

    // 가까이 흘러가는 화산 연기
    for (const d of this.near) {
      const r = 46 * d.s;
      const sg = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      sg.addColorStop(0, 'rgba(40,24,20,0.45)');
      sg.addColorStop(1, 'rgba(40,24,20,0)');
      ctx.fillStyle = sg;
      ellipse(ctx, d.x, d.y, r, r * 0.75);
    }
    // 화면 가장자리의 열기
    const heat = ctx.createLinearGradient(0, 0, VIEW_W, 0);
    heat.addColorStop(0, 'rgba(255,60,10,0.12)');
    heat.addColorStop(0.25, 'rgba(255,60,10,0)');
    heat.addColorStop(0.75, 'rgba(255,60,10,0)');
    heat.addColorStop(1, 'rgba(255,60,10,0.12)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /**
   * 궤도 방어선 — 왼쪽 아래로 지구의 밤 쪽 가장자리가 걸려 있고(도시 불빛·대기광),
   * 별이 천천히 흐르며 위성 잔해가 떠내려간다
   */
  private drawOrbit(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#01030a');
    g.addColorStop(1, '#060d20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 별 — 일부는 반짝인다
    for (const d of this.far) {
      const tw = d.k > 0.8 ? 0.5 + 0.5 * Math.sin(t * (2 + d.k * 3) + d.x) : 1;
      ctx.globalAlpha = (0.35 + d.s * 0.55) * tw;
      ctx.fillStyle = d.k > 0.9 ? '#ffe2c8' : d.k > 0.75 ? '#c8dcff' : '#ffffff';
      ctx.fillRect(d.x, d.y, 1.2 * d.s + 0.4, 1.2 * d.s + 0.4);
    }
    ctx.globalAlpha = 1;

    // 지구 — 중심은 화면 왼쪽 밖
    const ex = -430;
    const ey = VIEW_H * 0.62;
    const er = 560;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.clip();
    // 밤 쪽 지구 — 탄이 묻히지 않도록 아주 어둡게, 가장자리만 살짝 푸르다
    const body = ctx.createRadialGradient(ex, ey, er * 0.7, ex, ey, er);
    body.addColorStop(0, '#02060f');
    body.addColorStop(0.85, '#061430');
    body.addColorStop(1, '#0c2550');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 천천히 흘러가는 구름띠와 도시 불빛 (지구가 도는 만큼 아래로 흐른다)
    const spin = this.scroll * 0.25;
    for (let i = 0; i < 14; i++) {
      const y = ((((i * 83 + spin) % (VIEW_H + 160)) + VIEW_H + 160) % (VIEW_H + 160)) - 80;
      const cx = 30 + ((i * 53) % 90);
      ctx.fillStyle = 'rgba(120,150,200,0.06)';
      ctx.beginPath();
      ctx.ellipse(cx, y, 60, 9, -0.5, 0, TAU);
      ctx.fill();
      // 도시 불빛 무리
      ctx.fillStyle = 'rgba(255,190,110,0.75)';
      for (let k = 0; k < 6; k++) {
        const lx = cx - 30 + ((k * 37 + i * 11) % 60);
        const ly = y + 20 + ((k * 23 + i * 7) % 30);
        ctx.fillRect(lx, ly, 1.4, 1.4);
      }
    }
    ctx.restore();
    // 대기광 — 가장자리의 얇은 푸른 빛
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(90,180,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, er + 1, -0.9, 0.9);
    ctx.stroke();
    const atmo = ctx.createRadialGradient(ex, ey, er - 6, ex, ey, er + 40);
    atmo.addColorStop(0, 'rgba(90,180,255,0.22)');
    atmo.addColorStop(1, 'rgba(90,180,255,0)');
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(ex, ey, er + 40, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 위성 잔해 — 깨진 태양전지판과 금속 조각이 돌며 떠내려간다
    for (const d of this.near) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(t * (d.k - 0.5) * 1.6 + d.k * 10);
      ctx.globalAlpha = 0.55;
      if (d.k > 0.45) {
        const w = 26 * d.s;
        const h = 12 * d.s;
        ctx.fillStyle = '#1a2a52';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = 'rgba(140,180,255,0.6)';
        ctx.lineWidth = 0.8;
        for (let cx = -w / 2 + w / 4; cx < w / 2; cx += w / 4) {
          ctx.beginPath();
          ctx.moveTo(cx, -h / 2);
          ctx.lineTo(cx, h / 2);
          ctx.stroke();
        }
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#8a8f98';
        ctx.fillRect(w / 2, -1.5, 8 * d.s, 3);
      } else {
        ctx.fillStyle = '#5a5e66';
        poly(ctx, [
          -8 * d.s,
          -3 * d.s,
          2 * d.s,
          -7 * d.s,
          9 * d.s,
          0,
          3 * d.s,
          6 * d.s,
          -6 * d.s,
          4 * d.s,
        ]);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        poly(ctx, [-8 * d.s, -3 * d.s, 2 * d.s, -7 * d.s, 1 * d.s, -3 * d.s]);
      }
      ctx.restore();
    }
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
