/**
 * 스카이 에이스 — 게임 규칙·밸런스 상수 모음.
 * 숫자를 조정할 때는 이 파일만 고치면 된다.
 */

export const GAME_ID = 'sky-ace';

/** 논리 해상도 (세로형). 캔버스는 이 크기로 그리고 CSS 로 늘린다 */
export const VIEW_W = 480;
export const VIEW_H = 720;

/** 고정 시뮬레이션 간격 (60FPS) */
export const STEP = 1 / 60;

/** 서버 상한(packages/shared MAX_SCORE_BY_GAME)과 같게 유지 */
export const MAX_SCORE = 1_500_000;

/* ---------------- 플레이어 ---------------- */

export const START_LIVES = 3;
export const START_BOMBS = 3;
export const MAX_BOMBS = 6;
/** 기체별 시작 목숨·필살기가 많아도 이 개수까지는 쥘 수 있다 */
export const MAX_BOMBS_SECRET = 8;
export const MAX_POWER = 3;
/** 피격 판정 반지름 — 탄막 슈팅답게 기체 그림보다 훨씬 작다 */
export const PLAYER_HIT_RADIUS = 4;
/** 아이템·적 기체 충돌용 반지름 */
export const PLAYER_BODY_RADIUS = 14;
export const PLAYER_SPEED = 270;
/** Shift 를 누르고 있을 때 (정밀 이동) */
export const PLAYER_FOCUS_SPEED = 130;
/** 피격 후 무적 시간 (초) */
export const INVINCIBLE_SEC = 2.5;
/** 폭탄 지속 시간 (초) — 이 동안 무적 */
export const BOMB_SEC = 2.6;

export type AircraftId = 'p38' | 'shinden' | 'spitfire' | 'phoenix';

export interface AircraftDef {
  id: AircraftId;
  name: string;
  type: string;
  main: string;
  sub: string;
  bomb: string;
  /** 기체 대표 색 */
  color: string;
  accent: string;
  /** 이동 속도 배율 */
  speed: number;
  /** 시작 목숨 */
  lives: number;
  /** 시작 필살기 개수 (격추 후 재등장할 때도 이만큼은 채워 준다) */
  bombs: number;
  /** 필살기 데미지 배율 */
  bombPower: number;
  /** 홈 화면 이스터에그로만 고를 수 있는 숨은 기체 */
  secret?: boolean;
}

export const AIRCRAFTS: readonly AircraftDef[] = [
  {
    id: 'p38',
    name: 'P-38 라이트닝',
    type: '밸런스형',
    main: '2연장 플라즈마 주포',
    sub: '좌우 지원 드론 사격',
    bomb: '대형 폭격기 편대 융단 폭격',
    color: '#9fb6c9',
    accent: '#58c8ff',
    speed: 1,
    lives: START_LIVES,
    bombs: START_BOMBS,
    bombPower: 1,
  },
  {
    id: 'shinden',
    name: '신덴',
    type: '화력 집중형',
    main: '3방향 관통 기관포',
    sub: '전방 연속 빔 레이저',
    bomb: '적탄을 빨아들이는 에너지 회오리',
    color: '#c9a86a',
    accent: '#ff9d3c',
    speed: 0.92,
    lives: START_LIVES,
    bombs: START_BOMBS,
    bombPower: 1,
  },
  {
    id: 'spitfire',
    name: '스핏파이어',
    type: '유도·속도형',
    main: '고속 연사 탄환',
    sub: '교차 유도 미사일',
    bomb: '시간 정지 + 환영 칼날 참격',
    color: '#8fb08a',
    accent: '#7dffb0',
    speed: 1.12,
    lives: START_LIVES,
    bombs: START_BOMBS,
    bombPower: 1,
  },
  /**
   * 숨은 기체 — 홈 화면의 SKY ACE 제목을 누르면 나타난다.
   * 목숨·필살기 개수·필살기 화력·속도 모두 일반 기체보다 높다.
   */
  {
    id: 'phoenix',
    name: 'XF-0 피닉스',
    type: '시크릿 기체',
    main: '7방향 프리즘 플레어',
    sub: '불새 유도 미사일 연사',
    bomb: '불사조 강림 — 화면을 휩쓰는 화염 날개',
    color: '#f2f2f8',
    accent: '#ffb02e',
    speed: 1.3,
    lives: 5,
    bombs: 5,
    bombPower: 2,
    secret: true,
  },
];

