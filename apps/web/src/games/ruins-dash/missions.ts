import type { RunEvent, RunState } from './engine';

/**
 * 미션 — 한 번에 3개가 걸리고, 3개를 다 끝내면 미션 레벨이 오른다.
 * 레벨이 오를 때마다 기본 점수 배율 +1 (MISSION_MULT_CAP 까지) 과 동전 보상을 받고,
 * 조금 더 어려운 새 미션 3개가 걸린다.
 * - run: 한 판 안에서 채워야 한다 (판이 끝나면 처음부터)
 * - total: 여러 판에 걸쳐 쌓인다
 */

/** 미션 레벨로 오르는 기본 배율의 최대치 — 레벨이 더 올라도 배율은 여기서 멈추고 동전 보상만 받는다 */
export const MISSION_MULT_CAP = 5;
/** 미션 세트를 끝냈을 때 동전 보상 */
export function missionReward(level: number): number {
  return 50 + 25 * Math.min(level, 10);
}

/** 한 판 동안 센 기록 — 동전·거리는 RunState 에서 바로 읽는다 */
export interface RunStats {
  slides: number;
  jumps: number;
  turns: number;
  river: number;
  cliff: number;
  narrow: number;
  close: number;
  multUps: number;
  shields: number;
  smashes: number;
  items: number;
}

export function emptyStats(): RunStats {
  return {
    slides: 0,
    jumps: 0,
    turns: 0,
    river: 0,
    cliff: 0,
    narrow: 0,
    close: 0,
    multUps: 0,
    shields: 0,
    smashes: 0,
    items: 0,
  };
}

/** 게임 이벤트를 기록에 센다. 모퉁이는 돈 뒤의 지형(run.theme)을 본다 */
export function countEvent(stats: RunStats, e: RunEvent, run: RunState): void {
  switch (e) {
    case 'slide':
      stats.slides += 1;
      break;
    case 'jump':
      stats.jumps += 1;
      break;
    case 'turn':
      stats.turns += 1;
      if (run.theme === 'river') stats.river += 1;
      if (run.theme === 'cliff') stats.cliff += 1;
      if (run.narrow) stats.narrow += 1;
      break;
    case 'close':
      stats.close += 1;
      break;
    case 'multUp':
      stats.multUps += 1;
      break;
    case 'shield':
      // 방패로 막으면 그 장애물도 부서진다
      stats.shields += 1;
      stats.smashes += 1;
      break;
    case 'smash':
      stats.smashes += 1;
      break;
    case 'item':
      stats.items += 1;
      break;
    default:
      break;
  }
}

type MissionKind =
  | 'slide'
  | 'jump'
  | 'coinsRun'
  | 'distance'
  | 'river'
  | 'cliff'
  | 'narrow'
  | 'turn'
  | 'close'
  | 'multUp'
  | 'shield'
  | 'smash'
  | 'items'
  | 'coinsTotal';

interface MissionTemplate {
  scope: 'run' | 'total';
  /** 난이도 단계(0~)에 따른 목표 */
  target: (tier: number) => number;
  text: (n: number) => string;
  /** 이번 판에 쌓인 값 */
  value: (stats: RunStats, run: RunState) => number;
}

