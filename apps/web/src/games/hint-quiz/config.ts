/** 힌트 퀴즈 규칙 */
export const GAME_ID = 'hint-quiz';

/** 한 판에 푸는 문제 수 */
export const QUESTION_COUNT = 5;

/** 힌트 하나가 열려 있는 시간(초) — 지나면 다음 힌트가 자동으로 열린다 */
export const HINT_TIME_SEC = 10;

/**
 * 열린 힌트 개수별 점수 — 힌트 1개만 보고 맞히면 100점, 5개 다 보고 맞히면 20점.
 * 길이 = 한 문제의 최대 힌트 수
 */
export const POINTS_BY_HINT = [100, 80, 60, 40, 20] as const;

export const MAX_HINTS = POINTS_BY_HINT.length;

// 최고 점수 = QUESTION_COUNT * POINTS_BY_HINT[0] = 500
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
