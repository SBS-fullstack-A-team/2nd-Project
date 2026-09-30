# 프로젝트 규칙 (simsim-arcade · 심심오락실)

예능식 퀴즈 게임(초성 퀴즈 등)과 추억의 플래시 스타일 게임을 웹에서 운영하는 사이트.
게임은 하나씩 추가하며 확장한다. **Cloudflare 하나로 전부 구성** (Pages + Workers + D1).

> 브랜치 전략: **GitHub Flow** (`main` + `feature/*`, 배포는 태그로 표시)

## 사전 준비 (팀원 전원 최초 1회)

PR 자동 생성 기능을 쓰려면 GitHub CLI(`gh`)가 설치되어 있어야 합니다.

**설치 확인**

```bash
gh --version
```

→ 버전이 뜨면 설치되어 있는 것, 안 뜨면 아래 설치 진행

**설치 방법**

Windows (PowerShell, 관리자 권한):

```powershell
winget install --id GitHub.cli
```

Mac:

```bash
brew install gh
```

**로그인**

```bash
gh auth login
```

- `GitHub.com` 선택 → `HTTPS` 선택 → `Login with a web browser` 선택
- 코드가 나오면 복사 → 브라우저 열리면 붙여넣고 로그인/승인

**로그인 확인**

```bash
gh auth status
```

→ `Logged in to github.com as 본인아이디` 뜨면 완료

## 팀원 & Git 계정 정보

| 이름       | GitHub 아이디 | 역할       | 담당 브랜치 접두사 |
| ---------- | ------------- | ---------- | ------------------ |
| Heo (팀장) | heo-hyuk      | 프론트엔드 | feature/fe-*       |
| 신영       | syyu21b       | 백엔드     | feature/be-*       |
| 경수       | HurKyungsoo   | 프론트엔드 | feature/fe-*       |
| 동한       | Kim-dong-han  | 백엔드     | feature/be-*       |

> 위 역할(프론트/백엔드)은 **웹 공통 구성** 작업에만 적용된다.
> **게임 카드**는 역할과 상관없이 1인 1게임으로 담당자가 프론트·백 구분 없이 혼자 만든다. → 아래 "작업 구분" 참고

## 커밋 규칙

- 커밋 전, 현재 로컬 git config의 user.name / user.email이 위 표의 본인 GitHub 계정과 일치하는지 확인할 것
- 다르면 아래처럼 **로컬(이 프로젝트 한정)**로 설정할 것:
  ```bash
  git config user.name "본인이름"
  git config user.email "본인 GitHub 계정 이메일"
  ```
- 커밋 메시지는 아래 컨벤션을 따를 것 (단, wip 커밋은 "작업 중단/재개 규칙" 참고)

| 태그        | 의미                                   |
| ----------- | -------------------------------------- |
| `feat:`     | 새로운 기능 추가                       |
| `fix:`      | 버그 수정                              |
| `refactor:` | 코드 리팩토링                          |
| `style:`    | 코드 포맷팅, 세미콜론 등               |
| `docs:`     | 문서 수정                              |
| `chore:`    | 빌드/설정 파일 수정                    |
| `wip:`      | 미완성 작업 중간 저장 (아래 규칙 참고) |

예시: `feat: 로그인 API 연동`, `fix: 회원가입 유효성 검사 오류 수정`

## 스택

| 영역              | 기술                                     | 배포                |
| ----------------- | ---------------------------------------- | ------------------- |
| 모노레포          | pnpm workspace                           | —                   |
| `apps/web`        | React + TypeScript + Vite + React Router | Cloudflare Pages    |
| `apps/api`        | Cloudflare Workers + Hono + TypeScript   | Cloudflare Workers  |
| DB                | Cloudflare D1 + Drizzle ORM              | D1                  |
| `packages/shared` | API 요청/응답 타입, 게임 공통 타입       | (web·api 가 import) |

- 나중에 추가 예정 — **지금은 만들지 말 것**: Durable Objects(파티 모드), R2, KV, Turnstile

## 작업 구분: 웹 공통 구성 vs 게임 카드

| 구분             | 범위                                                                                 | 담당                                         | 브랜치                          |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------- |
| **웹 공통 구성** | 레이아웃, 공통 컴포넌트, 페이지, API, DB 스키마·마이그레이션, shared 공통 타입, 설정 | 프론트/백엔드 역할대로 분리                  | `feature/fe-*` / `feature/be-*` |
| **게임 카드**    | 게임 1개 (게임 폴더 + registry 등록 + 시드 + 점수 상한/meta 타입)                    | 카드 담당자 1명이 전부 (프론트·백 구분 없음) | `feature/game-<게임id>`         |

