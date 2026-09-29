/**
 * API 요청/응답 타입 — 요청·응답 형태는 이 파일에만 정의한다.
 * 모든 API는 gameId 기반 범용 API다: /api/games/:gameId/...
 */
import type { QuizItem } from './game';

// ---------- 공통 제약값 (서버 검증과 프론트 입력 제한에 같이 사용) ----------

export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 12;

export const RANKING_DEFAULT_LIMIT = 10;
export const RANKING_MAX_LIMIT = 50;

export const QUESTIONS_DEFAULT_LIMIT = 10;
export const QUESTIONS_MAX_LIMIT = 50;
/** 문제 조회 시 category 필터 값의 최대 길이 */
export const QUESTION_CATEGORY_MAX_LENGTH = 30;

// ---------- POST /api/games/:gameId/scores ----------

export interface SubmitScoreRequest {
  nickname: string;
  score: number;
}

export interface SubmitScoreResponse {
  id: number;
  /** 등록 직후 이 점수의 순위 (1부터) */
  rank: number;
}

// ---------- GET /api/games/:gameId/ranking?limit=N ----------

export interface RankingEntry {
  id: number;
  rank: number;
  nickname: string;
  score: number;
  /** UTC 'YYYY-MM-DD HH:MM:SS' */
  createdAt: string;
}

export interface RankingResponse {
  gameId: string;
  items: RankingEntry[];
}

// ---------- GET /api/games/:gameId/questions?limit=N&category=분류 ----------
// category 를 주면 quiz_item.meta.category 가 같은 문제만 고른다 (생략하면 전체에서)

export interface QuestionsResponse<TMeta = Record<string, unknown>> {
  gameId: string;
  items: QuizItem<TMeta>[];
}

// ---------- 에러 응답 (모든 API 공통) ----------

export type ApiErrorCode = 'BAD_REQUEST' | 'GAME_NOT_FOUND' | 'NOT_FOUND' | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
