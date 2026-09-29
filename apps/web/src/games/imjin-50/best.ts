// 이 브라우저에만 남는 개인 최고 기록. 이 사이트엔 로그인이 없어서 서버 랭킹은
// 닉네임만으로 쌓이는 공개 기록이고, 여기 이 값은 그와 별개로 "내가 이 기기에서
// 얼마나 잘했는지"만 재는 참고용이다. 점수와 도달 공세를 각각 따로 최고치로 잰다.
const BEST_KEY = 'ij-best';

export interface Best {
  score: number;
  wave: number;
}

function isBest(value: unknown): value is Best {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Best).score === 'number' &&
    typeof (value as Best).wave === 'number'
  );
}

export function loadBest(): Best | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 이번 판 결과가 어느 한쪽이라도 갱신하면 저장하고, 갱신된 값을 돌려준다. */
export function updateBest(score: number, wave: number): Best {
  const prev = loadBest();
  const next: Best = {
    score: Math.max(prev?.score ?? 0, score),
    wave: Math.max(prev?.wave ?? 0, wave),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(next));
    } catch {
      /* 프라이빗 모드 등 저장이 막혀 있으면 이번 판만 화면에 보이고 다음 방문에는 사라진다 */
    }
  }
  return next;
}
