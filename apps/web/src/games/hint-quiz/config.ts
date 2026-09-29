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

/** 한 판에 푸는 문제 수 */
export const QUESTION_COUNT = 5;

/** 힌트 하나가 열려 있는 시간(초) — 지나면 다음 힌트가 자동으로 열린다 */
export const HINT_TIME_SEC = 20;

/**
 * 열린 힌트 개수별 점수 — 힌트 1개만 보고 맞히면 100점, 7개 다 보고 맞히면 10점.
 * 길이 = 한 문제의 최대 힌트 수 (문제 힌트 최대 6개 + 마지막 '이름 초성' 힌트)
 */
export const POINTS_BY_HINT = [100, 85, 70, 55, 40, 25, 10] as const;

export const MAX_HINTS = POINTS_BY_HINT.length;

// 최고 점수 = QUESTION_COUNT * POINTS_BY_HINT[0] = 500
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것