### 게임 카드 담당 (1인 1게임씩, 차례대로)

카드 번호는 **혁 → 경수 → 신영 → 동한 순서로 4장씩 돌아가며** 받는다. 한 사람이 게임을 몇 개 만들든 번호가 자동으로 정해진다.

- **내 n번째 게임의 카드 번호 = (n − 1) × 4 + 내 순번**

| 순번 | 담당     | 카드 번호   | 1번째 게임 (id)                  | 2번째 게임 (id)           |
| ---- | -------- | ----------- | -------------------------------- | ------------------------- |
| 1    | 혁 (Heo) | 1, 5, 9, …  | 1 힌트 퀴즈 (`hint-quiz`)        | 5 국기 퀴즈 (`flag-quiz`) |
| 2    | 경수     | 2, 6, 10, … | 2 임진 50 (`imjin-50`)           | 6 미정                    |
| 3    | 신영     | 3, 7, 11, … | 3 과일 슬라이서 (`fruit-slicer`) | 7 미정                    |
| 4    | 동한     | 4, 8, 12, … | 4 미정                           | 8 미정                    |

- 게임이 정해지면 이 표의 해당 칸을 채운다. 3번째 게임부터는 열을 추가한다 (9~12).
- 브랜치는 게임마다 `feature/game-<게임id>` 로 따로 만든다.
- 메인 화면에는 카드 번호 순서대로 칸이 있고, 게임이 아직 없는 칸은 "준비 중" 으로 표시된다.
  - 게임을 등록할 때 `registry.ts` 의 항목에 `card: <내 카드 번호>` 를 적으면 그 칸에 들어간다.
  - 칸은 등록된 가장 큰 카드 번호가 속한 4장 묶음까지 자동으로 생긴다 (예: 5번이 등록되면 5~8 칸이 생기고 6·7·8 은 "준비 중").
  - 담당 순서(`CARD_OWNERS`)와 칸 계산(`GAME_CARD_SLOTS`)은 공통 코드이므로 게임 PR 에서 고치지 않는다.
- 두 번째 게임은 첫 번째 게임을 등록한 뒤에 시작하는 것을 권장한다 (번호는 미리 정해져 있으니 먼저 올려도 된다).
- 샘플 게임 `chosung-quiz`(초성 퀴즈)는 구조 참고용이다. 계속 둘지는 팀에서 정한다.

### 게임 카드 작업 규칙 — "추가만 한다"

게임 카드 작업은 **새 파일 추가 + 등록 한 줄**만 한다. 다른 사람 게임이나 공통 코드는 건드리지 않는다.

| 파일                             | 허용되는 변경                                                               |
| -------------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/games/<게임id>/`   | 새 폴더 — 자유롭게 작성 (내 게임 전용)                                      |
| `apps/web/src/games/registry.ts` | `GAMES` 에 **항목 1개 추가** (`card: 내 카드 번호` 포함), 썸네일 import 1줄 |
| `packages/shared/src/game.ts`    | `MAX_SCORE_BY_GAME` 에 **1줄 추가**, 퀴즈류면 meta 타입 **추가**            |
| `apps/api/seeds/<게임id>.sql`    | 새 파일 — 내 게임의 `game` 행 + `quiz_item` 문제                            |

- 금지: 공통 `components/`, `pages/`, `lib/`, API 라우트, DB 스키마, 다른 사람의 게임 폴더·시드 수정
- 공통 부분 변경이 필요하면 (예: 공통 컴포넌트에 기능 추가, 새 API) 게임 PR 에 섞지 말고 해당 역할 담당자에게 요청해서 `feature/fe-*` / `feature/be-*` PR 로 따로 진행한다.
- 게임 PR 리뷰는 팀원 누구든 1명 이상 승인이면 된다.

## 저장소 구조 & 담당

```
apps/web/src/          # 프론트 (Heo, 경수)
  games/               #   게임별 독립 폴더 + registry.ts
  components/          #   공통 UI: Timer, ResultModal, RankingList, GameCard ...
  pages/               #   HomePage(메인), GamePage(/games/:gameId), NotFoundPage
  lib/                 #   api 클라이언트, useFetch
