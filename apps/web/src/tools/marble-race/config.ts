/** 구슬 레이스 설정 — 길이 단위는 물리 세계 좌표(px 와 비슷), 시간은 고정 스텝(1/60초) */

/** 코스 폭 (양쪽 벽 안쪽) */
export const WORLD_W = 800;
export const WALL_THICKNESS = 40;
export const MARBLE_R = 11;

/** 한 판에 넣을 수 있는 구슬 수 (가중치 포함) — 너무 많으면 느려진다 */
export const MAX_MARBLES = 300;
/** 이름 하나에 줄 수 있는 최대 가중치 (이름*N) */
export const MAX_WEIGHT = 50;
export const MAX_NAME_LENGTH = 16;

/** 물리 고정 스텝 — 화면 프레임과 상관없이 같은 결과가 나오도록 항상 이 간격으로 계산한다 */
export const STEP_MS = 1000 / 60;
export const STEPS_PER_SEC = 60;

/** 출발 전 카운트다운 */
export const COUNTDOWN_SEC = 3;
/** 이 시간 동안 앞으로 거의 못 나간 구슬은 살짝 튕겨 준다 (끼임 방지) */
export const STUCK_SEC = 3;
/** 아무리 길어도 이 시간이 지나면 지금 순위로 끝낸다 */
export const MAX_RACE_SEC = 300;

/** 화면에 최소한 이만큼의 세로 길이(세계 좌표)는 보이게 한다 */
export const MIN_VIEW_HEIGHT = 720;

/** 배속 */
export const SPEEDS = [1, 2, 4] as const;
