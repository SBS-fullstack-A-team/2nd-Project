import {
  BREAK_SECONDS,
  BUILDS,
  ENEMIES,
  ENTRY,
  EXIT,
  MAX_LEVEL,
  PRE_WAVE_SECONDS,
  ROWS,
  SCORE,
  START_GOLD,
  START_LIVES,
  TOTAL_WAVES,
  buildWave,
  comboMultiplier,
  hpScale,
  isBossWave,
  rewardScale,
  towerChain,
  towerDamage,
  towerRange,
  towerRate,
  towerSlow,
  towerSplash,
  upgradeCost,
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
  | { type: 'chain' }
  | { type: 'kill'; kind: EnemyKind }
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
  angle: number;
  pulse: number;
  muzzle: number;
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

export type BuildRefusal = 'occupied' | 'reserved' | 'funds' | 'seal' | 'trap' | 'closed';

export const REFUSAL_TEXT: Record<BuildRefusal, string> = {
  occupied: '그 칸에는 이미 무언가 있습니다.',
  reserved: '왜군 상륙 지점, 성문, 경유지에는 세울 수 없습니다.',
  funds: '군자금이 부족합니다.',
  seal: '길을 완전히 막는 배치입니다. 한 칸은 비워 두세요.',
  trap: '이미 들어온 왜군의 길이 끊깁니다.',
  closed: '이번 판은 끝났습니다.',
};

const ENTRY_CELL = index(ENTRY.col, ENTRY.row);
const EXIT_CELL = index(EXIT.col, EXIT.row);
const OFF_EXIT: Point = { x: EXIT.col + 0.5, y: ROWS + 0.6 };

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
      angle: -Math.PI / 2,
      pulse: 1,
      muzzle: 0,
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
    const cost = upgradeCost(build.kind, build.level);
    if (this.gold < cost) {
      this.refusal = 'funds';
      return false;
    }
    this.gold -= cost;
    build.level += 1;
    build.invested += cost;
    build.pulse = 1;
    return true;
  }

  sell(col: number, row: number): boolean {
    this.refusal = null;
    const cell = index(col, row);
    const build = this.builds.get(cell);
    if (!build || this.finished) return false;
    this.gold += Math.floor(build.invested * 0.6);
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
      baseSpeed: def.speed,
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

  private hit(enemy: Enemy, amount: number, pierceArmor: boolean): void {
    if (enemy.dead) return;
    const effective = pierceArmor ? amount : Math.max(1, amount - enemy.armor);
    enemy.hp -= effective;
    enemy.hitFlash = 0.14;
    if (enemy.hp > 0) return;

    enemy.dead = true;
    this.kills += 1;
    this.combo += 1;
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

  private fire(build: Build, target: Enemy, range: number): void {
    const def = BUILDS[build.kind];
    const cx = build.col + 0.5;
    const cy = build.row + 0.5;
    const damage = towerDamage(build.kind, build.level);
    build.pulse = 1;
    build.muzzle = 1;

    if (build.kind === 'hwacha') {
      const struck: Enemy[] = [target];
      let current = target;
      let power = damage;
      this.beams.push({
        ax: cx,
        ay: cy,
        bx: target.x,
        by: target.y,
        life: 0.16,
        seed: Math.random(),
        level: build.level,
      });
      this.hit(target, power, true);
      this.emit({ type: 'chain' });
      const chain = towerChain(build.kind, build.level);
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
        this.beams.push({
          ax: current.x,
          ay: current.y,
          bx: next.x,
          by: next.y,
          life: 0.16,
          seed: Math.random(),
          level: build.level,
        });
        this.hit(next, power, true);
        this.emit({ type: 'chain' });
        struck.push(next);
        current = next;
      }
      return;
    }

    if (build.kind === 'cannon') this.emit({ type: 'shotCannon' });
    const speed = build.kind === 'cannon' ? 7 : 11;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const len = Math.max(0.0001, Math.hypot(dx, dy));
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
      splash: towerSplash(build.kind, build.level),
      pierceArmor: def.pierceArmor,
      color: def.color,
      life: range / speed + 0.9,
    });
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
      if (def.damage === 0) continue;
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
          this.hit(enemy, towerDamage(build.kind, build.level) * dt, def.pierceArmor);
        }
        if (touched) build.pulse = Math.max(build.pulse, 0.4);
        continue;
      }

      build.cooldown -= dt;
      const target = this.findTarget(build, range);
      if (!target) continue;
      build.angle = Math.atan2(target.y - (build.row + 0.5), target.x - (build.col + 0.5));
      if (build.cooldown <= 0) {
        build.cooldown = 1 / towerRate(build.kind, build.level);
        this.fire(build, target, range);
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
        this.wave + '파 방어 +' + waveClearGold(this.wave),
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
    if (shot.splash > 0) {
      this.rings.push({
        x: shot.x,
        y: shot.y,
        r: 0.1,
        max: shot.splash,
        life: 0.3,
        color: shot.color,
      });
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.ignoresWalls) continue;
        const d = Math.hypot(enemy.x - shot.x, enemy.y - shot.y);
        if (d > shot.splash) continue;
        this.hit(enemy, shot.damage * (1 - (d / shot.splash) * 0.45), shot.pierceArmor);
      }
      return;
    }
    this.rings.push({ x: shot.x, y: shot.y, r: 0.05, max: 0.22, life: 0.16, color: shot.color });
    this.hit(target, shot.damage, shot.pierceArmor);
  }

  private decay(dt: number): void {
    for (const beam of this.beams) beam.life -= dt;
    this.beams = this.beams.filter((beam) => beam.life > 0);
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
