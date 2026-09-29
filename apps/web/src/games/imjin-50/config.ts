import type { BuildKind } from './engine/config';

/** 임진 50 규칙 상수 */
export const GAME_ID = 'imjin-50';

/** 배속 단계 — 배속 버튼을 누를 때마다 다음 단계로 넘어가고 끝에서 1배로 돌아온다 */
export const SPEED_STEPS = [1, 2, 3, 4] as const;

/** 시뮬레이션 한 번에 흘려보낼 최대 시간(초). 고배속에서 한 프레임 시간을 이 크기로 잘게
 *  나눠 돌려서, 적이 한 틱에 너무 멀리 움직여 사거리·가시벽을 건너뛰지 않게 한다. */
export const MAX_SIM_STEP = 1 / 30;

/** 시설별 강조색 (덴초 안료 팔레트) */
export const BUILD_COLOR: Record<BuildKind, string> = {
  wall: '#b3906a',
  arrow: '#efe4cc',
  cannon: '#d9a441',
  caltrop: '#9aa2a6',
  hwacha: '#7a9ccf',
};
