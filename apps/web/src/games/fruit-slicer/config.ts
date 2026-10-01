/** 과일 슬라이서 규칙 · 데이터 */
export const GAME_ID = 'fruit-slicer';

/** 캔버스 논리 높이 — 너비는 화면 비율에 맞춰 정해지고, 실제 크기로 확대/축소해서 그린다 */
export const VIEW_HEIGHT = 500;

export const START_LIVES = 3;
export const POINTS_PER_FRUIT = 10;
/**
 * 콤보 = 과일을 놓치지 않고 연속으로 벤 개수. 과일 1개를 벨 때마다 +1 (동시에 3개면 +3),
 * 과일을 하나라도 놓치면 0 으로 돌아간다.
 * COMBO_MILESTONE 단위(10, 20, 30…)에 닿을 때마다 콤보 수 × COMBO_MILESTONE_BONUS 보너스
 */
export const COMBO_MILESTONE = 10;
export const COMBO_MILESTONE_BONUS = 5;
/**
 * 점수 상한 — 서버 검증용. 게임은 이 값을 넘지 않게 자른다.
 * 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
 */
export const MAX_SCORE = 100_000;

/** 랭킹 모달에 보여줄 개수 */
export const RANKING_SIZE = 5;

// ---------- 피버 타임 ----------

/** 콤보가 이만큼 쌓이면 피버 타임 발동 (피버가 끝나면 다시 0 부터 채운다) */
export const FEVER_COMBO_GOAL = 20;
export const FEVER_DURATION_SEC = 10;
/** 피버 중 과일 점수 배율 */
export const FEVER_SCORE_MULTIPLIER = 2;
/** 피버 중 폭탄을 베면 얻는 점수 */
export const FEVER_BOMB_POINTS = 30;

// ---------- 과일 ----------

export type FruitKind =
  'apple' | 'banana' | 'watermelon' | 'orange' | 'coconut' | 'kiwi' | 'strawberry';

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
  {
    kind: 'strawberry',
    label: '딸기',
    radius: 25,
    skinLight: '#ff5a6e',
    skinDark: '#c0102a',
    flesh: '#ff9aa8',
    juice: '#ff2d55',
  },
];

// ---------- 난이도 ----------

/**
 * 난이도(0 → 1) = (경과 시간 / DIFFICULTY_FULL_SEC + 점수 / DIFFICULTY_FULL_SCORE) 의 평균.
 * 예전엔 100초·4000점 기준을 "더해서" 2000점 즈음 최고 난이도가 되어 너무 빨랐다.
 * 지금은 2분·2000점일 때 약 0.5 (스폰 간격 약 1.2초, 한 번에 최대 3개).
 */
export const DIFFICULTY_FULL_SEC = 180;
export const DIFFICULTY_FULL_SCORE = 5000;
/** 스폰 간격(초): 시작값 → 최소값 */
export const SPAWN_INTERVAL_START = 1.5;
export const SPAWN_INTERVAL_MIN = 0.85;
/** 한 번에 튀어 오르는 개수 상한 */
export const MAX_WAVE_SIZE = 4;
export const BOMB_CHANCE_START = 0.08;
export const BOMB_CHANCE_MAX = 0.17;
/** 중력 가속도 (논리 px / s²) */
export const GRAVITY = 900;

// ---------- 검(Blade) 스킨 ----------

export type BladeId =
  | 'basic'
  | 'flame'
  | 'neon'
  | 'sakura'
  | 'golden'
  | 'gale'
  | 'tide'
  | 'venom'
  | 'amethyst'
  | 'crimson'
  | 'frost'
  | 'thunder'
  | 'void'
  | 'prism'
  | 'galaxy'
  | 'dragon';

export interface BladeDef {
  id: BladeId;
  name: string;
  description: string;
  /** 선택창 미리보기 색 (CSS gradient) */
  preview: string;
  /** 등급 — 일반 < 에픽 < 전설. 선택창에서 등급 표시 */
  tier: BladeTier;
}

export type BladeTier = 'normal' | 'epic' | 'legend' | 'champion';

export const TIER_LABEL: Record<BladeTier, string> = {
  normal: '일반',
  epic: '에픽',
  legend: '전설',
  champion: '👑 TOP 3',
};

/**
 * 랭커 전용 검 — 퀘스트로는 열 수 없고, 서버 전체 랭킹 CHAMPION_RANK 위 안에
 * 내 닉네임(마지막으로 등록한 이름)이 있을 때만 쓸 수 있다. 순위 밖으로 밀려나면 다시 잠긴다.
 */
