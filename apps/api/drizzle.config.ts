import { defineConfig } from 'drizzle-kit';

// 마이그레이션 SQL 생성 전용 설정 (`pnpm db:generate`).
// 적용은 wrangler d1 migrations apply 로 한다.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
