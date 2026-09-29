import {
  FULL_BONUS_SEC,
  MIN_TIME_MULTIPLIER,
  POINTS_BY_HINT,
  QUESTION_TIME_SEC,
  SCORE_SCALE,
} from './config';

/** 걸린 시간(초) → 시간 보너스 배율 (1.0 → MIN_TIME_MULTIPLIER, 소수 둘째 자리) */
export function timeMultiplier(seconds: number): number {
  if (seconds <= FULL_BONUS_SEC) return 1;
  if (seconds >= QUESTION_TIME_SEC) return MIN_TIME_MULTIPLIER;
  const ratio = (seconds - FULL_BONUS_SEC) / (QUESTION_TIME_SEC - FULL_BONUS_SEC);
  return Math.round((1 - ratio * (1 - MIN_TIME_MULTIPLIER)) * 100) / 100;
}

/** 한 문제 점수 = 힌트 점수 × 시간 보너스 (정수) */
export function questionPoints(revealedHints: number, seconds: number): number {
  const base = POINTS_BY_HINT[revealedHints - 1] ?? 0;
  return Math.round(base * timeMultiplier(seconds));
}

/**
 * 최종 점수 = 문제당 평균 점수 × SCORE_SCALE (최고 1000점)
 * 게임 도중에는 지금까지의 합계를 전체 문항 수로 나눈 값(= 최종 점수로 쌓여 가는 값)을 보여준다.
 */
export function scaledScore(totalPoints: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.round((totalPoints / questionCount) * SCORE_SCALE);
}