export function getAircraft(id: AircraftId): AircraftDef {
  return AIRCRAFTS.find((a) => a.id === id) ?? AIRCRAFTS[0]!;
}

/* ---------------- 적 ---------------- */

export type EnemyKind = 'fighter' | 'swooper' | 'gunship' | 'heavy';

export interface EnemyStats {
  hp: number;
  radius: number;
  points: number;
  /** 파워업 [P] 드롭 확률 */
  dropP: number;
  /** 폭탄 [B] 드롭 확률 */
  dropB: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  fighter: { hp: 3, radius: 13, points: 100, dropP: 0.03, dropB: 0.005 },
  swooper: { hp: 4, radius: 13, points: 150, dropP: 0.04, dropB: 0.008 },
  gunship: { hp: 22, radius: 22, points: 600, dropP: 0.35, dropB: 0.08 },
  heavy: { hp: 80, radius: 38, points: 2500, dropP: 1, dropB: 0.35 },
};

/* ---------------- 점수 ---------------- */

/** 살아남은 1초당 점수 */
export const POINTS_PER_SEC = 10;
/** 파워 최대일 때 [P] 를 먹으면 */
export const POINTS_ITEM_MAXED = 1000;
/** 폭탄 최대일 때 [B] 를 먹으면 */
export const POINTS_BOMB_MAXED = 2000;
/** 보스 1단계 장갑 파괴 보너스 */
export const POINTS_BOSS_PHASE = 10_000;
/** 스테이지 클리어 보너스 = 기본 × 스테이지 번호 */
export const POINTS_STAGE_CLEAR = 20_000;
export const POINTS_PER_LIFE_LEFT = 10_000;
export const POINTS_PER_BOMB_LEFT = 5_000;
/** 마지막 보스까지 격파 */
export const POINTS_ALL_CLEAR = 100_000;

/* ---------------- 스테이지 ---------------- */

export type BossId = 'goliath' | 'kraken' | 'chronos';

/**
 * 적 편대 출현 스크립트 한 줄.
 * t: 스테이지 시작 후 초, x: 0~1 (화면 가로 비율)
 */
export type WaveDef =
  | { t: number; f: 'line'; n: number; x: number; gap?: number }
  | { t: number; f: 'v'; n: number; x: number }
  | { t: number; f: 'swoop'; n: number; side: 'L' | 'R' }
  | { t: number; f: 'gunship'; x: number }
  | { t: number; f: 'heavy'; x: number }
  | { t: number; f: 'rain'; n: number; dur: number };

export interface StageDef {
  stage: number;
  name: string;
  boss: BossId;
  bossName: string;
  bossHp: number;
  bossPoints: number;
  /** 적 탄 속도 배율 */
  bulletSpeed: number;
  /** 적 사격 빈도 배율 */
  fireRate: number;
  waves: WaveDef[];
}

