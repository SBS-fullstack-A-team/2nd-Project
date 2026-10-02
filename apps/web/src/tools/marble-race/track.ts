import { Bodies, Body } from 'matter-js';
import { MARBLE_R, TRACK } from './config';
import { shuffle, type Rng } from './random';

/** 가운데선 위의 한 점 — s 는 트랙 시작부터의 거리, (tx,ty) 진행 방향, (nx,ny) 왼쪽 방향, w 반폭 */
export interface TrackPoint {
  x: number;
  y: number;
  s: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  w: number;
}

export type FeatureKind = 'bumper' | 'spinner' | 'boost' | 'mud' | 'hole';

/**
 * 트랙 위 장치. 위치는 (s, lat) — 트랙을 따라간 거리와 가운데선에서 왼쪽(+)·오른쪽(−)으로 벗어난 거리.
 * length 는 진행 방향 길이, width 는 옆 방향 폭 (구역형 장치), r 은 반지름 (원형 장치).
 */
export interface Feature {
  kind: FeatureKind;
  s: number;
  lat: number;
  x: number;
  y: number;
  /** 트랙 진행 방향 각도 (그리기용) */
  angle: number;
  length: number;
  width: number;
  r: number;
  body?: Body;
  /** 회전 바의 스텝당 회전량 */
  spin?: number;
}

export interface Track {
  points: TrackPoint[];
  /** 트랙 전체 길이 (결승 뒤 여유 구간 포함) */
  length: number;
  startS: number;
  finishS: number;
  walls: Body[];
  /** 출발 문 — 초록불이 켜지면 치운다 */
  gate: Body;
  features: Feature[];
  /** 출발 그리드 자리 (이미 섞여 있다) */
  slots: { x: number; y: number }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const STATIC = { isStatic: true, friction: 0, restitution: 0.5 };

const smooth = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

/** 가운데가 1 이고 양옆으로 부드럽게 0 이 되는 창 */
const bump = (s: number, center: number, half: number) =>
  Math.abs(s - center) >= half ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (s - center)) / half);

/** 출발 그리드가 몇 줄인지 */
function gridShape(marbleCount: number) {
  const usable = TRACK.wideHalfWidth * 2 - TRACK.gridGap * 1.5;
  const perRow = Math.max(1, Math.floor(usable / TRACK.gridGap));
  return { perRow, rows: Math.ceil(marbleCount / perRow) };
}

/**
 * 가운데선 만들기 — x 는 계속 오른쪽으로만 가고 y 만 사인파 몇 개를 겹쳐 구불거린다.
 * (x 가 되돌아가지 않으니 트랙이 자기 자신과 겹치지 않는다)
 * 출발·결승 근처는 직선으로 편다. 커브가 너무 급하면 벽이 꼬이므로 진폭을 줄여 다시 만든다.
 */
function buildCenterline(
  totalLength: number,
  startS: number,
  finishS: number,
  rng: Rng,
  amplitudeScale: number,
) {
  const waves = [
    { a: 380 + rng() * 220, l: 2600 + rng() * 1400 },
    { a: 130 + rng() * 90, l: 1300 + rng() * 500 },
    { a: 35 + rng() * 25, l: 650 + rng() * 250 },
  ].map((w) => ({ a: w.a * amplitudeScale, k: (Math.PI * 2) / w.l, p: rng() * Math.PI * 2 }));
  const noise = (x: number) => waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * x + w.p), 0);
  const envelope = (s: number) =>
    smooth((s - startS - 150) / 700) * (1 - smooth((s - finishS + 900) / 650));

  // 촘촘하게 x 를 늘려 가며 길이를 재고, 일정 간격(sample)마다 점을 찍는다
  const raw: { x: number; y: number; s: number }[] = [{ x: 0, y: 0, s: 0 }];
  let prev = { x: 0, y: 0 };
  let s = 0;
  let nextSample = TRACK.sample;
  const base = noise(0);
  for (let x = 2; s < totalLength; x += 2) {
    const y = envelope(s) * (noise(x) - base);
    s += Math.hypot(x - prev.x, y - prev.y);
    prev = { x, y };
    if (s >= nextSample) {
      raw.push({ x, y, s });
      nextSample += TRACK.sample;
    }
  }
  return raw;
}

function halfWidthAt(s: number, startS: number, finishS: number, chicanes: number[]): number {
  // 출발·결승 직선은 넓게
  const wide = Math.max(1 - smooth((s - startS - 100) / 500), smooth((s - finishS + 500) / 400));
  let w = TRACK.halfWidth + (TRACK.wideHalfWidth - TRACK.halfWidth) * wide;
  for (const c of chicanes) w -= (TRACK.halfWidth - TRACK.chicaneHalfWidth) * bump(s, c, 260);
  return w;
}

