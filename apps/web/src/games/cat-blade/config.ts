/**
 * 캣 블레이드 — 게임 규칙·밸런스 상수 모음.
 * 숫자를 조정할 때는 이 파일만 고치면 된다.
 */

export const GAME_ID = 'cat-blade';

/** 논리 해상도 (가로형 16:9). 캔버스는 이 크기로 그리고 CSS 로 늘린다 */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** 바닥 높이 · 좌우 벽 */
export const GROUND_Y = 470;
export const ARENA_L = 24;
export const ARENA_R = 936;

/** 고정 시뮬레이션 간격 (60FPS) */
export const STEP = 1 / 60;

/** 서버 상한(packages/shared MAX_SCORE_BY_GAME)과 같게 유지 */
export const MAX_SCORE = 500_000;

/** 아래에서 뛰어올라 설 수 있는 발판 (아래 + 점프로 내려온다) */
export const PLATFORMS: readonly { x1: number; x2: number; y: number }[] = [
  { x1: 140, x2: 320, y: GROUND_Y - 128 },
  { x1: 640, x2: 820, y: GROUND_Y - 128 },
];

/* ---------------- 플레이어 ---------------- */

export const GRAVITY = 2150;
export const MAX_FALL = 1000;
export const PLAYER_MAX_HP = 100;
export const PLAYER_W = 30;
export const PLAYER_H = 46;

/** 구르기 — 전체 시간 / 무적 시간 / 속도 / 재사용 대기 */
export const ROLL_SEC = 0.34;
export const ROLL_IFRAME = 0.3;
export const ROLL_SPEED = 560;
export const ROLL_COOLDOWN = 0.45;

/** 패링 — 자세 유지 시간 / 재사용 대기 / 성공 시 멈춤(히트스톱) */
export const PARRY_POSE = 0.36;
export const PARRY_COOLDOWN = 0.5;
export const PARRY_HITSTOP = 0.15;
/** 패링 성공 직후 무적 (연속 공격을 이어서 받아칠 수 있게 짧게) */
export const PARRY_IFRAME = 0.35;

/** 피격 후 무적 시간 */
export const HURT_IFRAME = 0.9;
/** 변신 재사용 대기 */
export const FORM_COOLDOWN = 1.1;
/** 이 시간 안에 다음 타격을 넣어야 콤보가 이어진다 */
export const COMBO_WINDOW = 2.4;
/** 입력 버퍼 — 조금 일찍 눌러도 다음 동작으로 이어 준다 */
export const INPUT_BUFFER = 0.14;
/** 스테이지 클리어 시 회복량 */
export const STAGE_CLEAR_HEAL = 40;
/** 생선 아이템 회복량 · 적이 떨어뜨릴 확률 */
export const FISH_HEAL = 14;
export const FISH_DROP_RATE = 0.22;

/* ---------------- 고양이 폼 ---------------- */

export type FormId = 'ninja' | 'knight' | 'fire' | 'cheese' | 'cyber';

export interface FormDef {
  id: FormId;
  name: string;
  type: string;
  /** 대표 색 (아이콘·이펙트) */
  color: string;
  /** 보조 색 (검기·잔상) */
  glow: string;
  /** 이동 속도 (px/s) */
  speed: number;
  /** 점프 초속 */
  jump: number;
  attack: string;
  skill: string;
  /** 스킬 재사용 대기 (초) */
  skillCooldown: number;
  /** 패링 판정 시간 (초) — 나이트는 넉넉하다 */
  parryWindow: number;
  /** 패링 성공 시 반격 데미지 */
  parryCounter: number;
  /** 받는 피해 배율 */
  damageTaken: number;
  /** 메뉴 설명 */
  desc: string;
}

