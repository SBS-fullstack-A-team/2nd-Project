/**
 * 구슬 레이스 설정 — 위에서 내려다본 레이스 트랙 (왼쪽 출발 → 오른쪽 결승).
 * 길이 단위는 물리 세계 좌표(px 와 비슷), 시간은 고정 스텝(1/60초).
 */

export const MARBLE_R = 12;

/** 한 판에 넣을 수 있는 구슬 수 (가중치 포함) — 너무 많으면 느려진다 */
export const MAX_MARBLES = 300;
/** 이름 하나에 줄 수 있는 최대 가중치 (이름*N) */
export const MAX_WEIGHT = 50;
export const MAX_NAME_LENGTH = 16;

/** 트랙 */
export const TRACK = {
  /** 출발선 → 결승선 거리 */
  raceDistance: 9000,
  /** 트랙 반폭 (가운데선에서 벽까지) */
  halfWidth: 165,
  /** 출발·결승 직선 구간 반폭 — 출발 그리드가 넓게 서도록 */
  wideHalfWidth: 185,
  /** 시케인(좁아지는 구간)의 가장 좁은 반폭 */
  chicaneHalfWidth: 80,
  /** 가운데선 샘플 간격 */
  sample: 30,
  wallThickness: 40,
  /** 출발 그리드 간격 */
  gridGap: MARBLE_R * 2 + 4,
};

/** 구슬을 앞으로 미는 힘 (트랙 방향, 질량 비례) — 공기 저항과 맞물려 최고 속도가 정해진다 */
export const DRIVE_FORCE = 0.00026;
export const AIR_FRICTION = 0.02;
/** 가속 패드 위에서는 미는 힘 배수 */
export const BOOST_MULTIPLIER = 3.2;
/** 진흙 위에서는 공기 저항이 커진다 */
export const MUD_AIR_FRICTION = 0.075;
/** 구멍에 빠지면 이만큼 뒤로 돌아간다 */
export const HOLE_SETBACK = 420;

/** 물리 고정 스텝 — 화면 프레임과 상관없이 같은 결과가 나오도록 항상 이 간격으로 계산한다 */
export const STEP_MS = 1000 / 60;
export const STEPS_PER_SEC = 60;

/** 출발 신호등 (빨간불 3개 → 초록불) */
export const COUNTDOWN_SEC = 3;
/** 이 시간 동안 거의 못 나간 구슬은 살짝 밀어 준다 (끼임 방지) */
export const STUCK_SEC = 2.5;
/** 아무리 길어도 이 시간이 지나면 지금 순위로 끝낸다 */
export const MAX_RACE_SEC = 300;

/** 결승 직전 접전이면 슬로모션 — 선두가 결승까지 이 거리 안이고, 2위와 차이가 이 안일 때 */
export const SLOWMO_DISTANCE = 380;
export const SLOWMO_GAP = 45;
export const SLOWMO_SPEED = 0.35;

/** 배속 */
export const SPEEDS = [1, 2, 4] as const;
