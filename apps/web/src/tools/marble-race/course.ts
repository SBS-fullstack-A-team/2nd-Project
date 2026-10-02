import { Bodies, Body } from 'matter-js';
import { MARBLE_R, WALL_THICKNESS, WORLD_W } from './config';
import { shuffle, type Rng } from './random';

/** 그리기용 장애물 종류 */
export type ObstacleKind = 'wall' | 'pin' | 'bumper' | 'ramp' | 'spinner' | 'gate';

export interface Obstacle {
  body: Body;
  kind: ObstacleKind;
}

/** 일정한 속도로 도는 풍차 — 매 스텝 angleSpeed 만큼 돌린다 */
export interface Spinner {
  body: Body;
  angleSpeed: number;
}

export interface Course {
  obstacles: Obstacle[];
  spinners: Spinner[];
  /** 출발 칸 (구슬 중심 좌표) — 이미 섞여 있다 */
  slots: { x: number; y: number }[];
  /** 출발 문 — 카운트다운이 끝나면 치운다 */
  gate: Body;
  /** 이 높이를 지나면 도착 */
  finishY: number;
  /** 코스 전체 높이 */
  height: number;
}

const STATIC = { isStatic: true, friction: 0.01, restitution: 0.3 };

/** 구간 하나 — y0 에서 시작해 장애물을 만들고, 차지한 높이를 돌려준다 */
type Section = (y0: number, rng: Rng, out: Obstacle[], spinners: Spinner[]) => number;

/**
 * 벽 쪽 방지턱 — 벽을 타고 장애물 없이 쭉 내려가는 '지름길'을 막는다.
 * 벽에서 안쪽 아래로 기울어진 짧은 막대를 양쪽 벽에 엇갈려 붙인다.
 */
function wallDeflectors(y0: number, height: number, out: Obstacle[]): void {
  const spacing = 170;
  for (let y = y0 + 60, i = 0; y < y0 + height - 30; y += spacing / 2, i++) {
    const left = i % 2 === 0;
    const length = 70;
    const body = Bodies.rectangle(
      left ? length / 2 - 6 : WORLD_W - length / 2 + 6,
      y,
      length,
      12,
      STATIC,
    );
    Body.setAngle(body, left ? 0.5 : -0.5);
    out.push({ kind: 'ramp', body });
  }
}

/** 지그재그로 엇갈린 핀 밭 */
function pins(rows: number, spacing: number): Section {
  return (y0, rng, out) => {
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? spacing / 2 : 0;
      for (let x = 30 + offset; x < WORLD_W - 20; x += spacing) {
        const jitter = (rng() - 0.5) * 12;
        out.push({
          kind: 'pin',
          body: Bodies.circle(x + jitter, y0 + 40 + r * spacing, 7, STATIC),
        });
      }
    }
    const height = 40 + rows * spacing + 20;
    wallDeflectors(y0, height, out);
    return height;
  };
}

/** 빙글빙글 도는 풍차 2~3개 */
const spinners: Section = (y0, rng, out, list) => {
  const count = rng() < 0.5 ? 2 : 3;
  const gap = WORLD_W / (count + 1);
  const length = gap * 0.85;
  const direction = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const x = gap * (i + 1);
    const y = y0 + 40 + length / 2;
    const body = Body.create({
      parts: [Bodies.rectangle(x, y, length, 14), Bodies.rectangle(x, y, 14, length)],
      ...STATIC,
    });
    Body.setAngle(body, rng() * Math.PI);
    // 이웃 풍차는 반대로 돌아서 구슬이 좌우로 튕긴다
    const speed = (0.025 + rng() * 0.025) * direction * (i % 2 ? -1 : 1);
    list.push({ body, angleSpeed: speed });
    out.push({ kind: 'spinner', body });
  }
  const height = 80 + length;
  wallDeflectors(y0, height, out);
  return height;
};

