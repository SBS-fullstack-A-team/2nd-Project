// Board, balance and history for Imjin 50, a maze tower defense set during the
// 1592 invasion. The whole board is buildable, the invaders cannot walk through
// what you build, and they must touch four waypoints in order before they reach
// the fortress gate. Pure data and pure functions only, so this module is safe
// to import during SSR.

export const COLS = 11;
export const ROWS = 15;
export const TOTAL_WAVES = 50;
export const START_GOLD = 260;
export const START_LIVES = 20;
export const PRE_WAVE_SECONDS = 20;
export const BREAK_SECONDS = 12;
export const MAX_LEVEL = 3;

export interface Cell {
  col: number;
  row: number;
}

export const ENTRY: Cell = { col: 5, row: 0 };
export const EXIT: Cell = { col: 5, row: ROWS - 1 };

/** Touched in this order. Never buildable, so a route always exists in
 *  principle and the maze problem stays solvable. */
export const CHECKPOINTS: readonly Cell[] = [
  { col: 1, row: 3 },
  { col: 9, row: 6 },
  { col: 1, row: 10 },
  { col: 9, row: 13 },
];

/** Dancheong, the pigment set on Joseon palace and temple woodwork:雷綠 celadon
 *  green grounds, 丹 cinnabar for the aggressor, 石間朱 iron oxide for timber,
 *  黃 ochre for brass and waypoints, hanji paper for everything written. */
export const PALETTE = {
  // 1592년 늦봄의 들판: 거무스름한 흙, 마른 풀, 밟아 다진 황톳길, 석축과 기와
  void: '#120f0a',
  ground: '#2b2a1c',
  groundAlt: '#232216',
  groundLit: '#363421',
  grass: '#6b7438',
  grid: 'rgba(10,8,4,0.26)',
  pad: '#3a3526',
  wall: '#4a3726',
  wallTop: '#6b5137',
  route: '#6a5238',
  routeLit: '#8f7652',
  footprint: '#2a2014',
  sea: '#1f3b44',
  stone: '#57554b',
  stoneLit: '#6d6a5e',
  roof: '#57544e',
  ink: '#241710',
  paper: '#ece3cf',
  muted: '#94a793',
  dim: '#5b7364',
  cinnabar: '#cf4a2c',
  cinnabarDeep: '#6e2317',
  celadon: '#74c0a4',
  ochre: '#d9a441',
  timber: '#a08556',
  steel: '#8fa3ab',
  samcheong: '#7a9ccf',
  straw: '#d8c98f',
  armour: '#57616b',
  boss: '#b32a22',
} as const;

export type BuildKind = 'wall' | 'arrow' | 'cannon' | 'caltrop' | 'hwacha';

export interface BuildDef {
  kind: BuildKind;
  name: string;
  /** What it does, and the history behind it. Shown before the first wave. */
  blurb: string;
  cost: number;
  damage: number;
  /** Shots per second. 0 with damage means a standing field of harm, 0 with no
   *  damage means the piece only ever blocks. */
  rate: number;
  range: number;
  splash: number;
  slow: number;
  chain: number;
  pierceArmor: boolean;
  hitsScout: boolean;
  upgradable: boolean;
  color: string;
}

export const BUILDS: Record<BuildKind, BuildDef> = {
  wall: {
    kind: 'wall',
    name: '목책',
    blurb:
      '왜군이 걸어야 하는 길을 늘리는 나무 울타리. 강화하면 사슴뿔처럼 가지를 벌려 바로 옆을 지나는 적을 찌르고, 3단계에서는 걸음도 붙잡습니다.',
    cost: 18,
    damage: 0,
    rate: 0,
    range: 0,
    splash: 0,
    slow: 0,
    chain: 0,
    pierceArmor: true,
    hitsScout: true,
    upgradable: true,
    color: PALETTE.timber,
  },
  arrow: {
    kind: 'arrow',
    name: '궁수대',
    blurb:
      '각궁으로 쏘는 빠른 단일 사격. 통 안에 짧은 화살을 넣어 쏘는 편전은 사거리와 관통력을 함께 높인 조선 고유의 무기였습니다.',
    cost: 55,
    damage: 12,
    rate: 1.6,
    range: 2.6,
    splash: 0,
    slow: 0,
    chain: 0,
    pierceArmor: false,
    hitsScout: true,
    upgradable: true,
    color: PALETTE.paper,
  },
  cannon: {
    kind: 'cannon',
    name: '천자총통',
    blurb:
      '조선 화포 가운데 가장 큰 구경. 착탄 지점 주변을 함께 쓸어냅니다. 대장군전을 날려 선체를 부수는 데 쓰였고, 좁은 통로에서 특히 강합니다.',
    cost: 105,
    damage: 38,
    rate: 0.62,
    range: 2.3,
    splash: 1,
    slow: 0,
    chain: 0,
    pierceArmor: false,
    hitsScout: false,
    upgradable: true,
    color: PALETTE.ochre,
  },
  caltrop: {
    kind: 'caltrop',
    name: '마름쇠',
    blurb:
      '길에 뿌리는 네 갈래 쇠 가시. 밟은 왜군의 걸음을 45%(3단계 60%) 늦추고 갑주를 무시합니다. 발밑을 노리는 무기라 갑옷이 두꺼울수록 손해였습니다.',
    cost: 90,
    damage: 4,
    rate: 0,
    range: 2.2,
    splash: 0,
    slow: 0.45,
    chain: 0,
    pierceArmor: true,
    hitsScout: true,
    upgradable: true,
    color: PALETTE.steel,
  },
  hwacha: {
    kind: 'hwacha',
    name: '화차',
    blurb:
      '신기전 백여 발을 한 번에 쏘아 올리는 수레 위 다연발 발사대. 불화살이 셋(3단계 다섯)까지 옮겨 붙고 갑주를 무시하며, 성벽을 넘는 척후병도 잡습니다.',
    cost: 155,
    damage: 22,
    rate: 1,
    range: 2.4,
    splash: 0,
    slow: 0,
    chain: 3,
    pierceArmor: true,
    hitsScout: true,
    upgradable: true,
    color: PALETTE.samcheong,
  },
};

