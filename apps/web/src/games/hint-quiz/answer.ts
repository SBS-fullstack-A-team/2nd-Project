import type { HintQuizMeta, QuizItem } from '@simsim/shared';

/** 비교용 정규화: 공백·가운뎃점·하이픈·마침표 제거 + 소문자 (예: "리오넬 메시" = "리오넬메시") */
export function normalizeAnswer(text: string): string {
  return text.replace(/[\s·.\-_]/g, '').toLowerCase();
}

/** 입력값이 정답(또는 인정 이름)과 같은지 확인 */
export function isCorrectAnswer(input: string, item: QuizItem<HintQuizMeta>): boolean {
  const guess = normalizeAnswer(input);
  if (!guess) return false;
  const answers = [item.answer, ...(item.meta.aliases ?? [])];
  return answers.some((answer) => normalizeAnswer(answer) === guess);
}
