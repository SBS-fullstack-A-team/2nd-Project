/**
 * 탐험가 캐릭터 그리기 — 러너 게임답게 "뒤에서 본 모습" 으로 그린다.
 * 관절(엉덩이-무릎-발, 어깨-팔꿈치-손)을 계산해서 팔다리가 굽혀지며 달리고,
 * 발을 뒤로 차올릴 때는 부츠 밑창이 보인다.
 *
 * 좌표 단위 u = 월드 1m 의 픽셀 크기. (x, feetY) = 두 발 사이 바닥 지점.
 */

const C = {
  outline: 'rgba(22, 13, 6, 0.9)',
  skin: '#e2ae84',
  skinShade: '#b9835b',
  hair: '#3a2718',
  shirt: '#cdb88c',
  shirtShade: '#9c8660',
  shirtLight: '#e2d2ab',
  pants: '#5e4c37',
  pantsShade: '#43362a',
  boot: '#3d2a1b',
  sole: '#1c130c',
  belt: '#2e2015',
  buckle: '#c9a44a',
  pack: '#7d5b39',
  packShade: '#5a3f27',
  packFlap: '#946c45',
  roll: '#8e3a2a',
  rollShade: '#6a2a1e',
  strap: '#2e2015',
  hat: '#8a6036',
  hatShade: '#664424',
  hatBand: '#2e2015',
};

export type Pose = 'run' | 'jump' | 'slide' | 'fallen';

export interface CharacterState {
  pose: Pose;
  /** 달리기 주기 위상 (라디안) */
  phase: number;
  /** 레인 이동 중 몸 기울기 (라디안, + 는 오른쪽으로 기울어짐) */
  tilt: number;
  /** 잡힌 뒤 지난 시간(초) — 모자가 날아가는 연출용 */
  fallenT: number;
}

interface Pt {
  x: number;
  y: number;
}

/** 두 마디로 된 팔다리 — 외곽선을 먼저 굵게 칠하고 그 위에 색을 칠한다 */
function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt, width: number, color: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = width + Math.max(1.5, width * 0.22);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function outlineFill(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, lw: number) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 부츠 — 발을 차올린 정도(kick)가 클수록 밑창이 크게 보인다 */
function boot(ctx: CanvasRenderingContext2D, p: Pt, u: number, kick: number, lw: number) {
  const w = u * 0.12;
  const h = u * 0.095;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
  outlineFill(ctx, C.boot, lw);
  if (kick > 0.15) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + h * 0.15, w * 0.8, h * 0.75 * kick, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.sole;
    ctx.fill();
  }
}

interface Skeleton {
  hipY: number;
  shoulderY: number;
  legs: { hip: Pt; knee: Pt; foot: Pt; kick: number }[];
  arms: { shoulder: Pt; elbow: Pt; hand: Pt }[];
}

function runSkeleton(x: number, feetY: number, u: number, phase: number): Skeleton {
  // 한 걸음마다 몸이 살짝 튀어 오른다
  const bob = Math.abs(Math.cos(phase)) * u * 0.045;
  const hipY = feetY - u * 0.72 - bob;
  const shoulderY = hipY - u * 0.6;
  const legs = [-1, 1].map((side, k) => {
    const s = Math.sin(phase + k * Math.PI);
    const hip = { x: x + side * u * 0.095, y: hipY };
    if (s >= 0) {
      // 뒤로 차올리는 다리 — 무릎이 살짝 들리고 발뒤꿈치가 엉덩이 쪽으로 올라온다
      const knee = { x: hip.x + side * u * 0.03, y: hipY + u * (0.34 - s * 0.09) };
      const foot = { x: hip.x + side * u * 0.045, y: knee.y + u * (0.34 - s * 0.46) };
      return { hip, knee, foot, kick: s };
    }
    // 땅을 딛는 다리
    const c = -s;
    const knee = { x: hip.x + side * u * 0.02, y: hipY + u * (0.36 - c * 0.02) };
    const foot = { x: hip.x + side * u * 0.015, y: feetY - bob * 0.2 };
    return { hip, knee, foot, kick: 0 };
  });
  const arms = [-1, 1].map((side, k) => {
    // 팔은 같은 쪽 다리와 반대로 흔든다
    const a = Math.sin(phase + k * Math.PI + Math.PI);
    const shoulder = { x: x + side * u * 0.175, y: shoulderY + u * 0.05 };
    const elbow = { x: shoulder.x + side * u * 0.07, y: shoulder.y + u * (0.25 - a * 0.06) };
    const hand = { x: elbow.x - side * u * 0.01, y: elbow.y + u * (0.2 - Math.max(0, a) * 0.3) };
    return { shoulder, elbow, hand };
  });
  return { hipY, shoulderY, legs, arms };
}