export const CHAMPION_BLADE_ID = 'dragon' satisfies BladeId;
export const CHAMPION_RANK = 3;

export const BLADES: readonly BladeDef[] = [
  {
    id: 'basic',
    name: '기본 검',
    description: '은색 궤적과 단순한 불꽃',
    preview: 'linear-gradient(90deg, #7a8391, #ffffff, #7a8391)',
    tier: 'normal',
  },
  {
    id: 'flame',
    name: '화염 검',
    description: '주황·빨강 불꽃 궤적과 연기',
    preview: 'linear-gradient(90deg, #7a0b00, #ff5a1f, #ffd23f)',
    tier: 'normal',
  },
  {
    id: 'neon',
    name: '네온 사이버',
    description: '네온 블루·핑크 번개와 잔상',
    preview: 'linear-gradient(90deg, #00e5ff, #6a5cff, #ff2bd6)',
    tier: 'normal',
  },
  {
    id: 'sakura',
    name: '사쿠라 블레이드',
    description: '핑크빛 궤적과 흩날리는 꽃잎',
    preview: 'linear-gradient(90deg, #ffd1e3, #ff7eb6, #ffd1e3)',
    tier: 'normal',
  },
  {
    id: 'golden',
    name: '황금의 칼날',
    description: '찬란한 금빛 궤적과 반짝이는 별',
    preview: 'linear-gradient(90deg, #8a6a00, #ffd700, #fff6c2, #ffd700)',
    tier: 'normal',
  },
  // ----- 에픽 등급 -----
  {
    id: 'gale',
    name: '질풍의 검',
    description: '휘몰아치는 바람 줄기와 흩날리는 나뭇잎',
    preview: 'linear-gradient(90deg, #e9fff4, #7ee8b8, #2fb58a, #e9fff4)',
    tier: 'epic',
  },
  {
    id: 'tide',
    name: '파도의 검',
    description: '넘실대는 물빛 궤적과 떠오르는 물방울',
    preview: 'linear-gradient(90deg, #04386b, #1f8fff, #7fe0ff, #1f8fff)',
    tier: 'epic',
  },
  {
    id: 'venom',
    name: '독사의 검',
    description: '독기 어린 초록 궤적과 부글거리는 독방울',
    preview: 'linear-gradient(90deg, #102a06, #6bd425, #c6ff4d, #3a8f12)',
    tier: 'epic',
  },
  {
    id: 'amethyst',
    name: '자수정 검',
    description: '보랏빛 결정 궤적과 반짝이는 자수정 조각',
    preview: 'linear-gradient(90deg, #3b1466, #9b5cff, #e2c6ff, #9b5cff)',
    tier: 'epic',
  },
  {
    id: 'crimson',
    name: '진홍 월광검',
    description: '붉은 달빛 궤적과 초승달 모양 검기',
    preview: 'linear-gradient(90deg, #2a0006, #c3002f, #ff6b81, #c3002f)',
    tier: 'epic',
  },
  // ----- 전설 등급 -----
  {
    id: 'frost',
    name: '서리 여왕의 검',
    description: '얼음빛 궤적, 눈꽃 결정과 차가운 서리 안개',
    preview: 'linear-gradient(90deg, #e8fbff, #7fdcff, #2a7bd8, #e8fbff)',
    tier: 'legend',
  },
  {
    id: 'thunder',
    name: '뇌신의 검',
    description: '갈라지는 번개 가지와 튀는 전격 스파크',
    preview: 'linear-gradient(90deg, #1b1f5e, #6c7bff, #ffffff, #ffe95c)',
    tier: 'legend',
  },
  {
    id: 'void',
    name: '공허의 검',
    description: '빛을 삼키는 검은 칼날과 보랏빛 공허 파편',
    preview: 'linear-gradient(90deg, #0a0014, #6b21ff, #1a0030, #c77dff)',
    tier: 'legend',
  },
  {
    id: 'prism',
    name: '프리즘 블레이드',
    description: '색이 흐르는 무지개 궤적과 빛의 결정 조각',
    preview: 'linear-gradient(90deg, #ff4d4d, #ffd23f, #4dff88, #4dc3ff, #b84dff)',
    tier: 'legend',
  },
  {
    id: 'galaxy',
    name: '갤럭시 세이버',
    description: '성운이 소용돌이치는 궤적과 반짝이는 별무리',
    preview: 'linear-gradient(90deg, #120a3a, #5b2bff, #ff5ec8, #7dd8ff, #120a3a)',
    tier: 'legend',
  },
  // ----- 랭커 전용 (전체 랭킹 TOP 3) -----
  {
    id: 'dragon',
    name: '청룡의 검',
    description: '궤적을 따라 꿈틀대며 나는 청룡과 여의주, 피어오르는 상서로운 구름',
    preview: 'linear-gradient(90deg, #06302c, #1fb59a, #7fffe0, #ffcf4a, #1fb59a, #06302c)',
    tier: 'champion',
  },
];

