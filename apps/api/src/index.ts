import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { errorResponse } from './lib/errors';
import { gamesRoute } from './routes/games';

const app = new Hono<AppEnv>().basePath('/api');

// 배포 환경에서 Pages(프론트) → Workers(API) 호출을 허용한다.
// 로컬 개발은 Vite 프록시로 같은 출처가 되므로 CORS 가 필요 없다.
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.length === 0) return next();
  return cors({ origin: allowed })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));

app.route('/games', gamesRoute);

app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', '요청한 API 가 없습니다.'));

app.onError((err, c) => {
  // 잘못된 JSON 본문 등 Hono 가 던진 4xx 는 그대로 전달
  if (err instanceof HTTPException && err.status < 500) {
    return errorResponse(c, err.status, 'BAD_REQUEST', '요청 형식이 올바르지 않습니다.');
  }
  console.error(err);
  return errorResponse(c, 500, 'INTERNAL_ERROR', '서버 오류가 발생했습니다.');
});

export default app;
