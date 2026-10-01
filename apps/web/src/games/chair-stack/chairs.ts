import { Bodies, Body } from 'matter-js';
import { CHAIR_INERTIA_SCALE, CHAIR_PHYSICS } from './config';

/**
 * 의자 모양 — 옆에서 본 모습을 직사각형 부품 여러 개로 만든다.
 * 좌표는 앉는 판(seat) 가운데를 (0, 0) 으로 한 cm 단위, y 는 아래쪽이 +.
 * angle 은 시계 방향(라디안). 세로 다리에 + 를 주면 아래쪽 끝이 왼쪽으로 벌어진다.
 */
interface PartDef {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  /** 다리·받침처럼 진한 색으로 칠할 부품 */
  dark?: boolean;
}

export interface ChairDef {
  id: string;
  name: string;
  parts: PartDef[];
}

export const CHAIRS: readonly ChairDef[] = [
  {
    id: 'basic',
    name: '기본 의자',
    parts: [
      { x: 0, y: 0, w: 56, h: 7 },
      { x: -24.5, y: -28, w: 7, h: 49 },
      { x: -24, y: 22, w: 6, h: 37, dark: true },
      { x: 24, y: 22, w: 6, h: 37, dark: true },
    ],
  },
  {
    id: 'stool',
    name: '스툴',
    parts: [
      { x: 0, y: 0, w: 46, h: 8 },
      { x: -16, y: 22, w: 6, h: 40, angle: 0.18, dark: true },
      { x: 16, y: 22, w: 6, h: 40, angle: -0.18, dark: true },
      { x: 0, y: 26, w: 34, h: 4, dark: true },
    ],
  },
  {
    id: 'bar',
    name: '바 의자',
    parts: [
      { x: 0, y: 0, w: 40, h: 7 },
      { x: -16.5, y: -14, w: 7, h: 21 },
      { x: -14, y: 34, w: 5, h: 61, dark: true },
      { x: 14, y: 34, w: 5, h: 61, dark: true },
      { x: 0, y: 44, w: 28, h: 4, dark: true },
    ],
  },
  {
    id: 'bench',
    name: '벤치',
    parts: [
      { x: 0, y: 0, w: 96, h: 8 },
      { x: -40, y: 15, w: 8, h: 22, dark: true },
      { x: 40, y: 15, w: 8, h: 22, dark: true },
    ],
  },
  {
    id: 'highback',
    name: '등받이 높은 의자',
    parts: [
      { x: 0, y: 0, w: 52, h: 7 },
      { x: -22.5, y: -40, w: 7, h: 73 },
      { x: -22, y: 20, w: 6, h: 33, dark: true },
      { x: 22, y: 20, w: 6, h: 33, dark: true },
    ],
  },
  {
    id: 'arm',
    name: '팔걸이 의자',
    parts: [
      { x: 0, y: 0, w: 60, h: 9 },
      { x: -26.5, y: -26, w: 7, h: 43 },
      { x: 1, y: -20, w: 50, h: 5 },
      { x: 24, y: -9, w: 5, h: 17 },
      { x: -26, y: 18, w: 6, h: 28, dark: true },
      { x: 26, y: 18, w: 6, h: 28, dark: true },
    ],
  },
  {
    id: 'rocker',
    name: '흔들의자',
    parts: [
      { x: 0, y: 0, w: 52, h: 7 },
      { x: -22.5, y: -30, w: 7, h: 53 },
      { x: -18, y: 21, w: 5, h: 36, dark: true },
      { x: 18, y: 21, w: 5, h: 36, dark: true },
      { x: -21, y: 40, w: 30, h: 5, angle: 0.22, dark: true },
      { x: 0, y: 43, w: 16, h: 5, dark: true },
      { x: 21, y: 40, w: 30, h: 5, angle: -0.22, dark: true },
    ],
  },
];

/** 의자 색 — [판·등받이, 다리] */
const PALETTE: readonly (readonly [string, string])[] = [
  ['#d39a5c', '#9a6434'],
  ['#b9784a', '#7d4b28'],
  ['#e8c48a', '#b08850'],
  ['#5b8bd9', '#35609f'],
  ['#e0625a', '#a8403a'],
  ['#4fae7a', '#2f7a50'],
  ['#f0c040', '#b88c1c'],
  ['#9a7bd8', '#6a4ea6'],
];

/** 의자 모양 + 색 한 벌 — 다음 의자 미리보기에도 같은 값을 쓴다 */
export interface ChairPick {
  def: ChairDef;
  colors: readonly [string, string];
}

/** chairIds 중에서 무작위로 고른다 (비우면 모든 의자) */
export function randomChair(
  chairIds: readonly string[] = [],
  random: () => number = Math.random,
): ChairPick {
  const pool = chairIds.length ? CHAIRS.filter((c) => chairIds.includes(c.id)) : CHAIRS;
  const def = pool[Math.floor(random() * pool.length)]!;
  const colors = PALETTE[Math.floor(random() * PALETTE.length)]!;
  return { def, colors };
}

/**
 * 의자 하나를 matter-js 복합 물체로 만든다.
 * 부품마다 render.fillStyle 에 색을 넣어 두고 직접 그릴 때 쓴다.
 */
export function createChairBody(pick: ChairPick, x: number, y: number): Body {
  const [main, dark] = pick.colors;
  const parts = pick.def.parts.map((p) =>
    // 모서리를 둥글게(chamfer) 하면 가는 다리 끝이 굴러다녀서 쓰지 않는다
    Bodies.rectangle(x + p.x, y + p.y, p.w, p.h, {
      angle: p.angle ?? 0,
      render: { fillStyle: p.dark ? dark : main },
    }),
  );
  const body = Body.create({ parts, ...CHAIR_PHYSICS });
  Body.setInertia(body, body.inertia * CHAIR_INERTIA_SCALE);
  body.label = pick.def.id;
  return body;
}
