/**
 * 핀볼 사다리 설정 — 위에서 공을 떨어뜨려 핀에 튕기며 아래 결과 칸에 들어가는 추첨판.
 * 길이 단위는 물리 세계 좌표(px 와 비슷), 시간은 고정 스텝(1/60초).
 */

/** 참가자 수 — 사다리처럼 한 명당 결과 칸 하나라 칸이 너무 좁아지지 않게 제한한다 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 30;
export const MAX_NAME_LENGTH = 16;
export const MAX_RESULT_LENGTH = 20;
/** 결과 `꽝*N` 에 줄 수 있는 최대 개수 */
export const MAX_WEIGHT = MAX_PLAYERS;
/** 결과가 참가자보다 적으면 남는 칸을 이 결과로 채운다 */
export const FILLER_RESULT = '꽝';

/** 추첨판 폭 (높이는 핀 줄 수에 따라 정해진다) */
export const BOARD_WIDTH = 900;
/** 공 반지름 — 칸 폭에 비례하되 이 범위 안 */
export const BALL_R_MIN = 8;
export const BALL_R_MAX = 17;
/** 핀 반지름 = 공 반지름 × 이 값 */
export const PEG_RATIO = 0.42;
/** 핀 간격 = 공 반지름 × 이 값 (핀 사이 틈이 공 지름보다 넉넉하게) */
export const PEG_SPACING_RATIO = 4.0;
/** 핀이 있는 구역 높이 목표 — 줄 수는 이 높이에 맞춰 MIN~MAX 사이로 정한다 */
export const PEG_ZONE_HEIGHT = 700;
export const MIN_ROWS = 8;
export const MAX_ROWS = 16;
/** 결과 이름을 적는 칸 아래 영역 높이 */
export const LABEL_HEIGHT = 120;

/** 물리 고정 스텝 — 화면 프레임과 상관없이 같은 결과가 나오도록 항상 이 간격으로 계산한다 */
export const STEP_MS = 1000 / 60;
export const STEPS_PER_SEC = 60;
/** 자동 진행일 때 앞 공이 들어간 뒤 다음 공을 떨어뜨리기까지 기다리는 시간 */
export const AUTO_DELAY_SEC = 0.8;
/** 이 시간 동안 거의 안 움직이면 살짝 튕겨 준다 (핀 위·칸막이 위 끼임 방지) */
export const STUCK_SEC = 1.5;
/** 공 하나가 이 시간 안에 못 들어가면 가장 가까운 빈 칸에 넣는다 */
export const MAX_BALL_SEC = 25;

/** 배속 */
export const SPEEDS = [1, 2, 4] as const;
