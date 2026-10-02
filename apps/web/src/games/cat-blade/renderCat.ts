/**
 * 캣 블레이드 — 주인공 고양이 그리기 (폼 5종 × 동작별 자세)
 * 원점은 발 밑 가운데, 오른쪽을 보는 모습으로 그리고 facing 으로 좌우를 뒤집는다.
 */
import type { FormId } from './config';
import { drawGlow } from './render';
import { TAU, clamp, easeOut, mixHex } from './util';

export type CatPoseName =
  'idle' | 'run' | 'jump' | 'fall' | 'attack' | 'skill' | 'roll' | 'hurt' | 'parry' | 'dead';

export interface CatPose {
  x: number;
  y: number;
  facing: number;
  form: FormId;
  pose: CatPoseName;
  /** 애니메이션 시계 (초) */
  t: number;
  /** 달리기 다리 위상 */
  runPhase: number;
  /** 공격·스킬 진행도 0~1 */
  attackP: number;
  /** 콤보 몇 번째 타격인지 (0부터) */
  attackStep: number;
  /** 구르기 회전 각 */
  rollAngle: number;
  /** 피격 순간 하얗게 번쩍임 0~1 */
  flash: number;
  /** 0~1 투명도 (잔상 등) */
  alpha: number;
}

interface Palette {
  /** 빛 받는 쪽 털 */
  furLight: string;
  /** 외곽선 */
  line: string;
  /** 볼터치 */
  blush: string;
  fur: string;
  furDark: string;
  belly: string;
  ear: string;
  eye: string;
  accent: string;
  accent2: string;
  blade: string;
  bladeEdge: string;
}

const PALETTES: Record<FormId, Palette> = {
  ninja: {
    furLight: '#7a82b0',
    line: '#141726',
    blush: '#ff8fb0',
    fur: '#4a5070',
    furDark: '#2e3248',
    belly: '#d9dcef',
    ear: '#ff9fb8',
    eye: '#7ae0ff',
    accent: '#e8344a',
    accent2: '#1c1f2e',
    blade: '#3a4060',
    bladeEdge: '#bff0ff',
  },
  knight: {
    furLight: '#ffffff',
    line: '#5a5046',
    blush: '#ffa6bd',
    fur: '#f4efe6',
    furDark: '#cfc6b6',
    belly: '#ffffff',
    ear: '#ffb3c4',
    eye: '#4a8aff',
    accent: '#b8c6dc',
    accent2: '#3a64d8',
    blade: '#dfe8f5',
    bladeEdge: '#ffffff',
  },
  fire: {
    furLight: '#ffb878',
    line: '#5a1c08',
    blush: '#ff6a6a',
    fur: '#ff8a3a',
    furDark: '#d85a1a',
    belly: '#ffe0c0',
    ear: '#ffb090',
    eye: '#ffe14a',
    accent: '#d8202a',
    accent2: '#ffd23a',
    blade: '#ff5a1a',
    bladeEdge: '#fff0a0',
  },
  cheese: {
    furLight: '#ffe696',
    line: '#6a3c08',
    blush: '#ff8a7a',
    fur: '#ffc04a',
    furDark: '#e08a1a',
    belly: '#fff2cc',
    ear: '#ffb3a0',
    eye: '#5a3a1a',
    accent: '#ffd84a',
    accent2: '#8a5a2a',
    blade: '#ffe066',
    bladeEdge: '#fff7c0',
  },
  cyber: {
    furLight: '#3e4558',
    line: '#020306',
    blush: '#ff4adf',
    fur: '#20232e',
    furDark: '#12141c',
    belly: '#3a3f52',
    ear: '#ff4adf',
    eye: '#28f0ff',
    accent: '#28f0ff',
    accent2: '#ff4adf',
    blade: '#28f0ff',
    bladeEdge: '#e8ffff',
  },
};

function paletteFor(form: FormId, flash: number): Palette {
  const base = PALETTES[form];
  if (flash <= 0.01) return base;
  const k = clamp(flash, 0, 1) * 0.85;
  const out = { ...base };
  for (const key of Object.keys(out) as (keyof Palette)[]) {
    out[key] = mixHex(base[key], '#ffffff', k);
  }
  return out;
}

/** 그림 전체 배율 — 판정(hurtbox)은 그대로 두고 보이는 크기만 키운다 */
const SPRITE_SCALE = 1.12;
/** 외곽선 두께 */
const LW = 1.5;

