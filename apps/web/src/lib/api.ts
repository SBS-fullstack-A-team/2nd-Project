import type {
  ApiErrorResponse,
  QuestionsResponse,
  RankingResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '@simsim/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** API 에러 — 서버의 공통 에러 형식을 담는다. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? '요청에 실패했습니다.',
    );
  }
  return (await res.json()) as T;
}

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;

export const api = {
  getQuestions<TMeta>(gameId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return request<QuestionsResponse<TMeta>>(`${gamePath(gameId)}/questions${query}`);
  },

  getRanking(gameId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return request<RankingResponse>(`${gamePath(gameId)}/ranking${query}`);
  },

  submitScore(gameId: string, body: SubmitScoreRequest) {
    return request<SubmitScoreResponse>(`${gamePath(gameId)}/scores`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
}
