/**
 * 지렁이 아레나 아이콘 — 이모지 대신 직접 그린 24×24 벡터 아이콘.
 * 같은 경로를 캔버스(Path2D)와 메뉴(SVG, Icon.tsx)에서 함께 쓴다. OS 마다 모양이 바뀌지 않는다.
 * 칠한 면은 위가 밝고 아래가 진한 그라데이션 + 윗부분 광택 (XP 시절 광택 아이콘 느낌).
 */

/** 색 칠한 면 아래에 깔리는 외곽선 — 어두운 경기장 · 밝은 메뉴 모두에서 또렷하게 */
export const OUTLINE = '#1d2030';
export const OUTLINE_WIDTH = 1.5;
/** 광택 세기 — 윗부분 흰 빛의 진하기 */
export const GLOSS_ALPHA = 0.55;
/** 버튼 글자색을 따라가는 색 (캔버스에서는 흰색) */
export const CURRENT = 'currentColor';

export interface Layer {
  d: string;
  fill?: string;
  stroke?: string;
  /** 선 굵기 */
  sw?: number;
}

export interface IconDef {
  layers: Layer[];
  /** 칠한 면에 외곽선을 두를지 (버튼용 단색 아이콘은 false) */
  outline: boolean;
}

/* ---------- 경로 만들기 ---------- */

const n = (v: number) => Math.round(v * 100) / 100;

function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0z`;
}

function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return (
    `M${x + r} ${y}h${w - r * 2}a${r} ${r} 0 0 1 ${r} ${r}v${h - r * 2}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(w - r * 2)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - r * 2)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

type Pt = readonly [number, number];

function poly(points: readonly Pt[]): string {
  return `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}z`;
}

/** 뾰족한 별 — points 개 꼭짓점, 바깥 R · 안쪽 r */
function star(
  cx: number,
  cy: number,
  R: number,
  r: number,
  points = 5,
  rot = -Math.PI / 2,
): string {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const d = i % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return poly(pts);
}

const mirror = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [24 - x, y]);

/* ---------- 모양 조각 ---------- */

const SWORD_BLADE: Pt[] = [
  [8.6, 13.4],
  [18, 4],
  [21, 3],
  [20, 6],
  [10.6, 15.4],
];
const SWORD_GUARD: Pt[] = [
  [6.4, 12.6],
  [7.4, 11.6],
  [12.4, 16.6],
  [11.4, 17.6],
];
const SWORD_GRIP: Pt[] = [
  [8.2, 15],
  [9, 15.8],
  [5, 19.8],
  [4.2, 19],
];

function sword(flip = false): Layer[] {
  const f = flip ? mirror : (p: Pt[]) => p;
  const pommel = flip ? circle(24 - 4, 20, 1.5) : circle(4, 20, 1.5);
  return [
    { d: poly(f(SWORD_BLADE)), fill: '#e8ecf4' },
    { d: poly(f(SWORD_GRIP)), fill: '#8a5a32' },
    { d: poly(f(SWORD_GUARD)), fill: '#ffc93c' },
    { d: pommel, fill: '#ffc93c' },
  ];
}

function flowerPetals(): string {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    d += circle(12 + Math.cos(a) * 5.2, 12 + Math.sin(a) * 5.2, 4.2);
  }
  return d;
}

const icon = (layers: Layer[], outline = true): IconDef => ({ layers, outline });

/* 동양 용 · 용의 관 조각 */
const DRAGON_HEAD =
  'M2.6 21V15c0-4.8 3.4-8.4 8-8.6 2.4-.1 4.2.6 5.6 1.8l4.6 1.4c1 .3 1.4 1.4.8 2.2l-1 1.4 1 1.6c.5.8 0 1.8-.9 1.9l-5.8.5c-1.2 2.5-3.6 3.8-6.4 3.8V21z';