/** 위쪽 왼편에서 빛이 드는 입체 음영 */
function volume(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  pal: Palette,
): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r * 1.15);
  g.addColorStop(0, pal.furLight);
  g.addColorStop(0.5, pal.fur);
  g.addColorStop(1, pal.furDark);
  return g;
}

function outline(ctx: CanvasRenderingContext2D, pal: Palette, w = LW) {
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** 폼별 몸집 배율 */
const BULK: Record<FormId, number> = {
  ninja: 0.95,
  knight: 1.05,
  fire: 1,
  cheese: 1.22,
  cyber: 1,
};

export function drawCat(ctx: CanvasRenderingContext2D, p: CatPose) {
  const pal = paletteFor(p.form, p.flash);
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.alpha < 1) ctx.globalAlpha *= Math.max(0, p.alpha);

  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  if (p.pose === 'roll') {
    drawRollBall(ctx, p, pal);
    ctx.restore();
    return;
  }

  ctx.scale(p.facing, 1);
  const bulk = BULK[p.form];

  // 몸 흔들림 · 기울기
  let bob = 0;
  let lean = 0;
  switch (p.pose) {
    case 'idle':
      bob = Math.sin(p.t * 3.2) * 1.2;
      break;
    case 'run':
      bob = -Math.abs(Math.sin(p.runPhase)) * 3.5;
      lean = 0.1;
      break;
    case 'jump':
      lean = -0.08;
      break;
    case 'fall':
      lean = 0.06;
      break;
    case 'hurt':
      lean = -0.3;
      break;
    case 'attack':
    case 'skill':
      lean = 0.12 * Math.sin(p.attackP * Math.PI);
      break;
    case 'parry':
      lean = -0.06;
      break;
    case 'dead':
      break;
  }

  if (p.pose === 'dead') {
    // 뒤로 벌러덩 — 몸이 바닥 위에 눕도록 회전 후 들어 올린다
    ctx.rotate(-Math.PI / 2);
    ctx.translate(14, 6);
  }

  ctx.translate(0, bob);
  ctx.rotate(lean);

  drawTail(ctx, p, pal, bulk);
  drawLegs(ctx, p, pal, bulk, true);
  if (p.form === 'ninja') drawScarfTails(ctx, p, pal);
  drawBody(ctx, p, pal, bulk);
  drawLegs(ctx, p, pal, bulk, false);
  drawHead(ctx, p, pal);
  drawArmAndWeapon(ctx, p, pal, bulk);

  ctx.restore();
}

/* ---------------- 부위별 ---------------- */

