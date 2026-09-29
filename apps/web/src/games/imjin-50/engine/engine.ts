import {
  BREAK_SECONDS,
  BUILDS,
  ENEMIES,
  ENTRY,
  EXIT,
  MAX_LEVEL,
  PRE_WAVE_SECONDS,
  REPAIR_RATE,
  ROWS,
  SCORE,
  SIEGE,
  SKILLS,
  START_GOLD,
  START_LIVES,
  TOTAL_WAVES,
  buildWave,
  comboMultiplier,
  hpScale,
  isBossWave,
  maxDurability,
  rewardScale,
  siegeScale,
  speedScale,
  towerChain,
  towerDamage,
  towerRange,
  towerRate,
  towerSlow,
  towerSplash,
  upgradeCost,
  WALL_BOSS_FACTOR,
  WALL_REACH,
  wallSlow,
  wallThorn,
  waveClearGold,
  type BuildKind,
  type EnemyKind,
  type Spawn,
} from './config';
import {
  CELL_COUNT,
  CHECKPOINT_CELLS,
  cellsToPoints,
  centerOf,
  fullRoute,
  index,
  isBuildable,
  routeExists,
  walk,
} from './maze';

export type Phase = 'break' | 'wave' | 'over' | 'win';

/** Discrete things the simulation did this tick, for the client shell to turn
 *  into sound and haptics. The engine stays audio-agnostic (SSR-safe, no
 *  browser globals) and just narrates itself; drained once per animation
 *  frame by whoever is listening. */
export type SimEvent =
  | { type: 'shotCannon' }
  | { type: 'shotArrow' }
  | { type: 'buildHit' }
  | { type: 'buildBroken'; kind: BuildKind }
  | { type: 'chain' }
  | { type: 'kill'; kind: EnemyKind }
  | { type: 'skill'; kind: BuildKind }
  | { type: 'leak' }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'waveClear'; wave: number }
  | { type: 'combo'; combo: number }
  | { type: 'gameOver' }
  | { type: 'victory' };

export interface Point {
  x: number;
  y: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  armor: number;
  reward: number;
  leak: number;
  ignoresWalls: boolean;
  slowResist: number;
  radius: number;
  x: number;
  y: number;
  angle: number;
  leg: number;
  nodes: Point[];
  node: number;
  travelled: number;
  slow: number;
  hitFlash: number;
  /** 화차 불길이 붙어 타오르는 남은 시간(초). 그림 전용, 피해와는 무관하다. */
  burn: number;
  /** 불길이 이 적에게 옮겨 오기까지 남은 시간 — 그 뒤에 타오르기 시작한다. */
  burnDelay: number;
  /** 맞은 반동으로 그림만 밀려난 거리 (실제 위치·경로는 그대로) */
  kickX: number;
  kickY: number;
  dead: boolean;
}

export interface Build {
  id: number;
  cell: number;
  col: number;
  row: number;
  kind: BuildKind;
  level: number;
  invested: number;
  cooldown: number;
  /** 3단계를 채운 뒤 군자금을 더 들여 스킬을 따로 해금했는지. */
  skillUnlocked: boolean;
  /** 스킬을 해금한 뒤부터 도는 자동 쿨타임. 해금 전에는 줄지 않고 그대로 대기한다. */
  skillCooldown: number;
  angle: number;
  pulse: number;
  muzzle: number;
  /** 남은 내구도 (목책은 0 으로 두고 쓰지 않는다) */
  durability: number;
  /** 내구도가 0 이 되어 사격을 멈춘 상태 — 정비 시간에 수리해야 다시 쏜다 */
  broken: boolean;
  /** 적에게 깎이는 중일 때 잠깐 켜지는 표시 (그림 전용) */
  hurt: number;
}

export interface Shot {
  /** Which piece fired it, so the renderer can draw the right munition. */
  kind: BuildKind;
  /** The firing piece's level, so a reinforced battery throws visibly
   *  heavier shot than a fresh one. */
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  targetId: number;
  damage: number;
  splash: number;
  pierceArmor: boolean;
  color: string;
  life: number;
}

export interface Beam {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  life: number;
  /** 처음 life — 불길이 자라나고 사그라드는 진행도를 계산한다. */
  span: number;
  /** 이 줄기가 나타나기까지 남은 시간. 옮겨붙는 불길을 차례로 보이게 한다. */
  delay: number;
  /** 0 이면 발사대에서 첫 적까지, 1 이상이면 적에서 적으로 옮겨붙은 불길 */
  hop: number;
  seed: number;
  /** The 화차's level: a bigger rack sends a broader volley. */
  level: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  life: number;
  color: string;
}

export interface Note {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  big: boolean;
}

/**
 * 타격감을 위한 입자(그림 전용 — 판정과 점수에는 전혀 관여하지 않는다).
 * spark: 속도 방향으로 그어지는 불똥 / debris: 튀는 파편 / smoke: 부풀며 옅어지는 연기 /
 * flash: 한순간 번쩍이는 섬광.
 */
export interface Particle {
  kind: 'spark' | 'debris' | 'smoke' | 'flash';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  span: number;
  size: number;
  color: string;
  /** 초당 속도 감쇠 계수 */
  drag: number;
}

/** 포탄이 떨어진 자리에 잠시 남는 그을음 (그림 전용) */
export interface Scorch {
  x: number;
  y: number;
  r: number;
  life: number;
  span: number;
}

const FX = {
  dirt: '#6a5238',
  dirtLit: '#b39668',
  clod: '#d8c49a',
  smoke: '#8f887a',
  ember: '#e08a3c',
  flash: '#ffd894',
  steel: '#c8d5da',
  wood: '#8a6a44',
  white: '#fff4dc',
  /** 스킬 발동 때만 쓰는 금박 색 — 스킬 강화 버튼의 금박과 같은 톤으로 맞췄다. */
  gild: '#e9c05e',
} as const;
const MAX_PARTICLES = 500;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface Snapshot {
  phase: Phase;
  wave: number;
  lives: number;
  gold: number;
  score: number;
  combo: number;
  comboMul: number;
  breakLeft: number;
  remaining: number;
  waveTotal: number;
  kills: number;
  leaks: number;
  durationMs: number;
  buildCount: number;
  routeLength: number;
}