export const BUILD_ORDER: readonly BuildKind[] = ['wall', 'arrow', 'cannon', 'caltrop', 'hwacha'];

export interface SkillDef {
  name: string;
  /** 3단계를 찍은 뒤 이 스킬만 따로 해금하는 데 드는 군자금. */
  cost: number;
  /** 몇 초마다 저절로 발동하는지 — 해금하고 나면 버튼 없이 저절로 나간다. */
  cooldown: number;
  /**
   * 목책은 적 최대 체력 대비 즉발 피해 비율, 나머지는 평소 한 발 피해에 곱하는 배율
   * (마름쇠는 그 배율만큼의 피해를 한 번에, 화차·천자총통은 그만큼 강해진 한 발을
   * 더 쏜다). 엔진의 실제 발동 로직과 towerDps 의 평균 피해 계산이 이 값을 함께 쓴다.
   */
  power: number;
}

/**
 * 3단계를 다 찍은 시설에 군자금을 더 들여 따로 해금하는 자동 스킬. 해금하고 나면
 * 버튼이나 쿨타임 UI 없이 알아서 주기적으로 한 번씩 터진다 — "3단계 + 별도 투자"를
 * 다 마쳤을 때 주는 마무리 보상이다.
 */
export const SKILLS: Record<BuildKind, SkillDef> = {
  wall: { name: '매복 찌르기', cost: 60, cooldown: 9, power: 0.05 },
  /** power 는 "보통 한 발과 같은 위력의 화살을 몇 발 더 쏘는지"다(예: 2 = 2발 추가). */
  arrow: { name: '연사', cost: 90, cooldown: 5, power: 2 },
  cannon: { name: '대장군전', cost: 170, cooldown: 14, power: 1.8 },
  caltrop: { name: '가시 폭발', cost: 150, cooldown: 8, power: 1.6 },
  hwacha: { name: '신기전 일제', cost: 260, cooldown: 7, power: 1.3 },
};

/** 선택 패널·도감에 붙이는 한 줄 — "이름 N초마다". */
export function skillLabel(kind: BuildKind): string {
  const skill = SKILLS[kind];
  return skill.name + ' ' + skill.cooldown + '초마다';
}

export function upgradeCost(kind: BuildKind, level: number): number {
  if (kind === 'wall') return WALL_UPGRADE_COST[level - 1] ?? 0;
  return Math.round(BUILDS[kind].cost * 0.85 * level);
}

/**
 * 목책 강화(녹채). 바로 옆(한 칸 거리)을 지나는 적에게 초당 최대 체력의 일정 비율을
 * 갑주 무시 피해로 주고, 3단계는 걸음도 늦춘다. 체력 비례라 체력이 수십 배로 불어나는
 * 후반에도 같은 비중으로 먹힌다. 왜장은 절반만 받는다. 인덱스는 level - 1.
 */
export const WALL_UPGRADE_COST: readonly number[] = [30, 60];
export const WALL_THORN: readonly number[] = [0, 0.004, 0.006];
export const WALL_SLOW: readonly number[] = [0, 0, 0.15];
export const WALL_REACH = 1.05;
export const WALL_BOSS_FACTOR = 0.5;

export function wallThorn(level: number): number {
  return WALL_THORN[level - 1] ?? 0;
}

