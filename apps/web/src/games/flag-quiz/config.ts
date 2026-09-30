/** 국기 퀴즈 규칙 */
export const GAME_ID = 'flag-quiz';

/** 모드 — 국기를 보고 나라 맞히기 / 나라를 보고 수도 맞히기 */
export const MODES = [
  { id: 'flag', icon: '🏳️', label: '국기 → 나라', description: '국기를 보고 어느 나라인지 맞혀요' },
  { id: 'capital', icon: '🏛️', label: '나라 → 수도', description: '나라를 보고 수도를 맞혀요' },
] as const;
export type ModeId = (typeof MODES)[number]['id'];

/** 난이도 — 쉬움은 잘 알려진 나라만, 전체는 모든 나라 (점수 배율이 더 높다) */
export const LEVELS = [
  { id: 'easy', label: '쉬움', description: '잘 알려진 나라 60여 개', multiplier: 1 },
  { id: 'all', label: '전체', description: '세계 195개 나라 · 점수 ×1.5', multiplier: 1.5 },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

/** 한 판의 문제 수와 보기 수 */
export const QUESTION_COUNT = 10;
export const CHOICE_COUNT = 4;

/** 문제당 제한시간(초) — 시간이 다 되면 그 문제는 0점 */
export const QUESTION_TIME_SEC = 10;

/**
 * 한 문제 점수 — FULL_BONUS_SEC 초 안에 맞히면 POINTS_PER_QUESTION 점,
 * 제한시간 끝까지 줄어들어 최소 POINTS_PER_QUESTION × MIN_TIME_MULTIPLIER 점. 틀리면 0점
 */
export const POINTS_PER_QUESTION = 100;
export const FULL_BONUS_SEC = 3;
export const MIN_TIME_MULTIPLIER = 0.5;

/** 답을 고른 뒤 정답을 보여주고 다음 문제로 넘어가기까지(ms) */
export const NEXT_DELAY_MS = 1200;

// 최고 점수 = QUESTION_COUNT × POINTS_PER_QUESTION × 전체 난이도 배율(1.5) = 1500
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