// ---------- 퀘스트 ----------

/** 누적 기록 (localStorage 에 저장) */
export interface PlayerStats {
  totalSliced: number;
  bestSwipe: number;
  highScore: number;
  /** 최고 콤보 (놓치지 않고 연속으로 벤 최대 개수) */
  maxCombo: number;
  /** 누적 피버 타임 발동 횟수 */
  totalFevers: number;
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
    title: '콤보 20 달성',
    reward: 'golden',
    goal: 20,
    progress: (s) => s.maxCombo,
  },
  // ----- 중급 퀘스트 → 에픽 검 (일반과 전설 사이 난이도) -----
  {
    id: 'e1',
    title: '누적 과일 200개 슬라이스',
    reward: 'gale',
    goal: 200,
    progress: (s) => s.totalSliced,
  },
  {
    id: 'e2',
    title: '한 번의 스와이프로 과일 4개 베기',
    reward: 'tide',
    goal: 4,
    progress: (s) => s.bestSwipe,
  },
  {
    id: 'e3',
    title: '콤보 40 달성',
    reward: 'venom',
    goal: 40,
    progress: (s) => s.maxCombo,
  },
  {
    id: 'e4',
    title: '최고 점수 1000점 달성',
    reward: 'amethyst',
    goal: 1000,
    progress: (s) => s.highScore,
  },
  {
    id: 'e5',
    title: '피버 타임 1회 발동',
    reward: 'crimson',
    goal: 1,
    progress: (s) => s.totalFevers,
  },
  // ----- 상급 퀘스트 → 전설 검 -----
  {
    id: 'q5',
    title: '누적 과일 500개 슬라이스',
    reward: 'frost',
    goal: 500,
    progress: (s) => s.totalSliced,
  },
  {
    id: 'q6',
    title: '한 번의 스와이프로 과일 5개 베기',
    reward: 'thunder',
    goal: 5,
    progress: (s) => s.bestSwipe,
  },
  {
    id: 'q7',
    title: '콤보 60 달성',
    reward: 'void',
    goal: 60,
    progress: (s) => s.maxCombo,
  },
  {
    id: 'q8',
    title: '최고 점수 2000점 달성',
    reward: 'prism',
    goal: 2000,
    progress: (s) => s.highScore,
  },
  {
    id: 'q9',
    title: '피버 타임 3회 발동',
    reward: 'galaxy',
    goal: 3,
    progress: (s) => s.totalFevers,
  },
];

// ---------- 게임 설명 (메뉴 화면 · 나중에 카드 "게임 설명" 버튼에서도 사용) ----------

export const HOW_TO_PLAY: readonly string[] = [
  '마우스를 누른 채 드래그하거나 화면을 스와이프해서 날아오는 과일을 베세요.',
  `과일 1개당 ${POINTS_PER_FRUIT}점. 과일을 벨 때마다 콤보 +1 (동시에 3개를 베면 +3), 하나라도 놓치면 콤보는 0!`,
  `콤보 ${COMBO_MILESTONE}, ${COMBO_MILESTONE * 2}, ${COMBO_MILESTONE * 3}… 에 닿을 때마다 보너스 점수!`,
  `과일을 놓쳐 바닥에 떨어뜨리면 목숨이 1개 줄어요. (목숨 ${START_LIVES}개)`,
  '💣 폭탄을 베면 그 즉시 게임 오버!',
  `🔥 콤보 ${FEVER_COMBO_GOAL}을 쌓으면 ${FEVER_DURATION_SEC}초간 피버 타임! 폭탄까지 전부 벨 수 있고 점수 ${FEVER_SCORE_MULTIPLIER}배, 과일을 놓쳐도 목숨과 콤보가 유지돼요.`,
  '퀘스트를 달성하면 새로운 검 스킨이 열려요. 일반 → 에픽 → 전설 등급 검 15종을 모아 보세요!',
  `👑 전체 랭킹 TOP ${CHAMPION_RANK} 안에 이름을 올리면 랭커 전용 검 「청룡의 검」을 쓸 수 있어요. 순위 밖으로 밀려나면 다시 잠겨요!`,
  '⚙️ 오른쪽 위 설정 버튼(또는 Esc 키)으로 일시정지하고 사운드·밝기를 바꿀 수 있어요.',
];