export interface RunResult {
  score: number;
  wave: number;
  lives: number;
  kills: number;
  durationMs: number;
  victory: boolean;
}

export type BuildRefusal =
  'occupied' | 'reserved' | 'funds' | 'seal' | 'trap' | 'closed' | 'broken' | 'repairTime';

export const REFUSAL_TEXT: Record<BuildRefusal, string> = {
  occupied: '그 칸에는 이미 무언가 있습니다.',
  reserved: '왜군 상륙 지점, 성문, 경유지에는 세울 수 없습니다.',
  funds: '군자금이 부족합니다.',
  seal: '길을 완전히 막는 배치입니다. 한 칸은 비워 두세요.',
  trap: '이미 들어온 왜군의 길이 끊깁니다.',
  closed: '이번 판은 끝났습니다.',
  broken: '파손된 무기입니다. 정비 시간에 먼저 수리하세요.',
  repairTime: '수리는 공세 사이 정비 시간에만 할 수 있습니다.',
};

const ENTRY_CELL = index(ENTRY.col, ENTRY.row);
const EXIT_CELL = index(EXIT.col, EXIT.row);
const OFF_EXIT: Point = { x: EXIT.col + 0.5, y: ROWS + 0.6 };

/** 화차 불길이 다음 적으로 옮겨붙는 사이의 간격(초, 그림 전용) */
const HOP_DELAY = 0.07;

function targetCell(leg: number): number {
  return leg < CHECKPOINT_CELLS.length ? CHECKPOINT_CELLS[leg]! : EXIT_CELL;
}

export class Engine {
  phase: Phase = 'break';
  wave = 1;
  lives = START_LIVES;
  gold = START_GOLD;
  score = 0;
  combo = 0;
  /** 화면에 보여주는 콤보 숫자. 실제 combo 를 그대로 따라가되, 끊겨서
   *  0 으로 떨어질 때만 서서히 뒤따라가며 줄어든다 (그림 전용, 점수와 무관). */
  comboEcho = 0;
  /** 콤보가 늘어난 순간 숫자가 살짝 튀어 보이게 하는 펄스 (그림 전용) */
  comboPulse = 0;
  breakLeft = PRE_WAVE_SECONDS;
  kills = 0;
  leaks = 0;
  simTime = 0;
  coreFlash = 0;
  shake = 0;

  blocked = new Uint8Array(CELL_COUNT);
  builds = new Map<number, Build>();
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  beams: Beam[] = [];
  rings: Ring[] = [];
  notes: Note[] = [];
  particles: Particle[] = [];
  scorches: Scorch[] = [];

  route: Point[] = [];
  events: SimEvent[] = [];
  selected: number | null = null;
  pending: BuildKind | null = null;
  refusal: BuildRefusal | null = null;

  private queue: Spawn[] = [];
  private spawned = 0;
  private waveClock = 0;
  private nextId = 1;

  constructor() {
    this.refreshRoute();
  }

  reset(): void {
    this.phase = 'break';
    this.wave = 1;
    this.lives = START_LIVES;
    this.gold = START_GOLD;
    this.score = 0;
    this.combo = 0;
    this.comboEcho = 0;
    this.comboPulse = 0;
    this.breakLeft = PRE_WAVE_SECONDS;
    this.kills = 0;
    this.leaks = 0;
    this.simTime = 0;
    this.coreFlash = 0;
    this.shake = 0;
    this.blocked.fill(0);
    this.builds.clear();
    this.enemies = [];
    this.shots = [];
    this.beams = [];
    this.rings = [];
    this.notes = [];
    this.particles = [];
    this.scorches = [];
    this.events = [];
    this.selected = null;
    this.pending = null;
    this.refusal = null;
    this.queue = [];
    this.spawned = 0;
    this.waveClock = 0;
    this.nextId = 1;
    this.refreshRoute();
  }

  get finished(): boolean {
    return this.phase === 'over' || this.phase === 'win';
  }

  buildAt(col: number, row: number): Build | undefined {
    return this.builds.get(index(col, row));
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
  }

  /** Pulls every event queued since the last call. Call once per animation
   *  frame; never poll faster than that or events get split across calls. */
  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  private refreshRoute(): void {
    const cells = fullRoute(this.blocked);
    this.route = cells ? cellsToPoints(cells) : [];
  }

  result(): RunResult {
    return {
      score: Math.round(this.score),
      wave: this.wave,
      lives: Math.max(0, this.lives),
      kills: this.kills,
      durationMs: Math.round(this.simTime * 1000),
      victory: this.phase === 'win',
    };
  }

  snapshot(): Snapshot {
    return {
      phase: this.phase,
      wave: this.wave,
      lives: Math.max(0, this.lives),
      gold: Math.floor(this.gold),
      score: Math.round(this.score),
      combo: this.combo,
      comboMul: comboMultiplier(this.combo),
      breakLeft: Math.max(0, this.breakLeft),
      remaining: this.enemies.length + Math.max(0, this.queue.length - this.spawned),
      waveTotal: this.queue.length,
      kills: this.kills,
      leaks: this.leaks,
      durationMs: Math.round(this.simTime * 1000),
      buildCount: this.builds.size,
      routeLength: Math.max(0, this.route.length - 1),
    };
  }

  private enemyCell(enemy: Enemy): number {
    const col = Math.min(Math.max(0, Math.floor(enemy.x)), 10);
    const row = Math.min(Math.max(0, Math.floor(enemy.y)), ROWS - 1);
    return index(col, row);
  }

