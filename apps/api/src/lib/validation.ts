import { z } from 'zod';
import type { ValidationTargets } from 'hono';
import { zValidator as zv } from '@hono/zod-validator';
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  QUESTION_CATEGORY_MAX_LENGTH,
  QUESTIONS_DEFAULT_LIMIT,
  QUESTIONS_MAX_LIMIT,
  RANKING_DEFAULT_LIMIT,
  RANKING_MAX_LIMIT,
} from '@simsim/shared';
import { errorResponse } from './errors';

/** 검증 실패 시 공통 에러 형식(400)으로 응답하는 zValidator */
export function zValidator<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zv(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다.';
      return errorResponse(c, 400, 'BAD_REQUEST', message);
    }
  });
}

/** gameId: 소문자/숫자/하이픈만 허용 (예: chosung-quiz) */
export const gameIdParamSchema = z.object({
  gameId: z.string().regex(/^[a-z0-9-]{1,50}$/, '잘못된 게임 ID 입니다.'),
});

export const submitScoreSchema = z.object({
  nickname: z
    .string('닉네임을 입력해 주세요.')
    .trim()
    .min(NICKNAME_MIN_LENGTH, '닉네임을 입력해 주세요.')
    .max(NICKNAME_MAX_LENGTH, `닉네임은 ${NICKNAME_MAX_LENGTH}자 이하로 입력해 주세요.`)
    // 제어 문자 금지
    .refine((v) => !/\p{Cc}/u.test(v), '닉네임에 사용할 수 없는 문자가 있습니다.'),
  score: z
    .number('점수는 숫자여야 합니다.')
    .int('점수는 정수여야 합니다.')
    .min(0, '점수가 올바르지 않습니다.'),
});

/** ?limit=N 쿼리 스키마 생성 (범위를 벗어나면 400) */
function limitQuerySchema(defaultLimit: number, maxLimit: number) {
  return z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1, 'limit 은 1 이상이어야 합니다.')
      .max(maxLimit, `limit 은 ${maxLimit} 이하여야 합니다.`)
      .default(defaultLimit),
  });
}

export const rankingQuerySchema = limitQuerySchema(RANKING_DEFAULT_LIMIT, RANKING_MAX_LIMIT);
/** ?limit=N&category=분류 — category 는 선택 (quiz_item.meta.category 와 비교) */
export const questionsQuerySchema = limitQuerySchema(
  QUESTIONS_DEFAULT_LIMIT,
  QUESTIONS_MAX_LIMIT,
).extend({
  category: z
    .string()
    .trim()
    .min(1, 'category 가 비어 있습니다.')
    .max(
      QUESTION_CATEGORY_MAX_LENGTH,
      `category 는 ${QUESTION_CATEGORY_MAX_LENGTH}자 이하여야 합니다.`,
    )
    .optional(),
});
