import { ITEMS, JUMP_HEIGHT, PERSPECTIVE, SPAWN_DISTANCE } from './config';
import { drawCharacter, type Pose } from './character';
import {
  isSliding,
  jumpHeight,
  type Coin,
  type Debris,
  type Item,
  type Obstacle,
  type RunState,
} from './engine';

/**
 * 유적 탈출 화면 그리기 — 2.5D 원근 투영.
 * 플레이어는 z = 0 평면에 서 있고, z 가 클수록 소실점(지평선) 쪽으로 작아진다.
 */

const COLORS = {
  skyTop: '#1d2b3a',
  skyMid: '#7a4b5a',
  skyLow: '#f0a95c',
  sun: '#ffd98a',
  ruin: '#3a2c3a',
  jungleFar: '#1f3b2c',
  jungleNear: '#152a1f',
  stoneA: '#8a7a62',
  stoneB: '#7b6c56',
  stoneEdge: '#4f4436',
  laneLine: 'rgba(40, 30, 20, 0.35)',
  log: '#7a4a26',
  logDark: '#4d2d15',
  logRing: '#c79a63',
  pillar: '#9b9076',
  pillarDark: '#6b624e',
  moss: '#4f7a3a',
  coin: '#ffd23f',
  coinDark: '#c8961a',
  torch: '#ffb347',
  boulder: '#6d655a',
  boulderDark: '#4a443c',
};

export interface View {
  w: number;
  h: number;
  horizonY: number;
  groundY: number;
  laneW: number;
  /** 월드 1단위(m) 높이의 픽셀 크기 (z = 0 기준) */
  unit: number;
}

export function makeView(w: number, h: number): View {
  const horizonY = h * 0.3;
  const groundY = h * 0.84;
  const laneW = Math.min(w * 0.27, h * 0.36);
  return { w, h, horizonY, groundY, laneW, unit: laneW * 0.6 };
}

/** 원근 배율 — z = 0 에서 1, 멀어질수록 0 에 가까워진다 */
function scaleAt(z: number): number {
  return PERSPECTIVE / (z + PERSPECTIVE);
}

function project(v: View, laneX: number, z: number): { x: number; y: number; s: number } {
  const s = scaleAt(z);
  return {
    x: v.w / 2 + laneX * v.laneW * s,
    y: v.horizonY + (v.groundY - v.horizonY) * s,
    s,
  };
}

/** 멀수록 안개처럼 흐려지는 투명도 */
function fogAlpha(z: number): number {
  return Math.max(0, Math.min(1, (SPAWN_DISTANCE - z) / 18));
}

export interface FrameInfo {
  /** 애니메이션용 누적 시간(초) — 일시정지 중에는 멈춘다 */
  t: number;
  /** 붙잡힌 뒤 지난 시간(초), 아직이면 null */
  caughtT: number | null;
}

export function drawFrame(ctx: CanvasRenderingContext2D, v: View, run: RunState, f: FrameInfo) {
  drawSky(ctx, v);
  drawJungle(ctx, v, run.distance);
  drawRoad(ctx, v, run.distance);
  drawTorches(ctx, v, run.distance, f.t);

  // 먼 것부터 그리고, 플레이어보다 앞(z > 0)과 뒤(z <= 0)를 나눠서 겹침 순서를 맞춘다
  type Drawable = { z: number; draw: () => void };
  const list: Drawable[] = [];
  for (const o of run.obstacles) list.push({ z: o.z, draw: () => drawObstacle(ctx, v, o) });
  for (const c of run.coinList) list.push({ z: c.z, draw: () => drawCoin(ctx, v, c, f.t) });
  for (const it of run.items) list.push({ z: it.z, draw: () => drawItem(ctx, v, it, f.t) });
  for (const d of run.debris) list.push({ z: d.z, draw: () => drawDebris(ctx, v, d) });
  list.sort((a, b) => b.z - a.z);

  if (run.effects.boost > 0) drawSpeedLines(ctx, v, f.t);
  for (const it of list) if (it.z > 0) it.draw();
  drawPlayer(ctx, v, run, f);
  for (const it of list) if (it.z <= 0) it.draw();

  drawBoulder(ctx, v, run, f);
  drawVignette(ctx, v);
  if (run.stumbleT > 0 && f.caughtT === null) drawDanger(ctx, v, run.stumbleT, f.t);
}

