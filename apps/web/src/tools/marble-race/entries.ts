import { MAX_MARBLES, MAX_NAME_LENGTH, MAX_WEIGHT } from './config';

export interface Entry {
  name: string;
  /** 구슬 개수 — 이름*3 이면 3 */
  weight: number;
}

export interface ParsedEntries {
  entries: Entry[];
  /** 구슬 총 개수 (가중치 합, MAX_MARBLES 로 자르기 전) */
  total: number;
}

/**
 * 참가자 명단 해석 — 줄바꿈·쉼표로 구분, `이름*3` 은 구슬 3개 (후원 횟수 등 가중치).
 * 채팅에서 복사한 명단을 그대로 붙여 넣어도 되도록 앞뒤 공백·빈 줄은 무시한다.
 */
export function parseEntries(text: string): ParsedEntries {
  const entries: Entry[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const line = raw.trim();
    if (!line) continue;
    // 닉네임에 x·숫자가 흔하므로 가중치 표시는 * 와 × 만 인정한다 (예: box2 는 이름 그대로)
    const match = /^(.*?)\s*[*×]\s*(\d+)$/.exec(line);
    const name = (match?.[1] ?? line).trim().slice(0, MAX_NAME_LENGTH);
    if (!name) continue;
    const weight = match ? Math.min(Math.max(Number(match[2]), 1), MAX_WEIGHT) : 1;
    entries.push({ name, weight });
  }
  return { entries, total: entries.reduce((sum, e) => sum + e.weight, 0) };
}

/** 가중치만큼 이름을 펼친다 (예: 철수*2 → 철수, 철수). MAX_MARBLES 를 넘으면 자른다 */
export function expandEntries(entries: Entry[]): string[] {
  const names: string[] = [];
  for (const { name, weight } of entries) {
    for (let i = 0; i < weight && names.length < MAX_MARBLES; i++) names.push(name);
  }
  return names;
}