/** 각 점의 방향·반폭을 채운다. 가장 급한 커브의 반지름(안쪽 벽 기준 여유)을 같이 돌려준다 */
function withFrames(
  raw: { x: number; y: number; s: number }[],
  startS: number,
  finishS: number,
  chicanes: number[],
): { points: TrackPoint[]; minClearance: number } {
  const points: TrackPoint[] = [];
  let minClearance = Infinity;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)]!;
    const b = raw[Math.min(raw.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const p = raw[i]!;
    const w = halfWidthAt(p.s, startS, finishS, chicanes);
    points.push({ x: p.x, y: p.y, s: p.s, tx, ty, nx: ty, ny: -tx, w });
    if (i > 0 && i < raw.length - 1) {
      // 세 점을 지나는 원의 반지름 = 커브 반지름
      const ax = p.x - a.x;
      const ay = p.y - a.y;
      const bx = b.x - p.x;
      const by = b.y - p.y;
      const cross = Math.abs(ax * by - ay * bx);
      const radius =
        cross < 1e-6 ? Infinity : (Math.hypot(ax, ay) * Math.hypot(bx, by) * len) / (2 * cross);
      minClearance = Math.min(minClearance, radius - w);
    }
  }
  return { points, minClearance };
}

/** 트랙 위 (s, lat) → 세계 좌표 */
export function pointAt(points: TrackPoint[], s: number, lat: number) {
  const i = Math.min(Math.max(Math.floor(s / TRACK.sample), 0), points.length - 2);
  const p = points[i]!;
  const q = points[i + 1]!;
  const t = Math.min(Math.max((s - p.s) / (q.s - p.s || 1), 0), 1);
  const x = p.x + (q.x - p.x) * t;
  const y = p.y + (q.y - p.y) * t;
  return { x: x + p.nx * lat, y: y + p.ny * lat, point: p, index: i };
}

/**
 * 세계 좌표 → 트랙 위 (s, lat). hint 근처의 점만 살펴서 빠르게 찾는다 (구슬마다 지난번 위치를 hint 로 준다).
 */
export function project(points: TrackPoint[], x: number, y: number, hint: number) {
  let best = hint;
  let bestDist = Infinity;
  const from = Math.max(0, hint - 6);
  const to = Math.min(points.length - 1, hint + 12);
  for (let i = from; i <= to; i++) {
    const p = points[i]!;
    const d = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const p = points[best]!;
  const dx = x - p.x;
  const dy = y - p.y;
  return { index: best, s: p.s + dx * p.tx + dy * p.ty, lat: dx * p.nx + dy * p.ny };
}

/** 트랙 양쪽 벽 — 짧은 직사각형을 이어 붙인다 (이음매가 벌어지지 않게 조금씩 겹친다) */
function buildWalls(points: TrackPoint[]): Body[] {
  const walls: Body[] = [];
  const t = TRACK.wallThickness;
  for (const side of [1, -1]) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i]!;
      const q = points[i + 1]!;
      const ax = p.x + p.nx * (p.w + t / 2) * side;
      const ay = p.y + p.ny * (p.w + t / 2) * side;
      const bx = q.x + q.nx * (q.w + t / 2) * side;
      const by = q.y + q.ny * (q.w + t / 2) * side;
      const body = Bodies.rectangle(
        (ax + bx) / 2,
        (ay + by) / 2,
        Math.hypot(bx - ax, by - ay) + t * 0.6,
        t,
        STATIC,
      );
      Body.setAngle(body, Math.atan2(by - ay, bx - ax));
      walls.push(body);
    }
  }
  // 트랙 앞뒤를 막는 벽
  for (const p of [points[0]!, points[points.length - 1]!]) {
    const body = Bodies.rectangle(p.x, p.y, t, p.w * 2 + t * 2, STATIC);
    Body.setAngle(body, Math.atan2(p.ty, p.tx));
    walls.push(body);
  }
  return walls;
}

