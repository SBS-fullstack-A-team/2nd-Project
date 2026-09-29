# 🕹️ 심심오락실 (simsim-arcade)

예능식 퀴즈 게임(초성 퀴즈 등)과 추억의 플래시 스타일 게임을 웹에서 즐기는 사이트입니다.
게임을 하나씩 추가하며 확장하고, 모든 인프라는 Cloudflare(Pages + Workers + D1)로 구성합니다.

[![CI](https://github.com/SBS-fullstack-A-team/simsim-arcade/actions/workflows/ci.yml/badge.svg)](https://github.com/SBS-fullstack-A-team/simsim-arcade/actions/workflows/ci.yml)
[![Deploy](https://github.com/SBS-fullstack-A-team/simsim-arcade/actions/workflows/deploy.yml/badge.svg)](https://github.com/SBS-fullstack-A-team/simsim-arcade/actions/workflows/deploy.yml)

🌐 **https://simsim-arcade.pages.dev**

| 링크                                                                                   | 설명                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------- |
| [사이트](https://simsim-arcade.pages.dev)                                              | 운영 웹 (Cloudflare Pages)             |
| [API 상태 확인](https://simsim-arcade-api.sbstacarematch1.workers.dev/api/health)      | `{"ok":true}` 가 나오면 정상 (Workers) |
| [Actions](https://github.com/SBS-fullstack-A-team/simsim-arcade/actions)               | CI · 자동 배포 진행 상황과 로그        |
| [Pull requests](https://github.com/SBS-fullstack-A-team/simsim-arcade/pulls)           | 리뷰 대기 중인 PR                      |
| [main 보호 규칙](https://github.com/SBS-fullstack-A-team/simsim-arcade/rules/24088644) | Ruleset (관리자만 수정 가능)           |
| [릴리스 태그](https://github.com/SBS-fullstack-A-team/simsim-arcade/tags)              | 배포 시점 기록                         |

> 팀 규칙(브랜치, 커밋, PR)과 게임 설계 원칙은 [CLAUDE.md](./CLAUDE.md) 를 참고하세요.

## 프로젝트 목표

이번 프로젝트는 **팀원 각자가 게임 하나를 맡아 처음부터 끝까지 직접 만들면서, 풀스택 개발자로서의 역량을 확인하는 프로젝트**입니다.

- **1인 1게임** — 게임 담당자는 프론트·백엔드 구분 없이 화면, 게임 로직, 점수 계산, 문제 데이터(DB 시드), 서버 점수 검증 값까지 혼자 완성합니다.
- **공통 기반은 역할대로 함께** — 레이아웃·공통 컴포넌트·API·DB 스키마 같은 웹 공통 구성은 프론트/백엔드 역할을 나눠 만들고, 모든 게임이 이 기반 위에서 동작합니다.
- **실제 서비스처럼 운영** — PR 리뷰, CI, `main` 머지 시 자동 배포까지 현업과 같은 흐름으로 작업합니다.

| 카드 | 담당       | 웹 공통 구성 역할 | 게임                    |
| ---- | ---------- | ----------------- | ----------------------- |
| 1    | Heo (팀장) | 프론트엔드        | 힌트 퀴즈 (`hint-quiz`) |
| 2    | 경수       | 프론트엔드        | 미정                    |
| 3    | 신영       | 백엔드            | 미정                    |
| 4    | 동한       | 백엔드            | 미정                    |

> 게임이 정해지면 위 표와 [CLAUDE.md](./CLAUDE.md#게임-카드-담당-1인-1게임) 의 게임 카드 표를 함께 채웁니다.

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
  - 색·모서리는 직접 쓰지 말고 **테마 토큰**(`var(--accent)` 등)을 씁니다. 그래야 XP·클래식 두 테마에서 모두 자연스럽습니다 (아래 "디자인 테마" 참고).
- [ ] **2. registry 등록** — `apps/web/src/games/registry.ts` 의 `GAMES` 에 **내 카드 번호 위치**에 추가
  ```ts
  {
    id: 'word-chain',
    name: '끝말잇기',
    description: '한 줄 설명',
    thumbnail: wordChainThumbnail, // import wordChainThumbnail from './word-chain/thumbnail.svg';
    category: 'quiz',
    card: 2, // 내 카드 번호 (CLAUDE.md "게임 카드 담당" 표)
    component: lazy(() => import('./word-chain')),
  },
  ```
  → 메인 화면의 내 카드 칸("준비 중" 자리)에 게임이 들어가고, `/games/word-chain` 페이지가 자동으로 생깁니다.
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

## 디자인 테마 (XP / 클래식)

사이트는 두 가지 테마를 버튼 하나로 바꿔 가며 쓸 수 있습니다. 기본은 **XP** 입니다.

| 테마   | 모습                                                               | 전환 버튼 위치         |
| ------ | ------------------------------------------------------------------ | ---------------------- |
| XP     | 추억의 윈도우 XP 느낌 — 바탕화면, 파란 제목 표시줄 창, 작업 표시줄 | [시작] 메뉴 맨 아래 🎨 |
| 클래식 | 처음 디자인 — 크림색 배경, 두꺼운 테두리 카드                      | 헤더 오른쪽 🎨         |

- XP 의 [시작] 메뉴에는 게임 목록, Q&A(`/qna`), 프로젝트 소개 바로가기와 테마 전환이 있습니다. 클래식은 헤더의 Q&A · 🎨 버튼을 씁니다.
- 선택한 테마는 브라우저(`localStorage` 의 `simsim:theme`)에 저장되어 다음 방문에도 유지됩니다.
- 테마는 `<html data-theme="xp|classic">` 로 적용되고, 로딩 중 깜빡이지 않도록 `index.html` 에서 먼저 적용합니다.
- 게임 도중 테마를 바꾸면 화면 틀이 바뀌면서 게임이 처음부터 다시 시작됩니다.

**게임 담당자:** 게임 폴더의 CSS 에서는 색·모서리를 직접 적지 말고 `styles/global.css` 의 토큰을 쓰세요.
`--bg`, `--surface`, `--surface-strong`, `--on-strong`, `--text`, `--text-muted`, `--border`, `--accent`, `--yellow`, `--success`, `--danger`, `--radius`, `--radius-sm`
→ 토큰 값이 테마마다 달라서 따로 작업하지 않아도 두 테마를 따라갑니다. 공통 버튼은 `className="btn"` / `"btn btn-primary"` 를 쓰면 됩니다.

**공통 UI 담당자:** 구조

- 테마 상태: `lib/theme.ts` (`useTheme`, `useThemeStyles`), `components/ThemeProvider.tsx`, `components/ThemeToggle.tsx`
- 테마별 토큰·공통 버튼: `styles/global.css` (`:root` = 클래식, `:root[data-theme='xp']` = XP)
- 공통 컴포넌트·페이지 스타일은 테마별 파일로 나눕니다: `Xxx.classic.module.css` / `Xxx.xp.module.css`
  - 구조가 같으면 `useThemeStyles({ classic, xp })` 로 스타일만 바꿔 끼우고 (`GameCard`, `RankingList`, `Timer`)
  - 구조가 다르면 테마별로 화면 틀만 나눕니다 (`Layout`, `HomePage`, `GamePage`, `ResultModal`)
- XP 창 틀은 `components/Window.tsx` 공통 컴포넌트를 씁니다.

## CI (GitHub Actions)

`main` 대상 PR 과 `main` push 마다 `.github/workflows/ci.yml` 이 자동으로 실행됩니다.

- 순서: `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `format:check` → `build`
- 실제 배포는 하지 않습니다 (api 빌드는 `--dry-run`).
- PR 화면의 체크가 ❌ 이면 머지하지 말고 고친 뒤 다시 push 합니다.
- 포맷 오류는 로컬에서 `pnpm format` 으로 바로 고칠 수 있습니다.

## 저장소 설정 (main 보호 규칙 · 팀원 권한)

`main` 은 Ruleset 으로 보호되어 있어서, 아래 조건을 만족해야만 머지됩니다.

| 규칙             | 설정                                          |
| ---------------- | --------------------------------------------- |
| PR 필수          | `main` 직접 push 불가                         |
| 리뷰 승인        | 1명 이상                                      |
| 필수 체크        | CI `check` 통과 (typecheck·lint·format·build) |
| 머지 방식        | Squash and merge 만 허용                      |
| 강제 push / 삭제 | 금지                                          |

- 머지된 브랜치는 원격에서 자동 삭제됩니다.
- 팀원은 저장소 **Write** 권한으로 초대합니다 (Settings → Collaborators and teams → Add people).
  - 초대 메일을 **7일 안에 수락**해야 합니다. 메일이 없으면 https://github.com/SBS-fullstack-A-team/simsim-arcade/invitations 에서 수락합니다.
  - Write 로 브랜치 push·PR·리뷰 승인·머지·태그 push 까지 모두 가능합니다.
  - 저장소 설정, 보호 규칙, Actions Secrets 변경은 관리자(팀장)만 합니다.

## 배포

운영 중입니다. 마지막 확인(2026-09-29): 웹 정상, API `/api/health` 정상, 원격 D1 에 초성 퀴즈 문제 적용됨.

| 대상          | 주소                                                  | 배포 방식                                         |
| ------------- | ----------------------------------------------------- | ------------------------------------------------- |
| 웹 (Pages)    | https://simsim-arcade.pages.dev                       | `main` 머지 시 **자동** (Cloudflare Git 연동)     |
| API (Workers) | https://simsim-arcade-api.sbstacarematch1.workers.dev | `main` 머지 시 **자동** (GitHub Actions `Deploy`) |
| DB (D1)       | `simsim-arcade-db` (APAC)                             | `main` 머지 시 **자동** (GitHub Actions `Deploy`) |

> 비밀값은 레포에 넣지 않습니다. 자동 배포는 GitHub Secrets 의 Cloudflare 토큰을 사용합니다.
> API 에 비밀값이 필요해지면 로컬은 `apps/api/.dev.vars`(`.dev.vars.example` 복사),
> 배포는 `wrangler secret put 이름` 으로 등록합니다.

### 자동 배포 (`.github/workflows/deploy.yml`)

`apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml` 이 바뀐 PR 이 `main` 에 머지되면 자동으로 실행됩니다.
(`apps/web` 만 바뀐 PR 은 Pages 가 처리하므로 실행되지 않습니다.)

1. 타입 체크
2. 원격 D1 마이그레이션 — 아직 적용되지 않은 마이그레이션만
3. 원격 D1 시드 — `seeds/*.sql` 전체를 파일명 순서대로 (새 게임의 `game` 행·문제가 여기서 들어감)
4. `wrangler deploy` — API 배포 (새 게임 점수 상한 `MAX_SCORE_BY_GAME` 반영)
5. `/api/health` 확인

- 진행 상황과 실패 로그는 GitHub **Actions** 탭 → `Deploy` 에서 봅니다. 실패하면 운영은 이전 버전 그대로입니다.
- 다시 배포해야 할 때는 Actions 탭 → `Deploy` → **Run workflow** 로 수동 실행합니다.
- 시드는 매번 전부 다시 적용되므로, 시드 파일은 **여러 번 실행해도 결과가 같게** 작성해야 합니다 (`chosung-quiz.sql` 참고).
- 마이그레이션도 머지되면 바로 운영 DB 에 적용됩니다. **스키마 PR 은 리뷰를 꼼꼼히** 하고, 이미 머지된 마이그레이션 파일은 수정하지 않습니다.

#### 최초 설정 (관리자 1회)

1. Cloudflare 대시보드 → My Profile → API Tokens → **Create Token** → Custom token
   - 권한: `Account` / `D1` / `Edit`, `Account` / `Workers Scripts` / `Edit`
   - Account Resources: 팀 계정만 선택
2. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
   - `CLOUDFLARE_API_TOKEN` — 위에서 만든 토큰
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare 대시보드 오른쪽의 Account ID
3. (선택) Settings → Environments → `production` 에 승인자를 지정하면, 배포 전에 사람이 승인해야 실행됩니다.

### 수동 배포 (비상용)

자동 배포를 쓸 수 없을 때만, 팀 Cloudflare 계정으로 `wrangler login` 한 뒤 `apps/api` 에서 실행합니다.

```bash
pnpm exec wrangler d1 migrations apply simsim-arcade-db --remote
pnpm exec wrangler d1 execute simsim-arcade-db --remote --file=seeds/<게임id>.sql
pnpm exec wrangler deploy
```

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