function jumpSkeleton(x: number, feetY: number, u: number): Skeleton {
  const hipY = feetY - u * 0.58;
  const shoulderY = hipY - u * 0.6;
  const legs = [-1, 1].map((side) => {
    const hip = { x: x + side * u * 0.085, y: hipY };
    const knee = { x: hip.x + side * u * 0.08, y: hipY + u * 0.26 };
    const foot = { x: knee.x - side * u * 0.02, y: knee.y + u * 0.14 };
    return { hip, knee, foot, kick: 0.7 };
  });
  const arms = [-1, 1].map((side) => {
    const shoulder = { x: x + side * u * 0.175, y: shoulderY + u * 0.05 };
    const elbow = { x: shoulder.x + side * u * 0.16, y: shoulder.y - u * 0.02 };
    const hand = { x: elbow.x + side * u * 0.06, y: elbow.y - u * 0.17 };
    return { shoulder, elbow, hand };
  });
  return { hipY, shoulderY, legs, arms };
}

/** 몸통 · 배낭 · 머리 · 모자 (다리 위에 그린다) */
function drawUpperBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  hipY: number,
  shoulderY: number,
  u: number,
  lw: number,
  hat: boolean,
) {
  // 엉덩이(바지 윗부분)
  roundRectPath(ctx, x - u * 0.175, hipY - u * 0.08, u * 0.35, u * 0.17, u * 0.05);
  outlineFill(ctx, C.pants, lw);

  // 셔츠 — 어깨가 넓고 허리로 갈수록 좁아지는 몸통, 한쪽에 그늘
  const shirt = ctx.createLinearGradient(x - u * 0.2, 0, x + u * 0.2, 0);
  shirt.addColorStop(0, C.shirtLight);
  shirt.addColorStop(0.55, C.shirt);
  shirt.addColorStop(1, C.shirtShade);
  ctx.beginPath();
  ctx.moveTo(x - u * 0.2, shoulderY + u * 0.04);
  ctx.quadraticCurveTo(x - u * 0.21, shoulderY - u * 0.02, x - u * 0.12, shoulderY - u * 0.03);
  ctx.lineTo(x + u * 0.12, shoulderY - u * 0.03);
  ctx.quadraticCurveTo(x + u * 0.21, shoulderY - u * 0.02, x + u * 0.2, shoulderY + u * 0.04);
  ctx.lineTo(x + u * 0.17, hipY - u * 0.05);
  ctx.lineTo(x - u * 0.17, hipY - u * 0.05);
  ctx.closePath();
  outlineFill(ctx, shirt, lw);

  // 벨트 · 버클은 뒤라 안 보이고 벨트 고리만
  ctx.fillStyle = C.belt;
  ctx.fillRect(x - u * 0.17, hipY - u * 0.075, u * 0.34, u * 0.045);
  ctx.fillStyle = C.buckle;
  ctx.fillRect(x - u * 0.012, hipY - u * 0.07, u * 0.024, u * 0.035);

  // 배낭
  const packTop = shoulderY + u * 0.07;
  const packH = u * 0.36;
  roundRectPath(ctx, x - u * 0.125, packTop, u * 0.25, packH, u * 0.05);
  const pack = ctx.createLinearGradient(x - u * 0.125, 0, x + u * 0.125, 0);
  pack.addColorStop(0, C.packFlap);
  pack.addColorStop(0.6, C.pack);
  pack.addColorStop(1, C.packShade);
  outlineFill(ctx, pack, lw);
  // 덮개 · 주머니
  roundRectPath(ctx, x - u * 0.125, packTop, u * 0.25, packH * 0.34, u * 0.05);
  outlineFill(ctx, C.packFlap, lw * 0.8);
  roundRectPath(ctx, x - u * 0.07, packTop + packH * 0.52, u * 0.14, packH * 0.34, u * 0.03);
  outlineFill(ctx, C.packShade, lw * 0.7);
  // 어깨끈
  ctx.strokeStyle = C.strap;
  ctx.lineWidth = u * 0.03;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * u * 0.1, packTop + u * 0.02);
    ctx.quadraticCurveTo(
      x + side * u * 0.15,
      shoulderY - u * 0.02,
      x + side * u * 0.07,
      shoulderY - u * 0.03,
    );
    ctx.stroke();
  }
  // 배낭 위 담요 롤
  roundRectPath(ctx, x - u * 0.16, packTop - u * 0.06, u * 0.32, u * 0.09, u * 0.045);
  const roll = ctx.createLinearGradient(0, packTop - u * 0.06, 0, packTop + u * 0.03);
  roll.addColorStop(0, C.roll);
  roll.addColorStop(1, C.rollShade);
  outlineFill(ctx, roll, lw * 0.8);
  ctx.fillStyle = C.strap;
  ctx.fillRect(x - u * 0.09, packTop - u * 0.06, u * 0.025, u * 0.09);
  ctx.fillRect(x + u * 0.065, packTop - u * 0.06, u * 0.025, u * 0.09);

  // 목 · 머리(뒤통수) · 귀
  const headY = shoulderY - u * 0.15;
  const headR = u * 0.115;
  ctx.fillStyle = C.skinShade;
  ctx.fillRect(x - u * 0.045, shoulderY - u * 0.09, u * 0.09, u * 0.08);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      x + side * headR * 0.98,
      headY + u * 0.01,
      headR * 0.22,
      headR * 0.32,
      0,
      0,
      Math.PI * 2,
    );
    outlineFill(ctx, C.skin, lw * 0.7);
  }
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  outlineFill(ctx, C.hair, lw);

  if (hat) drawHat(ctx, x, headY - headR * 0.35, u, lw);
}

