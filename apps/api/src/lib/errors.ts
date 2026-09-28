import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorResponse } from '@simsim/shared';

/** 공통 에러 응답 형식으로 JSON 을 반환한다. */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
) {
  return c.json<ApiErrorResponse>({ error: { code, message } }, status);
}
