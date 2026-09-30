// 이 브라우저에만 남는 개인 기록과 설정. 서버 랭킹(닉네임 공개 기록)과는 별개다.
const BEST_KEY = 'rd-best';
const MUTE_KEY = 'rd-muted';

export interface Best {
  score: number;
  /** 가장 멀리 달린 거리(m) */
  distance: number;
}

function isBest(value: unknown): value is Best {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Best).score === 'number' &&
    typeof (value as Best).distance === 'number'
  );
}

export function loadBest(): Best | null {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 점수·거리 중 하나라도 갱신하면 저장하고, 갱신된 값을 돌려준다 */
export function updateBest(score: number, distance: number): Best {
  const prev = loadBest();
  const next: Best = {
    score: Math.max(prev?.score ?? 0, score),
    distance: Math.max(prev?.distance ?? 0, Math.floor(distance)),
  };
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch {
    /* 저장이 막힌 환경(프라이빗 모드 등)이면 이번 판에만 보인다 */
  }
  return next;
}

export function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* 무시 */
  }
}