export const STAGES: readonly StageDef[] = [
  {
    stage: 1,
    name: '구름 위의 전선',
    boss: 'goliath',
    bossName: '거대 비행선 골리앗',
    bossHp: 1900,
    bossPoints: 50_000,
    bulletSpeed: 1,
    fireRate: 1,
    waves: [
      { t: 1.5, f: 'line', n: 5, x: 0.5 },
      { t: 4, f: 'swoop', n: 5, side: 'L' },
      { t: 7, f: 'swoop', n: 5, side: 'R' },
      { t: 10, f: 'v', n: 5, x: 0.3 },
      { t: 12, f: 'v', n: 5, x: 0.7 },
      { t: 15, f: 'gunship', x: 0.5 },
      { t: 18, f: 'rain', n: 10, dur: 5 },
      { t: 21, f: 'swoop', n: 6, side: 'L' },
      { t: 23, f: 'swoop', n: 6, side: 'R' },
      { t: 26, f: 'gunship', x: 0.25 },
      { t: 27, f: 'gunship', x: 0.75 },
      { t: 31, f: 'line', n: 6, x: 0.5, gap: 60 },
      { t: 34, f: 'heavy', x: 0.5 },
      { t: 40, f: 'v', n: 7, x: 0.5 },
      { t: 43, f: 'swoop', n: 6, side: 'L' },
      { t: 43.5, f: 'swoop', n: 6, side: 'R' },
      { t: 47, f: 'rain', n: 12, dur: 5 },
      { t: 50, f: 'gunship', x: 0.35 },
      { t: 51, f: 'gunship', x: 0.65 },
    ],
  },
  {
    stage: 2,
    name: '폭풍의 바다',
    boss: 'kraken',
    bossName: '해상 요새 크라켄',
    bossHp: 2700,
    bossPoints: 80_000,
    bulletSpeed: 1.12,
    fireRate: 1.2,
    waves: [
      { t: 1.5, f: 'swoop', n: 6, side: 'L' },
      { t: 3, f: 'swoop', n: 6, side: 'R' },
      { t: 6, f: 'gunship', x: 0.3 },
      { t: 6.5, f: 'gunship', x: 0.7 },
      { t: 10, f: 'v', n: 7, x: 0.5 },
      { t: 13, f: 'rain', n: 14, dur: 5 },
      { t: 16, f: 'heavy', x: 0.3 },
      { t: 22, f: 'swoop', n: 7, side: 'R' },
      { t: 23, f: 'swoop', n: 7, side: 'L' },
      { t: 27, f: 'line', n: 7, x: 0.5, gap: 55 },
      { t: 29, f: 'gunship', x: 0.2 },
      { t: 29.5, f: 'gunship', x: 0.5 },
      { t: 30, f: 'gunship', x: 0.8 },
      { t: 35, f: 'heavy', x: 0.7 },
      { t: 40, f: 'rain', n: 16, dur: 6 },
      { t: 44, f: 'v', n: 7, x: 0.3 },
      { t: 45, f: 'v', n: 7, x: 0.7 },
      { t: 49, f: 'swoop', n: 8, side: 'L' },
      { t: 49.5, f: 'swoop', n: 8, side: 'R' },
      { t: 53, f: 'gunship', x: 0.5 },
    ],
  },
  {
    stage: 3,
    name: '시공의 균열',
    boss: 'chronos',
    bossName: '시공간 메카 크로노스',
    bossHp: 3600,
    bossPoints: 120_000,
    bulletSpeed: 1.22,
    fireRate: 1.4,
    waves: [
      { t: 1.5, f: 'v', n: 7, x: 0.5 },
      { t: 4, f: 'swoop', n: 8, side: 'L' },
      { t: 5, f: 'swoop', n: 8, side: 'R' },
      { t: 9, f: 'gunship', x: 0.25 },
      { t: 9.5, f: 'gunship', x: 0.75 },
      { t: 12, f: 'heavy', x: 0.5 },
      { t: 18, f: 'rain', n: 18, dur: 6 },
      { t: 22, f: 'line', n: 7, x: 0.5, gap: 55 },
      { t: 24, f: 'swoop', n: 8, side: 'R' },
      { t: 25, f: 'swoop', n: 8, side: 'L' },
      { t: 28, f: 'heavy', x: 0.25 },
      { t: 30, f: 'heavy', x: 0.75 },
      { t: 37, f: 'gunship', x: 0.2 },
      { t: 37.5, f: 'gunship', x: 0.5 },
      { t: 38, f: 'gunship', x: 0.8 },
      { t: 42, f: 'rain', n: 20, dur: 6 },
      { t: 46, f: 'v', n: 9, x: 0.5 },
      { t: 49, f: 'swoop', n: 8, side: 'L' },
      { t: 49.5, f: 'swoop', n: 8, side: 'R' },
      { t: 53, f: 'gunship', x: 0.35 },
      { t: 53.5, f: 'gunship', x: 0.65 },
    ],
  },
];

/** 마지막 편대 이후 보스 경고까지 대기 (초) */
export const BOSS_WARNING_DELAY = 5;
/** WARNING 연출 길이 (초) */
export const BOSS_WARNING_SEC = 2.8;

export const HOW_TO_PLAY: readonly string[] = [
  '이동: 방향키 / WASD · 모바일은 화면을 끌어서 이동',
  '사격: 자동 연사 · Shift 를 누르고 있으면 정밀 이동',
  '필살기: 스페이스바 · 모바일은 오른쪽 아래 BOMB 버튼',
  '일시정지: Esc 또는 P',
  '[P] 주포 강화 (최대 3단계) · [B] 필살기 +1',
  '반짝이는 작은 점이 진짜 피격 판정이에요',
];
