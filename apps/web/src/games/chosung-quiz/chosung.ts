import type { ChosungQuizMeta, QuizItem } from '@simsim/shared';

/** 비교용 정규화: 공백 제거 + 소문자 */
export function normalizeAnswer(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/** 입력값이 정답(또는 인정 단어)과 같은지 확인 */
export function isCorrectAnswer(input: string, item: QuizItem<ChosungQuizMeta>): boolean {
  const guess = normalizeAnswer(input);
  if (!guess) return false;
  const answers = [item.answer, ...(item.meta.aliases ?? [])];
  return answers.some((answer) => normalizeAnswer(answer) === guess);
}
