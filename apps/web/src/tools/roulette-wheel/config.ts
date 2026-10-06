/** 돌림판 룰렛 설정 */

/** 항목 수 — 너무 많으면 칸이 실처럼 얇아져 글자를 못 읽는다 */
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 100;
export const MAX_LABEL_LENGTH = 24;
/** `항목*N` 에 줄 수 있는 최대 가중치 */
export const MAX_WEIGHT = 100;

/** 돌리는 시간 — 길수록 많이 돌고 끝에서 오래 버틴다 */
export const DURATIONS = {
  short: { label: '짧게', sec: 4, turns: 5 },
  normal: { label: '보통', sec: 7, turns: 8 },
  long: { label: '길게', sec: 11, turns: 12 },
} as const;
export type DurationKey = keyof typeof DURATIONS;

/**
 * 아슬아슬 연출 — 이 확률로 '다음 칸으로 넘어갈 듯 말 듯' 칸 끝자락에 멈춘다.
 * 당첨 항목은 미리 공정하게 뽑고, 그 칸 안에서 멈출 자리만 고르는 것이라 확률에는 영향이 없다.
 */
export const NEAR_MISS_CHANCE = 0.3;

/** 기록은 최근 이만큼만 보여 준다 */
export const MAX_HISTORY = 30;

/** 칸 색 — 이웃한 칸이 잘 구분되도록 채도 높은 색을 번갈아 쓴다 */
export const SLICE_COLORS = [
  '#ff5c8a',
  '#ffd23f',
  '#4fd1c5',
  '#7f93ff',
  '#ff9f43',
  '#a0e75a',
  '#c77dff',
  '#3ec1f3',
  '#ff6b6b',
  '#2ed8a3',
];
