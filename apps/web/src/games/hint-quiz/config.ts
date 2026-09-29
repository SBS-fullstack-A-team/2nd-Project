/** 힌트 퀴즈 규칙 */
export const GAME_ID = 'hint-quiz';

/**
 * 장르 — id 는 시드의 meta.category 와 같아야 한다 (문제 조회 시 category 필터로 사용)
 * 장르를 추가하면 seeds/hint-quiz*.sql 에 그 장르 문제도 넣을 것
 */
export const CATEGORIES = [
  { id: '축구선수', icon: '⚽', description: '국내외 축구선수 약 1,000명' },
  { id: '동물', icon: '🐾', description: '신기한 동물 이야기' },
  { id: '나라', icon: '🌏', description: '세계 여러 나라' },
  { id: '음식', icon: '🍜', description: '맛있는 음식' },
] as const;

/** 고를 수 있는 문항 수 (문제 API 최대 50개 이하) */
export const QUESTION_COUNTS = [5, 10, 20] as const;
export const DEFAULT_QUESTION_COUNT = 10;

/**
 * 열린 힌트 개수별 기본 점수 — 힌트 1개만 보고 맞히면 100점, 7개 다 보고 맞히면 10점.
 * 길이 = 한 문제의 최대 힌트 수 (문제 힌트 최대 6개 + 마지막 '이름 초성' 힌트)
 */
export const POINTS_BY_HINT = [100, 85, 70, 55, 40, 25, 10] as const;

export const MAX_HINTS = POINTS_BY_HINT.length;

/** 문제당 제한시간(초) — 시간이 다 되면 그 문제는 0점 (힌트는 시간으로 열리지 않는다) */
export const QUESTION_TIME_SEC = 60;

/**
 * 시간 보너스 — FULL_BONUS_SEC 초 안에 맞히면 ×1.0, 제한시간 끝까지 줄어들어 최소 ×MIN_TIME_MULTIPLIER
 */
export const FULL_BONUS_SEC = 10;
export const MIN_TIME_MULTIPLIER = 0.5;

/**
 * 최종 점수 = 문제당 평균 점수 × SCORE_SCALE → 최고 1000점.
 * 문항 수(5·10·20)가 달라도 같은 기준으로 랭킹을 비교하기 위해 합계가 아니라 평균을 쓴다.
 */
export const SCORE_SCALE = 10;

// 최고 점수 = POINTS_BY_HINT[0] * SCORE_SCALE = 1000
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
