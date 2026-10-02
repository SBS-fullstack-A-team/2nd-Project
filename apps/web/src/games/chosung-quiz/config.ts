/** 초성 퀴즈 규칙 */
export const GAME_ID = 'chosung-quiz';

/**
 * 분야 — id 는 시드의 meta.category 와 같아야 한다 (문제 조회 시 category 필터로 사용)
 * 분야를 추가하면 seeds/scripts/chosung-quiz.mjs 에 그 분야 문제도 넣고 시드를 다시 만들 것
 */
export const CATEGORIES = [
  { id: '음식', icon: '🍜' },
  { id: '동물', icon: '🐯' },
  { id: '과일·채소', icon: '🍎' },
  { id: '물건', icon: '🧸' },
  { id: '탈것', icon: '🚲' },
  { id: '장소', icon: '🏫' },
  { id: '직업', icon: '🧑‍🍳' },
  { id: '스포츠', icon: '⚽' },
  { id: '사자성어', icon: '📜' },
  { id: '속담', icon: '💬' },
] as const;

/** 한 판에 불러오는 문제 수 (문제 API 최대 50개 이하) — 시간 안에 다 풀면 올클리어 */
export const QUESTION_COUNT = 20;
export const TIME_LIMIT_SEC = 60;

/** 정답 기본 점수 — 힌트를 보고 맞히면 절반 */
export const POINTS_PER_CORRECT = 100;
export const POINTS_WITH_HINT = 50;

/**
 * 연속 정답 보너스 — 2연속부터 +10, 3연속 +20 … 최대 +50.
 * 오답·패스하면 콤보가 끊긴다 (힌트는 끊기지 않는다).
 */
export const COMBO_BONUS_STEP = 10;
export const COMBO_BONUS_MAX = 50;

/** 올클리어(모든 문제를 정답) 보너스 — 남은 시간 1초당 */
export const CLEAR_BONUS_PER_SEC = 10;

// 최고 점수 = 정답 20 × 100 + 콤보 (0+10+20+30+40 + 50×15 = 850) + 올클리어 59초 × 10 (= 590) = 3440
// 규칙을 바꾸면 packages/shared 의 MAX_SCORE_BY_GAME 도 같이 수정할 것 (scoring.ts maxScore() 로 계산)