  private repath(enemy: Enemy): void {
    if (enemy.ignoresWalls) {
      const target = centerOf(targetCell(enemy.leg));
      enemy.nodes = enemy.leg >= CHECKPOINT_CELLS.length ? [target, OFF_EXIT] : [target];
      enemy.node = 0;
      return;
    }
    const cells = walk(this.blocked, this.enemyCell(enemy), targetCell(enemy.leg));
    if (!cells) {
      enemy.nodes = [];
      enemy.node = 0;
      return;
    }
    const points = cellsToPoints(cells);
    if (points.length > 1) {
      const a = Math.hypot(points[0]!.x - enemy.x, points[0]!.y - enemy.y);
      const b = Math.hypot(points[1]!.x - enemy.x, points[1]!.y - enemy.y);
      if (b < a) points.shift();
    }
    if (enemy.leg >= CHECKPOINT_CELLS.length) points.push(OFF_EXIT);
    enemy.nodes = points;
    enemy.node = 0;
  }

  private repathAll(): void {
    for (const enemy of this.enemies) {
      if (!enemy.dead) this.repath(enemy);
    }
  }

  build(col: number, row: number, kind: BuildKind): boolean {
    this.refusal = null;
    if (this.finished) {
      this.refusal = 'closed';
      return false;
    }
    if (!isBuildable(col, row)) {
      this.refusal = 'reserved';
      return false;
    }
    const cell = index(col, row);
    if (this.builds.has(cell)) {
      this.refusal = 'occupied';
      return false;
    }
    const cost = BUILDS[kind].cost;
    if (this.gold < cost) {
      this.refusal = 'funds';
      return false;
    }
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.ignoresWalls) continue;
      if (this.enemyCell(enemy) === cell) {
        this.refusal = 'occupied';
        return false;
      }
    }

    this.blocked[cell] = 1;
    if (!routeExists(this.blocked)) {
      this.blocked[cell] = 0;
      this.refusal = 'seal';
      return false;
    }
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.ignoresWalls) continue;
      if (!walk(this.blocked, this.enemyCell(enemy), targetCell(enemy.leg))) {
        this.blocked[cell] = 0;
        this.refusal = 'trap';
        return false;
      }
    }

    this.gold -= cost;
    this.builds.set(cell, {
      id: this.nextId++,
      cell,
      col,
      row,
      kind,
      level: 1,
      invested: cost,
      cooldown: 0,
      skillUnlocked: false,
      skillCooldown: SKILLS[kind].cooldown,
      angle: -Math.PI / 2,
      pulse: 1,
      muzzle: 0,
      durability: maxDurability(kind, 1),
      broken: false,
      hurt: 0,
    });
    this.selected = cell;
    this.pending = null;
    this.refreshRoute();
    this.repathAll();
    return true;
  }

  upgrade(col: number, row: number): boolean {
    this.refusal = null;
    const build = this.buildAt(col, row);
    if (!build || this.finished) return false;
    if (!BUILDS[build.kind].upgradable || build.level >= MAX_LEVEL) return false;
    if (build.broken) {
      this.refusal = 'broken';
      return false;
    }
    const cost = upgradeCost(build.kind, build.level);
    if (this.gold < cost) {
      this.refusal = 'funds';
      return false;
    }
    this.gold -= cost;
    // 늘어난 최대 내구도만큼 더해 준다 (깎인 만큼은 그대로 남는다)
    build.durability +=
      maxDurability(build.kind, build.level + 1) - maxDurability(build.kind, build.level);
    build.level += 1;
    build.invested += cost;
    build.pulse = 1;
    return true;
  }

  /** 3단계를 채운 시설에 군자금을 더 들여 자동 스킬을 따로 해금한다. */
  unlockSkill(col: number, row: number): boolean {
    this.refusal = null;
    const build = this.buildAt(col, row);
    if (!build || this.finished) return false;
    if (build.level < MAX_LEVEL || build.skillUnlocked) return false;
    if (build.broken) {
      this.refusal = 'broken';
      return false;
    }
    const cost = SKILLS[build.kind].cost;
    if (this.gold < cost) {
      this.refusal = 'funds';
      return false;
    }
    this.gold -= cost;
    build.invested += cost;
    build.skillUnlocked = true;
    build.skillCooldown = SKILLS[build.kind].cooldown;
    build.pulse = 1;
    return true;
  }

  /** 내구도가 남은 비율 (내구도가 없는 목책은 1) */
  durabilityRatio(build: Build): number {
    const max = maxDurability(build.kind, build.level);
    return max > 0 ? Math.max(0, build.durability) / max : 1;
  }

  /** 지금 수리하면 드는 군자금 (깎이지 않았으면 0) */
  repairCost(build: Build): number {
    const missing = 1 - this.durabilityRatio(build);
    return missing <= 0 ? 0 : Math.max(1, Math.ceil(build.invested * REPAIR_RATE * missing));
  }

  /** 해체 환급 — 투자액의 60%, 깎인 무기는 그만큼 덜 돌려받는다 (최소 절반) */
  refund(build: Build): number {
    return Math.floor(build.invested * 0.6 * (0.5 + 0.5 * this.durabilityRatio(build)));
  }

  /** 정비 시간에 군자금을 들여 내구도를 가득 채우고 파손을 고친다 */
  repair(col: number, row: number): boolean {
    this.refusal = null;
    const build = this.buildAt(col, row);
    if (!build || this.finished) return false;
    const cost = this.repairCost(build);
    if (cost === 0) return false;
    if (this.phase !== 'break') {
      this.refusal = 'repairTime';
      return false;
    }
    if (this.gold < cost) {
      this.refusal = 'funds';
      return false;
    }
    this.gold -= cost;
    build.durability = maxDurability(build.kind, build.level);
    build.broken = false;
    build.pulse = 1;
    return true;
  }

  /** 적이 옆 무기를 깎는다 — 닿는 거리 안에서 가장 가까운 성한 무기 하나만 */
  private siege(enemy: Enemy, dt: number): void {
    const siege = SIEGE[enemy.kind];
    if (siege.dps <= 0 || siegeScale(this.wave) <= 0) return;
    let target: Build | null = null;
    let best = siege.reach * siege.reach;
    for (const build of this.builds.values()) {
      if (build.broken || build.kind === 'wall') continue;
      const dx = build.col + 0.5 - enemy.x;
      const dy = build.row + 0.5 - enemy.y;
      const d = dx * dx + dy * dy;
      if (d <= best) {
        best = d;
        target = build;
      }
    }
    if (!target) return;
    target.durability -= siege.dps * siegeScale(this.wave) * dt;
    target.hurt = 0.25;
    this.emit({ type: 'buildHit' });
    if (target.durability <= 0) {
      target.durability = 0;
      target.broken = true;
      target.muzzle = 0;
      const x = target.col + 0.5;
      const y = target.row + 0.5;
      this.burst(x, y, 10, 'debris', FX.wood, {
        speed: [1, 2.4],
        size: [0.04, 0.08],
        life: [0.35, 0.6],
        drag: 3,
        lift: 0.6,
      });
      this.burst(x, y, 4, 'smoke', FX.dirtLit, {
        speed: [0.2, 0.6],
        size: [0.12, 0.2],
        life: [0.6, 1],
      });
      this.pushNote(x, y - 0.5, BUILDS[target.kind].name + ' 파손!', ENEMIES.boss.color, true);
      this.emit({ type: 'buildBroken', kind: target.kind });
    }
  }

  sell(col: number, row: number): boolean {
    this.refusal = null;
    const cell = index(col, row);
    const build = this.builds.get(cell);
    if (!build || this.finished) return false;
    this.gold += this.refund(build);
    this.builds.delete(cell);
    this.blocked[cell] = 0;
    if (this.selected === cell) this.selected = null;
    this.refreshRoute();
    this.repathAll();
    return true;
  }

  callWave(): boolean {
    if (this.phase !== 'break' || this.breakLeft <= 0.4) return false;
    const seconds = Math.floor(this.breakLeft);
    this.gold += seconds * SCORE.earlyGoldPerSecond;
    this.score += seconds * SCORE.earlyCallPerSecond;
    this.pushNote(
      EXIT.col + 0.5,
      EXIT.row - 0.6,
      '조기 소집 +' + seconds * SCORE.earlyGoldPerSecond,
      BUILDS.arrow.color,
      false,
    );
    this.breakLeft = 0;
    this.startWave();
    return true;
  }

  private startWave(): void {
    this.queue = buildWave(this.wave);
    this.spawned = 0;
    this.waveClock = 0;
    this.phase = 'wave';
    this.emit({ type: 'waveStart', wave: this.wave, boss: isBossWave(this.wave) });
  }

  private spawn(kind: EnemyKind): void {
    const def = ENEMIES[kind];
    const hp = Math.round(def.hp * hpScale(this.wave));
    const enemy: Enemy = {
      id: this.nextId++,
      kind,
      hp,
      maxHp: hp,
      baseSpeed: def.speed * speedScale(this.wave),
      armor: def.armor,
      reward: Math.round(def.reward * rewardScale(this.wave)),
      leak: def.leak,
      ignoresWalls: def.ignoresWalls,
      slowResist: def.slowResist,
      radius: def.radius,
      x: ENTRY.col + 0.5,
      y: -0.6,
      angle: Math.PI / 2,
      leg: 0,
      nodes: [],
      node: 0,
      travelled: 0,
      slow: 0,
      hitFlash: 0,
      burn: 0,
      burnDelay: 0,
      kickX: 0,
      kickY: 0,
      dead: false,
    };
    if (enemy.ignoresWalls) {
      this.repath(enemy);
    } else {
      const cells = walk(this.blocked, ENTRY_CELL, targetCell(0));
      enemy.nodes = cells ? cellsToPoints(cells) : [centerOf(ENTRY_CELL)];
      enemy.node = 0;
    }
    this.enemies.push(enemy);
  }

  private pushNote(x: number, y: number, text: string, color: string, big: boolean): void {
    if (this.notes.length > 24) this.notes.shift();
    this.notes.push({ x, y, text, life: big ? 1.6 : 1, color, big });
  }

  /** 한 점에서 입자를 흩뿌린다. dir 을 주면 그 방향 ±arc 안으로만 튄다. */
  private burst(
    x: number,
    y: number,
    count: number,
    kind: Particle['kind'],
    color: string,
    opts: {
      speed: [number, number];
      size: [number, number];
      life: [number, number];
      drag?: number;
      dir?: number;
      arc?: number;
      lift?: number;
    },
  ): void {
    for (let i = 0; i < count; i += 1) {
      const a =
        opts.dir === undefined ? rand(0, Math.PI * 2) : opts.dir + rand(-1, 1) * (opts.arc ?? 0.6);
      const speed = rand(...opts.speed);
      const life = rand(...opts.life);
      this.particles.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - (opts.lift ?? 0),
        life,
        span: life,
        size: rand(...opts.size),
        color,
        drag: opts.drag ?? 3,
      });
    }
    const excess = this.particles.length - MAX_PARTICLES;
    if (excess > 0) this.particles.splice(0, excess);
  }

  /** 맞은 적을 그림에서만 살짝 밀어낸다 (반동). */
  private kick(enemy: Enemy, dirX: number, dirY: number, amount: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    enemy.kickX += (dirX / len) * amount;
    enemy.kickY += (dirY / len) * amount;
  }

  /** flash: 한 방씩 맞을 때만 번쩍인다. 마름쇠·녹채처럼 매 프레임 조금씩 깎는 지속
   *  피해까지 번쩍이면 적이 늘 하얗게 떠서 정작 화살·포탄의 타격이 묻힌다. */
  private hit(enemy: Enemy, amount: number, pierceArmor: boolean, flash = true): void {
    if (enemy.dead) return;
    const effective = pierceArmor ? amount : Math.max(1, amount - enemy.armor);
    enemy.hp -= effective;
    if (flash) enemy.hitFlash = 0.14;
    if (enemy.hp > 0) return;

    enemy.dead = true;
    // 쓰러지는 순간: 몸빛 파편이 터지고 흙먼지가 인다
    const boss = enemy.kind === 'boss';
    const ex = enemy.x + enemy.kickX;
    const ey = enemy.y + enemy.kickY;
    this.burst(ex, ey, boss ? 18 : 8, 'debris', ENEMIES[enemy.kind].color, {
      speed: [1.2, boss ? 3.4 : 2.6],
      size: [0.04, boss ? 0.1 : 0.075],
      life: [0.3, 0.55],
      drag: 4,
    });
    this.burst(ex, ey, boss ? 6 : 3, 'smoke', FX.dirtLit, {
      speed: [0.2, 0.5],
      size: [0.1, boss ? 0.24 : 0.15],
      life: [0.45, 0.8],
      drag: 2,
    });
    if (boss) {
      this.burst(ex, ey, 1, 'flash', FX.white, {
        speed: [0, 0],
        size: [0.9, 0.9],
        life: [0.22, 0.22],
      });
    }
    this.kills += 1;
    this.combo += 1;
    this.comboPulse = 1;
    this.score += Math.round(enemy.reward * SCORE.perKill * comboMultiplier(this.combo));
    this.gold += enemy.reward;
    this.emit({ type: 'kill', kind: enemy.kind });
    if (this.combo > 0 && this.combo % 5 === 0) this.emit({ type: 'combo', combo: this.combo });
    this.rings.push({
      x: enemy.x,
      y: enemy.y,
      r: enemy.radius,
      max: enemy.radius * 2.6,
      life: 0.32,
      color: ENEMIES[enemy.kind].color,
    });
    if (enemy.kind === 'boss') {
      this.shake = 0.5;
      this.pushNote(enemy.x, enemy.y, '왜장 격파 +' + enemy.reward, ENEMIES.boss.color, true);
    } else {
      this.pushNote(enemy.x, enemy.y, '+' + enemy.reward, BUILDS.arrow.color, false);
    }
  }

  private findTarget(build: Build, range: number): Enemy | null {
    const def = BUILDS[build.kind];
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.ignoresWalls && !def.hitsScout) continue;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      if (dx * dx + dy * dy > range * range) continue;
      const priority = enemy.leg * 10000 + enemy.travelled;
      if (priority > bestScore) {
        bestScore = priority;
        best = enemy;
      }
    }
    return best;
  }

  /**
   * mult·splashMul: 평소 발사는 둘 다 1이고, 3단계 자동 스킬(대장군전)이 더 강한
   * 한 발을 쏠 때만 키워서 넘긴다. volley 는 화차 스킬(신기전 일제) 전용 —
   * 평소처럼 한 마리에서 옆으로 옮겨붙는 대신, 카트에서 가까운 적 여럿에게
   * 지연 없이 한꺼번에 쏘아 "일제 발사"다운 순간을 만든다.
   */
  private fire(
    build: Build,
    target: Enemy,
    range: number,
    mult = 1,
    splashMul = 1,
    volley = false,
  ): void {
    const def = BUILDS[build.kind];
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    const damage = towerDamage(build.kind, build.level) * mult;
    build.pulse = 1;
    build.muzzle = 1;

    if (build.kind === 'hwacha') {
      const burnFor = 0.5 + build.level * 0.25;
      const chain = towerChain(build.kind, build.level);

      if (volley) {
        this.burst(cx, cy, 6, 'smoke', FX.smoke, {
          speed: [0.3, 0.8],
          size: [0.12, 0.2],
          life: [0.4, 0.7],
          drag: 2,
        });
        const targets = this.enemies
          .filter((enemy) => !enemy.dead)
          .map((enemy) => ({ enemy, d: Math.hypot(enemy.x - cx, enemy.y - cy) }))
          .filter((t) => t.d <= range)
          .sort((a, b) => a.d - b.d)
          .slice(0, chain);
        let power = damage;
        for (const { enemy } of targets) {
          this.beams.push({
            ax: cx,
            ay: cy,
            bx: enemy.x,
            by: enemy.y,
            life: 0.32,
            span: 0.32,
            delay: 0,
            hop: 0,
            seed: Math.random(),
            level: build.level,
          });
          this.ignite(enemy, burnFor, 0);
          this.hit(enemy, power, true);
          this.emit({ type: 'chain' });
          power *= 0.7;
        }
        return;
      }

      const struck: Enemy[] = [target];
      let current = target;
      let power = damage;
      this.beams.push({
        ax: cx,
        ay: cy,
        bx: target.x,
        by: target.y,
        life: 0.24,
        span: 0.24,
        delay: 0,
        hop: 0,
        seed: Math.random(),
        level: build.level,
      });
      this.ignite(target, burnFor, 0);
      this.hit(target, power, true);
      this.emit({ type: 'chain' });
      for (let hop = 1; hop < chain; hop += 1) {
        let next: Enemy | null = null;
        let bestDist = 1.85;
        for (const enemy of this.enemies) {
          if (enemy.dead || struck.includes(enemy)) continue;
          const d = Math.hypot(enemy.x - current.x, enemy.y - current.y);
          if (d < bestDist) {
            bestDist = d;
            next = enemy;
          }
        }
        if (!next) break;
        power *= 0.7;
        // 피해는 바로 들어가지만, 그림은 한 마리씩 차례로 옮겨붙는 것처럼 늦춰 보여준다.
        const delay = hop * HOP_DELAY;
        this.beams.push({
          ax: current.x,
          ay: current.y,
          bx: next.x,
          by: next.y,
          life: 0.3,
          span: 0.3,
          delay,
          hop,
          seed: Math.random(),
          level: build.level,
        });
        this.ignite(next, burnFor, delay);
        this.hit(next, power, true);
        this.emit({ type: 'chain' });
        struck.push(next);
        current = next;
      }
      return;
    }

    const speed = build.kind === 'cannon' ? 7 : 11;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const len = Math.max(0.0001, Math.hypot(dx, dy));
    if (build.kind !== 'cannon') this.emit({ type: 'shotArrow' });
    if (build.kind === 'cannon') {
      this.emit({ type: 'shotCannon' });
      // 포구 화염과 화약 연기
      const mx = cx + (dx / len) * 0.38;
      const my = cy + (dy / len) * 0.38;
      const dir = Math.atan2(dy, dx);
      this.burst(mx, my, 1, 'flash', FX.flash, {
        speed: [0, 0],
        size: [0.32 + build.level * 0.05, 0.32 + build.level * 0.05],
        life: [0.1, 0.1],
      });
      this.burst(mx, my, 3 + build.level, 'smoke', FX.smoke, {
        speed: [0.4, 1.1],
        size: [0.1, 0.17],
        life: [0.5, 0.9],
        drag: 2.5,
        dir,
        arc: 0.5,
      });
    }
    this.shots.push({
      kind: build.kind,
      level: build.level,
      x: cx,
      y: cy,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      speed,
      targetId: target.id,
      damage,
      splash: towerSplash(build.kind, build.level) * splashMul,
      pierceArmor: def.pierceArmor,
      color: def.color,
      life: range / speed + 0.9,
    });
  }

  /**
   * 스킬이 발동할 때 공통으로 붙는 이름표·불꽃·소리 — 평소 한 발과는 다르다는 걸
   * 한눈에 알리려고, 무기색 고리 위에 스킬 버튼과 같은 금박색 고리를 한 번 더
   * 겹쳐 퍼뜨리고, 섬광과 흔들림을 살짝 더한다.
   */
  private announceSkill(build: Build): void {
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    const color = BUILDS[build.kind].color;
    this.pushNote(cx, cy - 0.55, SKILLS[build.kind].name + '!', color, true);

    this.rings.push({ x: cx, y: cy, r: 0.08, max: 0.75, life: 0.38, color });
    this.rings.push({ x: cx, y: cy, r: 0.08, max: 1.05, life: 0.54, color: FX.gild });

    this.burst(cx, cy, 1, 'flash', FX.white, {
      speed: [0, 0],
      size: [0.5, 0.5],
      life: [0.13, 0.13],
    });
    this.burst(cx, cy, 14, 'spark', color, {
      speed: [1.6, 3.4],
      size: [0.032, 0.058],
      life: [0.24, 0.46],
      drag: 3,
    });
    this.burst(cx, cy, 10, 'spark', FX.gild, {
      speed: [1, 2.6],
      size: [0.022, 0.042],
      life: [0.3, 0.55],
      drag: 2.6,
      lift: 0.3,
    });

    this.shake = Math.max(this.shake, 0.3);
    this.emit({ type: 'skill', kind: build.kind });
  }

  /** 궁수대·천자총통·화차 3단계 스킬: 평소보다 세거나 많은, 혹은 동시에 여러 발을 쏜다. */
  private fireSkill(build: Build, target: Enemy, range: number): void {
    const skill = SKILLS[build.kind];
    if (build.kind === 'arrow') {
      // power 는 "보통 한 발만큼의 화살을 몇 발 더 쏘는지" — 한 발씩 나눠 쏜다.
      for (let i = 0; i < skill.power; i += 1) this.fire(build, target, range);
    } else if (build.kind === 'cannon') {
      this.fire(build, target, range, skill.power, 1.4);
    } else {
      // 화차: volley=true 로 넘겨 옆으로 옮겨붙는 평소 연쇄 대신 카트에서 여럿에게
      // 동시에 신기전을 쏘는 "일제 발사"로 발동한다.
      this.fire(build, target, range, skill.power, 1, true);
    }
    this.announceSkill(build);
  }

  /** 목책 3단계 스킬: 매복 찌르기 — 닿는 범위 안 모두에게 갑옷 무시 강타를 한 번에 꽂는다. */
  private wallSkill(build: Build): boolean {
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    let touched = false;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      if (dx * dx + dy * dy > WALL_REACH * WALL_REACH) continue;
      touched = true;
      const factor = enemy.kind === 'boss' ? WALL_BOSS_FACTOR : 1;
      this.hit(enemy, enemy.maxHp * SKILLS.wall.power * factor, true, true);
    }
    if (!touched) return false;
    build.pulse = 1;
    this.rings.push({
      x: cx,
      y: cy,
      r: WALL_REACH * 0.4,
      max: WALL_REACH * 1.4,
      life: 0.4,
      color: BUILDS.wall.color,
    });
    this.burst(cx, cy, 8, 'debris', FX.wood, {
      speed: [1, 2.2],
      size: [0.03, 0.06],
      life: [0.25, 0.45],
      drag: 4,
    });
    this.announceSkill(build);
    return true;
  }

  /** 마름쇠 3단계 스킬: 가시 폭발 — 사거리 안 모두에게 갑옷 무시 충격파를 한 번에 터뜨린다. */
  private caltropSkill(build: Build, range: number): boolean {
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    const burst = towerDamage('caltrop', build.level) * SKILLS.caltrop.power;
    let touched = false;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      if (dx * dx + dy * dy > range * range) continue;
      touched = true;
      this.hit(enemy, burst, true, true);
      if (enemy.slow < 0.7) enemy.slow = 0.7;
    }
    if (!touched) return false;
    build.pulse = 1;
    this.rings.push({
      x: cx,
      y: cy,
      r: range * 0.2,
      max: range,
      life: 0.4,
      color: BUILDS.caltrop.color,
    });
    this.burst(cx, cy, 12, 'spark', FX.steel, {
      speed: [1.6, 3.2],
      size: [0.03, 0.05],
      life: [0.2, 0.38],
      drag: 3,
    });
    this.announceSkill(build);
    return true;
  }

  private advance(enemy: Enemy, distance: number): void {
    let budget = distance;
    let guard = 0;
    while (budget > 0 && guard < 64) {
      guard += 1;
      if (enemy.node >= enemy.nodes.length) {
        if (enemy.leg >= CHECKPOINT_CELLS.length) {
          this.leak(enemy);
          return;
        }
        enemy.leg += 1;
        this.repath(enemy);
        if (enemy.nodes.length === 0) return;
      }
      const node = enemy.nodes[enemy.node]!;
      const dx = node.x - enemy.x;
      const dy = node.y - enemy.y;
      const gap = Math.hypot(dx, dy);
      if (gap <= 0.0001) {
        enemy.node += 1;
        continue;
      }
      enemy.angle = Math.atan2(dy, dx);
      if (gap <= budget) {
        enemy.x = node.x;
        enemy.y = node.y;
        enemy.travelled += gap;
        budget -= gap;
        enemy.node += 1;
        continue;
      }
      enemy.x += (dx / gap) * budget;
      enemy.y += (dy / gap) * budget;
      enemy.travelled += budget;
      budget = 0;
    }
  }

  private leak(enemy: Enemy): void {
    enemy.dead = true;
    this.leaks += 1;
    this.lives -= enemy.leak;
    this.combo = 0;
    this.coreFlash = 1;
    this.shake = 0.6;
    this.pushNote(EXIT.col + 0.5, EXIT.row - 0.4, '-' + enemy.leak, ENEMIES.boss.color, true);
    this.emit({ type: 'leak' });
  }

  update(dt: number): void {
    if (this.finished) {
      this.decay(dt);
      return;
    }

    this.simTime += dt;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 2);

    if (this.phase === 'break') {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) this.startWave();
    }

    if (this.phase === 'wave') {
      this.waveClock += dt;
      while (this.spawned < this.queue.length && this.queue[this.spawned]!.at <= this.waveClock) {
        this.spawn(this.queue[this.spawned]!.kind);
        this.spawned += 1;
      }
    }

    for (const enemy of this.enemies) enemy.slow = 0;

    for (const build of this.builds.values()) {
      const def = BUILDS[build.kind];
      build.pulse = Math.max(0, build.pulse - dt * 4);
      build.muzzle = Math.max(0, build.muzzle - dt * 8);
      build.hurt = Math.max(0, build.hurt - dt);

      if (build.kind === 'wall') {
        const thorn = wallThorn(build.level);
        if (thorn === 0) continue;
        const slow = wallSlow(build.level);
        const cx = build.col + 0.5;
        const cy = build.row + 0.5;
        let touched = false;
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          const dx = enemy.x - cx;
          const dy = enemy.y - cy;
          if (dx * dx + dy * dy > WALL_REACH * WALL_REACH) continue;
          touched = true;
          if (enemy.slow < slow) enemy.slow = slow;
          const factor = enemy.kind === 'boss' ? WALL_BOSS_FACTOR : 1;
          this.hit(enemy, enemy.maxHp * thorn * factor * dt, true, false);
          // 가시에 걸린 자리에서 나무 부스러기가 튄다
          if (Math.random() < dt * 4) {
            this.burst(enemy.x + enemy.kickX, enemy.y + enemy.kickY, 2, 'debris', FX.wood, {
              speed: [0.7, 1.5],
              size: [0.026, 0.042],
              life: [0.2, 0.35],
              dir: Math.atan2(enemy.y - cy, enemy.x - cx),
              arc: 0.8,
              drag: 5,
            });
          }
        }
        if (touched) build.pulse = Math.max(build.pulse, 0.4);
        if (build.skillUnlocked) {
          build.skillCooldown -= dt;
          if (build.skillCooldown <= 0 && this.wallSkill(build)) {
            build.skillCooldown = SKILLS.wall.cooldown;
          }
        }
        continue;
      }

      if (def.damage === 0 || build.broken) continue;
      const range = towerRange(build.kind, build.level);

      if (def.rate === 0) {
        const cx = build.col + 0.5;
        const cy = build.row + 0.5;
        let touched = false;
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          const dx = enemy.x - cx;
          const dy = enemy.y - cy;
          if (dx * dx + dy * dy > range * range) continue;
          touched = true;
          const slow = towerSlow(build.kind, build.level);
          if (enemy.slow < slow) enemy.slow = slow;
          this.hit(enemy, towerDamage(build.kind, build.level) * dt, def.pierceArmor, false);
          // 쇠가시를 밟은 발밑에서 쇳빛 불똥이 튄다
          if (Math.random() < dt * 5) {
            this.burst(
              enemy.x + enemy.kickX,
              enemy.y + enemy.kickY + enemy.radius * 0.5,
              1 + build.level,
              'spark',
              FX.steel,
              {
                speed: [0.6, 1.5],
                size: [0.024, 0.036],
                life: [0.14, 0.26],
                dir: -Math.PI / 2,
                arc: 1.2,
                drag: 5,
              },
            );
          }
        }
        if (touched) build.pulse = Math.max(build.pulse, 0.4);
        if (build.skillUnlocked) {
          build.skillCooldown -= dt;
          if (build.skillCooldown <= 0 && this.caltropSkill(build, range)) {
            build.skillCooldown = SKILLS.caltrop.cooldown;
          }
        }
        continue;
      }

      build.cooldown -= dt;
      if (build.skillUnlocked) build.skillCooldown -= dt;
      const target = this.findTarget(build, range);
      if (!target) continue;
      build.angle = Math.atan2(target.y - (build.row + 0.5), target.x - (build.col + 0.5));
      if (build.cooldown <= 0) {
        build.cooldown = 1 / towerRate(build.kind, build.level);
        this.fire(build, target, range);
      }
      if (build.skillUnlocked && build.skillCooldown <= 0) {
        build.skillCooldown = SKILLS[build.kind].cooldown;
        this.fireSkill(build, target, range);
      }
    }

    for (const shot of this.shots) {
      const target = this.enemies.find((e) => e.id === shot.targetId && !e.dead);
      if (target) {
        const dx = target.x - shot.x;
        const dy = target.y - shot.y;
        const len = Math.max(0.0001, Math.hypot(dx, dy));
        shot.vx = (dx / len) * shot.speed;
        shot.vy = (dy / len) * shot.speed;
        if (len < 0.2) {
          shot.life = -1;
          this.impact(shot, target);
          continue;
        }
      }
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }
    this.shots = this.shots.filter((shot) => shot.life > 0);

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      const slow = enemy.slow * (1 - enemy.slowResist);
      this.advance(enemy, enemy.baseSpeed * (1 - slow) * dt);
      if (!enemy.dead) this.siege(enemy, dt);
    }

    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    this.decay(dt);

    if (this.lives <= 0) {
      this.lives = 0;
      this.phase = 'over';
      this.emit({ type: 'gameOver' });
      return;
    }

    if (this.phase === 'wave' && this.spawned >= this.queue.length && this.enemies.length === 0) {
      this.score += this.wave * SCORE.waveClear;
      this.gold += waveClearGold(this.wave);
      this.pushNote(
        EXIT.col + 0.5,
        EXIT.row - 1.2,
        this.wave + '차 공세 격퇴 +' + waveClearGold(this.wave),
        BUILDS.caltrop.color,
        true,
      );
      if (this.wave >= TOTAL_WAVES) {
        this.score += SCORE.victory + Math.floor(this.gold) * SCORE.victoryGold;
        this.score += this.lives * SCORE.livesLeft;
        this.phase = 'win';
        this.emit({ type: 'victory' });
        return;
      }
      this.emit({ type: 'waveClear', wave: this.wave });
      this.wave += 1;
      this.phase = 'break';
      this.breakLeft = BREAK_SECONDS;
    }
  }

  private impact(shot: Shot, target: Enemy): void {
    const heading = Math.atan2(shot.vy, shot.vx);
    if (shot.splash > 0) {
      // 천자총통 착탄: 섬광 → 충격파 → 흙파편·불똥·연기, 그리고 그을음 자국
      const lv = shot.level;
      this.rings.push({
        x: shot.x,
        y: shot.y,
        r: 0.1,
        max: shot.splash,
        life: 0.3,
        color: shot.color,
      });
      this.burst(shot.x, shot.y, 1, 'flash', FX.flash, {
        speed: [0, 0],
        size: [shot.splash * 0.9, shot.splash * 0.9],
        life: [0.16, 0.16],
      });
      this.burst(shot.x, shot.y, 6 + lv * 2, 'debris', FX.dirtLit, {
        speed: [1.4, 3.2],
        size: [0.07, 0.12],
        life: [0.35, 0.6],
        drag: 3.5,
        lift: 0.6,
      });
      this.burst(shot.x, shot.y, 4 + lv, 'debris', FX.clod, {
        speed: [1, 2.6],
        size: [0.08, 0.13],
        life: [0.4, 0.65],
        drag: 3,
        lift: 0.8,
      });
      this.burst(shot.x, shot.y, 6 + lv * 2, 'spark', FX.flash, {
        speed: [2.2, 4.6],
        size: [0.035, 0.055],
        life: [0.18, 0.34],
        drag: 4,
      });
      this.burst(shot.x, shot.y, 3 + lv, 'smoke', FX.smoke, {
        speed: [0.2, 0.7],
        size: [0.18, 0.28],
        life: [0.7, 1.1],
        drag: 2,
      });
      this.scorches.push({ x: shot.x, y: shot.y, r: shot.splash * 0.5, life: 1.8, span: 1.8 });
      if (this.scorches.length > 24) this.scorches.shift();
      this.shake = Math.max(this.shake, 0.1 + lv * 0.04);

      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.ignoresWalls) continue;
        const d = Math.hypot(enemy.x - shot.x, enemy.y - shot.y);
        if (d > shot.splash) continue;
        this.kick(
          enemy,
          enemy.x - shot.x || 0.01,
          enemy.y - shot.y,
          0.05 + 0.12 * (1 - d / shot.splash),
        );
        this.hit(enemy, shot.damage * (1 - (d / shot.splash) * 0.45), shot.pierceArmor);
      }
      return;
    }
    // 궁수대 명중: 흰 섬광, 뒤로 튀는 화살대 조각, 맞은 방향으로 밀리는 반동
    this.rings.push({ x: shot.x, y: shot.y, r: 0.06, max: 0.3, life: 0.18, color: shot.color });
    this.burst(shot.x, shot.y, 1, 'flash', FX.white, {
      speed: [0, 0],
      size: [0.22 + shot.level * 0.03, 0.22 + shot.level * 0.03],
      life: [0.08, 0.08],
    });
    this.burst(shot.x, shot.y, 2 + shot.level, 'debris', FX.wood, {
      speed: [1, 2.2],
      size: [0.03, 0.05],
      life: [0.25, 0.4],
      drag: 4,
      dir: heading + Math.PI,
      arc: 0.9,
    });
    this.kick(target, shot.vx, shot.vy, 0.06 + shot.level * 0.015);
    this.hit(target, shot.damage, shot.pierceArmor);
  }

  private ignite(enemy: Enemy, duration: number, delay: number): void {
    enemy.burnDelay = enemy.burn > 0 ? 0 : delay;
    enemy.burn = Math.max(enemy.burn, duration);
  }

  private decay(dt: number): void {
    // 콤보는 늘어날 땐 바로 따라가고("잡았다" 반응이 늦으면 안 된다), 끊기면
    // "콤보 끊김" 같은 문구 없이 그 자리에서 0.4초쯤에 걸쳐 스스로 옅어지며 줄어든다.
    if (this.combo >= this.comboEcho) {
      this.comboEcho = this.combo;
    } else {
      this.comboEcho += (this.combo - this.comboEcho) * (1 - Math.exp(-dt / 0.4));
      if (this.comboEcho < 0.4) this.comboEcho = 0;
    }
    this.comboPulse = Math.max(0, this.comboPulse - dt * 3.2);

    for (const beam of this.beams) {
      if (beam.delay > 0) beam.delay -= dt;
      else beam.life -= dt;
    }
    this.beams = this.beams.filter((beam) => beam.life > 0);
    const settle = Math.exp(-14 * dt);
    for (const enemy of this.enemies) {
      if (enemy.burnDelay > 0) enemy.burnDelay -= dt;
      else if (enemy.burn > 0) enemy.burn -= dt;
      enemy.kickX *= settle;
      enemy.kickY *= settle;
    }
    for (const p of this.particles) {
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const scorch of this.scorches) scorch.life -= dt;
    this.scorches = this.scorches.filter((scorch) => scorch.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      ring.r += (ring.max - ring.r) * Math.min(1, dt * 9);
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);
    for (const note of this.notes) {
      note.life -= dt;
      note.y -= dt * 0.6;
    }
    this.notes = this.notes.filter((note) => note.life > 0);
  }
}