export const FORMS: readonly FormDef[] = [
  {
    id: 'ninja',
    name: '닌자 캣',
    type: '속도형',
    color: '#5b6cff',
    glow: '#9ad8ff',
    speed: 330,
    jump: 760,
    attack: '빠른 3연속 베기',
    skill: '그림자 분신참',
    skillCooldown: 4.5,
    parryWindow: 0.17,
    parryCounter: 22,
    damageTaken: 1,
    desc: '가장 빠른 고양이. 3연속 베기와 분신 참격으로 몰아친다',
  },
  {
    id: 'knight',
    name: '나이트 캣',
    type: '방어·패링형',
    color: '#c8d6ea',
    glow: '#ffe9a8',
    speed: 255,
    jump: 700,
    attack: '대검 내려치기',
    skill: '성검 낙하',
    skillCooldown: 5,
    parryWindow: 0.27,
    parryCounter: 36,
    damageTaken: 0.8,
    desc: '패링 판정이 넉넉하고, 성공하면 주변을 쓸어버리는 충격파가 터진다',
  },
  {
    id: 'fire',
    name: '파이어 캣',
    type: '범위 화염형',
    color: '#ff6a2a',
    glow: '#ffc04a',
    speed: 295,
    jump: 730,
    attack: '화염 검기 사격',
    skill: '화염 연쇄 폭발',
    skillCooldown: 5,
    parryWindow: 0.17,
    parryCounter: 24,
    damageTaken: 1,
    desc: '불꽃 검기를 날리고, 앞쪽 땅을 연쇄 폭발로 태운다',
  },
  {
    id: 'cheese',
    name: '치즈 냥이',
    type: '파워·지면 파쇄형',
    color: '#ffb432',
    glow: '#ffe066',
    speed: 225,
    jump: 680,
    attack: '치즈 망치',
    skill: '대지 파쇄 가시',
    skillCooldown: 6,
    parryWindow: 0.17,
    parryCounter: 30,
    damageTaken: 0.9,
    desc: '느리지만 한 방이 무겁다. 휘두르는 동안은 맞아도 밀리지 않는다',
  },
  {
    id: 'cyber',
    name: '사이버 캣',
    type: '레이저·원거리형',
    color: '#28f0ff',
    glow: '#ff4adf',
    speed: 310,
    jump: 740,
    attack: '네온 레이저 클로',
    skill: '광속 관통 찌르기',
    skillCooldown: 5,
    parryWindow: 0.17,
    parryCounter: 22,
    damageTaken: 1,
    desc: '멀리서 레이저 클로를 연사하고, 화면 끝까지 꿰뚫는 광선 돌진을 쓴다',
  },
];

export function getForm(id: FormId): FormDef {
  return FORMS.find((f) => f.id === id) ?? (FORMS[0] as FormDef);
}

/* ---------------- 적 · 스테이지 ---------------- */

export type EnemyKind = 'pup' | 'crow' | 'ratbot' | 'drone' | 'shade' | 'wisp';

export interface StageDef {
  id: number;
  name: string;
  /** 잡몹 웨이브 — 한 웨이브를 모두 처치하면 다음 웨이브 */
  waves: EnemyKind[][];
  bossName: string;
  bossEnglish: string;
}

export const STAGES: readonly StageDef[] = [
  {
    id: 1,
    name: '버려진 개집 마당',
    waves: [
      ['pup', 'pup', 'crow'],
      ['pup', 'crow', 'pup', 'crow'],
    ],
    bossName: '버려진 개집의 거대 들개',
    bossEnglish: 'GOLIATH HOUND',
  },
  {
    id: 2,
    name: '지하 비밀 연구소',
    waves: [
      ['ratbot', 'drone', 'ratbot'],
      ['ratbot', 'drone', 'drone', 'ratbot'],
    ],
    bossName: '강철 레이저 로봇 쥐',
    bossEnglish: 'MECHA RAT PRIME',
  },
  {
    id: 3,
    name: '그림자 왕궁',
    waves: [
      ['shade', 'wisp', 'shade'],
      ['shade', 'shade', 'wisp', 'wisp'],
    ],
    bossName: '타락한 고양이 왕',
    bossEnglish: 'SHADOW CAT KING',
  },
];

/* ---------------- 점수 ---------------- */

export const SCORE = {
  /** 타격 1회 (콤보 10단마다 +50%) */
  hit: 10,
  kill: 150,
  bossKill: 8000,
  bossPhase: 2000,
  parry: 400,
  /** 최대 콤보 1당 */
  maxCombo: 60,
  stageClear: 5000,
  /** 클리어 시간 보너스 = max(0, 기준초 - 걸린 초) × 초당 점수 */
  timeBaseSec: 900,
  timePerSec: 40,
  /** 클리어 시 남은 체력 1당 */
  hpLeft: 150,
} as const;

/** 메뉴의 조작법 안내 */
export const CONTROLS: readonly { keys: string; action: string }[] = [
  { keys: '← → / A D', action: '이동' },
  { keys: '↑ / W / Space', action: '점프 (2단 점프, ↓+점프로 발판 내려가기)' },
  { keys: 'J / Z', action: '기본 공격' },
  { keys: 'K / X', action: '폼 스킬' },
  { keys: 'L / C / Shift', action: '무적 구르기' },
  { keys: 'I / V', action: '냥냥펀치 패링' },
  { keys: 'Q · E / Tab · 1~5', action: '폼 체인지' },
  { keys: 'Esc / P', action: '일시정지' },
];

export const TIPS: readonly string[] = [
  '노란빛으로 번쩍이는 공격은 패링할 수 있어요. 성공하면 시간이 멈추고 적이 기절해요',
  '붉은 예고선·바닥 표식은 패링이 안 돼요. 구르기 무적이나 점프로 피하세요',
  '보스의 패링 게이지가 가득 차면 BREAK! 한동안 더 큰 피해를 받아요',
  '스킬 재사용 대기는 폼마다 따로 돌아요. 폼을 바꿔 가며 스킬을 이어 쓰세요',
];
