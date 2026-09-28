/** Workers 바인딩 / 환경변수 타입 (wrangler.toml 과 맞춰서 관리) */
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}

export type AppEnv = { Bindings: Env };
