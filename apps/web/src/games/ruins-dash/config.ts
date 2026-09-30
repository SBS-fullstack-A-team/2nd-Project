/** 유적 탈출 규칙 · 수치 모음 */
export const GAME_ID = 'ruins-dash';

/**
 * 점수 상한 — 서버 검증용. 게임은 이 값을 넘지 않게 자른다.
 * 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
 */
export const MAX_SCORE = 3_000_000;

// ---------- 레인 · 원근 ----------

/** 레인 수 (왼쪽 -1, 가운데 0, 오른쪽 1) */
export const LANES = [-1, 0, 1] as const;
export type Lane = (typeof LANES)[number];

/** 장애물이 처음 생기는 거리 (월드 단위, 1단위 = 1m) */
export const SPAWN_DISTANCE = 70;
/** 원근 계수 — 클수록 멀리 있는 것이 덜 작아진다 */
export const PERSPECTIVE = 9;
/** 레인을 바꾸는 데 걸리는 시간(초) */
export const LANE_SWITCH_SEC = 0.13;

// ---------- 속도 ----------

/** 시작 속도 (m/s) */
export const START_SPEED = 19;
/** 최고 속도 (m/s) */
export const MAX_SPEED = 42;
/** 초당 가속량 (m/s²) — 약 90초 만에 최고 속도에 닿는다 */
export const ACCELERATION = 0.26;

// ---------- 동작 ----------

export const JUMP_SEC = 0.62;
/** 점프 최고 높이 (월드 단위) */
export const JUMP_HEIGHT = 1.6;
export const SLIDE_SEC = 0.66;
/** 낮은 장애물을 넘었다고 볼 최소 점프 높이 */
export const CLEAR_HEIGHT = 0.55;

/** 이 거리 안에 들어오면 부딪힌 것으로 본다 (앞뒤 판정 폭) */
export const HIT_DEPTH = 0.9;

// ---------- 장애물 배치 ----------

/**
 * 장애물 줄 사이 간격(초). 속도가 빨라질수록 거리는 늘지만 반응 시간은 점점 줄어든다.
 * 시작 → 최소 간격까지 경과 시간에 따라 줄어든다.
 */
export const ROW_GAP_START_SEC = 1.15;
export const ROW_GAP_MIN_SEC = 0.6;
export const ROW_GAP_SHRINK_PER_SEC = 0.005;

/** 게임 시작 직후 장애물 없이 달리는 시간 */
export const GRACE_SEC = 1.6;

// ---------- 점수 ----------

/** 동전 1개 점수 */
export const COIN_POINTS = 10;
/** 한 줄에 놓이는 동전 개수 */
export const COIN_TRAIL = 5;
/** 동전 사이 간격 (m) */
export const COIN_SPACING = 2.4;

// ---------- 지형 ----------

/**
 * 구간별 지형 (템플런의 성벽·물가·절벽).
 * - temple: 돌길. 통나무·들보·기둥이 모두 나온다
 * - river: 물 위 나무다리. 점프로 넘는 것(통나무, 끊어진 판자)만 나온다
 * - cliff: 낭떠러지 위 돌길. 슬라이드로 지나는 아치와 바위만 나온다
 */
export type Theme = 'temple' | 'river' | 'cliff';

/** 모퉁이를 돌면 바뀔 수 있는 다음 지형 — 물가와 절벽은 바로 이어지지 않고 신전을 거친다 */
export const NEXT_THEMES: Record<Theme, readonly Theme[]> = {
  temple: ['temple', 'river', 'river', 'cliff', 'cliff'],
  river: ['temple'],
  cliff: ['temple'],
};

/**
 * 물가·절벽 구간이 좁은 길로 나올 확률 — 물가는 외통나무 다리, 절벽은 외길 능선.
 * 좁은 길에서는 레인을 바꿀 수 없고 가운데로만 달린다 (모퉁이 회전은 된다).
 */
export const NARROW_CHANCE = 0.4;

/**
 * 신전·절벽에서 가장자리가 무너진 줄이 나올 확률 — 바깥 레인(한쪽 또는 양쪽)만 뚫려 있어
 * 그 레인에 있으면 떨어진다. 옆으로 비키거나 점프로 건넌다.
 */
export const EDGE_COLLAPSE_CHANCE = 0.14;

export const THEME_LABEL: Record<Theme, string> = {
  temple: '신전',
  river: '물가',
  cliff: '절벽',
};

// ---------- 갈림길 (90° 회전) ----------

/** 첫 모퉁이까지 거리(m) */
export const TURN_FIRST_M = 140;
/** 모퉁이 사이 거리(m) — 시작은 넓고 시간이 지날수록 최소 간격이 줄어든다 */
export const TURN_GAP_MIN_START_M = 120;
// 앞뒤로 비우는 구간이 최고 속도에서 약 78m 라서, 그보다 넉넉히 떨어져야 사이에 장애물이 나온다
export const TURN_GAP_MIN_END_M = 110;
export const TURN_GAP_MAX_M = 200;
/** 모퉁이를 이 거리(m) 앞에서 미리 만든다 — 멀리서부터 꺾인 길이 보이게 */
export const TURN_SPAWN_Z = 95;
/**
 * 모퉁이 앞뒤로 장애물을 두지 않는 구간 — 거리가 아니라 "그 속도로 몇 초" 기준.
 * 거리로 고정하면 빨라질수록 반응할 시간이 줄어든다 (최고 속도에서 14m 는 0.4초).
 * - 뒤: 화면이 다 돌아간(0.25초) 뒤에도 1초쯤 새 길을 볼 여유
 * - 앞: 회전 입력에만 집중할 수 있게
 * 느릴 때도 최소 거리(M)는 비운다.
 */