/** 장치 배치 — 출발 후 조금 달린 뒤부터 결승 직전까지, 종류를 섞어 일정 간격으로 놓는다 */
function buildFeatures(points: TrackPoint[], startS: number, finishS: number, rng: Rng) {
  const features: Feature[] = [];
  const kinds: FeatureKind[] = [];
  const pool: FeatureKind[] = [
    'bumper',
    'bumper',
    'spinner',
    'boost',
    'boost',
    'mud',
    'hole',
    'hole',
  ];
  for (let s = startS + 650; s < finishS - 700; s += 520 + rng() * 360) {
    if (kinds.length === 0) kinds.push(...shuffle(pool, rng));
    const kind = kinds.pop()!;
    const { point } = pointAt(points, s, 0);
    const w = point.w;
    const angle = Math.atan2(point.ty, point.tx);
    const side = rng() < 0.5 ? 1 : -1;
    const add = (f: Omit<Feature, 'x' | 'y' | 'angle'>) => {
      const at = pointAt(points, f.s, f.lat);
      features.push({ ...f, x: at.x, y: at.y, angle });
    };

    switch (kind) {
      case 'bumper': {
        // 기둥 2~3개를 옆으로 흩어 놓는다
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
          const lat = (-1 + (2 * (i + 0.5)) / count) * (w - 45) + (rng() - 0.5) * 40;
          add({ kind, s: s + (rng() - 0.5) * 120, lat, length: 0, width: 0, r: 20 });
        }
        break;
      }
      case 'spinner':
        add({
          kind,
          s,
          lat: (rng() - 0.5) * 50,
          length: w * 1.25,
          width: 16,
          r: 0,
          spin: (0.035 + rng() * 0.02) * side,
        });
        break;
      case 'boost':
        // 한쪽 절반에만 깔아서, 그쪽으로 간 구슬만 빨라진다 (추월 포인트)
        add({ kind, s, lat: side * w * 0.48, length: 170, width: w * 0.85, r: 0 });
        break;
      case 'mud':
        add({ kind, s, lat: side * w * 0.4, length: 260, width: w * 1.05, r: 0 });
        break;
      case 'hole':
        add({ kind, s, lat: side * (w - 70) * (0.3 + rng() * 0.7), length: 0, width: 0, r: 34 });
        break;
    }
  }

  // 충돌하는 장치(범퍼·회전 바)는 물리 몸체를 만든다
  for (const f of features) {
    if (f.kind === 'bumper') {
      f.body = Bodies.circle(f.x, f.y, f.r, { ...STATIC, restitution: 1.1 });
    } else if (f.kind === 'spinner') {
      f.body = Bodies.rectangle(f.x, f.y, f.length, f.width, STATIC);
      Body.setAngle(f.body, rng() * Math.PI);
    }
  }
  return features;
}

/**
 * 트랙 만들기 — 출발 그리드 + 구불구불한 레이스 구간 + 결승선 + 여유 구간.
 * 같은 rng 면 같은 트랙이 나온다.
 */
export function buildTrack(marbleCount: number, rng: Rng): Track {
  const { perRow, rows } = gridShape(marbleCount);
  const startS = 60 + rows * TRACK.gridGap + 30;
  const finishS = startS + TRACK.raceDistance;
  const length = finishS + 450;
  const chicanes = shuffle([0.3, 0.55, 0.78], rng)
    .slice(0, 2)
    .map((r) => startS + TRACK.raceDistance * (r + (rng() - 0.5) * 0.08));

  // 커브가 너무 급하면(안쪽 벽이 꼬이면) 진폭을 줄여서 다시 만든다
  let built = withFrames(
    buildCenterline(length, startS, finishS, rng, 1),
    startS,
    finishS,
    chicanes,
  );
  for (let scale = 0.85; built.minClearance < 60 && scale > 0.2; scale -= 0.15) {
    built = withFrames(
      buildCenterline(length, startS, finishS, rng, scale),
      startS,
      finishS,
      chicanes,
    );
  }
  const { points } = built;

  const gateAt = pointAt(points, startS + MARBLE_R + 6, 0);
  const gate = Bodies.rectangle(gateAt.x, gateAt.y, 10, gateAt.point.w * 2 + 20, STATIC);
  Body.setAngle(gate, Math.atan2(gateAt.point.ty, gateAt.point.tx));

  // 출발 그리드 — 출발선 뒤로 줄지어 선다. 자리는 섞어서 배정한다
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      const lat = (c - (perRow - 1) / 2) * TRACK.gridGap + (r % 2 ? TRACK.gridGap / 4 : 0);
      const at = pointAt(points, startS - 10 - (r + 0.5) * TRACK.gridGap, lat);
      slots.push({ x: at.x, y: at.y });
    }
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    points,
    length,
    startS,
    finishS,
    walls: buildWalls(points),
    gate,
    features: buildFeatures(points, startS, finishS, rng),
    slots: shuffle(slots, rng).slice(0, marbleCount),
    bounds: {
      minX: Math.min(...xs) - 250,
      maxX: Math.max(...xs) + 250,
      minY: Math.min(...ys) - 250,
      maxY: Math.max(...ys) + 250,
    },
  };
}