/** 챙 넓은 탐험가 모자 — 뒤에서 살짝 내려다본 모습 */
function drawHat(ctx: CanvasRenderingContext2D, x: number, brimY: number, u: number, lw: number) {
  ctx.beginPath();
  ctx.ellipse(x, brimY, u * 0.2, u * 0.055, 0, 0, Math.PI * 2);
  outlineFill(ctx, C.hatShade, lw);
  // 윗부분(크라운) — 가운데가 살짝 눌린 모양
  ctx.beginPath();
  ctx.moveTo(x - u * 0.105, brimY);
  ctx.quadraticCurveTo(x - u * 0.115, brimY - u * 0.1, x - u * 0.07, brimY - u * 0.13);
  ctx.quadraticCurveTo(x, brimY - u * 0.105, x + u * 0.07, brimY - u * 0.13);
  ctx.quadraticCurveTo(x + u * 0.115, brimY - u * 0.1, x + u * 0.105, brimY);
  ctx.closePath();
  const crown = ctx.createLinearGradient(x - u * 0.11, 0, x + u * 0.11, 0);
  crown.addColorStop(0, C.hat);
  crown.addColorStop(1, C.hatShade);
  outlineFill(ctx, crown, lw);
  ctx.fillStyle = C.hatBand;
  ctx.fillRect(x - u * 0.107, brimY - u * 0.035, u * 0.214, u * 0.03);
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  x: number,
  sk: Skeleton,
  u: number,
  lw: number,
) {
  // 다리 (허벅지·정강이는 바지, 끝에 부츠)
  for (const leg of sk.legs) {
    limb(ctx, leg.hip, leg.knee, leg.foot, u * 0.15, C.pants);
    boot(ctx, leg.foot, u, leg.kick, lw);
  }
  // 팔 — 소매(윗팔)는 셔츠색, 아래팔·손은 맨살
  for (const arm of sk.arms) {
    limb(ctx, arm.shoulder, arm.elbow, arm.elbow, u * 0.115, C.shirtShade);
    limb(ctx, arm.elbow, arm.elbow, arm.hand, u * 0.085, C.skin);
    ctx.beginPath();
    ctx.arc(arm.hand.x, arm.hand.y, u * 0.045, 0, Math.PI * 2);
    outlineFill(ctx, C.skin, lw * 0.8);
  }
  drawUpperBody(ctx, x, sk.hipY, sk.shoulderY, u, lw, true);
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  u: number,
  s: CharacterState,
) {
  const lw = Math.max(1, u * 0.018);
  ctx.save();
  // 발을 축으로 몸을 기울인다
  ctx.translate(x, feetY);
  ctx.rotate(s.tilt);
  ctx.translate(-x, -feetY);

  if (s.pose === 'run') {
    drawSkeleton(ctx, x, runSkeleton(x, feetY, u, s.phase), u, lw);
  } else if (s.pose === 'jump') {
    drawSkeleton(ctx, x, jumpSkeleton(x, feetY, u), u, lw);
  } else if (s.pose === 'slide') {
    drawSlide(ctx, x, feetY, u, lw);
  } else {
    drawFallen(ctx, x, feetY, u, lw, s.fallenT);
  }
  ctx.restore();
}

