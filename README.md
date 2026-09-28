# 🕹️ 심심오락실 (simsim-arcade)

예능식 퀴즈 게임(초성 퀴즈 등)과 추억의 플래시 스타일 게임을 웹에서 즐기는 사이트입니다.
게임을 하나씩 추가하며 확장하고, 모든 인프라는 Cloudflare(Pages + Workers + D1)로 구성합니다.

🌐 **https://simsim-arcade.pages.dev**

> 팀 규칙(브랜치, 커밋, PR)과 게임 설계 원칙은 [CLAUDE.md](./CLAUDE.md) 를 참고하세요.

## 구성

| 폴더              | 내용              | 기술                                                     |
| ----------------- | ----------------- | -------------------------------------------------------- |
| `apps/web`        | 프론트엔드        | React, TypeScript, Vite, React Router → Cloudflare Pages |
| `apps/api`        | API 서버          | Cloudflare Workers, Hono, D1, Drizzle ORM                |
| `packages/shared` | web·api 공용 타입 | TypeScript                                               |

```
apps/web/src/
  games/            게임별 독립 폴더 + registry.ts (게임 등록부)
  components/       공통 UI (Timer, ResultModal, RankingList, GameCard …)
  pages/            HomePage, GamePage(/games/:gameId), NotFoundPage
  lib/              API 클라이언트, useFetch 훅
apps/api/
  src/routes/       gameId 기반 범용 API
  src/db/           Drizzle 스키마
  migrations/       마이그레이션 SQL (drizzle-kit 생성, 커밋 대상)
  seeds/            게임별 시드 SQL (<게임id>.sql, 초성 퀴즈 샘플 20문제)
packages/shared/src/  API 요청/응답 타입, 게임 공통 타입
```

## 로컬 실행

### 준비물

- Node.js **22.22 이상** (`.nvmrc` 참고)
- pnpm — Node 에 포함된 corepack 으로 켭니다 (버전은 `package.json` 의 `packageManager` 에 고정)
  ```bash
  corepack enable pnpm
  ```

### 처음 한 번

```bash
pnpm install              # 의존성 설치
pnpm db:setup:local       # 로컬 D1 에 마이그레이션 + 시드 적용
```

> 로컬 D1 데이터는 `wrangler.toml` 의 `database_id` 별로 저장됩니다. `database_id` 가 바뀐 뒤
> API 가 `서버 오류`(500)를 내면 `pnpm db:setup:local` 을 다시 실행하세요.

### 개발 서버

```bash
pnpm dev
```

- web: http://localhost:5173 , api: http://localhost:8787
- web 의 `/api/*` 요청은 Vite 프록시로 api 에 전달되므로 CORS 설정이 필요 없습니다.
- 로컬 D1 데이터는 `apps/api/.wrangler/` 에 저장됩니다 (git 에 올라가지 않음). 지우면 초기화됩니다.

> **WSL 사용자 참고:** 저장소가 `/mnt/c/...` (Windows 디스크)에 있으면 WSL 에서 파일 변경 감지가 되지 않아 수정 내용이 자동 반영되지 않습니다.
> 저장소를 WSL 홈(`~/`) 아래에 두거나, Windows 터미널(PowerShell)에서 실행하세요.

### 자주 쓰는 명령어 (루트에서 실행)