export function wallSlow(level: number): number {
  return WALL_SLOW[level - 1] ?? 0;
}

export function towerDamage(kind: BuildKind, level: number): number {
  return BUILDS[kind].damage * Math.pow(1.7, level - 1);
}

export function towerRange(kind: BuildKind, level: number): number {
  const base = BUILDS[kind].range;
  return base === 0 ? 0 : base + 0.25 * (level - 1);
}

/**
 * What a level buys beyond damage and range, per weapon. Held as data so the
 * simulation, the dock panel and the codex all read the same numbers -- and so
 * the artwork's promises (more tubes, more shafts, a wider bore, a denser
 * field) have something real behind them. Index is level - 1.
 */
const GROWTH: Partial<
  Record<
    BuildKind,
    {
      rate?: readonly number[];
      splash?: readonly number[];
      slow?: readonly number[];
      chain?: readonly number[];
    }
  >
> = {
  // 편전을 한 대씩 더 메기므로 사격이 빨라집니다.
  arrow: { rate: [1.6, 1.8, 2.0] },
  // 구경이 커지니 착탄 지점이 넓어집니다.
  cannon: { splash: [1, 1.15, 1.3] },
  // 같은 칸에 가시가 늘어나니 더 오래 붙잡습니다.
  caltrop: { slow: [0.45, 0.52, 0.6] },
  // 발사관이 늘어난 만큼 불화살이 더 멀리 옮겨 붙습니다.
  hwacha: { chain: [3, 4, 5] },
};

function stepped(values: readonly number[] | undefined, level: number, fallback: number): number {
  if (!values) return fallback;
  return values[Math.min(Math.max(level, 1), values.length) - 1] ?? fallback;
}

/** Shots per second at this level. 0 still means a standing field of harm. */
export function towerRate(kind: BuildKind, level: number): number {
  return stepped(GROWTH[kind]?.rate, level, BUILDS[kind].rate);
}

/** Blast radius in tiles at this level. */
export function towerSplash(kind: BuildKind, level: number): number {
  return stepped(GROWTH[kind]?.splash, level, BUILDS[kind].splash);
}

/** How much of an invader's pace this level takes away. */
export function towerSlow(kind: BuildKind, level: number): number {
  return stepped(GROWTH[kind]?.slow, level, BUILDS[kind].slow);
}

/** How many invaders one volley can jump between at this level. */
export function towerChain(kind: BuildKind, level: number): number {
  return stepped(GROWTH[kind]?.chain, level, BUILDS[kind].chain);
}

/**
 * 스킬을 해금했을 때 얹어지는 평균 초당 피해 — 스킬 강화를 살지 판단하는 데 쓴다.
 * 목책은 최대 체력 비례라 dps 로 환산하지 않고 trait 문구로만 보여준다(그래서
 * towerDps 에도 포함하지 않는다).
 */
export function skillDps(kind: BuildKind, level: number): number {
  if (level < MAX_LEVEL || kind === 'wall') return 0;
  const skill = SKILLS[kind];
  return (towerDamage(kind, level) * skill.power) / skill.cooldown;
}

/** 스킬을 아직 해금하지 않았을 때도 그대로 적용되는 기본 초당 피해. */
export function towerDps(kind: BuildKind, level: number): number {
  const def = BUILDS[kind];
  if (def.damage === 0) return 0;
  const damage = towerDamage(kind, level);
  return def.rate === 0 ? damage : damage * towerRate(kind, level);
}