function drawTail(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette, bulk: number) {
  const sway = Math.sin(p.t * 4 + (p.pose === 'run' ? p.runPhase : 0)) * 6;
  const tipX = -22 * bulk + sway;
  const tipY = -48;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-11 * bulk, -18);
    ctx.bezierCurveTo(-27 * bulk, -17, -31 * bulk - sway * 0.3, -36, tipX, tipY);
  };
  ctx.save();
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 5.4 * bulk + LW * 2;
  ctx.stroke();
  ctx.strokeStyle = pal.fur;
  ctx.lineWidth = 5.4 * bulk;
  ctx.stroke();
  // 꼬리 윗면 하이라이트
  ctx.save();
  ctx.translate(0.6, -1.4);
  path();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = pal.furLight;
  ctx.lineWidth = 1.6 * bulk;
  ctx.stroke();
  ctx.restore();
  if (p.form === 'cheese' || p.form === 'ninja') {
    // 꼬리 줄무늬
    ctx.strokeStyle = pal.furDark;
    ctx.lineWidth = 2;
    for (const k of [0.45, 0.7]) {
      const x = -11 * bulk + (tipX + 11 * bulk) * k - sway * 0.2;
      const y = -18 + (tipY + 18) * k;
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 1.5);
      ctx.lineTo(x + 3.5, y + 1.5);
      ctx.stroke();
    }
  }
  if (p.form === 'fire') {
    // 꼬리 끝 불꽃
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const f = Math.sin(p.t * 18 + i * 2) * 2;
      drawGlow(ctx, tipX + f, tipY - 3 - i * 4, 10 - i * 2, i < 2 ? '#ff5a1a' : '#ffd04a', 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (p.form === 'cyber') {
    ctx.fillStyle = '#ff4adf';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.6, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, tipX, tipY, 9, '#ff4adf', 0.9);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // 복슬복슬한 꼬리 끝
    ctx.fillStyle = p.form === 'knight' ? pal.furLight : pal.furDark;
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, 3.4 * bulk, 4.2 * bulk, -0.4, 0, TAU);
    ctx.fill();
    outline(ctx, pal, 1.1);
  }
  ctx.restore();
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  p: CatPose,
  pal: Palette,
  bulk: number,
  back: boolean,
) {
  let swing = 0;
  let lift = 0;
  if (p.pose === 'run') {
    swing = Math.sin(p.runPhase + (back ? Math.PI : 0)) * 7;
    lift = Math.max(0, Math.cos(p.runPhase + (back ? Math.PI : 0))) * 3;
  } else if (p.pose === 'jump') {
    swing = back ? -5 : 5;
    lift = 4;
  } else if (p.pose === 'fall') {
    swing = back ? -3 : 6;
    lift = 1;
  }
  const baseX = back ? -7 * bulk : 6 * bulk;
  for (const off of [0, back ? -5 : 5]) {
    const x = baseX + off + swing * (off === 0 ? 1 : -0.6);
    const y = -5 - lift;
    const g = ctx.createLinearGradient(x, y - 6, x, y + 6);
    g.addColorStop(0, back ? pal.fur : pal.furLight);
    g.addColorStop(1, back ? pal.furDark : pal.fur);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 4.3 * bulk, 5.8, 0, 0, TAU);
    ctx.fill();
    outline(ctx, pal, 1.2);
    if (!back) {
      // 발가락 구분선
      ctx.save();
      ctx.strokeStyle = pal.line;
      ctx.globalAlpha *= 0.6;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 3);
      ctx.lineTo(x + 1, y + 5.4);
      ctx.moveTo(x + 3, y + 2.6);
      ctx.lineTo(x + 3, y + 5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBody(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette, bulk: number) {
  const rx = 14 * bulk;
  const ry = 12.5 * (0.96 + bulk * 0.04);
  ctx.fillStyle = volume(ctx, 0, -19, rx, pal);
  ctx.beginPath();
  ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
  ctx.fill();
  outline(ctx, pal);
  // 등쪽 그림자
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = pal.furDark;
  ctx.globalAlpha *= 0.35;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.9, -14, rx * 0.55, ry * 1.1, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 가슴 털 뭉치 (위쪽이 삐죽삐죽)
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(5 * bulk, -15.5, 7 * bulk, 8, 0.2, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const bx = 1 * bulk + i * 3.6 * bulk;
    ctx.moveTo(bx - 2, -21);
    ctx.lineTo(bx, -27 + (i === 1 ? -1.5 : 0));
    ctx.lineTo(bx + 2.4, -21);
  }
  ctx.fill();

  switch (p.form) {
    case 'knight': {
      // 가슴 갑옷
      const g = ctx.createLinearGradient(-12, -30, 12, -8);
      g.addColorStop(0, '#f4f8ff');
      g.addColorStop(0.5, pal.accent);
      g.addColorStop(1, '#6a7a96');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(1, -20, 13.5, 11, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#4a5a76';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.moveTo(3, -27);
      ctx.lineTo(7, -20);
      ctx.lineTo(3, -13);
      ctx.lineTo(-1, -20);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 치즈 고양이 줄무늬
      ctx.strokeStyle = pal.furDark;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (const sx of [-10, -4, 2]) {
        ctx.beginPath();
        ctx.moveTo(sx, -30);
        ctx.quadraticCurveTo(sx - 3, -22, sx + 1, -14);
        ctx.stroke();
      }
      break;
    }
    case 'cyber': {
      // 네온 회로선
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#28f0ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-12, -20);
      ctx.lineTo(-4, -20);
      ctx.lineTo(0, -26);
      ctx.lineTo(8, -26);
      ctx.moveTo(-8, -12);
      ctx.lineTo(2, -12);
      ctx.lineTo(6, -16);
      ctx.stroke();
      const pulse = 0.6 + Math.sin(p.t * 6) * 0.4;
      drawGlow(ctx, 8, -26, 4, '#28f0ff', pulse);
      drawGlow(ctx, 6, -16, 3.5, '#ff4adf', pulse);
      ctx.restore();
      break;
    }
    case 'fire': {
      // 허리띠
      ctx.fillStyle = pal.accent;
      ctx.fillRect(-13, -14, 26, 3.5);
      ctx.fillStyle = pal.accent2;
      ctx.fillRect(-2, -15, 5, 5.5);
      break;
    }
    case 'ninja': {
      // 허리띠
      ctx.fillStyle = pal.accent2;
      ctx.fillRect(-13, -15, 26, 4);
      break;
    }
  }
}

function drawScarfTails(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  // 닌자 목도리 끝자락 — 몸 뒤로 휘날린다
  const speed = p.pose === 'run' ? 1.6 : 1;
  ctx.save();
  ctx.fillStyle = pal.accent;
  for (let k = 0; k < 2; k++) {
    const w1 = Math.sin(p.t * 9 * speed + k) * 4;
    const w2 = Math.sin(p.t * 9 * speed + k + 1.4) * 5;
    ctx.beginPath();
    ctx.moveTo(-2, -31 + k * 3);
    ctx.quadraticCurveTo(-14, -34 + w1 + k * 3, -26 - k * 4, -30 + w2 + k * 5);
    ctx.lineTo(-24 - k * 4, -25 + w2 + k * 5);
    ctx.quadraticCurveTo(-12, -28 + w1 + k * 3, -2, -27 + k * 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  const hx = 7;
  const hy = -38;
  const r = 13 * (p.form === 'cheese' ? 1.08 : 1);
  ctx.save();
  // 머리 기울기 (피격 시 뒤로)
  if (p.pose === 'hurt') {
    ctx.translate(hx, hy);
    ctx.rotate(-0.2);
    ctx.translate(-hx, -hy);
  }

  // 귀
  const earTwitch = Math.sin(p.t * 1.7) > 0.96 ? -0.15 : 0;
  for (const [ex, dir] of [
    [-1, -1],
    [10, 1],
  ] as const) {
    ctx.save();
    ctx.translate(hx + ex - 3 + dir * 2, hy - r * 0.62);
    ctx.rotate(dir * 0.22 + (dir > 0 ? earTwitch : 0));
    ctx.fillStyle = dir < 0 ? pal.furDark : pal.fur;
    ctx.beginPath();
    ctx.moveTo(-6.5, 4);
    ctx.quadraticCurveTo(-2, -6, 0, -13);
    ctx.quadraticCurveTo(2, -6, 6.5, 4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, pal, 1.3);
    const eg = ctx.createLinearGradient(0, -8, 0, 3);
    eg.addColorStop(0, pal.ear);
    eg.addColorStop(1, pal.furDark);
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.moveTo(-3.4, 3);
    ctx.quadraticCurveTo(-1, -3, 0, -8);
    ctx.quadraticCurveTo(1, -3, 3.4, 3);
    ctx.closePath();
    ctx.fill();
    // 귓속 털
    ctx.strokeStyle = pal.belly;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-1.5, 3);
    ctx.lineTo(-0.4, -2);
    ctx.moveTo(1.2, 3);
    ctx.lineTo(0.6, -1);
    ctx.stroke();
    if (p.form === 'cyber') {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, -11, 4, '#ff4adf', 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // 볼 털 (머리 아래 뒤쪽으로 삐죽)
  ctx.fillStyle = pal.fur;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.6, hy + r * 0.5);
  ctx.lineTo(hx - r - 3, hy + r * 0.55);
  ctx.lineTo(hx - r * 0.7, hy + r * 0.2);
  ctx.lineTo(hx - r - 2, hy + r * 0.1);
  ctx.lineTo(hx - r * 0.8, hy - r * 0.1);
  ctx.closePath();
  ctx.fill();
  outline(ctx, pal, 1.1);
  // 머리
  ctx.fillStyle = volume(ctx, hx, hy, r, pal);
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, TAU);
  ctx.fill();
  outline(ctx, pal);
  // 이마 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(hx - 3, hy - r * 0.55, r * 0.45, r * 0.22, -0.3, 0, TAU);
  ctx.fill();
  // 주둥이
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(hx + 7.5, hy + 5, 7.5, 5.5, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha *= 0.35;
  outline(ctx, pal, 0.9);
  ctx.restore();
  // 볼터치
  if (p.pose !== 'dead') {
    ctx.save();
    ctx.fillStyle = pal.blush;
    ctx.globalAlpha *= 0.45;
    ctx.beginPath();
    ctx.ellipse(hx + 1.5, hy + 4.5, 3.2, 1.9, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (p.form === 'cheese') {
    ctx.strokeStyle = pal.furDark;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const sx of [-2, 3, 8]) {
      ctx.beginPath();
      ctx.moveTo(hx + sx - 4, hy - r + 1);
      ctx.lineTo(hx + sx - 3, hy - r + 7);
      ctx.stroke();
    }
  }

  // 눈
  const blink = Math.sin(p.t * 0.9) > 0.985 || p.pose === 'dead';
  const eyeY = hy - 2;
  if (p.pose === 'dead') {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.8;
    for (const ex of [hx + 4, hx + 11]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, eyeY - 2.5);
      ctx.lineTo(ex + 2.5, eyeY + 2.5);
      ctx.moveTo(ex + 2.5, eyeY - 2.5);
      ctx.lineTo(ex - 2.5, eyeY + 2.5);
      ctx.stroke();
    }
  } else if (p.pose === 'hurt') {
    // > < 눈
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx + 2, eyeY - 3);
    ctx.lineTo(hx + 6, eyeY);
    ctx.lineTo(hx + 2, eyeY + 3);
    ctx.moveTo(hx + 13, eyeY - 3);
    ctx.lineTo(hx + 9, eyeY);
    ctx.lineTo(hx + 13, eyeY + 3);
    ctx.stroke();
  } else if (blink) {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.6;
    for (const ex of [hx + 4, hx + 11]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, eyeY);
      ctx.lineTo(ex + 2.5, eyeY);
      ctx.stroke();
    }
  } else {
    const focused = p.pose === 'attack' || p.pose === 'skill' || p.pose === 'parry';
    // 먼 쪽 눈은 조금 작게 (원근감)
    for (const [ex, k] of [
      [hx + 3.6, 0.86],
      [hx + 11.2, 1],
    ] as const) {
      const rx = 3.7 * k;
      const ry = (focused ? 3.3 : 4.6) * k;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, rx, ry, 0, 0, TAU);
      ctx.fill();
      outline(ctx, pal, 1);
      const ig = ctx.createRadialGradient(ex + 0.6, eyeY + 0.8, 0.3, ex + 0.6, eyeY, ry);
      ig.addColorStop(0, '#ffffff');
      ig.addColorStop(0.3, pal.eye);
      ig.addColorStop(1, pal.line);
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(ex + 0.7, eyeY + 0.2, rx * 0.78, ry * 0.86, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath();
      ctx.ellipse(ex + 1, eyeY + 0.2, rx * 0.3, ry * 0.66, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 0.5 * k, eyeY - 1.6 * k, 1.25 * k, 0, TAU);
      ctx.arc(ex + 1.8 * k, eyeY + 1.6 * k, 0.55 * k, 0, TAU);
      ctx.fill();
      // 윗 눈꺼풀 (속눈썹 라인)
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.92);
      ctx.stroke();
    }
    if (focused) {
      // 매서운 눈썹
      ctx.strokeStyle = pal.furDark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx + 1, eyeY - 5);
      ctx.lineTo(hx + 6.5, eyeY - 3.5);
      ctx.moveTo(hx + 14, eyeY - 5);
      ctx.lineTo(hx + 9, eyeY - 3.5);
      ctx.stroke();
    }
  }

  // 코 · 입 · 수염
  ctx.fillStyle = '#ff7f9a';
  ctx.beginPath();
  ctx.moveTo(hx + 12, hy + 2.5);
  ctx.lineTo(hx + 15, hy + 2.5);
  ctx.lineTo(hx + 13.5, hy + 4.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a2a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx + 13.5, hy + 4.3);
  ctx.quadraticCurveTo(hx + 12, hy + 7, hx + 10, hy + 6);
  ctx.moveTo(hx + 13.5, hy + 4.3);
  ctx.quadraticCurveTo(hx + 15, hy + 7, hx + 17, hy + 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const dy of [-1.5, 1, 3.5]) {
    ctx.moveTo(hx + 15, hy + 4 + dy * 0.5);
    ctx.quadraticCurveTo(hx + 21, hy + 2.5 + dy * 1.2, hx + 27, hy + 2 + dy * 2.2);
  }
  ctx.stroke();

  // 폼별 머리 장식
  switch (p.form) {
    case 'ninja': {
      // 머리띠 + 휘날리는 끈
      ctx.fillStyle = pal.accent2;
      ctx.fillRect(hx - r + 1, hy - 8, r * 2 - 2, 4.5);
      ctx.fillStyle = '#9aa4c8';
      ctx.fillRect(hx + 3, hy - 9, 8, 6.5);
      ctx.fillStyle = pal.accent;
      const w = Math.sin(p.t * 10) * 3;
      ctx.beginPath();
      ctx.moveTo(hx - r + 2, hy - 7);
      ctx.lineTo(hx - r - 10, hy - 10 + w);
      ctx.lineTo(hx - r - 9, hy - 5 + w);
      ctx.closePath();
      ctx.fill();
      // 목도리
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.ellipse(hx - 2, hy + r - 2, 11, 4.5, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'knight': {
      // 투구 (귀 구멍이 뚫린 은빛 돔) + 파란 깃털
      const g = ctx.createLinearGradient(hx - r, hy - r, hx + r, hy);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#b8c6dc');
      g.addColorStop(1, '#6a7a96');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 1.5, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(hx + r + 1.5, hy - 4);
      ctx.lineTo(hx - r - 1.5, hy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4a5a76';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffd34a';
      ctx.fillRect(hx - 1.5, hy - r - 1, 3, r - 3);
      ctx.fillStyle = pal.accent2;
      const w = Math.sin(p.t * 6) * 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy - r - 1);
      ctx.quadraticCurveTo(hx - 10, hy - r - 14 + w, hx - 20, hy - r - 4 + w);
      ctx.quadraticCurveTo(hx - 10, hy - r - 6, hx, hy - r + 2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'fire': {
      // 빨간 반다나 + 꼬리
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 0.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(hx + r, hy - 5);
      ctx.lineTo(hx - r, hy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.arc(hx + dx, hy - r + 4, 1.2, 0, TAU);
        ctx.fill();
      }
      const w = Math.sin(p.t * 12) * 3;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(hx - r + 1, hy - 6);
      ctx.lineTo(hx - r - 9, hy - 2 + w);
      ctx.lineTo(hx - r - 4, hy + 1 + w);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 작은 치즈 조각 머리핀
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - r + 2);
      ctx.lineTo(hx + 2, hy - r - 4);
      ctx.lineTo(hx + 2, hy - r + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0a020';
      ctx.beginPath();
      ctx.arc(hx - 1, hy - r + 0.5, 1.2, 0, TAU);
      ctx.fill();
      // 빨간 나비 넥타이
      ctx.fillStyle = '#e83a4a';
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy + r - 1);
      ctx.lineTo(hx - 8, hy + r - 5);
      ctx.lineTo(hx - 8, hy + r + 3);
      ctx.closePath();
      ctx.moveTo(hx - 2, hy + r - 1);
      ctx.lineTo(hx + 4, hy + r - 5);
      ctx.lineTo(hx + 4, hy + r + 3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cyber': {
      // 네온 바이저
      if (p.pose !== 'dead') {
        ctx.fillStyle = 'rgba(10,20,30,0.85)';
        ctx.beginPath();
        ctx.moveTo(hx - 2, hy - 7);
        ctx.lineTo(hx + r + 3, hy - 6);
        ctx.lineTo(hx + r + 2, hy + 1);
        ctx.lineTo(hx - 2, hy + 1);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const scan = (Math.sin(p.t * 5) + 1) / 2;
        ctx.fillStyle = 'rgba(40,240,255,0.85)';
        ctx.fillRect(hx, hy - 4, r + 1, 2);
        drawGlow(ctx, hx + 2 + scan * (r - 2), hy - 3, 6, '#28f0ff', 0.9);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

/* ---------------- 팔 · 무기 ---------------- */

/** 공격 진행도에 따른 무기 각도 (라디안, 0 = 정면 수평, 음수 = 위쪽) */
function weaponAngle(p: CatPose): number {
  const t = easeOut(clamp(p.attackP, 0, 1));
  switch (p.pose) {
    case 'attack':
      switch (p.form) {
        case 'ninja':
          if (p.attackStep === 1) return 1.1 - t * 2.9; // 올려 베기
          if (p.attackStep === 2) return -0.1 + Math.sin(t * Math.PI) * 0.1; // 찌르기
          return -2.0 + t * 3.0; // 내려 베기
        case 'knight':
          return -2.6 + t * 3.7;
        case 'cheese':
          return -2.9 + t * 4.1;
        case 'fire':
          return -1.6 + t * 1.7;
        case 'cyber':
          return -0.05;
      }
      break;
    case 'skill':
      switch (p.form) {
        case 'knight':
        case 'cheese':
          return p.attackP < 0.5 ? -2.7 : -2.7 + easeOut((p.attackP - 0.5) * 2) * 3.9;
        case 'cyber':
          return 0;
        case 'fire':
          return -2.2 + t * 2.4;
        case 'ninja':
          return -0.3;
      }
      break;
    case 'parry':
      return -1.45;
    case 'run':
      return 0.7 + Math.sin(p.runPhase) * 0.12;
    case 'jump':
    case 'fall':
      return 0.3;
    case 'hurt':
      return 1.3;
    case 'dead':
      return 1.5;
    default:
      return 0.75 + Math.sin(p.t * 3.2) * 0.05;
  }
  return 0.75;
}

function drawArmAndWeapon(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette, bulk: number) {
  const sx = 5 * bulk;
  const sy = -24;
  const ang = weaponAngle(p);
  const reach = p.pose === 'attack' && (p.form === 'cyber' || p.form === 'fire') ? 6 : 0;
  // 팔
  const hx = sx + Math.cos(ang * 0.4) * (9 + reach);
  const hy = sy + Math.sin(ang * 0.4) * 6 + 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 5.5 * bulk + LW * 2;
  ctx.stroke();
  ctx.strokeStyle = pal.fur;
  ctx.lineWidth = 5.5 * bulk;
  ctx.stroke();

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  drawWeapon(ctx, p, pal);
  ctx.restore();

  // 앞발
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.arc(hx, hy, 3.6 * bulk, 0, TAU);
  ctx.fill();
  outline(ctx, pal, 1.1);
  if (p.pose === 'parry') {
    // 패링 자세 — 젤리 발바닥을 내민다
    ctx.fillStyle = '#ff9fb8';
    ctx.beginPath();
    ctx.arc(hx + 1.5, hy, 1.6, 0, TAU);
    ctx.fill();
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  switch (p.form) {
    case 'ninja': {
      // 손잡이 + 코등이 + 가는 칼날
      ctx.fillStyle = '#2a1a1a';
      ctx.fillRect(-7, -1.6, 9, 3.2);
      ctx.fillStyle = '#d8b04a';
      ctx.fillRect(2, -3.5, 2.5, 7);
      const g = ctx.createLinearGradient(0, -2, 0, 2);
      g.addColorStop(0, pal.bladeEdge);
      g.addColorStop(1, pal.blade);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(4.5, -1.8);
      ctx.lineTo(34, -1.2);
      ctx.lineTo(38, 0.6);
      ctx.lineTo(4.5, 1.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'knight': {
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(-8, -2, 10, 4);
      ctx.fillStyle = '#ffd34a';
      ctx.fillRect(1, -8, 3.5, 16);
      const g = ctx.createLinearGradient(0, -5, 0, 5);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, pal.blade);
      g.addColorStop(1, '#8a9ab4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(4.5, -5);
      ctx.lineTo(50, -4.2);
      ctx.lineTo(58, 0);
      ctx.lineTo(50, 4.2);
      ctx.lineTo(4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,100,140,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(48, 0);
      ctx.stroke();
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.arc(2.7, 0, 2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'fire': {
      ctx.fillStyle = '#3a1a10';
      ctx.fillRect(-6, -1.8, 8, 3.6);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(2, -4, 2.5, 8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const fl = Math.sin(p.t * 20 + i * 1.3) * 1.5;
        drawGlow(ctx, 8 + i * 7, fl, 8 - i * 0.6, i % 2 ? '#ffc04a' : '#ff5a1a', 0.75);
      }
      ctx.restore();
      ctx.fillStyle = pal.bladeEdge;
      ctx.beginPath();
      ctx.moveTo(4.5, -1.6);
      ctx.lineTo(36, -0.8);
      ctx.lineTo(40, 0.5);
      ctx.lineTo(4.5, 1.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 나무 자루 + 구멍 뚫린 치즈 망치
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(-6, -2.2, 36, 4.4);
      ctx.save();
      ctx.translate(36, 0);
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.moveTo(-8, -15);
      ctx.lineTo(10, -11);
      ctx.lineTo(10, 13);
      ctx.lineTo(-8, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe98a';
      ctx.beginPath();
      ctx.moveTo(-8, -15);
      ctx.lineTo(10, -11);
      ctx.lineTo(4, -9);
      ctx.lineTo(-8, -11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0a020';
      for (const [cx, cy, r] of [
        [-2, -4, 2.6],
        [4, 5, 2],
        [-4, 8, 1.6],
        [5, -6, 1.3],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#c88a1a';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-8, -13, 18, 26);
      ctx.restore();
      break;
    }
    case 'cyber': {
      // 건틀릿 + 네온 클로 3갈래
      ctx.fillStyle = '#3a3f52';
      ctx.fillRect(-4, -4, 9, 8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(40,240,255,0.95)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const dy of [-3.5, 0, 3.5]) {
        ctx.beginPath();
        ctx.moveTo(5, dy);
        ctx.quadraticCurveTo(14, dy * 1.4, 20, dy * 0.6 + 1);
        ctx.stroke();
      }
      drawGlow(ctx, 14, 0, 11, '#28f0ff', 0.55);
      ctx.restore();
      break;
    }
  }
}

function drawRollBall(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  // 몸을 둥글게 말고 굴러간다
  const bulk = BULK[p.form];
  const r = 14 * bulk;
  ctx.translate(0, -r);
  ctx.rotate(p.rollAngle * p.facing);
  ctx.fillStyle = pal.fur;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.furDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0.3, 4.4);
  ctx.stroke();
  ctx.fillStyle = pal.fur;
  for (const a of [-0.5, 0.3]) {
    ctx.save();
    ctx.rotate(a - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(r - 2, -5);
    ctx.lineTo(r + 8, 0);
    ctx.lineTo(r - 2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = PALETTES[p.form].accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.25, 0, TAU);
  ctx.fill();
}

/* ---------------- HUD 폼 아이콘 ---------------- */

/** 폼 아이콘 (원 배경 + 상징 도형) */
export function drawFormIcon(
  ctx: CanvasRenderingContext2D,
  form: FormId,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
  bg.addColorStop(0, '#2c2f4a');
  bg.addColorStop(1, '#141626');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const s = r * 0.55;
  switch (form) {
    case 'ninja': {
      // 수리검
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(a) * s * 1.1, Math.sin(a) * s * 1.1);
        ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.3, Math.sin(a + Math.PI / 4) * s * 0.3);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#141626';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.15, 0, TAU);
      ctx.fill();
      break;
    }
    case 'knight': {
      // 방패
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, -s * 0.8);
      ctx.lineTo(s * 0.8, -s * 0.8);
      ctx.lineTo(s * 0.8, 0);
      ctx.quadraticCurveTo(s * 0.6, s * 0.8, 0, s * 1.05);
      ctx.quadraticCurveTo(-s * 0.6, s * 0.8, -s * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a64d8';
      ctx.fillRect(-s * 0.12, -s * 0.6, s * 0.24, s * 1.2);
      ctx.fillRect(-s * 0.5, -s * 0.2, s, s * 0.24);
      break;
    }
    case 'fire': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.1);
      ctx.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.6, s * 0.5);
      ctx.quadraticCurveTo(s * 0.3, s * 1.0, 0, s * 1.0);
      ctx.quadraticCurveTo(-s * 0.3, s * 1.0, -s * 0.6, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.8, 0, -s * 0.2, -s * 0.4);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.1, 0, -s * 1.1);
      ctx.fill();
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.45, s * 0.3, s * 0.45, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'cheese': {
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.6);
      ctx.lineTo(s, s * 0.6);
      ctx.lineTo(s, -s * 0.2);
      ctx.lineTo(-s, -s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c88a1a';
      for (const [cx, cy, cr] of [
        [-0.3, 0.1, 0.18],
        [0.4, 0.25, 0.14],
        [0.5, -0.05, 0.1],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx * s, cy * s, cr * s, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'cyber': {
      // 번개
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -s * 1.1);
      ctx.lineTo(-s * 0.6, s * 0.1);
      ctx.lineTo(-s * 0.05, s * 0.1);
      ctx.lineTo(-s * 0.3, s * 1.1);
      ctx.lineTo(s * 0.6, -s * 0.2);
      ctx.lineTo(s * 0.05, -s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