// ---------- 배경 ----------

function drawSky(ctx: CanvasRenderingContext2D, v: View) {
  const g = ctx.createLinearGradient(0, 0, 0, v.horizonY);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.6, COLORS.skyMid);
  g.addColorStop(1, COLORS.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.horizonY + 1);

  // 지는 해
  ctx.fillStyle = COLORS.sun;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(v.w * 0.5, v.horizonY - v.h * 0.02, v.h * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 지평선 너머 계단식 신전 실루엣
  ctx.fillStyle = COLORS.ruin;
  const baseW = v.w * 0.34;
  const steps = 5;
  const stepH = v.h * 0.024;
  for (let i = 0; i < steps; i++) {
    const w = baseW * (1 - i * 0.17);
    ctx.fillRect(v.w / 2 - w / 2, v.horizonY - stepH * (i + 1), w, stepH + 1);
  }
  ctx.fillRect(
    v.w / 2 - baseW * 0.07,
    v.horizonY - stepH * (steps + 1.6),
    baseW * 0.14,
    stepH * 1.6,
  );
}

function drawJungle(ctx: CanvasRenderingContext2D, v: View, distance: number) {
  // 먼 숲 — 들쭉날쭉한 나무 윤곽 (거리에 따라 아주 천천히 흐른다)
  ctx.fillStyle = COLORS.jungleFar;
  ctx.fillRect(0, v.horizonY, v.w, v.h - v.horizonY);
  ctx.beginPath();
  ctx.moveTo(0, v.horizonY);
  const bumps = 14;
  const shift = (distance * 0.4) % (v.w / bumps);
  for (let i = -1; i <= bumps + 1; i++) {
    const x = i * (v.w / bumps) - shift;
    const center = Math.abs(x - v.w / 2) < v.w * 0.2;
    const hgt = center ? v.h * 0.01 : v.h * (0.035 + ((i * 37) % 5) * 0.008);
    ctx.quadraticCurveTo(x - v.w / bumps / 2, v.horizonY - hgt * 2, x, v.horizonY - hgt * 0.4);
  }
  ctx.lineTo(v.w, v.horizonY + 2);
  ctx.lineTo(0, v.horizonY + 2);
  ctx.fill();
}

