import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * 스키마를 바꾸면 `pnpm db:generate` 로 마이그레이션을 만들고, 생성된 SQL을 함께 커밋한다.
 * 시간은 UTC 'YYYY-MM-DD HH:MM:SS' 문자열로 저장한다.
 */

/** 게임 목록. id 는 프론트 registry 의 게임 id 와 같아야 한다. */
export const game = sqliteTable('game', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** 점수 기록 */
export const score = sqliteTable(
  'score',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gameId: text('game_id')
      .notNull()
      .references(() => game.id),
    nickname: text('nickname').notNull(),
    score: integer('score').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index('score_game_score_idx').on(t.gameId, t.score)],
);

/** 퀴즈류 게임 문제. 게임마다 다른 데이터는 meta(JSON)에 담는다. */
export const quizItem = sqliteTable(
  'quiz_item',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gameId: text('game_id')
      .notNull()
      .references(() => game.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    meta: text('meta', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index('quiz_item_game_idx').on(t.gameId)],
);
