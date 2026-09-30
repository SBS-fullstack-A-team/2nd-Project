import { ITEM_KINDS, type ItemKind } from './config';
import { DEFAULT_LOOK, type Look, type LookSlot } from './looks';
import { findItem, ownsItem, SLOTS, UPGRADE_MAX } from './shop';

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

// ---------- 동전 · 상점 · 미션 진행 ----------

const PROGRESS_KEY = 'rd-progress';

export interface Progress {
  /** 가진 동전 */
  coins: number;
  /** 아이템별 강화 단계 */
  upgrades: Record<ItemKind, number>;
  /** 산 옷·모자 id */
  /** 산 꾸미기 품목 ("hat:miner" 처럼 칸:id). 기본 품목·미션 보상은 넣지 않아도 가진 것으로 친다 */
  owned: string[];
  /** 입고 있는 꾸미기 */
  look: Look;
  /** 미션 레벨 (끝낸 세트 수) */
  missionLevel: number;
  /** 지금 세트의 미션별 완료 여부 */
  missionDone: boolean[];
  /** 지금 세트의 누적 미션 진행 값 */
  missionTotals: number[];
}

function defaultProgress(): Progress {
  return {
    coins: 0,
    upgrades: { magnet: 0, shield: 0, boost: 0, double: 0 },
    owned: [],
    look: { ...DEFAULT_LOOK },
    missionLevel: 0,
    missionDone: [false, false, false],
    missionTotals: [0, 0, 0],
  };
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.floor(v)))
    : fallback;

/** 저장된 값이 깨졌거나 예전 형식이어도 항목별로 기본값을 채워 읽는다 */
export function loadProgress(): Progress {
  const base = defaultProgress();
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Progress> | null;
    if (!p || typeof p !== 'object') return base;
    const upgrades = { ...base.upgrades };
    for (const kind of ITEM_KINDS) upgrades[kind] = num(p.upgrades?.[kind], 0, UPGRADE_MAX, 0);
    const owned = Array.isArray(p.owned)
      ? [...new Set([...base.owned, ...p.owned.filter((id) => typeof id === 'string')])]
      : base.owned;
    const bools = (v: unknown) => [0, 1, 2].map((i) => (Array.isArray(v) ? v[i] === true : false));
    const nums = (v: unknown) =>
      [0, 1, 2].map((i) => (Array.isArray(v) ? num(v[i], 0, 1e9, 0) : 0));
    const missionLevel = num(p.missionLevel, 0, 1000, 0);
    // 입고 있는 것은 칸마다 — 없는 품목이거나 가지지 않은 것이면 기본으로
    const look: Look = { ...DEFAULT_LOOK };
    for (const slot of SLOTS) {
      const id: unknown = (p.look as Partial<Record<string, unknown>> | undefined)?.[slot];
      const item = typeof id === 'string' ? findItem(slot, id) : undefined;
      if (item && ownsItem(owned, missionLevel, item))
        (look as Record<LookSlot, string>)[slot] = item.id;
    }
    return {
      coins: num(p.coins, 0, 1e9, 0),
      upgrades,
      owned,
      look,
      missionLevel,
      missionDone: bools(p.missionDone),
      missionTotals: nums(p.missionTotals),
    };
  } catch {
    return base;
  }
}

export function saveProgress(p: Progress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 저장이 막힌 환경이면 이번 화면에서만 유지된다 */
  }
}

// ---------- 지난 판 정리 ----------

const LAST_RUN_KEY = 'rd-last-run';

/**
 * 판이 끝나면 곧 공통 결과창이 게임 화면을 덮으므로, 동전·미션 정리를 남겨 두었다가
 * "다시 하기" 로 새로 뜬 시작 화면에서 한 번 보여 준다. (이 탭에서만)
 */
export function saveLastRun(value: unknown): void {
  try {
    window.sessionStorage.setItem(LAST_RUN_KEY, JSON.stringify(value));
  } catch {
    /* 무시 */
  }
}

export function loadLastRun(): unknown {
  try {
    const raw = window.sessionStorage.getItem(LAST_RUN_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** 새 판을 시작하면 지운다 (새로고침해서 다시 보이지 않게) */
export function clearLastRun(): void {
  try {
    window.sessionStorage.removeItem(LAST_RUN_KEY);
  } catch {
    /* 무시 */
  }
}