/** 슬라이드 — 발을 앞으로 뻗고 뒤로 누워 미끄러진다. 뒤에서 보면 낮게 깔린 등과 모자만 보인다 */
function drawSlide(ctx: CanvasRenderingContext2D, x: number, feetY: number, u: number, lw: number) {
  // 바닥을 짚은 두 팔
  for (const side of [-1, 1]) {
    const shoulder = { x: x + side * u * 0.17, y: feetY - u * 0.34 };
    const elbow = { x: x + side * u * 0.3, y: feetY - u * 0.18 };
    const hand = { x: x + side * u * 0.36, y: feetY - u * 0.03 };
    limb(ctx, shoulder, elbow, elbow, u * 0.1, C.shirtShade);
    limb(ctx, elbow, elbow, hand, u * 0.075, C.skin);
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, u * 0.045, 0, Math.PI * 2);
    outlineFill(ctx, C.skin, lw * 0.8);
  }
  // 뒤로 젖힌 상체를 세로로 눌러서 그린다
  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(1.05, 0.52);
  ctx.translate(-x, -feetY);
  drawUpperBody(ctx, x, feetY - u * 0.05, feetY - u * 0.62, u, lw * 1.6, false);
  ctx.restore();
  drawHat(ctx, x, feetY - u * 0.44, u, lw);
  // 튀는 흙먼지
  ctx.fillStyle = 'rgba(160, 140, 110, 0.55)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * u * 0.25, feetY + u * 0.01, u * 0.12, u * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 앞으로 엎어진 모습 — 멀어지는 쪽으로 대자로 뻗어 있어서, 뒤에서 보면 납작하게 눌린 몸과
 * 크게 보이는 부츠 밑창, 벌린 팔다리가 보인다. 모자는 옆으로 날아간다.
 */
function drawFallen(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  u: number,
  lw: number,
  t: number,
) {
  // 넘어지면서 이는 흙먼지
  const dust = Math.min(1, t / 0.5);
  ctx.fillStyle = `rgba(170, 150, 118, ${0.5 * (1 - dust * 0.6)})`;
  ctx.beginPath();
  ctx.ellipse(
    x,
    feetY - u * 0.12,
    u * (0.5 + dust * 0.35),
    u * (0.14 + dust * 0.06),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const flat = 0.3;
  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(1, flat);
  ctx.translate(-x, -feetY);
  // 앞쪽 비스듬히 벌린 팔
  for (const side of [-1, 1]) {
    const shoulder = { x: x + side * u * 0.17, y: feetY - u * 1.3 };
    const elbow = { x: x + side * u * 0.42, y: feetY - u * 1.48 };
    const hand = { x: x + side * u * 0.56, y: feetY - u * 1.75 };
    limb(ctx, shoulder, elbow, elbow, u * 0.115, C.shirtShade);
    limb(ctx, elbow, elbow, hand, u * 0.085, C.skin);
  }
  // 벌어진 다리
  for (const side of [-1, 1]) {
    const hip = { x: x + side * u * 0.095, y: feetY - u * 0.72 };
    const knee = { x: x + side * u * 0.2, y: feetY - u * 0.36 };
    const foot = { x: x + side * u * 0.27, y: feetY - u * 0.04 };
    limb(ctx, hip, knee, foot, u * 0.15, C.pants);
  }
  drawUpperBody(ctx, x, feetY - u * 0.72, feetY - u * 1.32, u, lw / flat, false);
  ctx.restore();
  // 밑창이 보이는 부츠 (눌리지 않게 따로 그린다)
  for (const side of [-1, 1]) {
    boot(ctx, { x: x + side * u * 0.27, y: feetY - u * 0.02 }, u, 1, lw);
  }

  // 날아간 모자 — 포물선을 그리며 옆 바닥에 떨어진다
  const p = Math.min(1, t / 0.6);
  const hx = x + u * (0.3 + p * 0.4);
  const hy = feetY - u * 0.45 - u * 0.5 * Math.sin(p * Math.PI) + p * u * 0.35;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(p * 2.6);
  drawHat(ctx, 0, 0, u, lw);
  ctx.restore();
}
