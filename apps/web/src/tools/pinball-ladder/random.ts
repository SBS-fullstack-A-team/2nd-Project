/** 0 이상 1 미만의 난수를 내는 함수 */
export type Rng = () => number;

/**
 * 시드 난수 (mulberry32) — 같은 시드면 같은 순서의 난수가 나온다.
 * 시드는 매 판 crypto 로 새로 뽑으므로 결과를 미리 정할 수 없다 (newSeed 참고).
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 예측할 수 없는 새 시드 (브라우저 암호학적 난수) */
export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** 새 배열로 섞는다 (Fisher–Yates) */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
