import {
  FILLER_RESULT,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_RESULT_LENGTH,
  MAX_WEIGHT,
} from './config';

/** 줄바꿈·쉼표로 나눈 항목 (앞뒤 공백·빈 줄은 무시 — 채팅에서 복사한 명단을 그대로 붙여 넣어도 된다) */
function splitLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 참가자 명단 — 사다리처럼 한 사람당 공 하나 (MAX_PLAYERS 를 넘으면 자른다) */
export function parsePlayers(text: string): { names: string[]; total: number } {
  const all = splitLines(text).map((line) => line.slice(0, MAX_NAME_LENGTH));
  return { names: all.slice(0, MAX_PLAYERS), total: all.length };
}

/**
 * 결과 목록 — `꽝*3` 은 결과 칸 3개.
 * 이름에 x·숫자가 흔하므로 개수 표시는 * 와 × 만 인정한다 (예: 2등 은 결과 이름 그대로).
 */
export function parseResults(text: string): string[] {
  const results: string[] = [];
  for (const line of splitLines(text)) {
    const match = /^(.*?)\s*[*×]\s*(\d+)$/.exec(line);
    const name = (match?.[1] ?? line).trim().slice(0, MAX_RESULT_LENGTH);
    if (!name) continue;
    const count = match ? Math.min(Math.max(Number(match[2]), 1), MAX_WEIGHT) : 1;
    for (let i = 0; i < count; i++) results.push(name);
  }
  return results;
}

/** 결과가 참가자보다 적으면 남는 칸을 '꽝'으로 채운다 (많으면 그대로 — 화면에서 막는다) */
export function fillResults(results: string[], players: number): string[] {
  const filled = [...results];
  while (filled.length < players) filled.push(FILLER_RESULT);
  return filled;
}