export const TURN_CLEAR_BEFORE_SEC = 0.85;
export const TURN_CLEAR_AFTER_SEC = 1.3;
export const TURN_CLEAR_BEFORE_M = 18;
export const TURN_CLEAR_AFTER_M = 18;
/** 모퉁이 몇 초 전부터 회전 입력을 받는지 (속도가 빨라도 반응 시간이 일정하게) */
export const TURN_WINDOW_SEC = 0.55;
/** 회전 입력을 받는 최소 거리(m) — 느릴 때도 너무 촉박하지 않게 */
export const TURN_WINDOW_MIN_M = 9;
/** 모퉁이를 이만큼(m) 지나쳐도 못 돌았으면 떨어진다 */
export const TURN_LATE_M = 0.8;

// ---------- 비틀거림 ----------

/**
 * 가벼운 충돌(통나무에 걸림, 늦게 피하다 기둥에 스침)은 바로 잡히지 않고 비틀거린다.
 * 비틀거린 뒤 이 시간 안에 또 부딪히면 바위에 잡힌다.
 */
export const STUMBLE_WINDOW_SEC = 5;
/** 비틀거린 직후 무적 시간 — 같은 줄의 다른 장애물에 연달아 걸리지 않게 */
export const STUMBLE_INVULN_SEC = 0.8;
/** 비틀거린 직후 속도 배율 */
export const STUMBLE_SLOW = 0.75;
/** 옆에서 스친 것으로 보는 가로 어긋남 (레인 폭 단위) */
export const SIDESWIPE_OFFSET = 0.2;

// ---------- 아이템 ----------

export type ItemKind = 'magnet' | 'shield' | 'boost' | 'double';

export interface ItemInfo {
  kind: ItemKind;
  label: string;
  icon: string;
  /** 지속 시간(초) */
  duration: number;
  color: string;
  description: string;
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  magnet: {
    kind: 'magnet',
    label: '자석',
    icon: '🧲',
    duration: 8,
    color: '#ff5a5a',
    description: '주변 레인의 동전을 끌어당긴다',
  },
  shield: {
    kind: 'shield',
    label: '방패',
    icon: '🛡️',
    duration: 15,
    color: '#4fb3ff',
    description: '한 번 부딪혀도 장애물을 부수고 버틴다',
  },
  boost: {
    kind: 'boost',
    label: '부스트',
    icon: '⚡',
    duration: 4,
    color: '#ffa630',
    description: '무적 질주! 앞을 막는 것은 전부 부순다',
  },
  double: {
    kind: 'double',
    label: '동전 2배',
    icon: '×2',
    duration: 10,
    color: '#ffd23f',
    description: '동전 점수가 두 배',
  },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/** 아이템이 나오는 간격(초) — 이 범위에서 무작위 */
export const ITEM_INTERVAL_MIN_SEC = 9;
export const ITEM_INTERVAL_MAX_SEC = 15;
/** 부스트 중 속도 배율 */
export const BOOST_SPEED_MUL = 1.7;
/** 부스트가 끝난 뒤 이어지는 무적 시간 — 끝나자마자 장애물에 박히지 않게 */
export const BOOST_AFTER_INVULN_SEC = 1;
/** 자석이 동전을 끌어당기기 시작하는 거리(m) */
export const MAGNET_RANGE = 16;

// ---------- 점수 배율 · 아슬아슬 ----------

/** 비틀거리지 않고 이만큼(m) 달릴 때마다 배율 +1 */
export const MULT_STEP_M = 300;
/** 최고 배율 */
export const MULT_MAX = 5;
/** 아슬아슬하게 피했을 때 보너스 (배율이 곱해진다) */
export const CLOSE_POINTS = 20;
/** 점프·슬라이드를 장애물에 닿기 이 시간(초) 안에 시작했으면 아슬아슬 */
export const CLOSE_ACTION_SEC = 0.2;
/** 레인을 막는 장애물을 이 시간(초) 안에 옆으로 피했으면 아슬아슬 */
export const CLOSE_DODGE_SEC = 0.25;
/** 모퉁이를 마지막 이 시간(초) 안에 돌았으면 아슬아슬 */
export const CLOSE_TURN_SEC = 0.15;

// ---------- 연출 ----------

/** 붙잡힌 뒤 결과창이 뜨기까지 기다리는 시간(ms) */
export const CAUGHT_DELAY_MS = 1400;

export const HOW_TO_PLAY: readonly { keys: string; touch: string; action: string }[] = [
  { keys: '← → / A D', touch: '좌우로 밀기', action: '레인 이동 · 모퉁이에서 회전' },
  { keys: '↑ / W / Space', touch: '위로 밀기', action: '점프 — 낮은 통나무' },
  { keys: '↓ / S', touch: '아래로 밀기', action: '슬라이드 — 머리 위 들보' },
];
