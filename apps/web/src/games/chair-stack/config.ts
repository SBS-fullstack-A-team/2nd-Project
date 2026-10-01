/**
 * 의자 탑 쌓기 규칙 상수.
 * 월드 좌표 1 = 1cm. y 는 아래쪽이 + (캔버스와 같음), 받침대 윗면이 y = 0 이다.
 */

/** 화면에 보이는 월드 크기 (세로형 2:3) */
export const VIEW_WIDTH = 400;
export const VIEW_HEIGHT = 600;

/** 받침대 — 이 위에 의자를 쌓는다 */
export const PLATFORM = { width: 200, height: 26 } as const;

/** 의자를 들고 있을 때 좌우로 움직일 수 있는 범위 (x) */
export const HOLD_MIN_X = 30;
export const HOLD_MAX_X = VIEW_WIDTH - 30;
/** 키보드로 좌우 이동하는 속도 (cm/초) */
export const HOLD_MOVE_SPEED = 260;
/** 한 번 돌릴 때 각도 (15°) */
export const ROTATE_STEP = Math.PI / 12;

/** 들고 있는 의자는 탑 꼭대기보다 이만큼 위에 둔다 */
export const HOLD_GAP_ABOVE_TOWER = 150;
/** 카메라 — 탑 꼭대기가 화면 위에서 이 정도 아래에 오도록 따라간다 */
export const CAMERA_TOP_MARGIN = 300;

/** 떨어뜨린 의자가 멈췄다고 볼 기준 */
export const SETTLE_SPEED = 0.15;
export const SETTLE_ANGULAR_SPEED = 0.01;
/** 위 기준을 이 시간(초) 동안 만족하면 멈춘 것으로 본다 */
export const SETTLE_TIME = 0.6;
/** 너무 오래 흔들려도 이 시간(초)이 지나면 다음 의자를 준다 */
export const SETTLE_TIMEOUT = 5;

/** 의자 중심이 받침대 윗면보다 이만큼 아래로 떨어지면 게임 오버 */
export const FALL_OUT_Y = 160;
/** 의자가 떨어지고 나서 결과로 넘어가기 전 잠깐 보여 주는 시간(초) */
export const GAME_OVER_DELAY = 1.2;

/** 게임 내부 점수 상한 (cm) — packages/shared 의 MAX_SCORE_BY_GAME 과 같게 */
export const MAX_SCORE = 50_000;

/** 물리 성질 — 잘 미끄러지지 않고 튀지 않게 */
export const CHAIR_PHYSICS = {
  density: 0.0015,
  friction: 0.9,
  frictionStatic: 1.2,
  restitution: 0,
  /** 공기 저항 — 흔들림이 조금씩 잦아들게 */
  frictionAir: 0.02,
} as const;
/**
 * 회전 관성 배율 — 가는 다리로 설 때 생기는 덜덜 떨림이 점점 커져 넘어지는 것을 막는다.
 * 클수록 잘 안 넘어진다 (너무 크면 기울어진 채로 버티는 어색한 모습이 된다).
 */
export const CHAIR_INERTIA_SCALE = 4;

/**
 * 난이도 — 쉬움은 모두 같은 기본 의자, 어려움은 7가지 의자가 무작위로 나온다.
 * 랭킹은 하나라서 어려움에 점수 배율을 준다. (점수 = 최고 높이(cm) × 배율)
 */
export type Difficulty = 'easy' | 'hard';

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  description: string;
  /** 나올 수 있는 의자 id (chairs.ts 의 CHAIRS) — 비우면 전부 */
  chairIds: readonly string[];
  multiplier: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easy',
    label: '쉬움',
    description: '모두 같은 기본 의자 · 점수 = 높이',
    chairIds: ['basic'],
    multiplier: 1,
  },
  {
    id: 'hard',
    label: '어려움',
    description: '7가지 의자가 무작위로 · 점수 ×1.5',
    chairIds: [],
    multiplier: 1.5,
  },
];

export const HOW_TO_PLAY = [
  '위에서 의자를 골라 놓을 자리를 정하고 떨어뜨려요.',
  '의자가 받침대 아래로 하나라도 떨어지면 게임 끝!',
  '점수는 쌓은 탑의 최고 높이(cm)예요. 어려움은 ×1.5!',
] as const;

export const CONTROLS = [
  { keys: '← → / 마우스', action: '좌우 이동' },
  { keys: '↑ · X / Z · 휠', action: '돌리기' },
  { keys: '스페이스 · ↓ / 클릭', action: '떨어뜨리기' },
  { keys: 'Esc · P', action: '일시정지' },
] as const;
