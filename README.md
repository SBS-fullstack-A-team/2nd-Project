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

| 순번 | 담당       | 웹 공통 구성 역할 | 카드 번호   | 게임                                                                                        |
| ---- | ---------- | ----------------- | ----------- | ------------------------------------------------------------------------------------------- |
| 1    | Heo (팀장) | 프론트엔드        | 1, 5, 9, …  | 1 힌트 퀴즈 (`hint-quiz`), 5 국기 퀴즈 (`flag-quiz`), 9 의자 탑 쌓기 (`chair-stack`)        |
| 2    | 경수       | 프론트엔드        | 2, 6, 10, … | 2 임진 50 (`imjin-50`), 6 유적 탈출 (`ruins-dash`)                                          |
| 3    | 신영       | 백엔드            | 3, 7, 11, … | 3 과일 슬라이서 (`fruit-slicer`), 7 스카이 에이스 (`sky-ace`), 11 캣 블레이드 (`cat-blade`) |
| 4    | 동한       | 백엔드            | 4, 8, 12, … | 미정                                                                                        |

> 카드 번호는 4명이 순서대로 돌아가며 받습니다: **내 n번째 게임 = (n − 1) × 4 + 내 순번**.
> 게임이 정해지면 위 표와 [CLAUDE.md](./CLAUDE.md#게임-카드-담당-1인-1게임씩-차례대로) 의 게임 카드 표를 함께 채웁니다.

## 게임 목록

| 카드 | 게임                              | 분류     | 담당 | 한 줄 소개                                                                       |
| ---- | --------------------------------- | -------- | ---- | -------------------------------------------------------------------------------- |
| 1    | 🧩 힌트 퀴즈 (`hint-quiz`)        | 퀴즈     | 혁   | 힌트가 하나씩 열린다! 적은 힌트로 빨리 맞힐수록 고득점 (장르 5개, 아래 표)       |
| 2    | 🏯 임진 50 (`imjin-50`)           | 아케이드 | 경수 | 벽으로 길을 접어 50차례의 공세를 막는 미로형 타워디펜스                          |
| 3    | 🍉 과일 슬라이서 (`fruit-slicer`) | 아케이드 | 신영 | 날아오는 과일을 베고 폭탄은 피하라! 검 스킨 10종 해금과 피버 타임                |
| 5    | 🏳️ 국기 퀴즈 (`flag-quiz`)        | 퀴즈     | 혁   | 국기 보고 나라, 나라 보고 수도! 10초 안에 4지선다 (쉬움 61개 / 전체 195개국)     |
| 6    | 🏃 유적 탈출 (`ruins-dash`)       | 아케이드 | 경수 | 굴러오는 바위를 피해 달려라! 점프·슬라이드·레인 이동으로 즐기는 3레인 러너       |
| 7    | ✈️ 스카이 에이스 (`sky-ace`)      | 아케이드 | 신영 | 기체 3종 중 하나로 출격! 2단 변신 보스 3체가 기다리는 종스크롤 탄막 슈팅         |
| 9    | 🪑 의자 탑 쌓기 (`chair-stack`)   | 아케이드 | 혁   | 의자를 돌리고 떨어뜨려 높이 쌓아라! 물리로 흔들리는 탑 쌓기 (쉬움 / 어려움 ×1.5) |
| 11   | 🐱 캣 블레이드 (`cat-blade`)      | 아케이드 | 신영 | 무적 구르기·패링·5가지 폼 체인지로 2페이즈 보스 3체를 쓰러뜨리는 고양이 액션     |
| —    | 🔤 초성 퀴즈 (`chosung-quiz`)     | 퀴즈     | 공통 | 초성만 보고 단어를 맞혀라! 10개 분야 257문제, 콤보·올클리어 보너스 (60초 20문제) |

힌트 퀴즈 장르

| 장르        | 문제 수 | 만드는 방법                                                                |
| ----------- | ------- | -------------------------------------------------------------------------- |
| ⚽ 축구선수 | 1,008   | FC온라인 인기 선수 순 선발 + 위키데이터 힌트 (자동 생성) + 직접 만든 8문제 |
| ⚾ 야구선수 | 295     | KBO 선수를 한국어 위키백과 조회수 순 선발 + 위키데이터 힌트 (자동 생성)    |
| 🌏 나라     | 195     | 위키데이터 자동 생성 (유엔 회원국 + 바티칸·팔레스타인) + 직접 만든 8문제   |
| 🐾 동물     | 50      | 직접 작성                                                                  |
| 🍜 음식     | 50      | 직접 작성                                                                  |

> 자동 생성 방법은 아래 [퀴즈 문제 자동 생성](#퀴즈-문제-자동-생성-힌트-퀴즈), 데이터 출처는 [데이터 출처 · 라이선스](#데이터-출처--라이선스) 참고.

## 방송 도구

스트리머가 방송에서 쓰는 추첨 도구입니다. 점수·랭킹 없이 브라우저 안에서만 동작하고, 메인 화면의 "방송 도구" 섹션에 따로 나옵니다.
도구 페이지(`/tools/<도구ID>`)의 **전체 화면** 버튼으로 도구만 화면에 꽉 채울 수 있습니다 (OBS 창 캡처용).

| 도구                              | 한 줄 소개                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔮 구슬 레이스 (`marble-race`)    | 시청자 이름 구슬들의 서킷 레이스 — 매 판 무작위 트랙·테마 4종, 부스터·진흙·구멍·범퍼·회전 바, 역전 중계 자막·미니맵·접전 슬로모션·시상대. 먼저 도착/꼴등 뽑기, `이름*N` 가중치, 최대 300개                 |
| 🎯 핀볼 사다리 (`pinball-ladder`) | 사다리타기 대신 쓰는 1:1 짝짓기 — 이름 공이 핀에 튕기며 결과 칸에 들어가고, 들어간 칸은 닫혀서 한 칸에 한 명씩. 결과 `꽝*N`, 모자란 칸은 꽝 자동 채움, 결과 가리기(들어가면 공개), 자동/한 명씩, 최대 30명 |
| 🎡 돌림판 룰렛 (`roulette-wheel`) | 벌칙·미션·후원 룰렛 — `항목*N` 으로 칸 크기·확률 조절, 뽑힌 항목 다음 판부터 빼기, 짧게/보통/길게, 아슬아슬하게 멈추는 연출, 스페이스바로 돌리기, 기록·복사, 최대 100칸                                    |

새 도구 추가: `apps/web/src/tools/<도구ID>/` 폴더(`index.tsx` default export, props 없음 + 썸네일)를 만들고 `apps/web/src/tools/registry.ts` 의 `TOOLS` 맨 뒤에 등록합니다. DB·시드·점수 상한은 필요 없습니다.

## 구성

| 폴더              | 내용              | 기술                                                                                      |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `apps/web`        | 프론트엔드        | React, TypeScript, Vite, React Router → Cloudflare Pages (게임별: matter-js 2D 물리 엔진) |
| `apps/api`        | API 서버          | Cloudflare Workers, Hono, D1, Drizzle ORM                                                 |
| `packages/shared` | web·api 공용 타입 | TypeScript                                                                                |

```
apps/web/src/
  games/            게임별 독립 폴더 + registry.ts (게임 등록부)
  tools/            방송 도구별 독립 폴더 + registry.ts (점수·랭킹 없는 추첨 도구)
  components/       공통 UI (Timer, ResultModal, RankingList, GameCard, Window, StartMenu …)
  pages/            HomePage, GamePage(/games/:gameId), ToolPage(/tools/:toolId), QnaPage(/qna), NotFoundPage
  lib/              API 클라이언트, useFetch 훅
apps/api/
  src/routes/       gameId 기반 범용 API
  src/db/           Drizzle 스키마
  migrations/       마이그레이션 SQL (drizzle-kit 생성, 커밋 대상)
  seeds/            게임별 시드 SQL (<게임id>.sql, 힌트 퀴즈는 장르별로 hint-quiz-*.sql)
  seeds/scripts/    퀴즈 문제 자동 생성 스크립트 (Node 개발용, 결과는 seeds/*.sql 로 저장)
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

## 퀴즈 문제 자동 생성 (힌트 퀴즈)

힌트 퀴즈의 축구선수·야구선수·나라 문제는 스크립트로 만들어 시드 SQL 로 저장합니다. (직접 만든 문제는 `seeds/hint-quiz.sql`)

| 스크립트                               | 결과 파일                      | 걸리는 시간 | 비고                                           |
| -------------------------------------- | ------------------------------ | ----------- | ---------------------------------------------- |
| `seeds/scripts/hint-quiz-football.mjs` | `seeds/hint-quiz-football.sql` | 약 5~10분   | 인원수 인자 (기본 1000)                        |
| `seeds/scripts/hint-quiz-baseball.mjs` | `seeds/hint-quiz-baseball.sql` | 10분 이상   | 위키백과 조회수 API 요청 제한 때문에 오래 걸림 |
| `seeds/scripts/hint-quiz-country.mjs`  | `seeds/hint-quiz-country.sql`  | 1분 이내    |                                                |

```bash
node apps/api/seeds/scripts/hint-quiz-football.mjs    # 루트에서 실행 (인터넷 연결 필요)
pnpm db:seed:local                                    # 로컬 D1 에 적용해서 확인
```

- **결과를 검토한 뒤 커밋**합니다. 위키데이터는 매일 바뀌므로 다시 만들면 문제 일부가 달라질 수 있습니다.
  축구선수 스크립트는 이름이 정확히 같지 않게 연결된 선수를 "이름 연결 검토" 로그로 보여줍니다 — 잘못 연결된 선수는 스크립트의 `FC_LINK` 에 적어 바로잡습니다.
- 각 시드는 **자기 장르 문제만 지우고 다시 넣습니다** (`meta.source = 'wikidata'` + `meta.category`). 새 장르 스크립트를 만들 때도 DELETE 조건에 장르를 꼭 넣으세요 — 빠지면 파일명 순서상 뒤에 적용되는 시드가 다른 장르 문제를 지웁니다.
- 선수 이름 표기 보정은 스크립트 안의 목록으로 관리해서 다시 만들어도 유지됩니다 (`NAME_FIX` 등).
- 정답 판정은 게임 폴더의 `answer.ts` 가 합니다 — 표기 차이·이름 일부도 인정하지만, **나라는 정확히 일치(별칭 포함)만** 인정합니다 (이란 ≠ 이라크).

## 데이터 출처 · 라이선스

| 데이터                                                                                          | 쓰는 곳                                            | 라이선스 · 조건                                                                                                    |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [위키데이터](https://www.wikidata.org)                                                          | 힌트 퀴즈 축구·야구·나라 힌트, 국기 퀴즈 나라·수도 | CC0 (자유 이용)                                                                                                    |
| [Wikimedia Pageviews API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/) | 야구선수 선발 (한국어 위키백과 조회수)             | CC0                                                                                                                |
| [넥슨 Open API](https://openapi.nexon.com) — FC온라인 선수 메타데이터                           | 축구선수 선발·정답 이름                            | 화면에 **"Data based on NEXON Open API"** 출처 표시 필수 ([이용약관](https://openapi.nexon.com/ko/support/terms/)) |
| [flag-icons](https://github.com/lipis/flag-icons)                                               | 국기 퀴즈 국기 그림                                | MIT (`apps/web/src/games/flag-quiz/flags/LICENSE`)                                                                 |
| [matter-js](https://github.com/liabru/matter-js)                                                | 의자 탑 쌓기 물리 엔진 (npm 의존성)                | MIT                                                                                                                |

- 동물·음식 문제와 직접 만든 문제는 팀이 직접 작성했습니다. 방송 프로그램 이름·로고·실제 방송 문제는 쓰지 않습니다.
- 출처 문구는 힌트 퀴즈 문제 카드 아래에 장르별로 표시됩니다 (`hint-quiz/config.ts` 의 `CATEGORY_CREDIT`).

## API

모든 API 는 게임별이 아닌 **gameId 기반 범용 API** 입니다. 요청/응답 타입은 `packages/shared/src/api.ts` 참고.

| 메서드 | 경로                                                  | 설명                                                                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST` | `/api/games/:gameId/scores`                           | 점수 등록 `{ nickname, score }` → `{ id, rank }`                                |
| `GET`  | `/api/games/:gameId/ranking?limit=10`                 | 상위 N개 (최대 50, 같은 점수는 먼저 등록한 순)                                  |
| `GET`  | `/api/games/:gameId/questions?limit=10&category=동물` | 퀴즈 문제 랜덤 N개 (최대 50). `category` 를 주면 `meta.category` 가 같은 문제만 |
| `GET`  | `/api/health`                                         | 상태 확인                                                                       |

- 에러 응답은 공통 형식입니다: `{ "error": { "code": "GAME_NOT_FOUND", "message": "..." } }`
- 검증: 닉네임 1~12자(앞뒤 공백 제거), 점수는 0 이상 정수이고 게임별 상한(`MAX_SCORE_BY_GAME`) 이하

## 새 게임 추가 방법 (체크리스트)

게임은 **카드 담당자 1명이 프론트·백 구분 없이** 만듭니다 (담당 카드는 [CLAUDE.md](./CLAUDE.md#게임-카드-담당-1인-1게임씩-차례대로) 참고).
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
  - 색·모서리는 직접 쓰지 말고 **테마 토큰**(`var(--accent)` 등)을 씁니다. 그래야 XP·98·7·11·클래식 모든 테마에서 자연스럽습니다 (아래 "디자인 테마" 참고).
- [ ] **2. registry 등록** — `apps/web/src/games/registry.ts` 의 `GAME_ENTRIES` **맨 뒤에** 추가
  ```ts
  {
    id: 'word-chain',
    name: '끝말잇기',
    description: '한 줄 설명',
    thumbnail: wordChainThumbnail, // import wordChainThumbnail from './word-chain/thumbnail.svg';
    category: 'quiz',
    owner: '경수', // 내 이름만 적으면 카드 번호가 자동으로 붙는다 (예: 경수의 2번째 게임 → 6)
    component: lazy(() => import('./word-chain')),
  },
  ```
  → 카드 번호 = (내 n번째 게임 − 1) × 4 + 내 순번 이 자동 계산되어 메인 화면에 그 순서로 나타나고, `/games/word-chain` 페이지가 자동으로 생깁니다.
  - `card` 는 직접 적지 않습니다. 이미 있는 항목의 순서를 바꾸거나 중간에 끼워 넣지 마세요 (내 뒤쪽 게임 카드 번호가 바뀝니다).
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

## 디자인 테마 (XP / 98 / 7 / 11 / 클래식)

사이트는 다섯 가지 테마를 골라 쓸 수 있습니다. 기본은 **XP** 입니다.

| 테마   | 모습                                                                    | 바꾸는 곳                   |
| ------ | ----------------------------------------------------------------------- | --------------------------- |
| XP     | 추억의 윈도우 XP 느낌 — 하늘·언덕 바탕화면, 파란 제목 표시줄 창         | [시작] 메뉴 맨 아래 🎨 테마 |
| 98     | 추억의 윈도우 98 느낌 — 청록색 바탕화면, 회색 입체 창, 남색 제목 표시줄 | [시작] 메뉴 맨 아래 🎨 테마 |
| 7      | 윈도우 7 느낌 — 빛줄기 바탕화면, 반투명 유리(Aero) 창, 둥근 시작 버튼   | [시작] 메뉴 맨 아래 🎨 테마 |
| 11     | 윈도우 11 느낌 — 둥근 모서리 창, 반투명 작업 표시줄, 가운데 "시작" 버튼 | [시작] 메뉴 맨 아래 🎨 테마 |
| 클래식 | 처음 디자인 — 크림색 배경, 두꺼운 테두리 카드                           | 헤더 오른쪽 테마 선택 목록  |

- XP·98·7·11 은 화면 구조(바탕화면 · 창 · 작업 표시줄 · 시작 메뉴)가 같고 스타일만 다릅니다. [시작] 메뉴에는 게임 목록, Q&A(`/qna`), 프로젝트 소개 바로가기와 테마 선택이 있습니다.
- 클래식은 헤더의 Q&A 버튼과 테마 선택 목록을 씁니다.
- 선택한 테마는 브라우저(`localStorage` 의 `simsim:theme`)에 저장되어 다음 방문에도 유지됩니다.
- 테마는 `<html data-theme="xp|win98|win7|win11|classic">` 로 적용되고, 로딩 중 깜빡이지 않도록 `index.html` 에서 먼저 적용합니다.
- 게임 도중 테마를 바꾸면 화면 틀이 바뀌면서 게임이 처음부터 다시 시작될 수 있습니다.

**게임 담당자:** 게임 폴더의 CSS 에서는 색·모서리를 직접 적지 말고 `styles/global.css` 의 토큰을 쓰세요.
`--bg`, `--surface`, `--surface-strong`, `--on-strong`, `--text`, `--text-muted`, `--border`, `--accent`, `--yellow`, `--success`, `--danger`, `--radius`, `--radius-sm`
→ 토큰 값이 테마마다 달라서 따로 작업하지 않아도 모든 테마를 따라갑니다. 공통 버튼은 `className="btn"` / `"btn btn-primary"` 를 쓰면 됩니다.

**공통 UI 담당자:** 구조

- 테마 상태: `lib/theme.ts` (`useTheme`, `useThemeStyles`, `isDesktopTheme`), `components/ThemeProvider.tsx`, `components/ThemeSelect.tsx`
- 테마별 토큰·공통 버튼: `styles/global.css` (`:root` = 클래식, `:root[data-theme='xp']`, `win98`, `win7`, `win11`)
- 공통 컴포넌트·페이지 스타일은 테마별 파일로 나눕니다: `Xxx.classic.module.css` / `Xxx.xp.module.css` / `Xxx.win98.module.css` / `Xxx.win7.module.css` / `Xxx.win11.module.css`
  - 구조가 같으면 `useThemeStyles({ classic, xp, win98, win7, win11 })` 로 스타일만 바꿔 끼우고 (`GameCard`, `RankingList`, `Timer`, `Window`, `StartMenu`)
  - 구조가 다르면 클래식 / 바탕화면 테마(`isDesktopTheme`)로 화면 틀만 나눕니다 (`Layout`, `HomePage`, `GamePage`, `ResultModal`, `QnaPage`)
- 바탕화면 테마의 창 틀은 `components/Window.tsx` 공통 컴포넌트를 씁니다.
- **테마 추가 방법:** `Theme` 타입에 추가 → `global.css` 토큰 → 각 `*.<테마>.module.css` → `index.html` 초기 스크립트 허용값. 타입 검사가 빠진 곳을 알려 줍니다.

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
