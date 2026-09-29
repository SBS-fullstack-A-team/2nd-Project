/** 과일 슬라이서 규칙 · 데이터 */
export const GAME_ID = 'fruit-slicer';

/** 캔버스 논리 높이 — 너비는 화면 비율에 맞춰 정해지고, 실제 크기로 확대/축소해서 그린다 */
export const VIEW_HEIGHT = 500;

export const START_LIVES = 3;
export const POINTS_PER_FRUIT = 10;
/** 콤보 판정: 직전 슬라이스로부터 이 시간(초) 안에 또 베면 연속으로 본다 */
export const COMBO_WINDOW_SEC = 0.2;
export const COMBO_MIN = 3;
/** 콤보 보너스 = 콤보 수 × 이 값 */
export const COMBO_BONUS_PER_FRUIT = 10;
/**
 * 점수 상한 — 서버 검증용. 게임은 이 값을 넘지 않게 자른다.
 * 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
 */
export const MAX_SCORE = 100_000;

/** 랭킹 모달에 보여줄 개수 */
export const RANKING_SIZE = 5;

// ---------- 과일 ----------

export type FruitKind = 'apple' | 'banana' | 'watermelon' | 'orange' | 'coconut' | 'kiwi';

export interface FruitType {
  kind: FruitKind;
  label: string;
  radius: number;
  /** 껍질 색 (그라데이션 밝은 쪽 / 어두운 쪽) */
  skinLight: string;
  skinDark: string;
  /** 단면(과육) 색 */
  flesh: string;
  /** 과즙 색 */
  juice: string;
}

export const FRUIT_TYPES: readonly FruitType[] = [
  {
    kind: 'apple',
    label: '사과',
    radius: 30,
    skinLight: '#ff6b6b',
    skinDark: '#b3121f',
    flesh: '#fff3c4',
    juice: '#ff4d4d',
  },
  {
    kind: 'banana',
    label: '바나나',
    radius: 32,
    skinLight: '#fff27a',
    skinDark: '#e0b400',
    flesh: '#fffbe0',
    juice: '#ffe95c',
  },
  {
    kind: 'watermelon',
    label: '수박',
    radius: 42,
    skinLight: '#5fd068',
    skinDark: '#1e7a2e',
    flesh: '#ff4f6d',
    juice: '#ff3355',
  },
  {
    kind: 'orange',
    label: '오렌지',
    radius: 30,
    skinLight: '#ffb347',
    skinDark: '#e06600',
    flesh: '#ffc766',
    juice: '#ff9a1f',
  },
  {
    kind: 'coconut',
    label: '코코넛',
    radius: 32,
    skinLight: '#a0704a',
    skinDark: '#4a2c17',
    flesh: '#fbf7ee',
    juice: '#f4efe4',
  },
  {
    kind: 'kiwi',
    label: '키위',
    radius: 27,
    skinLight: '#b08a5a',
    skinDark: '#6b4f2a',
    flesh: '#8fd14f',
    juice: '#9be15d',
  },
];

// ---------- 난이도 ----------

/** 스폰 간격(초): 시작값 → 최소값 */
export const SPAWN_INTERVAL_START = 1.5;
export const SPAWN_INTERVAL_MIN = 0.55;
/** 한 번에 튀어 오르는 개수 상한 */
export const MAX_WAVE_SIZE = 6;
export const BOMB_CHANCE_START = 0.08;
export const BOMB_CHANCE_MAX = 0.22;
/** 중력 가속도 (논리 px / s²) */
export const GRAVITY = 900;

// ---------- 검(Blade) 스킨 ----------

export type BladeId = 'basic' | 'flame' | 'neon' | 'sakura' | 'golden';

export interface BladeDef {
  id: BladeId;
  name: string;
  description: string;
  /** 선택창 미리보기 색 (CSS gradient) */
  preview: string;
}

export const BLADES: readonly BladeDef[] = [
  {
    id: 'basic',
    name: '기본 검',
    description: '은색 궤적과 단순한 불꽃',
    preview: 'linear-gradient(90deg, #7a8391, #ffffff, #7a8391)',
  },
  {
    id: 'flame',
    name: '화염 검',
    description: '주황·빨강 불꽃 궤적과 연기',
    preview: 'linear-gradient(90deg, #7a0b00, #ff5a1f, #ffd23f)',
  },
  {
    id: 'neon',
    name: '네온 사이버',
    description: '네온 블루·핑크 번개와 잔상',
    preview: 'linear-gradient(90deg, #00e5ff, #6a5cff, #ff2bd6)',
  },
  {
    id: 'sakura',
    name: '사쿠라 블레이드',
    description: '핑크빛 궤적과 흩날리는 꽃잎',
    preview: 'linear-gradient(90deg, #ffd1e3, #ff7eb6, #ffd1e3)',
  },
  {
    id: 'golden',
    name: '황금의 칼날',
    description: '찬란한 금빛 궤적과 반짝이는 별',
    preview: 'linear-gradient(90deg, #8a6a00, #ffd700, #fff6c2, #ffd700)',
  },
];

// ---------- 퀘스트 ----------

/** 누적 기록 (localStorage 에 저장) */
export interface PlayerStats {
  totalSliced: number;
  totalCombos: number;
  bestSwipe: number;
  highScore: number;
}

export interface QuestDef {
  id: string;
  title: string;
  reward: BladeId;
  goal: number;
  progress: (stats: PlayerStats) => number;
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'q1',
    title: '누적 과일 50개 슬라이스',
    reward: 'flame',
    goal: 50,
    progress: (s) => s.totalSliced,
  },
  {
    id: 'q2',
    title: '한 번의 스와이프로 과일 3개 베기',
    reward: 'neon',
    goal: 3,
    progress: (s) => s.bestSwipe,
  },
  {
    id: 'q3',
    title: '최고 점수 500점 달성',
    reward: 'sakura',
    goal: 500,
    progress: (s) => s.highScore,
  },
  {
    id: 'q4',
    title: '누적 콤보 20회 달성',
    reward: 'golden',
    goal: 20,
    progress: (s) => s.totalCombos,
  },
];

// ---------- 게임 설명 (메뉴 화면 · 나중에 카드 "게임 설명" 버튼에서도 사용) ----------

export const HOW_TO_PLAY: readonly string[] = [
  '마우스를 누른 채 드래그하거나 화면을 스와이프해서 날아오는 과일을 베세요.',
  `과일 1개당 ${POINTS_PER_FRUIT}점, ${COMBO_WINDOW_SEC}초 안에 연속으로 ${COMBO_MIN}개 이상 베면 콤보 보너스!`,
  `과일을 놓쳐 바닥에 떨어뜨리면 목숨이 1개 줄어요. (목숨 ${START_LIVES}개)`,
  '💣 폭탄을 베면 그 즉시 게임 오버!',
  '퀘스트를 달성하면 새로운 검 스킨이 열려요.',
];