function drawRoad(ctx: CanvasRenderingContext2D, v: View, distance: number) {
  const edge = 1.62; // 길 가장자리 (레인 폭 단위)
  const far = project(v, 0, SPAWN_DISTANCE + 20);
  const nearZ = -PERSPECTIVE * 0.55;

  // 길 양옆 가까운 수풀
  ctx.fillStyle = COLORS.jungleNear;
  const nl = project(v, -edge, nearZ);
  const nr = project(v, edge, nearZ);
  const fl = project(v, -edge, SPAWN_DISTANCE + 20);
  const fr = project(v, edge, SPAWN_DISTANCE + 20);
  ctx.beginPath();
  ctx.moveTo(0, v.h);
  ctx.lineTo(nl.x, nl.y);
  ctx.lineTo(fl.x, far.y);
  ctx.lineTo(0, v.horizonY + (v.h - v.horizonY) * 0.08);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(v.w, v.h);
  ctx.lineTo(nr.x, nr.y);
  ctx.lineTo(fr.x, far.y);
  ctx.lineTo(v.w, v.horizonY + (v.h - v.horizonY) * 0.08);
  ctx.fill();

  // 돌바닥 — 4m 단위 띠를 번갈아 칠해서 달리는 느낌을 준다
  const tile = 4;
  const offset = distance % tile;
  for (let z = SPAWN_DISTANCE + 20 - offset; z > nearZ; z -= tile) {
    const z2 = Math.max(nearZ, z - tile);
    const a = project(v, -edge, z);
    const b = project(v, edge, z);
    const c = project(v, edge, z2);
    const d = project(v, -edge, z2);
    const idx = Math.floor((z + distance) / tile);
    ctx.fillStyle = idx % 2 === 0 ? COLORS.stoneA : COLORS.stoneB;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.fill();
  }

  // 레인 구분선 · 길 가장자리
  ctx.strokeStyle = COLORS.laneLine;
  ctx.lineWidth = 2;
  for (const lx of [-0.5, 0.5]) {
    const a = project(v, lx, SPAWN_DISTANCE + 20);
    const b = project(v, lx, nearZ);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.strokeStyle = COLORS.stoneEdge;
  ctx.lineWidth = 4;
  for (const lx of [-edge, edge]) {
    const a = project(v, lx, SPAWN_DISTANCE + 20);
    const b = project(v, lx, nearZ);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // 지평선 쪽 안개
  const fog = ctx.createLinearGradient(
    0,
    v.horizonY,
    0,
    v.horizonY + (v.groundY - v.horizonY) * 0.25,
  );
  fog.addColorStop(0, 'rgba(240, 169, 92, 0.55)');
  fog.addColorStop(1, 'rgba(240, 169, 92, 0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, v.horizonY, v.w, (v.groundY - v.horizonY) * 0.25);
}

/** 길 양옆 횃불 기둥 — 일정 간격으로 흘러가며 속도감을 준다 */
function drawTorches(ctx: CanvasRenderingContext2D, v: View, distance: number, t: number) {
  const gap = 14;
  const offset = distance % gap;
  for (let z = SPAWN_DISTANCE - offset; z > -4; z -= gap) {
    for (const side of [-1.9, 1.9]) {
      const p = project(v, side, z);
      const alpha = fogAlpha(z);
      if (alpha <= 0) continue;
      const w = v.unit * 0.22 * p.s;
      const h = v.unit * 1.9 * p.s;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.pillarDark;
      ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      // 흔들리는 불꽃
      const flicker = 1 + Math.sin(t * 18 + z) * 0.12;
      ctx.fillStyle = COLORS.torch;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - h - w * 0.6, w * 0.55 * flicker, w * 0.9 * flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- 장애물 · 동전 ----------

function drawObstacle(ctx: CanvasRenderingContext2D, v: View, o: Obstacle) {
  const p = project(v, o.lane, o.z);
  const alpha = fogAlpha(o.z);
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const laneW = v.laneW * p.s;
  const u = v.unit * p.s;

  if (o.kind === 'low') {
    // 쓰러진 통나무
    const w = laneW * 0.92;
    const h = u * 0.5;
    ctx.fillStyle = COLORS.logDark;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillStyle = COLORS.log;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.55);
    ctx.fillStyle = COLORS.logRing;
    ctx.beginPath();
    ctx.ellipse(p.x - w / 2, p.y - h / 2, h * 0.28, h / 2, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + w / 2, p.y - h / 2, h * 0.28, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'high') {
    // 무너진 문 — 양쪽 기둥 위에 걸친 들보. 아래로 미끄러져 지나간다
    const w = laneW * 0.96;
    const postW = laneW * 0.1;
    const beamBottom = u * 0.95;
    const beamH = u * 0.55;
    ctx.fillStyle = COLORS.pillarDark;
    ctx.fillRect(p.x - w / 2, p.y - beamBottom - beamH, postW, beamBottom + beamH);
    ctx.fillRect(p.x + w / 2 - postW, p.y - beamBottom - beamH, postW, beamBottom + beamH);
    ctx.fillStyle = COLORS.pillar;
    ctx.fillRect(p.x - w / 2, p.y - beamBottom - beamH, w, beamH);
    ctx.fillStyle = COLORS.moss;
    ctx.fillRect(p.x - w / 2, p.y - beamBottom - beamH, w, beamH * 0.18);
    // 늘어진 덩굴
    ctx.strokeStyle = COLORS.moss;
    ctx.lineWidth = Math.max(1, u * 0.05);
    for (const k of [-0.25, 0.05, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(p.x + w * k, p.y - beamBottom);
      ctx.lineTo(p.x + w * k, p.y - beamBottom + beamH * 0.45);
      ctx.stroke();
    }
  } else {
    // 돌기둥 — 레인을 통째로 막는다
    const w = laneW * 0.72;
    const h = u * 2.8;
    ctx.fillStyle = COLORS.pillarDark;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillStyle = COLORS.pillar;
    ctx.fillRect(p.x - w / 2, p.y - h, w * 0.7, h);
    // 새겨진 얼굴 문양
    ctx.fillStyle = COLORS.pillarDark;
    ctx.fillRect(p.x - w * 0.28, p.y - h * 0.72, w * 0.16, w * 0.12);
    ctx.fillRect(p.x + w * 0.04, p.y - h * 0.72, w * 0.16, w * 0.12);
    ctx.fillRect(p.x - w * 0.22, p.y - h * 0.55, w * 0.36, w * 0.08);
    ctx.fillStyle = COLORS.moss;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.06);
  }
  ctx.globalAlpha = 1;
}

function drawCoin(ctx: CanvasRenderingContext2D, v: View, c: Coin, t: number) {
  const p = project(v, c.x, c.z);
  const alpha = fogAlpha(c.z);
  if (alpha <= 0) return;
  const r = v.unit * 0.22 * p.s;
  const y = p.y - v.unit * p.s * (0.45 + c.y) + Math.sin(t * 5 + c.z) * r * 0.15;
  // 빙글빙글 도는 느낌 — 가로 폭만 줄였다 늘린다
  const spin = Math.abs(Math.cos(t * 4 + c.z * 0.3));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.coinDark;
  ctx.beginPath();
  ctx.ellipse(p.x, y, r * Math.max(0.25, spin), r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.coin;
  ctx.beginPath();
  ctx.ellipse(p.x, y, r * Math.max(0.15, spin) * 0.72, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------- 플레이어 ----------

function drawPlayer(ctx: CanvasRenderingContext2D, v: View, run: RunState, f: FrameInfo) {
  const base = project(v, run.x, 0);
  const u = v.unit;
  const lift = jumpHeight(run) * u;
  const x = base.x;
  const feet = base.y - lift;

  // 그림자 — 높이 뛸수록 작고 흐리게
  const shadowK = 1 - jumpHeight(run) / (JUMP_HEIGHT * 1.6);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * shadowK})`;
  ctx.beginPath();
  ctx.ellipse(x, base.y, u * 0.38 * shadowK, u * 0.1 * shadowK, 0, 0, Math.PI * 2);
  ctx.fill();

  const caught = f.caughtT !== null;
  const pose: Pose = caught ? 'fallen' : isSliding(run) ? 'slide' : lift > 0 ? 'jump' : 'run';
  // 비틀거린 직후에는 몸이 휘청거린다
  const wobble = !caught && run.slowT > 0 ? Math.sin(f.t * 32) * 0.22 * (run.slowT / 0.8) : 0;
  // 무적(부스트 끝·방패 깨진 직후)일 때는 깜빡인다
  const blink = !caught && run.invulnT > 0 && run.effects.boost === 0 && Math.sin(f.t * 40) > 0.3;

  if (!caught && run.effects.boost > 0) drawBoostGlow(ctx, x, feet, u, f.t);
  if (!caught && run.effects.magnet > 0) drawMagnetAura(ctx, x, base.y, u, f.t);

  if (blink) ctx.globalAlpha = 0.45;
  drawCharacter(ctx, x, feet, u, {
    pose,
    // 달린 거리에 맞춰 보폭이 돌아가서 빨라질수록 다리도 빨라진다
    phase: run.distance * 0.55,
    // 레인을 옮기는 쪽으로 몸을 기울인다
    tilt: (run.lane - run.x) * 0.35 + wobble,
    fallenT: f.caughtT ?? 0,
  });
  ctx.globalAlpha = 1;

  if (!caught && run.effects.shield > 0) {
    // 끝나기 2초 전부터 깜빡여서 곧 사라진다는 걸 알린다
    const ending = run.effects.shield < 2 && Math.sin(f.t * 20) < 0;
    if (!ending) drawShieldBubble(ctx, x, feet, u, f.t);
  }
}

// ---------- 아이템 · 효과 ----------

/** 아이템 — 빛나는 원판 위에 아이콘. 위아래로 둥실거린다 */
function drawItem(ctx: CanvasRenderingContext2D, v: View, it: Item, t: number) {
  const p = project(v, it.lane, it.z);
  const alpha = fogAlpha(it.z);
  if (alpha <= 0) return;
  const info = ITEMS[it.kind];
  const r = v.unit * 0.42 * p.s;
  const y = p.y - v.unit * p.s * 0.85 + Math.sin(t * 4 + it.z) * r * 0.2;
  ctx.globalAlpha = alpha;
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 0.8, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // 후광
  const glow = ctx.createRadialGradient(p.x, y, r * 0.3, p.x, y, r * 1.7);
  glow.addColorStop(0, info.color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = alpha * (0.55 + Math.sin(t * 6) * 0.15);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, y, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  // 원판
  ctx.fillStyle = '#fff8e6';
  ctx.strokeStyle = info.color;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.arc(p.x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawItemIcon(ctx, it.kind, p.x, y, r * 0.62);
  ctx.globalAlpha = 1;
}

/** 아이콘은 이모지 대신 도형으로 그린다 (OS마다 이모지 모양·크기가 달라서) */
function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  kind: Item['kind'],
  x: number,
  y: number,
  r: number,
) {
  const color = ITEMS[kind].color;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'magnet') {
    // 말굽자석 — 빨간 몸통에 은색 끝
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.05, r * 0.55, Math.PI, 0, true);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y - r * 0.05);
    ctx.lineTo(x - r * 0.55, y - r * 0.5);
    ctx.moveTo(x + r * 0.55, y - r * 0.05);
    ctx.lineTo(x + r * 0.55, y - r * 0.5);
    ctx.stroke();
  } else if (kind === 'shield') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.85);
    ctx.lineTo(x + r * 0.7, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.65, y + r * 0.45, x, y + r * 0.9);
    ctx.quadraticCurveTo(x - r * 0.65, y + r * 0.45, x - r * 0.7, y - r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(x - r * 0.08, y - r * 0.6, r * 0.16, r * 1.1);
  } else if (kind === 'boost') {
    // 번개
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.2, y - r * 0.95);
    ctx.lineTo(x - r * 0.5, y + r * 0.1);
    ctx.lineTo(x - r * 0.02, y + r * 0.1);
    ctx.lineTo(x - r * 0.22, y + r * 0.95);
    ctx.lineTo(x + r * 0.5, y - r * 0.15);
    ctx.lineTo(x + r * 0.02, y - r * 0.15);
    ctx.closePath();
    ctx.fill();
  } else {
    // ×2 동전
    ctx.fillStyle = '#c8961a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5410';
    ctx.font = `900 ${Math.max(6, Math.round(r * 0.9))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×2', x, y + r * 0.05);
  }
  ctx.restore();
}

function drawDebris(ctx: CanvasRenderingContext2D, v: View, d: Debris) {
  const p = project(v, d.x, d.z);
  const size = v.unit * 0.14 * p.s;
  ctx.globalAlpha = Math.min(1, d.life * 2);
  ctx.fillStyle = d.color === 'wood' ? COLORS.log : COLORS.pillar;
  ctx.fillRect(p.x - size / 2, p.y - v.unit * p.s * d.y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

function drawShieldBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  feet: number,
  u: number,
  t: number,
) {
  const cy = feet - u * 0.8;
  const r = u * 0.95 * (1 + Math.sin(t * 5) * 0.02);
  const g = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r);
  g.addColorStop(0, 'rgba(79, 179, 255, 0)');
  g.addColorStop(1, 'rgba(79, 179, 255, 0.4)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, cy, r * 0.75, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 215, 255, 0.85)';
  ctx.lineWidth = Math.max(1.5, u * 0.03);
  ctx.stroke();
}

/** 바닥에서 퍼져 나가는 붉은 고리 */
function drawMagnetAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  ground: number,
  u: number,
  t: number,
) {
  for (let i = 0; i < 2; i++) {
    const k = (t * 1.2 + i * 0.5) % 1;
    ctx.strokeStyle = `rgba(255, 90, 90, ${0.5 * (1 - k)})`;
    ctx.lineWidth = Math.max(1, u * 0.03);
    ctx.beginPath();
    ctx.ellipse(x, ground, u * (0.3 + k * 0.9), u * (0.08 + k * 0.22), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBoostGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  feet: number,
  u: number,
  t: number,
) {
  const cy = feet - u * 0.8;
  const g = ctx.createRadialGradient(x, cy, u * 0.2, x, cy, u * 1.3);
  g.addColorStop(0, `rgba(255, 190, 80, ${0.55 + Math.sin(t * 30) * 0.1})`);
  g.addColorStop(1, 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, cy, u * 1.3, 0, Math.PI * 2);
  ctx.fill();
}

/** 부스트 중 소실점에서 화면 가장자리로 뻗어 나가는 속도선 */
function drawSpeedLines(ctx: CanvasRenderingContext2D, v: View, t: number) {
  const cx = v.w / 2;
  const cy = v.horizonY;
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + i * 0.37;
    const k = (t * 2.5 + i * 0.13) % 1;
    const r0 = v.h * (0.35 + k * 0.6);
    const r1 = r0 + v.h * 0.12;
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 비틀거리는 동안 화면 가장자리가 붉게 맥박친다 — 한 번 더 부딪히면 끝이라는 경고 */
function drawDanger(ctx: CanvasRenderingContext2D, v: View, left: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 9) * 0.5;
  // 남은 시간이 줄수록 옅어진다
  const strength = Math.min(1, left / 1.5) * (0.25 + pulse * 0.2);
  const g = ctx.createRadialGradient(v.w / 2, v.h / 2, v.h * 0.3, v.w / 2, v.h / 2, v.h * 0.85);
  g.addColorStop(0, 'rgba(200, 30, 20, 0)');
  g.addColorStop(1, `rgba(200, 30, 20, ${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
}

/**
 * 뒤에서 굴러오는 바위 — 시작할 때 잠깐 보였다가 물러나고, 비틀거리면 바짝 따라붙는다.
 * 붙잡히면 화면 아래에서 굴러 올라와 플레이어를 덮친다.
 */
function drawBoulder(ctx: CanvasRenderingContext2D, v: View, run: RunState, f: FrameInfo) {
  // 잡히면 끝까지 올라와 덮치고, 평소에는 추격 거리(chase)만큼 화면 아래에서 보인다
  const rise = f.caughtT !== null ? Math.min(1, 0.6 + f.caughtT / 1.2) : run.chase * 0.6;
  if (rise < 0.02) return;

  const r = v.laneW * 0.9;
  const cx = v.w / 2 + run.x * v.laneW * 0.5;
  const cy = v.h + r * 0.85 - rise * r * 1.2;
  const roll = f.t * 6;
  ctx.fillStyle = COLORS.boulder;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.boulderDark;
  ctx.lineWidth = r * 0.07;
  for (let i = 0; i < 3; i++) {
    const a = roll + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, a, a + 0.9);
    ctx.stroke();
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, v: View) {
  const g = ctx.createRadialGradient(
    v.w / 2,
    v.h * 0.55,
    v.h * 0.35,
    v.w / 2,
    v.h * 0.55,
    v.h * 0.95,
  );
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
}