const DRAGON_JAW = 'M4.6 21v-1.6c3.2 0 5.6-1.3 6.9-3.6l3.9-.3c-1.2 2.5-3.6 3.9-6.4 3.9V21z';
const DRAGON_ANTLER = 'M11.2 6.6c-.2-2 .4-3.6 1.8-4.8M12.4 3.6l1.9-.5';
const DRAGON_WHISKER = 'M19.8 12.4c1.6.6 2.8 2 3.2 4.2M19 10.2c1.2-1 2.6-1.4 4-1.2';
const CREST_ANTLERS =
  'M9 15.4C8.4 11.4 7 8.6 4.6 6.6M7.2 10.2 9.2 8.4M5.8 7.8l-.2-2.8' +
  'M15 15.4c.6-4 2-6.8 4.4-8.8M16.8 10.2l-2-1.8M18.2 7.8l.2-2.8';
const CREST_WHISKERS = 'M3.8 20.6c-1.6.4-2.6 1.4-3 2.9M20.2 20.6c1.6.4 2.6 1.4 3 2.9';

/* ---------- 아이콘 ---------- */

export const ICONS = {
  /* 파워업 */
  magnet: icon([
    { d: 'M4.5 3h5.5v8.5a2 2 0 0 0 4 0V3h5.5v8.5a7.5 7.5 0 0 1-15 0z', fill: '#ff5f6d' },
    { d: rect(4.5, 3, 5.5, 3.2), fill: '#e8ecf4' },
    { d: rect(14, 3, 5.5, 3.2), fill: '#e8ecf4' },
  ]),
  bolt: icon([{ d: 'M13.8 2 4.8 13.6h5.8L9.4 22l9.8-12.8h-6z', fill: '#ffc93c' }]),
  shield: icon([
    { d: 'M12 2.5 4 5.6v6.1c0 5 3.4 8.6 8 9.8 4.6-1.2 8-4.8 8-9.8V5.6z', fill: '#4fc3f7' },
    { d: 'M12 5.2 6.6 7.3v4.4c0 3.4 2.1 6 5.4 7.2z', fill: '#a9e4ff' },
  ]),
  double: icon([
    { d: circle(12, 12, 9.8), fill: '#7ee081' },
    { d: 'M6.3 9.2l4.3 5.6M10.6 9.2l-4.3 5.6', stroke: OUTLINE, sw: 2.2 },
    { d: 'M13.4 10.4a2.2 2.2 0 1 1 3.9 1.5l-3.9 3.6h4.4', stroke: OUTLINE, sw: 2 },
  ]),
  ghost: icon([
    {
      d: 'M12 2.5a7.2 7.2 0 0 0-7.2 7.2V21l2.4-1.9 2.4 1.9 2.4-1.9 2.4 1.9 2.4-1.9 2.4 1.9V9.7A7.2 7.2 0 0 0 12 2.5z',
      fill: '#ece6ff',
    },
    { d: ellipse(9.3, 10.4, 1.3, 1.7) + ellipse(14.7, 10.4, 1.3, 1.7), fill: OUTLINE },
    { d: 'M10.4 14.4a1.6 1.6 0 0 0 3.2 0z', fill: '#c9b6ff' },
  ]),

  /* 지렁이 성격 · 지렁이 */
  worm: icon([
    { d: 'M4 16.5c2-5.5 5.2-5.5 7.2-2.2s5.2 3.3 7.3-2.6', stroke: OUTLINE, sw: 6.5 },
    { d: 'M4 16.5c2-5.5 5.2-5.5 7.2-2.2s5.2 3.3 7.3-2.6', stroke: '#ff7aa8', sw: 5 },
    { d: 'M5.6 14.6c1.4-2.6 3-3 4.2-2', stroke: '#ffc0d6', sw: 1.4 },
    { d: circle(18.4, 11.6, 1.1), fill: OUTLINE },
  ]),
  sword: icon(sword()),
  drumstick: icon([
    {
      d: poly([
        [9.2, 12.6],
        [11.4, 14.8],
        [7.2, 19],
        [5, 16.8],
      ]),
      fill: '#f4ead0',
    },
    { d: circle(4.6, 18.2, 1.7) + circle(5.8, 19.4, 1.7), fill: '#f4ead0' },
    {
      d: 'M15.6 2.5c3.6 0 5.9 2.6 5.9 5.8 0 4.3-3.8 7.4-7.9 7.4-1 0-1.8.3-2.4.8L8.6 13.9c.5-.6.8-1.4.8-2.4 0-4.4 2.6-9 6.2-9z',
      fill: '#d07a3a',
    },
    { d: 'M15.4 5.4c1.9 0 3.2 1.2 3.2 3', stroke: '#f6b070', sw: 1.6 },
  ]),
  drop: icon([
    {
      d: 'M12 2.5C9 7 5.8 10.6 5.8 14.6a6.2 6.2 0 0 0 12.4 0c0-4-3.2-7.6-6.2-12.1z',
      fill: '#5ec8ff',
    },
    { d: 'M9.2 14.6a2.8 2.8 0 0 0 2.8 2.8', stroke: '#ffffff', sw: 1.6 },
  ]),

  /* 목표 · 표시 */
  crown: icon([
    { d: 'M3 8.2l4.6 4.3L12 5l4.4 7.5L21 8.2l-1.9 9.8H4.9z', fill: '#ffcc33' },
    { d: rect(4.9, 17.2, 14.2, 3.6, 1), fill: '#e8a920' },
    { d: circle(12, 13.4, 1.6), fill: '#ff4f6d' },
    { d: circle(3, 7.6, 1.5) + circle(12, 4.3, 1.5) + circle(21, 7.6, 1.5), fill: '#ffcc33' },
  ]),
  star: icon([
    { d: star(12, 12.6, 10, 4.3), fill: '#ffd84a' },
    { d: star(12, 12.6, 5, 2.2), fill: '#fff3b0' },
  ]),
  burst: icon([
    { d: star(12, 12, 10.5, 5.5, 8, -Math.PI / 2 + 0.2), fill: '#ff7a45' },
    { d: star(12, 12, 5.8, 3, 8, -Math.PI / 2 + 0.6), fill: '#ffd84a' },
  ]),
  food: icon([
    { d: circle(12, 12, 7), fill: '#ff7aa8' },
    { d: circle(9.8, 9.6, 2.2), fill: '#ffd0e2' },
  ]),
  sparkle: icon([
    {
      d: 'M11 3c1 6.6 2.6 8.2 9 9.2-6.4 1-8 2.6-9 9.2-1-6.6-2.6-8.2-9-9.2 6.4-1 8-2.6 9-9.2z',
      fill: '#ffd84a',
    },
    {
      d: 'M19 1.8c.4 2 .8 2.4 2.6 2.7-1.8.3-2.2.7-2.6 2.7-.4-2-.8-2.4-2.6-2.7 1.8-.3 2.2-.7 2.6-2.7z',
      fill: '#ffffff',
    },
  ]),
  lock: icon([
    { d: 'M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5', stroke: OUTLINE, sw: 3.1 },
    { d: 'M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5', stroke: '#b8c0d0', sw: 1.6 },
    { d: rect(5.2, 10, 13.6, 11, 2.2), fill: '#ffc93c' },
    { d: circle(12, 14.6, 1.6) + rect(11.2, 15, 1.6, 3.2), fill: OUTLINE },
  ]),
  check: icon([
    { d: circle(12, 12, 9.8), fill: '#3ccf7a' },
    { d: 'M7.4 12.4l3.1 3.1 6.1-6.6', stroke: '#ffffff', sw: 2.8 },
  ]),
  target: icon([
    { d: circle(12, 12, 9.8), fill: '#ff5f6d' },
    { d: circle(12, 12, 6.6), fill: '#ffffff' },
    { d: circle(12, 12, 3.4), fill: '#ff5f6d' },
  ]),
  party: icon([
    { d: 'M3 21l4.6-12.8 8.2 8.2z', fill: '#b07cff' },
    { d: 'M5 15.5l3.5 3.5M6.5 11.5l6 6', stroke: '#ffd84a', sw: 1.6 },
    { d: circle(16.5, 4.5, 1.4), fill: '#ffcc33' },
    { d: circle(20.2, 10, 1.3), fill: '#4fc3f7' },
    { d: rect(11.2, 2.4, 2.2, 3.4, 0.6), fill: '#ff5f6d' },
    { d: rect(18.4, 14.6, 3.4, 2.2, 0.6), fill: '#7ee081' },
  ]),
  levelUp: icon([
    { d: rect(3, 3, 18, 18, 4.5), fill: '#3a9ae8' },
    { d: 'M12 6.2l5.4 6h-3.3v5.6H9.9v-5.6H6.6z', fill: '#ffffff' },
  ]),
  palette: icon([
    {
      d: 'M12 3a9 9 0 0 0 0 18c1.6 0 2.1-1.1 1.5-2.1-.7-1.2.2-2.5 1.6-2.5h2a4 4 0 0 0 4-4C21.1 7.2 17.1 3 12 3z',
      fill: '#f4dcb0',
    },
    { d: circle(7.4, 11.2, 1.6), fill: '#ff5f6d' },
    { d: circle(9.6, 7, 1.6), fill: '#ffc93c' },
    { d: circle(14.6, 6.8, 1.6), fill: '#4fc3f7' },
    { d: circle(17.6, 10.6, 1.6), fill: '#7ee081' },
  ]),

  /* 조작 안내 */
  mouse: icon([
    { d: rect(6.5, 2.5, 11, 19, 5.5), fill: '#e8ecf4' },
    { d: 'M12 2.8v6.4M6.8 9.2h10.4', stroke: OUTLINE, sw: 1.4 },
    { d: rect(11, 4.6, 2, 3, 1), fill: '#ff7aa8' },
  ]),
  touch: icon([
    { d: circle(12, 12, 8.2), stroke: '#ffc93c', sw: 1.6 },
    { d: circle(12, 12, 4.2), fill: '#ffc93c' },
  ]),

  /* 메뉴 탭 */
  gamepad: icon([
    {
      d: 'M7 7h10a5 5 0 0 1 4.8 6.4l-1.3 4.4a2.5 2.5 0 0 1-4.3.9L14.5 17h-5l-1.7 1.7a2.5 2.5 0 0 1-4.3-.9l-1.3-4.4A5 5 0 0 1 7 7z',
      fill: '#7b8bff',
    },
    { d: 'M7.6 9.8v4.4M5.4 12h4.4', stroke: '#ffffff', sw: 1.8 },
    { d: circle(15.6, 10.8, 1.2) + circle(17.9, 13.1, 1.2), fill: '#ffffff' },
  ]),
  bulb: icon([
    {
      d: 'M12 2.5a6.6 6.6 0 0 0-4 11.8c.8.7 1 1.4 1 2.3h6c0-.9.2-1.6 1-2.3A6.6 6.6 0 0 0 12 2.5z',
      fill: '#ffd84a',
    },
    { d: rect(9, 17.3, 6, 4.2, 1.6), fill: '#b8c0d0' },
    { d: 'M9.4 7.8a3 3 0 0 1 2.6-2.2', stroke: '#ffffff', sw: 1.6 },
  ]),
  book: icon([
    { d: 'M2.5 5.2c3.2-1.2 6.4-1 9.5 1v15c-3.1-2-6.3-2.2-9.5-1z', fill: '#4fc3f7' },
    { d: 'M21.5 5.2c-3.2-1.2-6.4-1-9.5 1v15c3.1-2 6.3-2.2 9.5-1z', fill: '#3a9ae8' },
    { d: 'M5 9c1.6-.4 3.2-.2 4.6.5M5 12.4c1.6-.4 3.2-.2 4.6.5', stroke: '#ffffff', sw: 1.2 },
  ]),
  chart: icon([
    { d: rect(3.5, 13, 4.6, 8, 1), fill: '#7ee081' },
    { d: rect(9.7, 8, 4.6, 13, 1), fill: '#4fc3f7' },
    { d: rect(15.9, 3.5, 4.6, 17.5, 1), fill: '#ff7aa8' },
  ]),

  /* 업적 */
  ruler: icon([
    {
      d: poly([
        [3, 15.6],
        [15.6, 3],
        [21, 8.4],
        [8.4, 21],
      ]),
      fill: '#ffc93c',
    },
    { d: 'M7.1 13.7l2 2M10.1 10.7l1.4 1.4M13.1 7.7l2 2', stroke: OUTLINE, sw: 1.4 },
  ]),
  stopwatch: icon([
    { d: rect(10, 1.8, 4, 3, 1), fill: '#ff5f6d' },
    { d: circle(12, 13.4, 8.2), fill: '#e8ecf4' },
    { d: 'M12 13.4V8.6M12 13.4l3.2 2', stroke: OUTLINE, sw: 2 },
  ]),
  flame: icon([
    {
      d: 'M12 2c1.2 4.2 5.4 5.8 5.4 11.4a5.4 5.4 0 0 1-10.8 0c0-2.6 1.4-4.2 2.6-5.3.3 2 1.2 3 2.2 3C11 8.6 11 5.2 12 2z',
      fill: '#ff7a45',
    },
    {
      d: 'M12 12.6c1.6 1.3 2.7 2.5 2.7 4.3a2.7 2.7 0 0 1-5.4 0c0-1.6 1.1-2.9 2.7-4.3z',
      fill: '#ffd84a',
    },
  ]),
  trophy: icon([
    {
      d: 'M7 5H4.4v1.6A3.6 3.6 0 0 0 8 10.2M17 5h2.6v1.6A3.6 3.6 0 0 1 16 10.2',
      stroke: OUTLINE,
      sw: 3.1,
    },
    {
      d: 'M7 5H4.4v1.6A3.6 3.6 0 0 0 8 10.2M17 5h2.6v1.6A3.6 3.6 0 0 1 16 10.2',
      stroke: '#e8a920',
      sw: 1.6,
    },
    { d: 'M6.8 3h10.4v5.4a5.2 5.2 0 0 1-10.4 0z', fill: '#ffcc33' },
    { d: rect(10.5, 12.8, 3, 4), fill: '#e8a920' },
    { d: rect(7.4, 16.6, 9.2, 4.4, 1), fill: '#8a5a32' },
  ]),
  /** 동양 용 (옆모습) — 붉은 머리 · 금색 갈기 · 사슴뿔 · 수염 */
  dragon: icon([
    {
      d: poly([
        [9, 6.6],
        [6.4, 1.8],
        [6.2, 5.4],
        [3, 2.6],
        [3.8, 6.8],
        [0.6, 6],
        [2.6, 9.6],
        [0, 11.4],
        [3, 12.4],
      ]),
      fill: '#ffcc33',
    },
    { d: DRAGON_ANTLER, stroke: OUTLINE, sw: 2.6 },
    { d: DRAGON_ANTLER, stroke: '#f4ead0', sw: 1.3 },
    { d: DRAGON_HEAD, fill: '#e8463a' },
    { d: DRAGON_JAW, fill: '#ffcf8a' },
    {
      d:
        poly([
          [15, 15.9],
          [15.6, 17],
          [16.2, 15.8],
        ]) +
        poly([
          [17.2, 15.7],
          [17.7, 16.6],
          [18.2, 15.6],
        ]),
      fill: '#ffffff',
    },
    { d: 'M13.8 15.9l6.8-.5', stroke: OUTLINE, sw: 1.1 },
    { d: 'M10.6 9c1-.8 2.4-1 3.6-.4', stroke: '#a8261e', sw: 1.2 },
    { d: ellipse(12.4, 10.7, 1.5, 1.25), fill: '#ffe66d' },
    { d: 'M12.4 9.8v1.8', stroke: OUTLINE, sw: 0.9 },
    { d: circle(19.4, 11.2, 0.55), fill: OUTLINE },
    { d: DRAGON_WHISKER, stroke: OUTLINE, sw: 2.2 },
    { d: DRAGON_WHISKER, stroke: '#ffcc33', sw: 1 },
  ]),
  swords: icon([...sword(), ...sword(true)]),
  /** 용의 관 (모자) — 사슴뿔 · 금색 갈기 · 붉은 띠 · 여의주 · 수염 */
  dragonCrest: icon([
    {
      d: poly([
        [3, 17.4],
        [1.2, 11.8],
        [4.6, 13.6],
        [4.4, 8.4],
        [8, 12],
        [9.4, 7.4],
        [12, 11],
        [14.6, 7.4],
        [16, 12],
        [19.6, 8.4],
        [19.4, 13.6],
        [22.8, 11.8],
        [21, 17.4],
      ]),
      fill: '#ffcc33',
    },
    { d: CREST_ANTLERS, stroke: OUTLINE, sw: 3 },
    { d: CREST_ANTLERS, stroke: '#f4ead0', sw: 1.5 },
    {
      d: 'M3.6 19c2.6-2.2 5.4-3.2 8.4-3.2s5.8 1 8.4 3.2v2.6c-2.6-1.8-5.4-2.6-8.4-2.6s-5.8.8-8.4 2.6z',
      fill: '#e8463a',
    },
    { d: circle(6.6, 19.4, 0.8) + circle(17.4, 19.4, 0.8), fill: '#ffcc33' },
    { d: circle(12, 17.6, 2.6), fill: '#bfe8ff' },
    { d: CREST_WHISKERS, stroke: OUTLINE, sw: 2.2 },
    { d: CREST_WHISKERS, stroke: '#ffcc33', sw: 1 },
  ]),
  calendar: icon([
    { d: rect(3.5, 5, 17, 16, 2.4), fill: '#ffffff' },
    { d: 'M5.9 5h12.2a2.4 2.4 0 0 1 2.4 2.4V10h-17V7.4A2.4 2.4 0 0 1 5.9 5z', fill: '#ff5f6d' },
    { d: 'M8 3v4M16 3v4', stroke: OUTLINE, sw: 2 },
    {
      d:
        rect(6.6, 12.4, 2.4, 2.4) +
        rect(10.8, 12.4, 2.4, 2.4) +
        rect(15, 12.4, 2.4, 2.4) +
        rect(6.6, 16.2, 2.4, 2.4) +
        rect(10.8, 16.2, 2.4, 2.4),
      fill: '#b8c0d0',
    },
  ]),

  /* 모자 */
  ribbon: icon([
    { d: 'M11 13 8.6 19.6l2.2-.8 1.2 1.9 1.2-1.9 2.2.8L13 13z', fill: '#ff4f8a' },
    { d: 'M12 11C9 7 4.2 4.6 3.6 7.6c-.5 2.6-.5 4.4 0 7 .6 3 5.4.4 8.4-3.6z', fill: '#ff7aa8' },
    { d: 'M12 11c3-4 7.8-6.4 8.4-3.4.5 2.6.5 4.4 0 7-.6 3-5.4.4-8.4-3.6z', fill: '#ff7aa8' },
    { d: circle(12, 11, 2.4), fill: '#ff4f8a' },
  ]),
  cap: icon([
    { d: 'M3.6 15.4a8.4 8.4 0 0 1 16.8 0z', fill: '#4a90e2' },
    { d: 'M11 15.4h10.6a2.2 2.2 0 0 1-2.2 2.6H11z', fill: '#2f6fc0' },
    { d: 'M12 7.2v8M7.4 9.2c-1 1.8-1.4 3.8-1.4 6.2', stroke: '#2f6fc0', sw: 1.2 },
    { d: circle(12, 6.9, 1.3), fill: '#ff5f6d' },
  ]),
  flower: icon([
    { d: flowerPetals(), fill: '#ffb3d1' },
    { d: circle(12, 12, 3.2), fill: '#ffd84a' },
  ]),
  tophat: icon([
    { d: rect(7, 3.2, 10, 13, 1), fill: '#353545' },
    { d: rect(7, 11.8, 10, 2.6), fill: '#e8232e' },
    { d: rect(2.8, 15.8, 18.4, 3.4, 1.6), fill: '#353545' },
    { d: 'M9.2 5.2v5', stroke: '#6a6a80', sw: 1.4 },
  ]),
  partyHat: icon([
    { d: 'M12 3.6 5.4 20.4h13.2z', fill: '#b07cff' },
    { d: 'M9.6 10h4.8M8 14.6h8', stroke: '#ffd84a', sw: 2 },
    { d: circle(12, 3.4, 2), fill: '#ffcc33' },
  ]),
  /** 기사 투구 — 강철 투구 + 눈 틈 바이저 + 빨간 깃털 */
  knightHelmet: icon([
    {
      d: 'M11.6 5.2c-.6-2.6 1.4-4.4 4.6-4 3.2.4 5.4 2.6 6 5.8-1.6-1.2-3.2-1.6-4.8-1.4 1 .9 1.7 2 1.9 3.2-2.1-1.7-4.8-2.6-7.7-3.6z',
      fill: '#e8232e',
    },
    { d: 'M14.4 3c1.6-.4 3.4.2 4.6 1.6', stroke: '#ff8a8a', sw: 1 },
    { d: 'M4.8 20.6V11.4a7.2 7.2 0 0 1 14.4 0v9.2z', fill: '#b8c4d6' },
    { d: 'M12 4.4v7.6', stroke: '#8a96aa', sw: 1.2 },
    { d: 'M7.6 10a4.6 4.6 0 0 1 3-3.4', stroke: '#ffffff', sw: 1.4 },
    { d: rect(4.8, 12, 14.4, 3.4, 0.8), fill: '#6a7890' },
    { d: 'M7.2 13.7h3.6M13.2 13.7h3.6', stroke: OUTLINE, sw: 1.4 },
    { d: 'M9.4 17.2v1.8M12 17.4v1.8M14.6 17.2v1.8', stroke: '#6a7890', sw: 1.2 },
  ]),
  halo: icon([
    { d: ellipse(12, 12, 9, 4), stroke: OUTLINE, sw: 4.5 },
    { d: ellipse(12, 12, 9, 4), stroke: '#ffd84a', sw: 3 },
    { d: 'M5.4 10.6c1.6-1 3.8-1.6 6.6-1.6', stroke: '#fff3b0', sw: 1.2 },
  ]),
  cowboy: icon([
    {
      d: 'M7 7.4c0-2.2 2-3.8 2.8-3.8.8 0 1.4.8 2.2.8s1.4-.8 2.2-.8c.8 0 2.8 1.6 2.8 3.8l.6 6.6H6.4z',
      fill: '#c8743a',
    },
    { d: rect(6.6, 11.4, 10.8, 2.2), fill: '#6a3a1a' },
    {
      d: 'M1.8 13.4c2 2.6 5.6 3.2 10.2 3.2s8.2-.6 10.2-3.2c-.5 3.2-4.2 5.8-10.2 5.8S2.3 16.6 1.8 13.4z',
      fill: '#a85a28',
    },
  ]),

  /* 버튼 — 글자색을 따른다 */
  fullscreen: icon(
    [{ d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', stroke: CURRENT, sw: 2.2 }],
    false,
  ),
  fullscreenExit: icon(
    [{ d: 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5', stroke: CURRENT, sw: 2.2 }],
    false,
  ),
  soundOn: icon(
    [
      { d: 'M3.5 9h4l5-4.5v15l-5-4.5h-4z', fill: CURRENT },
      { d: 'M15.8 8.6a5 5 0 0 1 0 6.8M18.4 6a8.6 8.6 0 0 1 0 12', stroke: CURRENT, sw: 2 },
    ],
    false,
  ),
  soundOff: icon(
    [
      { d: 'M3.5 9h4l5-4.5v15l-5-4.5h-4z', fill: CURRENT },
      { d: 'M16 9.5l5 5M21 9.5l-5 5', stroke: CURRENT, sw: 2 },
    ],
    false,
  ),
  pause: icon(
    [{ d: rect(6, 4.5, 4.2, 15, 1) + rect(13.8, 4.5, 4.2, 15, 1), fill: CURRENT }],
    false,
  ),
  close: icon([{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', stroke: CURRENT, sw: 2.4 }], false),
} satisfies Record<string, IconDef>;

export type IconId = keyof typeof ICONS;

export function isIconId(id: string): id is IconId {
  return Object.prototype.hasOwnProperty.call(ICONS, id);
}

/* ---------- 광택 색 ---------- */

/** 그라데이션 · 광택을 입힐 면인지 — 외곽선색 · 글자색 면은 그대로 칠한다 */
export function isShaded(fill: string): boolean {
  return fill.startsWith('#') && fill !== OUTLINE;
}

function mixHex(hex: string, to: readonly [number, number, number], k: number): string {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgb(${rgb.map((v, i) => Math.round(v + (to[i]! - v) * k)).join(' ')})`;
}

/** 면 그라데이션 — 위 · 가운데 · 아래 색 */
export function shadeStops(fill: string): [string, string, string] {
  return [mixHex(fill, [255, 255, 255], 0.38), fill, mixHex(fill, [20, 22, 36], 0.28)];
}

/* ---------- 캔버스에 그리기 ---------- */

const pathCache = new Map<string, Path2D>();

function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxCache = new Map<string, Box>();
let measureSvg: SVGSVGElement | null = null;

/** 경로가 차지하는 사각형 — 그라데이션을 면마다 맞추려고 브라우저에 한 번 재 본다 */
function layerBox(d: string): Box {
  let b = boxCache.get(d);
  if (b) return b;
  b = { x: 0, y: 0, w: 24, h: 24 };
  try {
    if (!measureSvg) {
      measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      measureSvg.setAttribute('width', '24');
      measureSvg.setAttribute('height', '24');
      measureSvg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
      document.body.appendChild(measureSvg);
    }
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    measureSvg.appendChild(p);
    const r = p.getBBox();
    p.remove();
    if (r.width > 0 && r.height > 0) b = { x: r.x, y: r.y, w: r.width, h: r.height };
  } catch {
    // 잴 수 없으면 아이콘 전체 기준
  }
  boxCache.set(d, b);
  return b;
}

/** 면마다 그라데이션 · 광택 — 아이콘 좌표(24 단위)에서 만들어 두고 다시 쓴다 */
interface Paint {
  body: CanvasGradient;
  gloss: CanvasGradient | null;
  box: Box;
}

const paintCache = new WeakMap<CanvasRenderingContext2D, Map<string, Paint>>();

function paintOf(ctx: CanvasRenderingContext2D, d: string, fill: string): Paint {
  let map = paintCache.get(ctx);
  if (!map) {
    map = new Map();
    paintCache.set(ctx, map);
  }
  const key = `${fill}|${d}`;
  let paint = map.get(key);
  if (!paint) {
    const box = layerBox(d);
    const [top, mid, bottom] = shadeStops(fill);
    const body = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    body.addColorStop(0, top);
    body.addColorStop(0.55, mid);
    body.addColorStop(1, bottom);
    let gloss: CanvasGradient | null = null;
    if (box.w > 3 && box.h > 3) {
      gloss = ctx.createLinearGradient(0, box.y, 0, box.y + box.h * 0.5);
      gloss.addColorStop(0, `rgb(255 255 255 / ${GLOSS_ALPHA})`);
      gloss.addColorStop(1, 'rgb(255 255 255 / 0)');
    }
    paint = { body, gloss, box };
    map.set(key, paint);
  }
  return paint;
}

/** (cx, cy) 를 가운데로 size 크기의 아이콘을 그린다 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  id: IconId,
  cx: number,
  cy: number,
  size: number,
) {
  const def: IconDef = ICONS[id];
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const l of def.layers) {
    const p = path2d(l.d);
    if (l.fill) {
      if (def.outline) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.stroke(p);
      }
      if (!isShaded(l.fill)) {
        ctx.fillStyle = l.fill === CURRENT ? '#fff' : l.fill;
        ctx.fill(p);
      } else {
        const paint = paintOf(ctx, l.d, l.fill);
        ctx.fillStyle = paint.body;
        ctx.fill(p);
        // 윗부분 광택 — 면 안쪽에만
        if (paint.gloss) {
          const b = paint.box;
          ctx.save();
          ctx.clip(p);
          ctx.fillStyle = paint.gloss;
          ctx.beginPath();
          ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.18, b.w * 0.48, b.h * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    if (l.stroke) {
      ctx.strokeStyle = l.stroke === CURRENT ? '#fff' : l.stroke;
      ctx.lineWidth = l.sw ?? 2;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}
