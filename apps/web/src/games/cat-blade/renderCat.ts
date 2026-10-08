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
  /** 각성(업그레이드) 폼 — 사무라이·킹·플레임·참치·슈프림 */
  upgraded?: boolean;
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

/** 각성 폼 색 — 사무라이(먹색·진홍·금) / 킹(백금·왕실 빨강) / 플레임(진홍 털·청염) / 참치(바다) / 슈프림(백색·홀로그램) */
const UP_PALETTES: Record<FormId, Palette> = {
  ninja: {
    furLight: '#5e6380',
    line: '#0c0d16',
    blush: '#ff8fb0',
    fur: '#363a50',
    furDark: '#1c1e2c',
    belly: '#e8e4f2',
    ear: '#ff9fb8',
    eye: '#ffd23a',
    accent: '#d81e3c',
    accent2: '#d8a83a',
    blade: '#c8d0e0',
    bladeEdge: '#ffffff',
  },
  knight: {
    furLight: '#ffffff',
    line: '#5a4630',
    blush: '#ffa6bd',
    fur: '#fbf6ec',
    furDark: '#d8ccb4',
    belly: '#ffffff',
    ear: '#ffb3c4',
    eye: '#3a6aff',
    accent: '#ffd34a',
    accent2: '#c8102e',
    blade: '#fff4d0',
    bladeEdge: '#ffffff',
  },
  fire: {
    furLight: '#ff9a7a',
    line: '#3a0a10',
    blush: '#ff6a8a',
    fur: '#d8402a',
    furDark: '#8a1a14',
    belly: '#ffd8c0',
    ear: '#ff9a9a',
    eye: '#9af0ff',
    accent: '#1a2a6a',
    accent2: '#5aa8ff',
    blade: '#3a8aff',
    bladeEdge: '#e8ffff',
  },
  cheese: {
    furLight: '#ffffff',
    line: '#163652',
    blush: '#ff8a9a',
    fur: '#e6eef6',
    furDark: '#93aec6',
    belly: '#ffffff',
    ear: '#ffb3c4',
    eye: '#1a6aff',
    accent: '#3ab4ff',
    accent2: '#1a4a8a',
    blade: '#5a8ab8',
    bladeEdge: '#e8f8ff',
  },
  cyber: {
    furLight: '#ffffff',
    line: '#2a1a4a',
    blush: '#ff7ad8',
    fur: '#ecebff',
    furDark: '#a8a0d8',
    belly: '#ffffff',
    ear: '#ff7ad8',
    eye: '#7afff0',
    accent: '#ffd34a',
    accent2: '#c07aff',
    blade: '#7afff0',
    bladeEdge: '#ffffff',
  },
};

function paletteFor(form: FormId, flash: number, upgraded = false): Palette {
  const base = (upgraded ? UP_PALETTES : PALETTES)[form];
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
  const pal = paletteFor(p.form, p.flash, p.upgraded);
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

  if (p.upgraded && p.pose !== 'dead') drawAura(ctx, p, pal);
  drawBackDecor(ctx, p, pal, bulk);
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
    // 꼬리 끝 불꽃 (플레임 캣은 더 크고 푸른 청염)
    const up = p.upgraded;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < (up ? 6 : 4); i++) {
      const f = Math.sin(p.t * 18 + i * 2) * 2;
      const hot = up ? (i < 3 ? '#2a6aff' : '#9af0ff') : i < 2 ? '#ff5a1a' : '#ffd04a';
      drawGlow(ctx, tipX + f, tipY - 3 - i * 4, (up ? 13 : 10) - i * 2, hot, 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (p.form === 'cyber') {
    const col = p.upgraded ? pal.accent2 : '#ff4adf';
    ctx.fillStyle = p.upgraded ? pal.accent : col;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.6, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, tipX, tipY, p.upgraded ? 12 : 9, col, 0.9);
    ctx.globalCompositeOperation = 'source-over';
  } else if (p.form === 'ninja' && p.upgraded) {
    // 사무라이 — 꼬리에 감은 진홍 매듭끈과 금 방울
    ctx.fillStyle = pal.furDark;
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, 3.4 * bulk, 4.2 * bulk, -0.4, 0, TAU);
    ctx.fill();
    outline(ctx, pal, 1.1);
    const mx = -11 * bulk + (tipX + 11 * bulk) * 0.55;
    const my = -18 + (tipY + 18) * 0.55;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.ellipse(mx, my, 3.6, 2.2, 0.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx - 3, my + 6, mx - 2 + sway * 0.3, my + 11);
    ctx.stroke();
    ctx.fillStyle = pal.accent2;
    ctx.beginPath();
    ctx.arc(mx - 2 + sway * 0.3, my + 12, 1.8, 0, TAU);
    ctx.fill();
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
  // 가슴 털 결
  ctx.save();
  ctx.strokeStyle = pal.furDark;
  ctx.globalAlpha *= 0.35;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const [x0, y0] of [
    [3, -17],
    [7, -14],
    [5, -11],
  ] as const) {
    ctx.moveTo(x0 * bulk, y0);
    ctx.quadraticCurveTo(x0 * bulk + 1.5, y0 + 1.5, x0 * bulk + 1, y0 + 3);
  }
  ctx.stroke();
  ctx.restore();
  rimLight(ctx, 0, -19, rx, ry, pal);

  if (p.upgraded) {
    drawUpgradedBody(ctx, p, pal, bulk);
    return;
  }

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
      // 갑옷 판 이음선 + 하이라이트
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(1, -20, 13.5, 11, 0, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = 'rgba(74,90,118,0.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-13, -15);
      ctx.quadraticCurveTo(1, -11, 15, -15);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(-4, -26, 5, 1.8, -0.35, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.moveTo(3, -27);
      ctx.lineTo(7, -20);
      ctx.lineTo(3, -13);
      ctx.lineTo(-1, -20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd34a';
      ctx.beginPath();
      ctx.arc(3, -20, 1.4, 0, TAU);
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 치즈 고양이 줄무늬 + 가죽 멜빵
      tabbyStripes(ctx, rx, ry, pal.furDark);
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4 * bulk, -30);
      ctx.quadraticCurveTo(0, -20, 5 * bulk, -10);
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(3.6 * bulk, -13, 1.6, 0, TAU);
      ctx.fill();
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
      // 허리띠 + 불꽃 버클 + 배 쪽 불꽃 무늬
      belt(ctx, rx, ry, -12.5, 3.5, pal.accent, pal);
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.moveTo(1, -16.5);
      ctx.quadraticCurveTo(4.5, -13.5, 2.5, -9.6);
      ctx.quadraticCurveTo(0, -10.5, -0.5, -12.5);
      ctx.quadraticCurveTo(-1, -14.5, 1, -16.5);
      ctx.fill();
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      break;
    }
    case 'ninja': {
      // 허리띠 + 매듭 + 수리검
      belt(ctx, rx, ry, -13, 4, pal.accent2, pal);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.ellipse(-8, -11, 2.4, 1.8, 0, 0, TAU);
      ctx.fill();
      const w = Math.sin(p.t * 8) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-9, -11);
      ctx.lineTo(-14, -6 + w);
      ctx.lineTo(-11.5, -5.5 + w);
      ctx.closePath();
      ctx.fill();
      shuriken(ctx, 6, -11, 3.2, '#c8d0e8', pal.line);
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
  if (p.upgraded) {
    drawUpgradedHead(ctx, p, pal, hx, hy, r);
    ctx.restore();
    return;
  }
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
        case 'ninja': {
          // 사무라이는 4연타 — 내려·올려·내려·일섬(찌르기)
          const step = p.upgraded ? ([0, 1, 0, 2][p.attackStep] ?? 0) : p.attackStep;
          if (step === 1) return 1.1 - t * 2.9; // 올려 베기
          if (step === 2) return -0.1 + Math.sin(t * Math.PI) * 0.1; // 찌르기
          return -2.0 + t * 3.0; // 내려 베기
        }
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
  if (p.form === 'knight' || p.form === 'cyber' || (p.form === 'ninja' && p.upgraded)) {
    shoulderGuard(ctx, p, pal, sx + 0.5, sy - 1);
  }

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
  if (p.upgraded) {
    drawUpgradedWeapon(ctx, p, pal);
    return;
  }
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
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.25, 0, TAU);
  ctx.fill();
}