| 명령어                  | 설명                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`              | web + api 동시 실행                                                          |
| `pnpm typecheck`        | 전체 타입 체크                                                               |
| `pnpm lint`             | ESLint                                                                       |
| `pnpm format`           | Prettier 로 코드 정리                                                        |
| `pnpm build`            | web 빌드 + api 번들 확인 (`--dry-run`, 실제 배포 아님)                       |
| `pnpm db:generate`      | 스키마 변경 후 마이그레이션 SQL 생성                                         |
| `pnpm db:migrate:local` | 로컬 D1 에 마이그레이션 적용                                                 |
| `pnpm db:seed:local`    | 로컬 D1 에 `seeds/*.sql` 전체 적용 (여러 번 실행해도 안전, 점수 기록은 유지) |
| `pnpm db:setup:local`   | 위 두 개를 한 번에                                                           |

## DB 마이그레이션 / 시드

1. `apps/api/src/db/schema.ts` 수정
2. `pnpm db:generate` → `apps/api/migrations/` 에 SQL 생성 (`--name` 으로 이름 지정 가능:
   `pnpm --filter @simsim/api exec drizzle-kit generate --name add_xxx`)
3. `pnpm db:migrate:local` 로 로컬에 적용 후 확인
4. 생성된 `migrations/*.sql` 과 `migrations/meta/*` 를 **함께 커밋**

- 이미 main 에 머지된 마이그레이션 파일은 수정하지 말고, 새 마이그레이션을 추가하세요.
- 시드는 게임별 파일 `apps/api/seeds/<게임id>.sql` 로 나뉘어 있고, `pnpm db:seed:local` 이 파일명 순서대로 전부 적용합니다.
- 로컬 DB 를 SQL 로 직접 조회하려면:
  ```bash
  cd apps/api
  pnpm exec wrangler d1 execute simsim-arcade-db --local --command "SELECT * FROM score"
  ```

## API

모든 API 는 게임별이 아닌 **gameId 기반 범용 API** 입니다. 요청/응답 타입은 `packages/shared/src/api.ts` 참고.

| 메서드 | 경로                                    | 설명                                             |
| ------ | --------------------------------------- | ------------------------------------------------ |
| `POST` | `/api/games/:gameId/scores`             | 점수 등록 `{ nickname, score }` → `{ id, rank }` |
| `GET`  | `/api/games/:gameId/ranking?limit=10`   | 상위 N개 (최대 50, 같은 점수는 먼저 등록한 순)   |
| `GET`  | `/api/games/:gameId/questions?limit=10` | 퀴즈 문제 랜덤 N개 (최대 50)                     |
| `GET`  | `/api/health`                           | 상태 확인                                        |

- 에러 응답은 공통 형식입니다: `{ "error": { "code": "GAME_NOT_FOUND", "message": "..." } }`
- 검증: 닉네임 1~12자(앞뒤 공백 제거), 점수는 0 이상 정수이고 게임별 상한(`MAX_SCORE_BY_GAME`) 이하

## 새 게임 추가 방법 (체크리스트)

게임은 **카드 담당자 1명이 프론트·백 구분 없이** 만듭니다 (담당 카드는 [CLAUDE.md](./CLAUDE.md#게임-카드-담당-1인-1게임) 참고).
브랜치는 최신 main 에서 `feature/game-<게임ID>` 로 만들고, **새 파일 추가 + 등록 한 줄**만 합니다.
공통 코드(components, pages, API, 스키마) 수정이 필요하면 게임 PR 과 분리해서 역할 담당자에게 요청하세요.

게임 ID 는 소문자·숫자·하이픈으로 정하고(예: `word-chain`), 아래 모든 곳에서 **같은 ID** 를 사용합니다.

- [ ] **1. 게임 폴더 만들기** — `apps/web/src/games/<게임ID>/`
  - `index.tsx`: `GameProps` 를 받는 컴포넌트를 **default export**
    ```tsx
    import type { GameProps } from '@simsim/shared';

    export default function MyGame({ onFinish }: GameProps) {
      // ... 게임 진행 후 최종 점수로 한 번만 호출
      // onFinish(score);
    }
    ```
  - `config.ts`(규칙 상수), `*.module.css`, `thumbnail.svg`(16:9) 도 이 폴더에 둡니다.
  - 점수 등록·결과창·랭킹은 공통 페이지가 처리하므로 게임에서 만들지 않습니다.
  - 공통 UI 가 필요하면 `components/` 의 `Timer` 등을 가져다 씁니다.
- [ ] **2. registry 등록** — `apps/web/src/games/registry.ts` 의 `GAMES` 에 **내 카드 번호 위치**에 추가
  ```ts
  {
    id: 'word-chain',
    name: '끝말잇기',
    description: '한 줄 설명',
    thumbnail: wordChainThumbnail, // import wordChainThumbnail from './word-chain/thumbnail.svg';
    category: 'quiz',
    component: lazy(() => import('./word-chain')),
  },
  ```
  → 메인 카드와 `/games/word-chain` 페이지가 자동으로 생깁니다.
- [ ] **3. 공용 타입** — `packages/shared/src/game.ts`
  - `MAX_SCORE_BY_GAME` 에 최고 점수 추가 (서버가 이보다 큰 점수를 거부)
  - 퀴즈류라면 `quiz_item.meta` 에 들어갈 타입 추가 (예: `ChosungQuizMeta`)
- [ ] **4. DB 등록** — 새 파일 `apps/api/seeds/<게임ID>.sql` 작성 후 `pnpm db:seed:local`
  ```sql
  INSERT OR IGNORE INTO game (id, name, category) VALUES ('word-chain', '끝말잇기', 'quiz');
  ```
  - 퀴즈류라면 `quiz_item` 에 문제도 넣습니다 (게임마다 다른 데이터는 `meta` JSON 에).
  - 여러 번 실행해도 되도록 내 게임 문제만 `DELETE` 후 다시 넣습니다 (`chosung-quiz.sql` 참고).
  - 문제는 직접 만든 것만 사용합니다 (방송 프로그램 이름·로고·실제 방송 문제 금지).
- [ ] **5. 확인** — `pnpm typecheck && pnpm lint && pnpm build` 통과, `pnpm dev` 로 한 판 끝까지 플레이 → 점수 등록 → 랭킹 확인
- [ ] **6. PR** — 새 테이블이나 API 는 필요 없습니다. 필요해 보이면 먼저 팀과 상의하세요.

## CI (GitHub Actions)

`main` 대상 PR 과 `main` push 마다 `.github/workflows/ci.yml` 이 자동으로 실행됩니다.

- 순서: `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `format:check` → `build`
- 실제 배포는 하지 않습니다 (api 빌드는 `--dry-run`).
- PR 화면의 체크가 ❌ 이면 머지하지 말고 고친 뒤 다시 push 합니다.
- 포맷 오류는 로컬에서 `pnpm format` 으로 바로 고칠 수 있습니다.

## 배포

| 대상          | 주소                                                  | 배포 방식                          |
| ------------- | ----------------------------------------------------- | ---------------------------------- |
| 웹 (Pages)    | https://simsim-arcade.pages.dev                       | `main` 머지 시 **자동** (Git 연동) |
| API (Workers) | https://simsim-arcade-api.sbstacarematch1.workers.dev | **수동** `wrangler deploy`         |
| DB (D1)       | `simsim-arcade-db` (APAC)                             | **수동** 원격 마이그레이션·시드    |

> 비밀값은 레포에 넣지 않습니다. 배포 명령은 팀 Cloudflare 계정으로 `wrangler login` 한 사람이 실행합니다.
> API 에 비밀값이 필요해지면 로컬은 `apps/api/.dev.vars`(`.dev.vars.example` 복사),
> 배포는 `wrangler secret put 이름` 으로 등록합니다.

### 언제 무엇을 실행하나

모든 명령은 최신 `main` 에서, `apps/api` 폴더 기준입니다 (`cd apps/api`).

| 머지된 변경                     | 해야 할 일                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web` 만 변경              | 없음 — Pages 가 자동 배포                                                                                         |
| `apps/api` 코드·`wrangler.toml` | `pnpm exec wrangler deploy`                                                                                       |
| 마이그레이션 추가 (스키마 변경) | `pnpm exec wrangler d1 migrations apply simsim-arcade-db --remote` → `wrangler deploy`                            |
| 새 게임 / 시드 변경             | 시드 적용 `pnpm exec wrangler d1 execute simsim-arcade-db --remote --file=seeds/<게임id>.sql` → `wrangler deploy` |
| `packages/shared` 변경          | `wrangler deploy` (점수 상한 등 API 에도 쓰임, 웹은 자동)                                                         |

- 새 게임 PR 은 머지 즉시 웹이 자동 배포되므로, **머지 직후 바로** 시드 적용 + `wrangler deploy` 를 실행합니다.
  시드가 없으면 점수 등록이 `GAME_NOT_FOUND`, API 미배포면 새 점수 상한(`MAX_SCORE_BY_GAME`)이 적용되지 않습니다.
- 배포 후 확인: `curl https://simsim-arcade-api.sbstacarematch1.workers.dev/api/health` → `{"ok":true}`

### 설정값 (최초 1회, 완료)

- D1 생성 (2026-09-28): `database_id` 는 `wrangler.toml` 에 반영됨 — `d1 create` 다시 실행하지 말 것
- Workers: `wrangler.toml` 의 `[vars] ALLOWED_ORIGINS = "https://simsim-arcade.pages.dev"` (CORS 허용 출처)
- Pages 프로젝트 `simsim-arcade` (Git 연동, production 브랜치 `main`)
  - 빌드 명령 `pnpm --filter @simsim/web build`, 출력 폴더 `apps/web/dist`
  - 환경변수 `NODE_VERSION=22`, `VITE_API_BASE_URL=https://simsim-arcade-api.sbstacarematch1.workers.dev`
  - `VITE_*` 값은 빌드할 때 코드에 들어가므로, 바꾸면 **Pages 를 재배포**해야 적용됩니다.
- Pages 는 `404.html` 이 없으면 SPA 로 동작하므로 `/games/:gameId` 새로고침도 정상 동작합니다.

### PR 미리보기 주소 주의

PR 마다 생기는 미리보기 주소(`xxxx.simsim-arcade.pages.dev`)는 `ALLOWED_ORIGINS` 에 없어서 **API 호출이 CORS 로 막힙니다.**
화면 확인까지만 가능하고, 플레이·랭킹 확인은 로컬(`pnpm dev`)에서 합니다.

### 릴리스 태그

배포한 시점은 CLAUDE.md 규칙대로 `main` 에 `v메이저.마이너.패치` 형식 태그로 남깁니다. (첫 배포: `v0.1.0`)

## 알려진 한계 (다음 단계에서 개선)

- **정답이 브라우저로 전달됩니다.** `/questions` 가 정답을 함께 내려주고 채점을 브라우저에서 하므로,
  개발자도구로 정답을 보거나 점수를 조작해 등록할 수 있습니다. 지금은 서버에서 점수 상한만 검사합니다.
  → 서버 채점(세션/토큰) + Turnstile 도입 예정
- 랭킹 기간 필터(일간/주간), 닉네임 금칙어 필터는 아직 없습니다.
- 개발 모드에서는 React StrictMode 때문에 문제 조회 요청이 두 번 나갑니다 (배포 빌드에서는 한 번).