/** 좌우로 번갈아 기울어진 경사로 — 구슬이 굴러 내려가며 줄을 선다 */
const zigzag: Section = (y0, rng, out) => {
  const ramps = 3;
  const length = WORLD_W * 0.8;
  // 경사로 사이 틈이 구슬 지름보다 넉넉해야 끼지 않는다 (기울기·두께 감안)
  const step = 190;
  const startRight = rng() < 0.5;
  for (let i = 0; i < ramps; i++) {
    const gapOnRight = (i % 2 === 0) === startRight;
    const angle = 0.2 + rng() * 0.08;
    const x = gapOnRight ? length / 2 : WORLD_W - length / 2;
    const body = Bodies.rectangle(x, y0 + 60 + i * step, length, 14, STATIC);
    // 빈틈 쪽이 아래로 가도록 기울인다 (화면 좌표는 시계 방향이 +)
    Body.setAngle(body, gapOnRight ? angle : -angle);
    out.push({ kind: 'ramp', body });
  }
  return 60 + ramps * step;
};

/** 통통 튀는 범퍼 */
const bumpers: Section = (y0, rng, out) => {
  const rows = 3;
  const cols = 4;
  const dx = WORLD_W / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = dx * (c + 0.5) + (r % 2 ? dx / 2 : 0) + (rng() - 0.5) * 30;
      if (x > WORLD_W - 30) continue;
      const body = Bodies.circle(x, y0 + 70 + r * 130, 26, { ...STATIC, restitution: 1.1 });
      out.push({ kind: 'bumper', body });
    }
  }
  const height = 60 + rows * 130;
  wallDeflectors(y0, height, out);
  return height;
};

/** 가운데로 모이는 깔때기 — 구슬이 몰리면서 순위가 뒤집힌다 */
const funnel: Section = (y0, rng, out) => {
  const opening = MARBLE_R * 2 * (5 + Math.floor(rng() * 3));
  const depth = 200;
  const center = WORLD_W / 2 + (rng() - 0.5) * 160;
  const sides: [number, number][] = [
    [0, center - opening / 2],
    [WORLD_W, center + opening / 2],
  ];
  for (const [fromX, toX] of sides) {
    const dx = toX - fromX;
    const length = Math.hypot(dx, depth);
    const body = Bodies.rectangle(fromX + dx / 2, y0 + 20 + depth / 2, length, 14, STATIC);
    Body.setAngle(body, Math.atan2(depth, dx));
    out.push({ kind: 'ramp', body });
  }
  return depth + 80;
};

/**
 * 코스 만들기 — 출발 칸 + 구간들(가운데 순서는 매번 섞인다) + 도착선.
 * 같은 rng 면 같은 코스가 나온다.
 */
export function buildCourse(marbleCount: number, rng: Rng): Course {
  const obstacles: Obstacle[] = [];
  const spinnerList: Spinner[] = [];

  // 출발 칸 — 구슬 지름보다 조금 넓은 격자, 자리는 섞어서 배정한다
  const cell = MARBLE_R * 2 + 6;
  const perRow = Math.floor((WORLD_W - 20) / cell);
  const rows = Math.ceil(marbleCount / perRow);
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      slots.push({ x: 10 + cell * (c + 0.5), y: 30 + cell * (r + 0.5) });
    }
  }
  const startBottom = 30 + rows * cell + 10;
  const gate = Bodies.rectangle(WORLD_W / 2, startBottom + 8, WORLD_W, 16, STATIC);
  obstacles.push({ kind: 'gate', body: gate });

  // 가운데 구간은 매번 순서를 섞고, 뒤쪽에 몇 개를 더 뽑아 붙여 코스 길이를 늘린다
  const middle = shuffle([spinners, zigzag, bumpers, funnel, pins(5, 56)], rng);
  const extra = shuffle([spinners, bumpers, pins(4, 60), zigzag], rng).slice(0, 3);
  const sections: Section[] = [pins(6, 62), ...middle, ...extra, spinners, funnel];

  let y = startBottom + 40;
  for (const section of sections) y += section(y, rng, obstacles, spinnerList);
  const finishY = y + 40;
  const height = finishY + 200;

  // 양쪽 벽 (코스 전체 높이)
  for (const x of [-WALL_THICKNESS / 2, WORLD_W + WALL_THICKNESS / 2]) {
    obstacles.push({
      kind: 'wall',
      body: Bodies.rectangle(x, height / 2 - 200, WALL_THICKNESS, height + 400, STATIC),
    });
  }

  return {
    obstacles,
    spinners: spinnerList,
    slots: shuffle(slots, rng).slice(0, marbleCount),
    gate,
    finishY,
    height,
  };
}