const TEMPLATES: Record<MissionKind, MissionTemplate> = {
  slide: {
    scope: 'run',
    target: (t) => 10 + 5 * t,
    text: (n) => `한 판에 슬라이드 ${n}번`,
    value: (s) => s.slides,
  },
  jump: {
    scope: 'run',
    target: (t) => 12 + 6 * t,
    text: (n) => `한 판에 점프 ${n}번`,
    value: (s) => s.jumps,
  },
  coinsRun: {
    scope: 'run',
    target: (t) => 30 + 15 * t,
    text: (n) => `한 판에 동전 ${n}개`,
    value: (_, run) => run.coins,
  },
  distance: {
    scope: 'run',
    target: (t) => 600 + 300 * t,
    text: (n) => `한 판에 ${n.toLocaleString()}m 달리기`,
    value: (_, run) => Math.floor(run.distance),
  },
  river: {
    scope: 'run',
    target: (t) => 1 + Math.floor(t / 3),
    text: (n) => `한 판에 물가 ${n}번 지나기`,
    value: (s) => s.river,
  },
  cliff: {
    scope: 'run',
    target: (t) => 1 + Math.floor(t / 3),
    text: (n) => `한 판에 절벽 ${n}번 지나기`,
    value: (s) => s.cliff,
  },
  narrow: {
    scope: 'run',
    target: (t) => 1 + Math.floor(t / 3),
    text: (n) => `한 판에 좁은 길 ${n}번 건너기`,
    value: (s) => s.narrow,
  },
  turn: {
    scope: 'run',
    target: (t) => 3 + Math.round(1.5 * t),
    text: (n) => `한 판에 모퉁이 ${n}번 돌기`,
    value: (s) => s.turns,
  },
  close: {
    scope: 'run',
    target: (t) => 3 + 2 * t,
    text: (n) => `한 판에 아슬아슬 ${n}번`,
    value: (s) => s.close,
  },
  multUp: {
    scope: 'run',
    target: (t) => Math.min(4, 1 + Math.floor(t / 2)),
    text: (n) => `한 판에 배율 ${n}번 올리기`,
    value: (s) => s.multUps,
  },
  shield: {
    scope: 'total',
    target: (t) => 2 + Math.floor(t / 2),
    text: (n) => `방패로 ${n}번 막기 (누적)`,
    value: (s) => s.shields,
  },
  smash: {
    scope: 'total',
    target: (t) => 5 + 5 * t,
    text: (n) => `장애물 ${n}개 부수기 (누적)`,
    value: (s) => s.smashes,
  },
  items: {
    scope: 'total',
    target: (t) => 4 + 2 * t,
    text: (n) => `아이템 ${n}개 먹기 (누적)`,
    value: (s) => s.items,
  },
  coinsTotal: {
    scope: 'total',
    target: (t) => 150 + 100 * t,
    text: (n) => `동전 ${n}개 모으기 (누적)`,
    value: (_, run) => run.coins,
  },
};

const KINDS = Object.keys(TEMPLATES) as MissionKind[];

/** 지형 미션 — 운(모퉁이 뒤 지형)에 기대므로 한 세트에 하나만 */
const TERRAIN: readonly MissionKind[] = ['river', 'cliff', 'narrow'];

/** 첫 세트는 고정 — 슬라이드, 물가, 방패 (조작·지형·아이템을 하나씩 익히게) */
const FIRST_SET: readonly MissionKind[] = ['slide', 'river', 'shield'];

export interface Mission {
  kind: MissionKind;
  scope: 'run' | 'total';
  target: number;
  text: string;
}

/** 레벨마다 같은 미션이 나오도록 레벨로 정한 난수로 고른다 (새로고침해도 바뀌지 않게) */
export function missionSet(level: number): Mission[] {
  let kinds: MissionKind[];
  if (level === 0) {
    kinds = [...FIRST_SET];
  } else {
    let seed = (level * 2654435761) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const pool = [...KINDS];
    kinds = [];
    while (kinds.length < 3) {
      const [k] = pool.splice(Math.floor(rand() * pool.length), 1);
      if (!k) break;
      // 누적 미션은 한 세트에 하나만 — 세 개 다 누적이면 몇 판을 해도 안 끝나 보인다
      if (TEMPLATES[k].scope === 'total' && kinds.some((x) => TEMPLATES[x].scope === 'total'))
        continue;
      if (TERRAIN.includes(k) && kinds.some((x) => TERRAIN.includes(x))) continue;
      kinds.push(k);
    }
  }
  const tier = Math.min(level, 8);
  return kinds.map((kind) => {
    const tpl = TEMPLATES[kind];
    const target = tpl.target(tier);
    return { kind, scope: tpl.scope, target, text: tpl.text(target) };
  });
}

/** 이번 판에 쌓인 값 (누적 미션도 이번 판 몫만) */
export function runValue(m: Mission, stats: RunStats, run: RunState): number {
  return TEMPLATES[m.kind].value(stats, run);
}
