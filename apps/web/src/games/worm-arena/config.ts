/**
 * 지렁이 아레나 규칙 상수.
 * 월드 좌표 단위는 픽셀과 비슷하다 (카메라 배율 1일 때 1 = 1px). 원형 경기장의 중심이 (0, 0).
 */

/** 경기장 반지름 — 테두리에 머리가 닿으면 끝 */
export const ARENA_RADIUS = 2600;

/** 물리 갱신 간격(초) — 화면 프레임과 상관없이 1초에 60번 계산한다 */
export const TICK = 1 / 60;

/* ---------- 지렁이 ---------- */

/** 처음 길이(점수) */
export const START_MASS = 20;
/** 기본 속도 · 가속 속도 (초당) */
export const SPEED = 170;
export const BOOST_SPEED = 340;
/** 가속하면 1초에 줄어드는 길이 = max(BOOST_COST, 길이 × BOOST_COST_RATIO) — 줄어든 만큼 뒤에 먹이로 떨어진다 */
export const BOOST_COST = 6;
export const BOOST_COST_RATIO = 0.02;
/** 대시 게이지 — 연속으로 가속할 수 있는 시간(초), 1초에 차는 양(초), 다 쓰면 이만큼 차야 다시 쓸 수 있다 */
export const BOOST_STAMINA = 2.5;
export const STAMINA_REGEN = 0.6;
export const STAMINA_RESUME = 0.35;
/** 이 길이보다 짧으면 가속할 수 없다 */
export const MIN_BOOST_MASS = 14;
/** 1초에 돌 수 있는 각도(라디안) — 몸이 굵을수록 조금씩 느려진다 */
export const TURN_RATE = 4.2;
export const TURN_RATE_MIN = 2.2;

/** 몸 굵기(반지름) = BASE + √길이 × GROWTH, 최대 MAX */
export const RADIUS_BASE = 7;
export const RADIUS_GROWTH = 0.55;
export const RADIUS_MAX = 34;
/** 마디 개수 = 길이 × SEGMENTS_PER_MASS (최소 MIN, 최대 MAX) */
export const SEGMENTS_PER_MASS = 0.5;
export const SEGMENTS_MIN = 8;
export const SEGMENTS_MAX = 420;
/** 마디 사이 간격 = 반지름 × SPACING */
export const SEGMENT_SPACING = 0.55;

/* ---------- 먹이 ---------- */

/** 경기장에 항상 깔려 있는 작은 먹이 수 */
export const FOOD_COUNT = 900;
/** 작은 먹이 하나의 길이 값 (1 ~ 3) */
export const FOOD_VALUE_MIN = 1;
export const FOOD_VALUE_MAX = 3;
/** 머리에서 이 거리(+ 반지름) 안의 먹이는 끌려와서 먹힌다 */
export const EAT_RANGE = 26;
/** 죽은 지렁이는 길이의 이 비율만큼 먹이로 변한다 */
export const DEATH_DROP_RATIO = 0.8;

/* ---------- AI 지렁이 ---------- */

/** 경기장에 있는 AI 지렁이 수 — 죽으면 잠시 뒤 새로 들어온다 */
export const BOT_COUNT = 14;
export const BOT_RESPAWN_DELAY = 2.5;
/** 새로 들어오는 AI 길이 범위 */
export const BOT_MASS_MIN = 20;
export const BOT_MASS_MAX = 260;
/** AI 가 앞을 내다보는 거리 — 이 안에 몸통·테두리가 있으면 피한다 */
export const BOT_LOOKAHEAD = 140;
/** 처음에 AI 가 플레이어 근처에 생기지 않도록 비워 두는 거리 */
export const SAFE_SPAWN_DISTANCE = 700;

export const BOT_NAMES = [
  '꿈틀이',
  '지렁맨',
  '흙파는놈',
  '비오는날',
  '꼬물꼬물',
  '젤리지렁',
  '낚시미끼',
  '땅속왕',
  '분홍이',
  '길쭉이',
  '무지개뱀',
  '한입만',
  '배고파',
  '느림보',
  '번개지렁',
  '초코롤',
  '마라탕',
  '국수가닥',
  '스파게티',
  '심심해',
] as const;

/* ---------- 파워업 ---------- */

export type PowerKind = 'magnet' | 'turbo' | 'shield' | 'double' | 'ghost';

export interface PowerDef {
  kind: PowerKind;
  label: string;
  icon: string;
  color: string;
  /** 지속 시간(초) — 방패는 한 번 막아 주면 바로 사라진다 */
  seconds: number;
  /** 나오는 비율 */
  weight: number;
}

export const POWERS: readonly PowerDef[] = [
  { kind: 'magnet', label: '자석', icon: '🧲', color: '#ff5f6d', seconds: 10, weight: 3 },
  { kind: 'turbo', label: '터보', icon: '⚡', color: '#ffc93c', seconds: 7, weight: 3 },
  { kind: 'shield', label: '방패', icon: '🛡️', color: '#4fc3f7', seconds: 15, weight: 2 },
  { kind: 'double', label: '먹이 ×2', icon: '✖️', color: '#7ee081', seconds: 12, weight: 2 },
  { kind: 'ghost', label: '유령', icon: '👻', color: '#c9b6ff', seconds: 5, weight: 1.5 },
];