apps/api/              # 백엔드 (신영, 동한)
  src/routes/games.ts  #   gameId 기반 범용 API
  src/db/schema.ts     #   Drizzle 스키마
  migrations/          #   drizzle-kit 생성 SQL (커밋 대상)
  seeds/<게임id>.sql   #   게임별 시드 SQL (파일명 순서대로 전부 적용)
packages/shared/src/   # 공용 타입 — 변경 시 프론트·백엔드 양쪽 리뷰 받을 것
```

- (웹 공통 구성) 프론트 작업은 `apps/web/` 안에서만, 백엔드 작업은 `apps/api/` 안에서만 한다.
- (게임 카드) 위 "게임 카드 작업 규칙"의 파일만 추가/수정한다.
- 요청/응답 타입은 **`packages/shared` 에만** 정의한다. web·api 에 같은 타입을 따로 만들지 말 것.

## 게임 설계 원칙 (게임 추가가 쉬워야 함)

### 프론트

1. 게임은 `apps/web/src/games/<게임id>/` **폴더 하나로 완결**한다. (컴포넌트, 규칙 config, 스타일, 썸네일)
   - 게임 폴더 밖의 공통 코드(`components/`, `pages/`)를 게임 전용으로 수정하지 않는다.
2. 모든 게임 컴포넌트는 `default export` 이고 공통 Props `GameProps` (`{ onFinish: (score: number) => void }`) 를 따른다.
   - 게임은 **점수 계산까지만** 책임진다. 점수 등록·결과창·랭킹은 `GamePage` 가 공통 처리한다.
   - `onFinish` 는 한 판에 한 번만 호출한다. 다시 하기는 GamePage 가 게임을 새로 마운트해서 처리한다.
3. `games/registry.ts` 에 메타(id, name, description, thumbnail, category, lazy 컴포넌트)를 등록한다.
   - 메인 카드 목록과 `/games/:gameId` 라우트는 registry 로 자동 생성된다. **게임별 라우트를 따로 만들지 말 것.**
   - 컴포넌트는 반드시 `React.lazy(() => import('./<게임id>'))` 로 등록한다 (게임별 코드 분리).

### 백엔드

4. API 는 **게임별로 만들지 않고 gameId 기반 범용**으로 만든다.
   - `POST /api/games/:gameId/scores` — `{ nickname, score }` 등록
   - `GET  /api/games/:gameId/ranking?limit=N` — 상위 N개 (기간 필터는 나중에)
   - `GET  /api/games/:gameId/questions?limit=N` — 퀴즈류 문제 랜덤 N개
   - 에러는 공통 형식 `{ error: { code, message } }` 로 응답한다.
5. DB 스키마: `game(id, name, category, created_at)`, `score(id, game_id, nickname, score, created_at)`, `quiz_item(id, game_id, question, answer, meta JSON, created_at)`
   - 게임마다 달라지는 데이터는 **새 테이블/컬럼 대신 `quiz_item.meta`(JSON)** 에 담고, meta 타입은 `packages/shared` 에 정의한다.
   - 스키마 변경 시 `pnpm db:generate` 로 마이그레이션을 만들고 **생성된 SQL 을 함께 커밋**한다. 이미 머지된 마이그레이션 파일은 수정하지 말 것.

### 게임 ID 규칙

- 소문자·숫자·하이픈 (예: `chosung-quiz`). 아래 4곳의 ID 가 반드시 같아야 한다:
  1. 게임 폴더명 `apps/web/src/games/<id>/`
  2. `registry.ts` 의 `id`
  3. DB `game.id` (시드 파일 `apps/api/seeds/<id>.sql`)
  4. `packages/shared` 의 `MAX_SCORE_BY_GAME` 키 (서버 점수 상한 검증)

## 새 게임 추가 체크리스트 (게임 카드 담당자)

0. 최신 main 에서 `feature/game-<id>` 브랜치 생성
1. `apps/web/src/games/<id>/` 폴더 생성 — `index.tsx`(default export, `GameProps`), `config.ts`, 스타일, `thumbnail.svg`
2. `apps/web/src/games/registry.ts` 에 메타 등록 (`lazy(() => import('./<id>'))`, `card: (n − 1) × 4 + 내 순번`)
3. `packages/shared/src/game.ts` — `MAX_SCORE_BY_GAME` 에 최고 점수 추가, 퀴즈류면 meta 타입 추가
4. `apps/api/seeds/<id>.sql` 새 파일에 `game` 행 INSERT (+ 퀴즈류면 `quiz_item` 문제) → `pnpm db:seed:local`
   - 여러 번 실행해도 되게 작성 (`INSERT OR IGNORE`, 내 게임 문제만 `DELETE` 후 재삽입 — `chosung-quiz.sql` 참고)
5. `pnpm typecheck && pnpm lint && pnpm build` 통과, `pnpm dev` 로 한 판 → 점수 등록 → 랭킹까지 확인 후 PR

## 개발 명령어 (루트에서 실행)

```bash
pnpm install              # 의존성 설치
pnpm db:setup:local       # 로컬 D1 마이그레이션 + 시드 (최초 1회, 스키마/시드 변경 시)
pnpm dev                  # web(5173) + api(8787) 동시 실행, web → api 프록시
pnpm typecheck            # 전체 타입 체크
pnpm lint / pnpm format   # ESLint / Prettier
pnpm build                # web 빌드 + api 번들 확인(dry-run, 실제 배포 아님)
pnpm db:generate          # 스키마 변경 후 마이그레이션 SQL 생성
```

## 코드 작성 규칙

- 코드 주석과 README 는 **한국어**로 작성한다.
- `apps/api` 는 Workers 런타임에서 동작하는 라이브러리만 사용한다. **Node 전용 API(`fs`, `path`, `process` 등) 금지.**
- 비밀값(API 토큰, 계정 ID 등)은 코드·레포에 넣지 않는다. 로컬은 `apps/api/.dev.vars`(gitignore), 배포는 `wrangler secret` / 환경변수 사용.
- **실제 배포(`wrangler deploy`)와 원격 D1 마이그레이션·시드(`--remote`)는 Claude 가 실행하지 않는다.** 운영 배포는 `main` 머지 시 자동 배포(Pages Git 연동 + GitHub Actions `Deploy`)로만 한다. 수동 명령은 README 에만 정리한다.
- 방송 프로그램 이름·로고·실제 방송 문제는 사용하지 않는다. 문제는 직접 만든 것만 쓴다.

## 브랜치 전략 (GitHub Flow)

```
main        # 통합 + 배포 브랜치. 항상 배포 가능한 상태 유지, 직접 push 금지
feature/*   # 개별 기능 작업 브랜치. main에서 분기 → main으로 PR
```

- 웹 공통 구성 — 프론트 담당자(Heo, 경수): `feature/fe-기능명`
- 웹 공통 구성 — 백엔드 담당자(신영, 동한): `feature/be-기능명`
- 게임 카드 — 담당자 누구나 (역할 무관): `feature/game-게임id`
- 공통 구성은 본인 role에 맞는 브랜치명만, 게임 카드는 본인 담당 게임의 브랜치만 생성할 것
- `develop` 브랜치는 사용하지 않음

예시: `feature/fe-ranking-ui`, `feature/be-ranking-period`, `feature/game-word-chain`

## 작업 흐름

1. 작업 시작 전 main 최신화
   ```bash
   git checkout main
   git pull origin main
   ```
2. 작업 종류에 맞는 브랜치 생성
   ```bash
   git checkout -b feature/역할-기능명     # 웹 공통 구성 (fe / be)
   git checkout -b feature/game-게임id     # 게임 카드
   ```
3. 작업 후 커밋 & push
   ```bash
   git add .
   git commit -m "feat: 작업내용"
   git push origin feature/역할-기능명
   ```
4. GitHub에서 `main`으로 PR 생성
5. 팀원 1명 이상 리뷰 승인 후 머지 (Squash and merge)
6. 머지 완료된 브랜치는 삭제 (PR 화면의 "Delete branch" 버튼, 원격 자동 삭제 설정도 적용됨)
7. 로컬 정리
   ```bash
   git checkout main && git pull origin main
   git fetch --prune
   git branch --merged main | grep -v '^\* \|main' | xargs -r git branch -d
   ```

## 작업 중단/재개 규칙

- 작업 장소를 옮기거나(다른 컴퓨터) 작업을 중단해야 할 때는, 미완성이어도 wip 커밋으로 push해둘 것
  ```bash
  git add .
  git commit -m "wip: 작업중 - 어디까지 했는지 간단히"
  git push origin feature/역할-기능명
  ```
  예: `wip: 로그인 API - 유효성 검사 로직 작성 중`
- 작업을 다시 시작할 때는 항상 아래 순서로 원격 최신 상태부터 확인할 것:
  1. `git fetch`로 원격 상태 확인
  2. 현재 브랜치가 원격보다 뒤처져 있으면 `git pull origin 브랜치명`으로 최신화
  3. pull 받은 내용 기준으로 "지난번엔 여기까지 했었네요"라고 요약해서 안내
- wip 커밋들은 나중에 main으로 PR 올릴 때 Squash and merge로 1개로 압축되므로, 여러 번 wip 커밋해도 최종 히스토리는 깔끔하게 유지됨

## 배포 / 릴리스

- `main`에 머지되면 자동 배포된다: 웹은 Cloudflare Pages, API·D1(마이그레이션+시드)은 GitHub Actions `Deploy` (README "배포" 참고)
  - 그래서 마이그레이션·시드가 들어간 PR 은 머지 = 운영 반영이다. 리뷰를 꼼꼼히 할 것
- 배포 시점은 `main`에 **git 태그**로 표시 (별도 브랜치 만들지 않음)
  ```bash
  git checkout main && git pull origin main
  git tag -a v1.0.0 -m "첫 배포"
  git push origin v1.0.0
  ```
- 태그는 `v메이저.마이너.패치` 형식 (예: `v1.0.0`, `v1.1.0`, `v1.1.1`)

## 규칙

- ⚠️ `main`에 직접 push 금지 — 반드시 PR을 통해서만 병합
- ✅ `main`은 항상 배포 가능한 상태로 유지 (깨진 코드 머지 금지)
- ✅ 작업 시작 전 `main`을 최신 상태로 pull 받고 시작하기
- ✅ PR 올리기 전 최소 1명 이상 코드 리뷰 승인받기
- ✅ 웹 공통 구성은 본인 역할(프론트/백엔드)에 맞는 접두사, 게임 카드는 `feature/game-*` 사용
- ✅ 게임 카드 PR 에는 내 게임 파일 추가 + 등록 줄만 포함 (공통 코드 수정은 별도 PR)

## PR 생성 규칙

- "오늘 ~작업했어" 또는 "커밋하고 PR까지 만들어줘"라고 말하면 아래 순서로 진행할 것:
  1. `git fetch origin`으로 `origin/main`이 최신인지 확인. 로컬 `main`이 뒤처져 있으면 먼저 `git pull origin main`으로 최신화 (단, 현재 작업 중인 feature 브랜치에 미커밋 변경이 있으면 pull 전에 그대로 두고 feature 브랜치 기준으로만 진행 — main 갱신 때문에 작업 내용을 stash/덮어쓰기 하지 말 것)
  2. 현재 브랜치가 `feature/*`인지 확인 (`main`이면 먼저 최신 main에서 feature 브랜치 생성)
  3. `git add`, `git commit` (커밋 컨벤션 태그 사용)
  4. `git push origin 현재브랜치명`
  5. GitHub CLI로 PR 생성:
     ```bash
     gh pr create --base main --head feature/역할-기능명 \
       --title "feat: 기능 설명" \
       --body "작업 내용 요약"
     ```
  6. PR 링크를 사용자에게 안내
- **PR 승인(approve)과 머지(merge)는 절대 자동으로 하지 말 것** — 반드시 팀원 리뷰 후 사람이 직접 GitHub에서 진행
- `gh` 명령 실행 전 `gh auth status`로 로그인 상태 확인, 안 되어 있으면 `gh auth login` 안내할 것

## CLI 응답 규칙

- "이번 역할이 뭐야" 질문을 받으면 위 표에서 현재 git config user.name/email에 매칭되는 사람의 역할(웹 공통 구성)과 담당 게임 카드 번호·게임을 함께 답할 것
- "오늘 뭐 했어" 질문을 받으면 `git log --since="today"`로 오늘 커밋 내역을 조회해 요약하고, 아직 커밋하지 않은 변경사항(`git status`, `git diff`)도 함께 안내할 것
- 브랜치를 새로 만들 때는 작업 종류를 먼저 판단할 것:
  - 게임 카드 작업(게임 추가/수정) → `feature/game-<게임id>` (역할 무관)
  - 그 외 웹 공통 구성 → 역할에 맞는 `feature/fe-*` 또는 `feature/be-*`
- 게임 카드 작업 중 "게임 카드 작업 규칙"에서 허용하지 않은 파일(공통 코드, 다른 사람 게임)을 수정해야 하면 바로 수정하지 말고 사용자에게 먼저 알릴 것
- 새 브랜치는 항상 최신 `main`에서 분기할 것
