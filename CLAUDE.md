# 프로젝트 규칙 (프로젝트명 미정)

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

| 이름 | GitHub 아이디 | 역할 | 담당 브랜치 접두사 |
|---|---|---|---|
| Heo (팀장) | heo-hyuk | 프론트엔드 | feature/fe-* |
| 신영 | syyu21b | 백엔드 | feature/be-* |
| 경수 | HurKyungsoo | 프론트엔드 | feature/fe-* |
| 동한 | Kim-dong-han | 백엔드 | feature/be-* |

## 커밋 규칙

- 커밋 전, 현재 로컬 git config의 user.name / user.email이 위 표의 본인 GitHub 계정과 일치하는지 확인할 것
- 다르면 아래처럼 **로컬(이 프로젝트 한정)**로 설정할 것:
  ```bash
  git config user.name "본인이름"
  git config user.email "본인 GitHub 계정 이메일"
  ```
- 커밋 메시지는 아래 컨벤션을 따를 것 (단, wip 커밋은 "작업 중단/재개 규칙" 참고)

| 태그 | 의미 |
|---|---|
| `feat:` | 새로운 기능 추가 |
| `fix:` | 버그 수정 |
| `refactor:` | 코드 리팩토링 |
| `style:` | 코드 포맷팅, 세미콜론 등 |
| `docs:` | 문서 수정 |
| `chore:` | 빌드/설정 파일 수정 |
| `wip:` | 미완성 작업 중간 저장 (아래 규칙 참고) |

예시: `feat: 로그인 API 연동`, `fix: 회원가입 유효성 검사 오류 수정`

## 저장소 구조 (모노레포)

> ⚠️ 기술 스택 / 배포 환경 미정 — 확정되면 이 섹션 업데이트할 것

```
backend/    # API 서버. 백엔드 담당(신영, 동한). 기술 스택/배포 미정
frontend/   # 웹 앱. 프론트 담당(Heo, 경수). 기술 스택/배포 미정
docs/       # API / ERD 문서 (공용)
.github/    # CODEOWNERS, 워크플로우 (공용, 팀장 관리)
CLAUDE.md   # 이 파일 (공용)
```

- 백엔드 작업은 `backend/` 안에서만, 프론트 작업은 `frontend/` 안에서만 한다.
- IDE 설정 / 빌드·실행 방법은 기술 스택 확정 후 추가한다.

## 브랜치 전략 (GitHub Flow)

```
main        # 통합 + 배포 브랜치. 항상 배포 가능한 상태 유지, 직접 push 금지
feature/*   # 개별 기능 작업 브랜치. main에서 분기 → main으로 PR
```

- 프론트 담당자(Heo, 경수): `feature/fe-기능명`
- 백엔드 담당자(신영, 동한): `feature/be-기능명`
- 각자 본인 role에 맞는 브랜치명만 생성할 것
- `develop` 브랜치는 사용하지 않음

예시: `feature/fe-login`, `feature/be-login-api`, `feature/fe-mypage`, `feature/be-board-crud`

## 작업 흐름

1. 작업 시작 전 main 최신화
   ```bash
   git checkout main
   git pull origin main
   ```
2. 본인 role에 맞는 브랜치 생성
   ```bash
   git checkout -b feature/역할-기능명
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
- ✅ 본인 역할(프론트/백엔드)에 맞는 브랜치 접두사만 사용

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

- "이번 역할이 뭐야" 질문을 받으면 위 표에서 현재 git config user.name/email에 매칭되는 사람의 역할을 찾아 답할 것
- "오늘 뭐 했어" 질문을 받으면 `git log --since="today"`로 오늘 커밋 내역을 조회해 요약하고, 아직 커밋하지 않은 변경사항(`git status`, `git diff`)도 함께 안내할 것
- 브랜치를 새로 만들 때는 항상 위 표의 역할에 맞는 접두사(feature/fe-* 또는 feature/be-*)를 사용할 것
- 새 브랜치는 항상 최신 `main`에서 분기할 것
