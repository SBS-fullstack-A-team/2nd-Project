import { Hono } from 'hono';
import { and, asc, count, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import {
  getMaxScore,
  type QuestionsResponse,
  type RankingResponse,
  type SubmitScoreResponse,
} from '@simsim/shared';
import type { AppEnv } from '../env';
import { createDb, type Db } from '../db/client';
import { game, quizItem, score } from '../db/schema';
import { errorResponse } from '../lib/errors';
import {
  gameIdParamSchema,
  questionsQuerySchema,
  rankingQuerySchema,
  submitScoreSchema,
  zValidator,
} from '../lib/validation';

/**
 * 게임 공통 API — 게임별 라우트를 만들지 않고 gameId 로 구분한다.
 * 새 게임은 DB game 테이블에 등록만 하면 이 API 를 그대로 사용한다.
 */
export const gamesRoute = new Hono<AppEnv>();

async function gameExists(db: Db, gameId: string): Promise<boolean> {
  const row = await db.select({ id: game.id }).from(game).where(eq(game.id, gameId)).get();
  return row !== undefined;
}

// 점수 등록
gamesRoute.post(
  '/:gameId/scores',
  zValidator('param', gameIdParamSchema),
  zValidator('json', submitScoreSchema),
  async (c) => {
    const { gameId } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = createDb(c.env.DB);

    if (!(await gameExists(db, gameId))) {
      return errorResponse(c, 404, 'GAME_NOT_FOUND', '존재하지 않는 게임입니다.');
    }
    if (body.score > getMaxScore(gameId)) {
      return errorResponse(c, 400, 'BAD_REQUEST', '점수가 올바르지 않습니다.');
    }

    const inserted = await db
      .insert(score)
      .values({ gameId, nickname: body.nickname, score: body.score })
      .returning({ id: score.id })
      .get();

    // 순위 = 나보다 점수가 높거나, 같은 점수인데 먼저 등록한 기록 수 + 1
    const ahead = await db
      .select({ n: count() })
      .from(score)
      .where(
        and(
          eq(score.gameId, gameId),
          or(
            gt(score.score, body.score),
            and(eq(score.score, body.score), lt(score.id, inserted.id)),
          ),
        ),
      )
      .get();

    return c.json<SubmitScoreResponse>({ id: inserted.id, rank: (ahead?.n ?? 0) + 1 }, 201);
  },
);

// 랭킹 조회 (점수 내림차순, 같은 점수면 먼저 등록한 순)
gamesRoute.get(
  '/:gameId/ranking',
  zValidator('param', gameIdParamSchema),
  zValidator('query', rankingQuerySchema),
  async (c) => {
    const { gameId } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    const db = createDb(c.env.DB);

    if (!(await gameExists(db, gameId))) {
      return errorResponse(c, 404, 'GAME_NOT_FOUND', '존재하지 않는 게임입니다.');
    }

    const rows = await db
      .select({
        id: score.id,
        nickname: score.nickname,
        score: score.score,
        createdAt: score.createdAt,
      })
      .from(score)
      .where(eq(score.gameId, gameId))
      .orderBy(desc(score.score), asc(score.id))
      .limit(limit)
      .all();

    return c.json<RankingResponse>({
      gameId,
      items: rows.map((row, i) => ({ ...row, rank: i + 1 })),
    });
  },
);

// 퀴즈 문제 조회 (랜덤 N개)
gamesRoute.get(
  '/:gameId/questions',
  zValidator('param', gameIdParamSchema),
  zValidator('query', questionsQuerySchema),
  async (c) => {
    const { gameId } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    const db = createDb(c.env.DB);

    if (!(await gameExists(db, gameId))) {
      return errorResponse(c, 404, 'GAME_NOT_FOUND', '존재하지 않는 게임입니다.');
    }

    const items = await db
      .select({
        id: quizItem.id,
        question: quizItem.question,
        answer: quizItem.answer,
        meta: quizItem.meta,
      })
      .from(quizItem)
      .where(eq(quizItem.gameId, gameId))
      .orderBy(sql`random()`)
      .limit(limit)
      .all();

    return c.json<QuestionsResponse>({ gameId, items });
  },
);
