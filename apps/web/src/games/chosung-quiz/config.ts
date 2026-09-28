/** 초성 퀴즈 규칙 */
export const GAME_ID = 'chosung-quiz';
export const QUESTION_COUNT = 10;
export const TIME_LIMIT_SEC = 60;
export const POINTS_PER_CORRECT = 10;
// 최고 점수 = QUESTION_COUNT * POINTS_PER_CORRECT = 100
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