/* ---------------- 공통 디테일 ---------------- */

/** 몸 아래쪽 가장자리의 반사광 + 위쪽 윤기 — 둥근 입체감을 더한다 */
function rimLight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pal: Palette,
) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.globalAlpha *= 0.4;
  ctx.strokeStyle = pal.furLight;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(cx - 1.6, cy + 1.8, rx, ry, 0, 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.globalAlpha *= 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, cy - ry * 0.62, rx * 0.38, ry * 0.16, -0.35, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 몸통 둘레를 감는 허리띠 (몸 타원 안으로 잘라서 둥글게 보인다) */
function belt(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  y: number,
  h: number,
  color: string,
  pal: Palette,
) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-rx - 1, y - h / 2 - 1);
  ctx.quadraticCurveTo(0, y - h / 2 + 2, rx + 1, y - h / 2 - 1);
  ctx.lineTo(rx + 1, y + h / 2 - 1);
  ctx.quadraticCurveTo(0, y + h / 2 + 2, -rx - 1, y + h / 2 - 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = pal.line;
  ctx.globalAlpha *= 0.5;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

/** 작은 수리검 */
function shuriken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  line: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.32, Math.sin(a + Math.PI / 4) * r * 0.32);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

/** 등 쪽 호랑이 줄무늬 (치즈·참치) */
function tabbyStripes(ctx: CanvasRenderingContext2D, rx: number, ry: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = color;
  for (const sx of [-10, -4.5, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx - 1.6, -32);
    ctx.quadraticCurveTo(sx - 4.5, -23, sx - 0.5, -14);
    ctx.quadraticCurveTo(sx + 0.4, -22, sx + 1.8, -32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 어깨 보호대 — 앞쪽 어깨 위에 겹쳐 그린다 */
function shoulderGuard(
  ctx: CanvasRenderingContext2D,
  p: CatPose,
  pal: Palette,
  x: number,
  y: number,
) {
  const up = p.upgraded;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.15);
  if (p.form === 'ninja' && up) {
    // 사무라이 소데 — 진홍 옻칠판 2장을 금실로 엮었다
    for (let i = 1; i >= 0; i--) {
      const y = -3 + i * 3.6;
      ctx.fillStyle = i === 0 ? '#ff4a5e' : pal.accent;
      ctx.beginPath();
      ctx.moveTo(-6, y);
      ctx.quadraticCurveTo(0, y - 1.6, 6, y);
      ctx.lineTo(5.4, y + 3.6);
      ctx.quadraticCurveTo(0, y + 2.4, -5.4, y + 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.fillStyle = pal.accent2;
    for (const x of [-3, 0, 3]) {
      ctx.beginPath();
      ctx.arc(x, -0.6, 0.65, 0, TAU);
      ctx.arc(x, 3, 0.65, 0, TAU);
      ctx.fill();
    }
  } else {
    // 둥근 판금 견갑 (나이트·킹·사이버·슈프림)
    const metal =
      p.form === 'knight'
        ? up
          ? ['#fff6c8', '#ffd34a', '#a8781a']
          : ['#ffffff', '#b8c6dc', '#5a6a86']
        : up
          ? ['#ffffff', '#e8e4ff', '#a89ad8']
          : ['#5a6278', '#3a3f52', '#1a1d28'];
    const g = ctx.createRadialGradient(-2, -3, 0.5, 0, 0, 8);
    g.addColorStop(0, metal[0] as string);
    g.addColorStop(0.55, metal[1] as string);
    g.addColorStop(1, metal[2] as string);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.4, 5.8, 0, Math.PI, 0);
    ctx.quadraticCurveTo(6, 4.5, 0, 4);
    ctx.quadraticCurveTo(-6, 4.5, -7.4, 0);
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    // 테두리 장식
    ctx.strokeStyle =
      p.form === 'cyber' ? (up ? pal.accent2 : '#28f0ff') : up ? pal.accent2 : pal.accent2;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 5.6, 4.2, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    if (p.form === 'cyber') {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, -1, 5, up ? pal.accent2 : '#28f0ff', 0.6 + Math.sin(p.t * 6) * 0.3);
    }
  }
  ctx.restore();
}

/* ---------------- 각성 오라 · 등 장식 ---------------- */

const AURA_COLOR: Record<FormId, [string, string]> = {
  ninja: ['#ff3a5c', '#ffc2d6'],
  knight: ['#ffd34a', '#fff4c8'],
  fire: ['#2a6aff', '#9af0ff'],
  cheese: ['#3ab4ff', '#b4f0ff'],
  cyber: ['#c07aff', '#7afff0'],
};

/** 각성 폼 뒤로 일렁이는 오라 */
function drawAura(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  const [c1, c2] = AURA_COLOR[p.form];
  const pulse = 0.75 + Math.sin(p.t * 5) * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 2, -28, 38 * pulse, c1, 0.42);
  drawGlow(ctx, 2, -30, 24, c2, 0.3);
  // 위로 타오르는 오라 혀
  ctx.globalAlpha *= 0.4;
  for (let i = 0; i < 5; i++) {
    const ph = p.t * 3 + i * 1.3;
    const x = -16 + i * 8;
    const h = 22 + Math.sin(ph * 2.1) * 8;
    const g = ctx.createLinearGradient(0, -8, 0, -8 - h - 30);
    g.addColorStop(0, withAlphaHex(c1, 0));
    g.addColorStop(0.4, withAlphaHex(c1, 0.8));
    g.addColorStop(1, withAlphaHex(c2, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 5, -8);
    ctx.quadraticCurveTo(x - 6 + Math.sin(ph) * 3, -26 - h * 0.5, x + Math.sin(ph) * 4, -40 - h);
    ctx.quadraticCurveTo(x + 6 + Math.sin(ph) * 3, -26 - h * 0.5, x + 5, -8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // 몸 주위를 도는 빛 알갱이
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const a = p.t * 2.4 + (i * TAU) / 3;
    const ox = Math.cos(a) * 22;
    const oy = -28 + Math.sin(a) * 9;
    if (Math.sin(a) < 0) continue; // 뒤쪽 반바퀴는 몸에 가려진다
    drawGlow(ctx, ox, oy, 6, pal.eye, 0.8);
  }
  ctx.restore();
}

/** '#rrggbb' 에 투명도를 붙인 rgba 문자열 */
function withAlphaHex(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 몸 뒤쪽 장식 — 나이트 망토, 사무라이 깃발, 킹 왕실 망토, 플레임 청염, 슈프림 날개 */
function drawBackDecor(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette, bulk: number) {
  const speed = p.pose === 'run' ? 1.8 : 1;
  const wave = Math.sin(p.t * 6 * speed);
  if (!p.upgraded) {
    if (p.form === 'knight' && p.pose !== 'dead') {
      // 짧은 파란 망토
      const g = ctx.createLinearGradient(-4, -32, -20, -6);
      g.addColorStop(0, '#4a74e8');
      g.addColorStop(1, '#1e3a9a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(2, -31);
      ctx.quadraticCurveTo(-14, -30, -19 - wave * 2, -8);
      ctx.lineTo(-12 - wave, -6);
      ctx.lineTo(-7 - wave * 1.5, -9);
      ctx.lineTo(-2, -8);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1.1);
    }
    return;
  }
  if (p.pose === 'dead') return;
  switch (p.form) {
    case 'ninja': {
      // 사시모노 — 등에 꽂은 진홍 깃발 (금색 벚꽃 문양)
      ctx.save();
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -22);
      ctx.lineTo(-13, -82);
      ctx.stroke();
      ctx.translate(-13, -82);
      ctx.rotate(-0.1);
      const fw = 14;
      const fh = 26;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-fw * 0.5, 2 + wave * 1.5, -fw, wave * 2);
      ctx.lineTo(-fw - wave, fh + wave);
      ctx.quadraticCurveTo(-fw * 0.5, fh + 2 - wave, 0, fh);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1);
      // 금색 벚꽃
      ctx.fillStyle = pal.accent2;
      ctx.translate(-fw / 2 - wave * 0.4, fh / 2);
      for (let i = 0; i < 5; i++) {
        ctx.rotate(TAU / 5);
        ctx.beginPath();
        ctx.ellipse(0, -2.6, 1.6, 2.4, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'knight': {
      // 왕실 망토 — 진홍 비단 + 흰 담비털 깃
      const g = ctx.createLinearGradient(0, -34, -26, 0);
      g.addColorStop(0, '#e8203e');
      g.addColorStop(0.6, pal.accent2);
      g.addColorStop(1, '#6a0818');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(4, -33);
      ctx.quadraticCurveTo(-18, -34, -27 - wave * 3, -2);
      ctx.quadraticCurveTo(-20, 1, -15 - wave * 2, -2);
      ctx.quadraticCurveTo(-9, 1, -4 - wave, -3);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1.2);
      // 안감 금실
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-25 - wave * 3, -4);
      ctx.quadraticCurveTo(-20, -1, -15 - wave * 2, -4);
      ctx.quadraticCurveTo(-9, -1, -4 - wave, -5);
      ctx.stroke();
      // 담비털 깃 (흰 바탕 + 검은 점)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-2, -32, 10, 4.2, -0.15, 0, TAU);
      ctx.fill();
      outline(ctx, pal, 1);
      ctx.fillStyle = '#1a1a1a';
      for (const dx of [-8, -3, 2]) {
        ctx.beginPath();
        ctx.ellipse(dx, -32, 0.8, 1.4, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'fire': {
      // 등 뒤로 솟는 청염 날개
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const ph = p.t * 10 + i * 1.7;
        const len = 20 + i * 5 + Math.sin(ph) * 4;
        const ang = -2.3 + i * 0.22;
        const bx = -6;
        const by = -28;
        const tx = bx + Math.cos(ang) * len;
        const ty = by + Math.sin(ang) * len;
        const g = ctx.createLinearGradient(bx, by, tx, ty);
        g.addColorStop(0, 'rgba(154,240,255,0.9)');
        g.addColorStop(0.5, 'rgba(58,138,255,0.7)');
        g.addColorStop(1, 'rgba(42,60,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.quadraticCurveTo(tx + 6, (by + ty) / 2 - 4, tx, ty);
        ctx.quadraticCurveTo((bx + tx) / 2, (by + ty) / 2 + 6, bx, by + 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'cheese': {
      // 등에 멘 작살 + 물방울
      ctx.save();
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16 * bulk, -8);
      ctx.lineTo(4, -54);
      ctx.stroke();
      ctx.fillStyle = '#d8e8f4';
      ctx.translate(4, -54);
      ctx.rotate(Math.atan2(-46, 16 + 16 * bulk) + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(3, 0);
      ctx.lineTo(1, 0);
      ctx.lineTo(3.5, 3);
      ctx.lineTo(-3.5, 3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 0.9);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const k = (p.t * 0.6 + i / 4) % 1;
        const bx = -14 + Math.sin(i * 2.3 + p.t * 2) * 8;
        const by = -10 - k * 60;
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = '#b4f0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + i * 0.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'cyber': {
      // 육각 홀로그램 날개 두 쌍
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flap = Math.sin(p.t * 4) * 0.08;
      for (const [ang, len, col] of [
        [-2.45 + flap, 30, '#c07aff'],
        [-2.95 - flap, 24, '#7afff0'],
      ] as const) {
        ctx.save();
        ctx.translate(-4, -30);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, withAlphaHex(col, 0.85));
        g.addColorStop(1, withAlphaHex(col, 0.05));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(len * 0.7, -9);
        ctx.lineTo(len, -2);
        ctx.lineTo(len * 0.8, 5);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = withAlphaHex(col, 0.9);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // 육각 셀
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        for (let i = 1; i <= 3; i++) {
          const cx = len * 0.22 * i;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * TAU) / 6;
            ctx.lineTo(cx + Math.cos(a) * 2.6, Math.sin(a) * 2.6);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      break;
    }
  }
}

/* ---------------- 각성 폼 몸통 ---------------- */

function drawUpgradedBody(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette, bulk: number) {
  const rx = 14 * bulk;
  const ry = 12.5 * (0.96 + bulk * 0.04);
  switch (p.form) {
    case 'ninja': {
      // 사무라이 도 (가슴 갑옷) — 진홍 옻칠판에 금실 엮음
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(-10, -30, 10, -8);
      g.addColorStop(0, '#ff5a6a');
      g.addColorStop(0.5, pal.accent);
      g.addColorStop(1, '#7a0a1c');
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -30, rx * 2, 17);
      ctx.strokeStyle = pal.accent2;
      ctx.lineWidth = 0.9;
      for (const y of [-26, -21.5, -17]) {
        ctx.beginPath();
        ctx.moveTo(-rx, y);
        ctx.quadraticCurveTo(0, y + 2, rx, y);
        ctx.stroke();
      }
      ctx.fillStyle = pal.accent2;
      for (const x of [-6, 0, 6]) {
        for (const y of [-24, -19.5]) {
          ctx.beginPath();
          ctx.arc(x, y, 0.7, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      belt(ctx, rx, ry, -12.5, 3.6, '#1a1420', pal);
      ctx.fillStyle = pal.accent2;
      ctx.fillRect(-1.5, -14.4, 3, 3.8);
      break;
    }
    case 'knight': {
      // 황금 흉갑 + 루비 + 고양이 문장
      const g = ctx.createLinearGradient(-12, -30, 12, -8);
      g.addColorStop(0, '#fff8d0');
      g.addColorStop(0.45, pal.accent);
      g.addColorStop(1, '#9a6a12');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(1, -20, 13.8, 11.4, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7a5410';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(1, -20, 13.8, 11.4, 0, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = 'rgba(122,84,16,0.7)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-13, -14);
      ctx.quadraticCurveTo(1, -10, 15, -14);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.ellipse(-4, -26, 5.5, 1.9, -0.35, 0, TAU);
      ctx.fill();
      ctx.restore();
      // 고양이 얼굴 문장
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.moveTo(-1.5, -24.5);
      ctx.lineTo(0, -27.5);
      ctx.lineTo(1.8, -25);
      ctx.lineTo(4.2, -25);
      ctx.lineTo(6, -27.5);
      ctx.lineTo(7.5, -24.5);
      ctx.quadraticCurveTo(8.5, -18.5, 3, -17);
      ctx.quadraticCurveTo(-2.5, -18.5, -1.5, -24.5);
      ctx.fill();
      ctx.strokeStyle = '#ffe98a';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(1.5, -22.5, 0.8, 0, TAU);
      ctx.arc(4.5, -22.5, 0.8, 0, TAU);
      ctx.fill();
      break;
    }
    case 'fire': {
      // 등의 짙은 불꽃 무늬 + 남색 허리띠 + 푸른 보석
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = pal.furDark;
      for (const sx of [-11, -5]) {
        ctx.beginPath();
        ctx.moveTo(sx - 2.5, -32);
        ctx.quadraticCurveTo(sx - 4, -24, sx + 0.5, -18);
        ctx.quadraticCurveTo(sx + 0.5, -23, sx + 2.5, -25);
        ctx.quadraticCurveTo(sx + 0.5, -28, sx - 2.5, -32);
        ctx.fill();
      }
      ctx.restore();
      belt(ctx, rx, ry, -12.5, 3.6, pal.accent, pal);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 1, -12.8, 6, '#5aa8ff', 0.9);
      ctx.restore();
      ctx.fillStyle = '#bff4ff';
      ctx.beginPath();
      ctx.moveTo(1, -15.6);
      ctx.lineTo(3, -12.8);
      ctx.lineTo(1, -10);
      ctx.lineTo(-1, -12.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 참치 냥이 — 회청 줄무늬 + 파란 어부 조끼
      tabbyStripes(ctx, rx, ry, pal.furDark);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(-10, -30, 10, -8);
      g.addColorStop(0, '#5ac8ff');
      g.addColorStop(1, pal.accent2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rx, -27);
      ctx.lineTo(-2 * bulk, -29);
      ctx.lineTo(1 * bulk, -18);
      ctx.lineTo(-rx, -12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rx, -26);
      ctx.lineTo(8 * bulk, -29);
      ctx.lineTo(5 * bulk, -18);
      ctx.lineTo(rx, -12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 주머니 + 물고기 배지
      ctx.fillStyle = pal.accent2;
      ctx.fillRect(-9 * bulk, -20, 6, 4.5);
      ctx.strokeStyle = '#9ad8ff';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-9 * bulk, -20, 6, 4.5);
      fishBadge(ctx, 9 * bulk, -22, 2.4, '#ffd84a');
      break;
    }
    case 'cyber': {
      // 슈프림 — 백금 장갑판 + 보랏빛 네온선 + 프리즘 코어
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -19, rx, ry, 0, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(-12, -30, 12, -8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#ece6ff');
      g.addColorStop(1, '#b0a4e0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rx, -26);
      ctx.lineTo(rx, -28);
      ctx.lineTo(rx, -14);
      ctx.lineTo(-rx, -14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-rx, -26);
      ctx.lineTo(rx, -28);
      ctx.moveTo(-rx, -14);
      ctx.lineTo(rx, -14);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(192,122,255,0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-12, -20);
      ctx.lineTo(-4, -20);
      ctx.lineTo(-1, -24);
      ctx.moveTo(-10, -16.5);
      ctx.lineTo(-2, -16.5);
      ctx.stroke();
      ctx.restore();
      // 프리즘 코어 (색이 돈다)
      const hue = (p.t * 120) % 360;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 4, -21, 8, '#7afff0', 0.8);
      ctx.restore();
      ctx.fillStyle = `hsl(${hue},100%,72%)`;
      ctx.beginPath();
      ctx.moveTo(4, -25);
      ctx.lineTo(7, -21);
      ctx.lineTo(4, -17);
      ctx.lineTo(1, -21);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
  }
}

/** 작은 물고기 배지 */
function fishBadge(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.4, s * 0.8, 0, 0, TAU);
  ctx.moveTo(-s * 1.2, 0);
  ctx.lineTo(-s * 2.2, -s * 0.8);
  ctx.lineTo(-s * 2.2, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------- 각성 폼 머리 장식 ---------------- */

function drawUpgradedHead(
  ctx: CanvasRenderingContext2D,
  p: CatPose,
  pal: Palette,
  hx: number,
  hy: number,
  r: number,
) {
  switch (p.form) {
    case 'ninja': {
      // 사무라이 투구 — 옻칠 돔 + 진홍 테 + 금빛 초승달 장식(마에다테) + 목 가리개
      ctx.fillStyle = '#1c1e2c';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(hx - r + 1 - i * 2, hy - 6 + i * 3.4);
        ctx.lineTo(hx - r - 6 - i * 2, hy - 1 + i * 4);
        ctx.lineTo(hx - r - 4 - i * 2, hy + 3 + i * 4);
        ctx.lineTo(hx - r + 3, hy - 1 + i * 3.4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      const g = ctx.createLinearGradient(hx - r, hy - r, hx + r, hy);
      g.addColorStop(0, '#5a5e78');
      g.addColorStop(0.5, '#262838');
      g.addColorStop(1, '#0c0d16');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 1.8, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(hx + r + 1.8, hy - 5);
      ctx.lineTo(hx - r - 1.8, hy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // 투구 세로 골 + 진홍 챙
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.8;
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(hx + dx, hy - r - 0.5);
        ctx.quadraticCurveTo(hx + dx * 1.2, hy - 10, hx + dx * 1.3, hy - 5.5);
        ctx.stroke();
      }
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(hx - r - 2.5, hy - 6.5);
      ctx.lineTo(hx + r + 4, hy - 6.5);
      ctx.lineTo(hx + r + 6, hy - 3.6);
      ctx.lineTo(hx - r - 2.5, hy - 4);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 0.9);
      // 금빛 초승달
      ctx.save();
      ctx.translate(hx + 3, hy - r - 2);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, -5, 12, '#ffd34a', 0.45);
      ctx.globalCompositeOperation = 'source-over';
      const cg = ctx.createLinearGradient(-12, -12, 12, 0);
      cg.addColorStop(0, '#fff4b0');
      cg.addColorStop(0.5, pal.accent2);
      cg.addColorStop(1, '#8a5a10');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-13, -13);
      ctx.quadraticCurveTo(0, 6, 13, -13);
      ctx.quadraticCurveTo(0, 0, -13, -13);
      ctx.fill();
      ctx.strokeStyle = '#6a4010';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(0, -1.5, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'knight': {
      // 황금 왕관 — 다섯 봉우리 + 보석, 살짝 기울여 썼다
      ctx.save();
      ctx.translate(hx + 1, hy - r + 1);
      ctx.rotate(0.12);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, -6, 16, '#ffd34a', 0.35);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, -14, 0, 2);
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.5, pal.accent);
      g.addColorStop(1, '#a8741a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-11, 1);
      ctx.lineTo(-12, -9);
      ctx.lineTo(-7, -4);
      ctx.lineTo(-4, -13);
      ctx.lineTo(0, -5);
      ctx.lineTo(4, -13);
      ctx.lineTo(7, -4);
      ctx.lineTo(12, -9);
      ctx.lineTo(11, 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6a4a10';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#a8741a';
      ctx.fillRect(-11, -2, 22, 3);
      // 봉우리 끝 진주
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of [
        [-12, -9],
        [-4, -13],
        [4, -13],
        [12, -9],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, TAU);
        ctx.fill();
      }
      // 보석
      for (const [x, c] of [
        [-6, '#3a6aff'],
        [0, pal.accent2],
        [6, '#2ad86a'],
      ] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x, -0.5, 1.8, 1.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x - 0.5, -1, 0.5, 0, TAU);
        ctx.fill();
      }
      const tw = (Math.sin(p.t * 3) + 1) / 2;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, -4 + tw * 8, -10, 4, '#ffffff', 0.7);
      ctx.restore();
      break;
    }
    case 'fire': {
      // 청염 갈기 — 머리 위로 타오르는 푸른 불꽃 + 남색 머리띠
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ph = p.t * 14 + i * 1.9;
        const x = hx - 9 + i * 4.5;
        const h = 10 + Math.sin(ph) * 3 + (i === 2 ? 5 : 0);
        const g = ctx.createLinearGradient(x, hy - r + 2, x, hy - r - h - 4);
        g.addColorStop(0, 'rgba(154,240,255,0.95)');
        g.addColorStop(0.5, 'rgba(58,138,255,0.85)');
        g.addColorStop(1, 'rgba(40,60,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 4, hy - r + 4);
        ctx.quadraticCurveTo(
          x - 3 + Math.sin(ph) * 2,
          hy - r - h * 0.5,
          x - 2 + Math.sin(ph) * 3,
          hy - r - h,
        );
        ctx.quadraticCurveTo(x + 4, hy - r - h * 0.4, x + 4, hy - r + 4);
        ctx.closePath();
        ctx.fill();
      }
      drawGlow(ctx, hx, hy - r - 2, 14, '#3a8aff', 0.5);
      ctx.restore();
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 0.6, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineTo(hx + r - 1, hy - 4.5);
      ctx.lineTo(hx - r + 1, hy - 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 0.6, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineTo(hx + r - 1, hy - 4.5);
      ctx.lineTo(hx - r + 1, hy - 4.5);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = pal.furDark;
      ctx.fillRect(hx - r, hy - 8, r * 2, 4);
      ctx.restore();
      ctx.fillStyle = '#bff4ff';
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy - 10);
      ctx.lineTo(hx + 6, hy - 7.5);
      ctx.lineTo(hx + 4, hy - 5);
      ctx.lineTo(hx + 2, hy - 7.5);
      ctx.closePath();
      ctx.fill();
      // 휘날리는 끈 (끝에 청염)
      const w = Math.sin(p.t * 12) * 3;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(hx - r + 1, hy - 6);
      ctx.lineTo(hx - r - 10, hy - 3 + w);
      ctx.lineTo(hx - r - 5, hy + 1 + w);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, hx - r - 9, hy - 2 + w, 6, '#5aa8ff', 0.8);
      ctx.restore();
      break;
    }
    case 'cheese': {
      // 어부 벙거지 모자 — 흰 바탕 + 파란 띠 + 물고기 배지
      const g = ctx.createLinearGradient(hx, hy - r - 6, hx, hy - 4);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#cfdcea');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hx - r - 5, hy - 4);
      ctx.quadraticCurveTo(hx, hy - 1, hx + r + 6, hy - 4);
      ctx.lineTo(hx + r - 1, hy - 8);
      ctx.quadraticCurveTo(hx + r - 2, hy - r - 6, hx, hy - r - 6);
      ctx.quadraticCurveTo(hx - r + 2, hy - r - 6, hx - r + 1, hy - 8);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1.1);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(hx - r + 0.6, hy - 9.5);
      ctx.quadraticCurveTo(hx, hy - 7, hx + r - 0.6, hy - 9.5);
      ctx.lineTo(hx + r - 1.2, hy - 12.5);
      ctx.quadraticCurveTo(hx, hy - 10, hx - r + 1.2, hy - 12.5);
      ctx.closePath();
      ctx.fill();
      fishBadge(ctx, hx + 4, hy - 15.5, 1.8, pal.accent2);
      // 냉기 반짝임
      const tw = (Math.sin(p.t * 4) + 1) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, hx - 6 + tw * 12, hy - r - 3, 4, '#ffffff', 0.6);
      ctx.restore();
      break;
    }
    case 'cyber': {
      // 슈프림 — 금테 바이저 + 머리 위 빛의 고리
      if (p.pose !== 'dead') {
        const hg = ctx.createLinearGradient(hx - 2, hy - 7, hx + r + 3, hy + 1);
        hg.addColorStop(0, 'rgba(40,10,60,0.9)');
        hg.addColorStop(1, 'rgba(90,30,120,0.9)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(hx - 2, hy - 7);
        ctx.lineTo(hx + r + 3, hy - 6);
        ctx.lineTo(hx + r + 2, hy + 1);
        ctx.lineTo(hx - 2, hy + 1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const scan = (Math.sin(p.t * 5) + 1) / 2;
        const hue = (p.t * 140) % 360;
        ctx.fillStyle = `hsla(${hue},100%,70%,0.9)`;
        ctx.fillRect(hx, hy - 4, r + 1, 2);
        drawGlow(ctx, hx + 2 + scan * (r - 2), hy - 3, 7, '#7afff0', 0.9);
        ctx.restore();
      }
      // 빛의 고리
      ctx.save();
      const bob = Math.sin(p.t * 3) * 1.2;
      ctx.translate(hx - 1, hy - r - 9 + bob);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, 16, '#ffd34a', 0.4);
      ctx.strokeStyle = 'rgba(255,230,120,0.95)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 2.8, -0.12, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

/* ---------------- 각성 폼 무기 ---------------- */

function drawUpgradedWeapon(ctx: CanvasRenderingContext2D, p: CatPose, pal: Palette) {
  switch (p.form) {
    case 'ninja': {
      // 대태도 — 진홍 손잡이 감개 + 둥근 금 코등이 + 물결 칼날무늬
      ctx.fillStyle = '#1a0c10';
      ctx.fillRect(-9, -2, 12, 4);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.1;
      for (let x = -8; x < 2; x += 2.6) {
        ctx.beginPath();
        ctx.moveTo(x, -2);
        ctx.lineTo(x + 1.6, 2);
        ctx.moveTo(x + 1.6, -2);
        ctx.lineTo(x, 2);
        ctx.stroke();
      }
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.ellipse(4, 0, 1.8, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#6a4010';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -2.4, 0, 2.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, pal.blade);
      g.addColorStop(1, '#5a6280');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(5.8, -2);
      ctx.quadraticCurveTo(30, -3.2, 48, -2.8);
      ctx.lineTo(54, -0.4);
      ctx.quadraticCurveTo(30, 1.6, 5.8, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = 8; x < 48; x += 4) {
        ctx.lineTo(x, -0.6 + (Math.floor(x / 4) % 2 ? 0.7 : -0.3));
      }
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 30, -1, 10, '#ff7aa8', 0.35);
      ctx.restore();
      break;
    }
    case 'knight': {
      // 왕검 — 황금 대검 + 루비 코등이 + 빛나는 룬
      ctx.fillStyle = '#5a1a1a';
      ctx.fillRect(-10, -2.2, 12, 4.4);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(-10.5, 0, 2.6, 0, TAU);
      ctx.fill();
      const cg = ctx.createLinearGradient(0, -11, 0, 11);
      cg.addColorStop(0, '#fff6c0');
      cg.addColorStop(0.5, pal.accent);
      cg.addColorStop(1, '#9a6a12');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(1, -11);
      ctx.quadraticCurveTo(5, -6, 4.5, 0);
      ctx.quadraticCurveTo(5, 6, 1, 11);
      ctx.lineTo(4, 11);
      ctx.quadraticCurveTo(8, 5, 7.5, 0);
      ctx.quadraticCurveTo(8, -5, 4, -11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6a4a10';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 36, 0, 22, '#ffe98a', 0.45);
      ctx.restore();
      const g = ctx.createLinearGradient(0, -6, 0, 6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, pal.blade);
      g.addColorStop(1, '#c8a860');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(7.5, -6);
      ctx.lineTo(60, -5);
      ctx.lineTo(70, 0);
      ctx.lineTo(60, 5);
      ctx.lineTo(7.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a8862a';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // 홈 + 룬
      ctx.strokeStyle = 'rgba(168,134,42,0.7)';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(56, 0);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + Math.sin(p.t * 5) * 0.3;
      ctx.fillStyle = `rgba(255,220,110,${pulse})`;
      for (const x of [16, 26, 36, 46]) {
        ctx.beginPath();
        ctx.moveTo(x, -2.6);
        ctx.lineTo(x + 2, 0);
        ctx.lineTo(x, 2.6);
        ctx.lineTo(x - 2, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.arc(5, 0, 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(4.3, -0.8, 0.8, 0, TAU);
      ctx.fill();
      break;
    }
    case 'fire': {
      // 청염검 — 푸른 불꽃이 칼날을 감싼다
      ctx.fillStyle = '#10142a';
      ctx.fillRect(-7, -2, 9, 4);
      ctx.fillStyle = pal.accent2;
      ctx.beginPath();
      ctx.moveTo(2, -5);
      ctx.lineTo(5, -2);
      ctx.lineTo(5, 2);
      ctx.lineTo(2, 5);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const fl = Math.sin(p.t * 22 + i * 1.3) * 1.8;
        drawGlow(ctx, 9 + i * 6.5, fl, 9 - i * 0.6, i % 2 ? '#9af0ff' : '#2a6aff', 0.8);
      }
      // 칼날 위로 너울대는 불꽃 혀
      ctx.fillStyle = 'rgba(120,200,255,0.55)';
      for (let i = 0; i < 4; i++) {
        const x = 12 + i * 10;
        const h = 6 + Math.sin(p.t * 16 + i * 2) * 2.5;
        ctx.beginPath();
        ctx.moveTo(x - 3, -1);
        ctx.quadraticCurveTo(x - 4, -h * 0.6, x - 5, -h);
        ctx.quadraticCurveTo(x + 2, -h * 0.5, x + 3, -1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = pal.bladeEdge;
      ctx.beginPath();
      ctx.moveTo(5, -1.8);
      ctx.lineTo(44, -1);
      ctx.lineTo(49, 0.5);
      ctx.lineTo(5, 1.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheese': {
      // 냉동 참치 — 꼬리를 쥐고 휘두른다 (푸른 등 · 은빛 배 · 서리)
      ctx.save();
      ctx.translate(2, 0);
      // 꼬리 지느러미 (손잡이 쪽)
      ctx.fillStyle = '#2a5a9a';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-9, -7);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-9, 7);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1);
      // 몸통
      const g = ctx.createLinearGradient(0, -12, 0, 12);
      g.addColorStop(0, '#1a3a7a');
      g.addColorStop(0.42, '#3a7ad8');
      g.addColorStop(0.55, '#d8e8f4');
      g.addColorStop(1, '#a8bccc');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.quadraticCurveTo(14, -13, 34, -11);
      ctx.quadraticCurveTo(48, -8, 50, 0);
      ctx.quadraticCurveTo(48, 8, 34, 11);
      ctx.quadraticCurveTo(14, 13, 0, 1.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, pal, 1.2);
      // 등지느러미 · 작은 토막 지느러미
      ctx.fillStyle = '#ffd84a';
      for (const x of [8, 12, 16]) {
        ctx.beginPath();
        ctx.moveTo(x, -6.5);
        ctx.lineTo(x + 1.5, -9.5);
        ctx.lineTo(x + 3, -7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#1a3a7a';
      ctx.beginPath();
      ctx.moveTo(22, -11);
      ctx.lineTo(28, -17);
      ctx.lineTo(32, -11);
      ctx.closePath();
      ctx.fill();
      // 아가미 · 눈 · 입
      ctx.strokeStyle = 'rgba(16,40,80,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(38, 0, 7, -1.1, 1.1);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(43.5, -3, 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a1020';
      ctx.beginPath();
      ctx.arc(44, -3, 1.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#0a1020';
      ctx.beginPath();
      ctx.moveTo(50, 1);
      ctx.lineTo(46, 2.5);
      ctx.stroke();
      // 은빛 측선 + 서리
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(20, -1.5, 34, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const tw = (Math.sin(p.t * 5) + 1) / 2;
      drawGlow(ctx, 12 + tw * 26, -6, 5, '#ffffff', 0.7);
      drawGlow(ctx, 26, 4, 14, '#9ae8ff', 0.3);
      ctx.restore();
      break;
    }
    case 'cyber': {
      // 프리즘 클로 — 금장 건틀릿 + 무지개빛 발톱 다섯
      const gg = ctx.createLinearGradient(-4, -5, 6, 5);
      gg.addColorStop(0, '#ffffff');
      gg.addColorStop(1, '#c8b8f0');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(6, -4);
      ctx.lineTo(7, 4);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const base = (p.t * 160) % 360;
      [-5, -2.5, 0, 2.5, 5].forEach((dy, i) => {
        ctx.strokeStyle = `hsla(${(base + i * 50) % 360},100%,70%,0.95)`;
        ctx.beginPath();
        ctx.moveTo(7, dy * 0.8);
        ctx.quadraticCurveTo(17, dy * 1.5, 25, dy * 0.7 + 1);
        ctx.stroke();
      });
      drawGlow(ctx, 16, 0, 14, '#c07aff', 0.5);
      drawGlow(ctx, 22, 0, 8, '#7afff0', 0.5);
      ctx.restore();
      break;
    }
  }
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
  upgraded = false,
) {
  ctx.save();
  ctx.translate(x, y);
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
  bg.addColorStop(0, upgraded ? '#4a2a5a' : '#2c2f4a');
  bg.addColorStop(1, upgraded ? '#1a0e24' : '#141626');
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
  if (upgraded) {
    // 각성 표시 — 금테 + 별
    ctx.strokeStyle = '#ffd34a';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();
    ctx.translate(r * 0.62, -r * 0.62);
    const sr = Math.max(4, r * 0.32);
    ctx.fillStyle = '#ffd34a';
    ctx.strokeStyle = '#6a4010';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? sr * 0.45 : sr;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
