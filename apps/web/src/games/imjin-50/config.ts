import type { BuildKind } from './engine/config';

/** 임진 50 규칙 상수 */
export const GAME_ID = 'imjin-50';

/** 시설별 강조색 (덴초 안료 팔레트) */
export const BUILD_COLOR: Record<BuildKind, string> = {
  wall: '#b3906a',
  arrow: '#efe4cc',
  cannon: '#d9a441',
  caltrop: '#9aa2a6',
  hwacha: '#7a9ccf',
};
