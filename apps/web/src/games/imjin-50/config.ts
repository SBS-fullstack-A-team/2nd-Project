import type { BuildKind } from './engine/config';

/** 임진 50 규칙 상수 */
export const GAME_ID = 'imjin-50';

/** 시설별 강조색 (덴초 안료 팔레트) */
export const BUILD_COLOR: Record<BuildKind, string> = {
  wall: '#94a793',
  arrow: '#ece3cf',
  cannon: '#d9a441',
  caltrop: '#5b7364',
  hwacha: '#7a9ccf',
};