export type EnemyKind = 'walker' | 'runner' | 'gunner' | 'armored' | 'scout' | 'boss';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  /** One line of history, shown in the roster on the front page. */
  note: string;
  hp: number;
  speed: number;
  reward: number;
  armor: number;
  leak: number;
  /** Walks over everything you build instead of around it. */
  ignoresWalls: boolean;
  slowResist: number;
  radius: number;
  color: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  walker: {
    kind: 'walker',
    name: '아시가루',
    note: '왜군 병력의 다수를 이룬 징집 보병. 수가 많고 하나하나는 약합니다.',
    hp: 42,
    speed: 1.2,
    reward: 8,
    armor: 0,
    leak: 1,
    ignoresWalls: false,
    slowResist: 0,
    radius: 0.26,
    color: PALETTE.cinnabar,
  },
  runner: {
    kind: 'runner',
    name: '왜검병',
    note: '가벼운 차림으로 빠르게 파고드는 검병. 체력은 얕지만 통로를 금방 지나갑니다.',
    hp: 28,
    speed: 2.2,
    reward: 7,
    armor: 0,
    leak: 1,
    ignoresWalls: false,
    slowResist: 0,
    radius: 0.21,
    color: '#c98a2e',
  },
  gunner: {
    kind: 'gunner',
    name: '조총병',
    note: '왜군의 주력 신무기 조총을 든 병사. 조선군이 활과 화포로 맞서야 했던 상대입니다.',
    hp: 74,
    speed: 1.1,
    reward: 14,
    armor: 2,
    leak: 1,
    ignoresWalls: false,
    slowResist: 0.1,
    radius: 0.27,
    color: '#4a5a7a',
  },
  armored: {
    kind: 'armored',
    name: '사무라이',
    note: '갑주를 두른 무사. 느리지만 두꺼워서 어지간한 공격은 잘 먹히지 않습니다.',
    hp: 128,
    speed: 0.85,
    reward: 16,
    armor: 6,
    leak: 2,
    ignoresWalls: false,
    slowResist: 0.25,
    radius: 0.31,
    color: PALETTE.armour,
  },
  scout: {
    kind: 'scout',
    name: '척후병',
    note: '목책과 성벽을 넘어 곧장 움직이는 정찰병. 미로를 아무리 길게 뽑아도 통하지 않습니다.',
    hp: 52,
    speed: 1.55,
    reward: 13,
    armor: 0,
    leak: 1,
    ignoresWalls: true,
    slowResist: 1,
    radius: 0.25,
    color: PALETTE.straw,
  },
  boss: {
    kind: 'boss',
    name: '왜장',
    note: '부대를 이끄는 장수. 열 번째 공세마다 들어오고, 뚫리면 성문이 크게 흔들립니다.',
    hp: 760,
    speed: 0.72,
    reward: 150,
    armor: 6,
    leak: 4,
    ignoresWalls: false,
    slowResist: 0.5,
    radius: 0.42,
    color: PALETTE.boss,
  },
};

export const ENEMY_ORDER: readonly EnemyKind[] = [
  'walker',
  'runner',
  'gunner',
  'armored',
  'scout',
  'boss',
];

export function hpScale(wave: number): number {
  const w = wave - 1;
  return 1 + 0.22 * w + 0.013 * w * w;
}

export function rewardScale(wave: number): number {
  return 1 + 0.025 * (wave - 1);
}

export function waveClearGold(wave: number): number {
  return 24 + wave * 4;
}

export function isBossWave(wave: number): boolean {
  return wave % 10 === 0;
}

export const SCORE = {
  perKill: 12,
  waveClear: 120,
  earlyCallPerSecond: 40,
  earlyGoldPerSecond: 3,
  livesLeft: 800,
  victory: 30000,
  victoryGold: 3,
} as const;

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, 120) / 40;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Spawn {
  kind: EnemyKind;
  at: number;
}

/** Seeded off the wave number alone, so every player meets the same 50 waves in
 *  the same order. That is what makes the score table comparable. */
export function buildWave(wave: number): Spawn[] {
  const rnd = mulberry32(0x5f3a + wave * 7919);
  const out: Spawn[] = [];
  let t = 0;

  if (isBossWave(wave)) {
    const generals = wave >= 40 ? 3 : wave >= 20 ? 2 : 1;
    for (let i = 0; i < generals; i += 1) {
      out.push({ kind: 'boss', at: t });
      t += 2.2;
    }
    t += 1.2;
  }

  const pool: Array<[EnemyKind, number]> = [['walker', 1]];
  if (wave >= 4) pool.push(['runner', 0.62]);
  if (wave >= 7) pool.push(['armored', 0.5]);
  if (wave >= 9) pool.push(['gunner', 0.58]);
  if (wave >= 11) pool.push(['scout', 0.55]);
  if (wave >= 18) pool.push(['runner', 0.45]);
  if (wave >= 26) pool.push(['armored', 0.4]);

  const weight = pool.reduce((sum, entry) => sum + entry[1], 0);
  const count = Math.round(6 + wave * 0.9);
  const gap = Math.max(0.36, 0.6 - wave * 0.004);

  for (let i = 0; i < count; i += 1) {
    let roll = rnd() * weight;
    let kind: EnemyKind = 'walker';
    for (const [candidate, w] of pool) {
      if (roll < w) {
        kind = candidate;
        break;
      }
      roll -= w;
    }
    out.push({ kind, at: t });
    t += gap + rnd() * 0.3;
  }

  return out;
}

/**
 * 정비 시간에 다음 공세의 구성을 미리 보여주기 위한 집계. buildWave 는 웨이브
 * 번호로만 정해지는 순수 함수라, 시뮬레이션에 아무 영향 없이 미리 내다볼 수 있다.
 */
export function previewWave(wave: number): Partial<Record<EnemyKind, number>> {
  const counts: Partial<Record<EnemyKind, number>> = {};
  for (const spawn of buildWave(wave)) {
    counts[spawn.kind] = (counts[spawn.kind] ?? 0) + 1;
  }
  return counts;
}