export function findPower(kind: PowerKind): PowerDef {
  return POWERS.find((p) => p.kind === kind)!;
}

/** 경기장에 동시에 떠 있는 파워업 수 · 새로 생기는 간격(초) · 안 먹으면 사라지는 시간(초) */
export const POWER_MAX = 6;
export const POWER_INTERVAL = 5;
export const POWER_LIFE = 30;
/** 자석이 먹이를 끌어당기는 범위 배율 */
export const MAGNET_RANGE = 4;
/** 방패가 막아 준 뒤 잠깐 무적인 시간(초) — 그 사이 빠져나간다 */
export const SHIELD_GRACE = 1.5;

/* ---------- 연속 킬 ---------- */

/** 이 시간(초) 안에 또 쓰러뜨리면 연속 킬 */
export const STREAK_WINDOW = 5;
/** 연속 킬 보너스 길이 = (연속 수 - 1) × STREAK_BONUS */
export const STREAK_BONUS = 15;
export const STREAK_NAMES = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '펜타 킬!'] as const;

/* ---------- 황금 먹이 잔치 ---------- */

/** 처음 잔치 · 다음 잔치까지 간격(초) */
export const FEAST_FIRST = 20;
export const FEAST_INTERVAL = 30;
/** 잔치 먹이 개수 · 퍼지는 반경 · 한 개 값 · 남아 있는 시간(초) */
export const FEAST_COUNT = 40;
export const FEAST_RADIUS = 150;
export const FEAST_VALUE = 5;
export const FEAST_LIFE = 25;
export const FEAST_COLOR = '#ffd84a';

/* ---------- 스킨 ---------- */

export interface Skin {
  id: string;
  label: string;
  /** 마디마다 돌아가며 칠하는 색 */
  colors: readonly string[];
}

export const SKINS: readonly Skin[] = [
  { id: 'pink', label: '분홍 지렁이', colors: ['#ff7aa8', '#ff9ec0'] },
  { id: 'lime', label: '라임', colors: ['#9be15d', '#6fc23a'] },
  { id: 'sky', label: '하늘', colors: ['#5ec8ff', '#3a9ae8'] },
  { id: 'sunset', label: '노을', colors: ['#ffb347', '#ff7a45', '#ff4f6d'] },
  { id: 'grape', label: '포도', colors: ['#b07cff', '#8a55e8'] },
  { id: 'zebra', label: '얼룩말', colors: ['#f4f4f4', '#2a2a2a'] },
  {
    id: 'rainbow',
    label: '무지개',
    colors: ['#ff5f5f', '#ffb35f', '#ffe95f', '#6bdc6b', '#5fb8ff', '#a77bff'],
  },
  { id: 'gold', label: '황금', colors: ['#ffd84a', '#e8a920'] },
];

/** AI 지렁이 색 후보 */
export const BOT_COLORS: readonly (readonly string[])[] = [
  ['#ff6b6b', '#e84a4a'],
  ['#4ecdc4', '#2fb3aa'],
  ['#ffe66d', '#f2c94c'],
  ['#a29bfe', '#7f75f0'],
  ['#fd79a8', '#e8508a'],
  ['#55efc4', '#20c997'],
  ['#fab1a0', '#e17055'],
  ['#74b9ff', '#4a90e2'],
  ['#ffeaa7', '#fdcb6e', '#e17055'],
  ['#81ecec', '#00cec9', '#0984e3'],
];

/** 먹이 색 */
export const FOOD_COLORS = [
  '#ff5f7e',
  '#ffb35f',
  '#ffe95f',
  '#6bdc6b',
  '#5fd4ff',
  '#7b8bff',
  '#d17bff',
  '#ff7bd1',
] as const;

/* ---------- 화면 ---------- */

/** 카메라 배율 — 길어질수록 조금씩 멀리 본다 */
export const ZOOM_MAX = 1;
export const ZOOM_MIN = 0.55;
/** 랭킹에 보여 줄 지렁이 수 */
export const LEADERBOARD_SIZE = 5;

/**
 * 게임 내부 점수 상한 — packages/shared 의 MAX_SCORE_BY_GAME 과 같게.
 * 점수 = 가장 길었을 때 길이. 경기장 먹이와 AI 를 전부 먹어도 수만 점이라 넉넉히 잡았다.
 */
export const MAX_SCORE = 100_000;

export const HOW_TO_PLAY = [
  '먹이를 먹고 길어지세요. 가장 길었을 때 길이가 점수예요.',
  '머리가 다른 지렁이 몸에 닿거나 경기장 벽에 닿으면 끝!',
  '가속해서 다른 지렁이 앞을 막으면, 부딪힌 지렁이가 먹이로 변해요.',
  '🧲⚡🛡️✖️👻 파워업을 먹고, ★ 황금 먹이 잔치를 노려 보세요!',
] as const;

export const CONTROLS = [
  { keys: '마우스', action: '방향' },
  { keys: '클릭 (꾹) · 스페이스', action: '가속' },
  { keys: '← → / A D', action: '키보드로 돌기' },
  { keys: 'Esc · P', action: '일시정지' },
  { keys: 'F · ⛶', action: '전체 화면' },
] as const;
