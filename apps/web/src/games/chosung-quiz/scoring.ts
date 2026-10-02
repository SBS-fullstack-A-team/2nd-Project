import {
  CLEAR_BONUS_PER_SEC,
  COMBO_BONUS_MAX,
  COMBO_BONUS_STEP,
  POINTS_PER_CORRECT,
  POINTS_WITH_HINT,
  QUESTION_COUNT,
  TIME_LIMIT_SEC,
} from './config';

/** 연속 정답 보너스 — combo 는 이번 정답을 포함한 연속 횟수 (1연속은 보너스 없음) */
export function comboBonus(combo: number): number {
  return Math.min(Math.max(combo - 1, 0) * COMBO_BONUS_STEP, COMBO_BONUS_MAX);
}

/** 한 문제 점수 = 기본 점수(힌트를 봤으면 절반) + 콤보 보너스 */
export function correctPoints(usedHint: boolean, combo: number): number {
  return (usedHint ? POINTS_WITH_HINT : POINTS_PER_CORRECT) + comboBonus(combo);
}

/** 올클리어 보너스 — 남은 시간(초, 내림) × CLEAR_BONUS_PER_SEC */
export function clearBonus(remainingSec: number): number {
  return Math.max(0, Math.floor(remainingSec)) * CLEAR_BONUS_PER_SEC;
}

/** 이론상 최고 점수 — 힌트 없이 전부 연속 정답 + 남은 시간 최대(1초도 안 걸릴 수는 없으니 TIME_LIMIT_SEC - 1) */
export function maxScore(questionCount = QUESTION_COUNT): number {
  let total = 0;
  for (let combo = 1; combo <= questionCount; combo++) total += correctPoints(false, combo);
  return total + clearBonus(TIME_LIMIT_SEC - 1);
}
