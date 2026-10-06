import { MAX_ITEMS, MAX_LABEL_LENGTH, MAX_WEIGHT, SLICE_COLORS } from './config';

export interface Item {
  label: string;
  /** 칸 크기이자 당첨 확률 비율 — `벌칙*3` 이면 3 */
  weight: number;
  color: string;
}

/** 돌림판에 그릴 칸 (각도는 라디안, 0 = 오른쪽, 시계 방향으로 커진다) */
export interface Slice extends Item {
  /** 원래 목록에서의 번호 */
  index: number;
  a0: number;
  a1: number;
}

/**
 * 항목 목록 해석 — 한 줄에 하나, `벌칙*3` 은 칸 크기(확률) 3배.
 * 항목 이름에 쉼표가 흔해서(예: 치킨, 피자 쏘기) 쉼표로는 나누지 않는다.
 * 색은 원래 순서로 정해서, 뽑힌 항목을 빼도 나머지 칸 색이 바뀌지 않는다.
 */
export function parseItems(text: string): { items: Item[]; total: number } {
  const items: Item[] = [];
  let total = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(.*?)\s*[*×]\s*(\d+)$/.exec(line);
    const label = (match?.[1] ?? line).trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) continue;
    total++;
    if (items.length >= MAX_ITEMS) continue;
    const weight = match ? Math.min(Math.max(Number(match[2]), 1), MAX_WEIGHT) : 1;
    items.push({ label, weight, color: SLICE_COLORS[items.length % SLICE_COLORS.length]! });
  }
  // 마지막 칸이 첫 칸과 같은 색으로 맞닿지 않게
  const last = items[items.length - 1];
  if (items.length > 1 && last && last.color === items[0]?.color) {
    last.color = SLICE_COLORS[(items.length + 1) % SLICE_COLORS.length]!;
  }
  return { items, total };
}

/** 이미 뽑혀 빠진 만큼 가중치를 줄인다 (같은 이름이 여러 번 뽑혔으면 그만큼) */
export function applyRemoved(items: Item[], removed: readonly string[]): Item[] {
  const left = new Map<string, number>();
  for (const label of removed) left.set(label, (left.get(label) ?? 0) + 1);
  const result: Item[] = [];
  for (const item of items) {
    const take = Math.min(item.weight, left.get(item.label) ?? 0);
    if (take > 0) left.set(item.label, (left.get(item.label) ?? 0) - take);
    if (item.weight - take > 0) result.push({ ...item, weight: item.weight - take });
  }
  return result;
}

/** 가중치 비율대로 칸 각도를 나눈다 (첫 칸은 맨 위에서 시작) */
export function layoutSlices(items: Item[]): Slice[] {
  const sum = items.reduce((s, item) => s + item.weight, 0);
  let angle = -Math.PI / 2;
  return items.map((item, index) => {
    const a0 = angle;
    angle += (item.weight / sum) * Math.PI * 2;
    return { ...item, index, a0, a1: angle };
  });
}

/** 0 이상 1 미만의 예측할 수 없는 난수 (브라우저 암호학적 난수) */
export function secureRandom(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 4294967296;
}

/** 가중치 비율대로 하나 뽑는다 */
export function pickWeighted(slices: Slice[]): Slice {
  const sum = slices.reduce((s, slice) => s + slice.weight, 0);
  let r = secureRandom() * sum;
  for (const slice of slices) {
    r -= slice.weight;
    if (r < 0) return slice;
  }
  return slices[slices.length - 1]!;
}
