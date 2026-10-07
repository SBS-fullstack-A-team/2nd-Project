/**
 * 지렁이 아레나 시뮬레이션 — 화면과 떨어진 순수 계산.
 * 지렁이 이동·먹이·충돌·AI 를 고정 간격(TICK)으로 한 번씩 진행한다.
 */
import {
  ARENA_RADIUS,
  BOOST_COST,
  BOOST_COST_RATIO,
  BOOST_SPEED,
  BOOST_STAMINA,
  BOUNTY_MIN_MASS,
  BOUNTY_SWITCH_RATIO,
  BOT_COLORS,
  BOT_COUNT,
  BOT_LOOKAHEAD,
  BOT_MASS_MAX,
  BOT_MASS_MIN,
  BOT_NAMES,
  BOT_RESPAWN_DELAY,
  COWARD_SIGHT,
  DEATH_DROP_RATIO,
  EAT_RANGE,
  FEAST_COLOR,
  FEAST_COUNT,
  FEAST_FIRST,
  FEAST_INTERVAL,
  FEAST_LIFE,
  FEAST_RADIUS,
  FEAST_VALUE,
  FOOD_COLORS,
  FOOD_COUNT,
  FOOD_VALUE_MAX,
  FOOD_VALUE_MIN,
  GLUTTON_SIGHT,
  HUNTER_SIGHT,
  MAGNET_RANGE,
  MAX_SCORE,
  MIN_BOOST_MASS,
  POWERS,
  POWER_INTERVAL,
  POWER_LIFE,
  POWER_MAX,
  RADIUS_BASE,
  RADIUS_GROWTH,
  RADIUS_MAX,
  SAFE_SPAWN_DISTANCE,
  SEGMENTS_MAX,
  SEGMENTS_MIN,
  SEGMENTS_PER_MASS,
  SEGMENT_SPACING,
  SHIELD_GRACE,
  SPEED,
  STAMINA_REGEN,
  STAMINA_RESUME,
  STREAK_BONUS,
  STREAK_WINDOW,
  START_MASS,
  TURN_RATE,
  TRAITS,
  TURN_RATE_MIN,
  bountyReward,
  findPower,
  findTrait,
  type PowerKind,
  type TraitKind,
} from './config';

export interface Point {
  x: number;
  y: number;
}

export interface Food {
  x: number;
  y: number;
  value: number;
  color: string;
  /** 그릴 때 반지름 */
  r: number;
  /** 지렁이가 죽거나 가속하며 떨어뜨린 먹이 — 시간이 지나면 사라진다 */
  dropped: boolean;
  /** 남은 시간(초) — 떨어뜨린 먹이만 */
  life: number;
  eaten: boolean;
  /** 반짝임 위상 */
  phase: number;
  /** 황금 먹이 잔치에서 나온 먹이 */
  golden: boolean;
}

/** 플레이어 한 판 기록 — 업적 · 미션 계산용 */
export interface RunStats {
  /** 먹은 먹이 개수 */
  food: number;
  /** 먹은 황금 먹이 개수 */
  golden: number;
  /** 먹은 파워업 개수 */
  powerups: number;
  /** 대시 중에 쓰러뜨린 수 */
  dashKills: number;
  /** 가장 긴 연속 킬 */
  maxStreak: number;
  /** 방패가 막아 준 횟수 */
  shieldSaves: number;
  /** 잡은 현상금 지렁이 수 */
  bounties: number;
}

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
  /** 남은 시간(초) */
  life: number;
  phase: number;
}

export interface Worm {
  id: number;
  name: string;
  isPlayer: boolean;
  /** AI 성격 — 플레이어는 'normal' */
  trait: TraitKind;
  colors: readonly string[];
  /** segments[0] 이 머리 */
  segments: Point[];
  angle: number;
  /** 가고 싶은 방향 */
  targetAngle: number;
  mass: number;
  boosting: boolean;
  alive: boolean;
  kills: number;
  /** 가속하며 떨어뜨릴 먹이 누적량 */
  dropAcc: number;
  /** AI — 다음 판단까지 남은 시간 · 떠돌 방향 */
  think: number;
  wander: number;
  /** 파워업 남은 시간(초) — 0 이면 없음 */
  effects: Record<PowerKind, number>;
  /** 방패가 막아 준 뒤 잠깐 무적인 남은 시간(초) */
  grace: number;
  /** 대시 게이지(초) — 가속하면 줄고 쉬면 찬다 */
  stamina: number;
  /** 게이지를 다 써서 STAMINA_RESUME 만큼 찰 때까지 가속 못 함 */
  exhausted: boolean;
  /** 이번 칸에 실제로 가속했는지 (그리기 · 화면 표시용) */
  dashing: boolean;
}

export interface WorldEvents {
  /** 플레이어가 먹이를 먹었을 때 (먹은 양) */
  ate?: number;
  /** 플레이어가 다른 지렁이를 쓰러뜨렸을 때 그 이름 */
  killed?: string[];
  /** 플레이어가 죽었을 때 — 부딪힌 지렁이 이름 (벽이면 null) */
  died?: { by: string | null; byId: number | null };
  /** 지렁이가 쓰러진 자리 (화면 효과용) · 플레이어가 쓰러뜨렸는지 */
  bursts?: { x: number; y: number; color: string; byPlayer: boolean }[];
  /** 플레이어 연속 킬 — 2 이상일 때만, 보너스 길이와 함께 */
  streak?: { count: number; bonus: number };
  /** 플레이어가 먹은 파워업 */
  power?: PowerKind;
  /** 플레이어 방패가 부서지며 막아 줬다 */
  shieldSaved?: boolean;
  /** 황금 먹이 잔치가 열렸다 */
  feast?: Point;
  /** 새 현상금 지렁이 (표시 이름) */
  bounty?: string;
  /** 플레이어가 현상금 지렁이를 잡았다 */
  bountyClaimed?: { name: string; bonus: number };
}

/** 화면에 보여 줄 이름 — 성격 아이콘을 앞에 붙인다 */
export function displayName(w: Worm): string {
  const icon = findTrait(w.trait).icon;
  return icon ? `${icon} ${w.name}` : w.name;
}

export function radiusOf(mass: number): number {
  return Math.min(RADIUS_MAX, RADIUS_BASE + Math.sqrt(mass) * RADIUS_GROWTH);
}

function segmentCount(mass: number): number {
  return Math.max(SEGMENTS_MIN, Math.min(SEGMENTS_MAX, Math.round(mass * SEGMENTS_PER_MASS)));
}

function turnRateOf(mass: number): number {
  return Math.max(TURN_RATE_MIN, TURN_RATE - Math.sqrt(mass) * 0.06);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function pickTrait(): TraitKind {
  const total = TRAITS.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of TRAITS) {
    roll -= t.weight;
    if (roll < 0) return t.kind;
  }
  return 'normal';
}

/** -π ~ π 로 맞춘 각도 차이 */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 경기장 안 무작위 위치 (테두리에서 margin 만큼 안쪽) */
function randomInArena(margin: number): Point {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * (ARENA_RADIUS - margin);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

/* ---------- 공간 격자 — 가까운 것만 빠르게 찾기 ---------- */

const CELL = 96;

class Grid<T> {
  private cells = new Map<number, T[]>();

  private key(cx: number, cy: number): number {
    return (cx + 1000) * 4096 + (cy + 1000);
  }

  clear() {
    this.cells.clear();
  }

  add(x: number, y: number, item: T) {
    const k = this.key(Math.floor(x / CELL), Math.floor(y / CELL));
    let list = this.cells.get(k);
    if (!list) {
      list = [];
      this.cells.set(k, list);
    }
    list.push(item);
  }

  /** (x, y) 에서 range 안에 걸치는 칸의 항목들을 차례로 넘긴다 */
  query(x: number, y: number, range: number, fn: (item: T) => void) {
    const x0 = Math.floor((x - range) / CELL);
    const x1 = Math.floor((x + range) / CELL);
    const y0 = Math.floor((y - range) / CELL);
    const y1 = Math.floor((y + range) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const item of list) fn(item);
      }
    }
  }
}

interface SegRef {
  worm: Worm;
  index: number;
  x: number;
  y: number;
  r: number;
}

/* ---------- 월드 ---------- */

export class World {
  worms: Worm[] = [];
  food: Food[] = [];
  player: Worm;
  /** 플레이어가 가장 길었을 때 길이 */
  bestMass = START_MASS;
  /** 플레이어가 살아남은 시간(초) */
  time = 0;
  private nextId = 1;
  private segGrid = new Grid<SegRef>();
  private foodGrid = new Grid<Food>();
  private respawnTimers: number[] = [];
  powerups: PowerUp[] = [];
  private powerTimer = POWER_INTERVAL;
  /** 황금 먹이 잔치 자리 — 잔치 먹이가 남아 있는 동안만 */
  feast: Point | null = null;
  private feastTimer = FEAST_FIRST;
  /** 현상금이 걸린 AI 지렁이 id */
  bountyId: number | null = null;
  /** 플레이어 연속 킬 */
  streak = 0;
  private lastKillAt = -99;
  runStats: RunStats = {
    food: 0,
    golden: 0,
    powerups: 0,
    dashKills: 0,
    maxStreak: 0,
    shieldSaves: 0,
    bounties: 0,
  };

  constructor(playerColors: readonly string[]) {
    this.player = this.makeWorm('나', true, playerColors, { x: 0, y: 0 }, START_MASS);
    this.worms.push(this.player);
    for (let i = 0; i < BOT_COUNT; i++) this.spawnBot();
    for (let i = 0; i < FOOD_COUNT; i++) this.spawnFood();
  }

  private makeWorm(
    name: string,
    isPlayer: boolean,
    colors: readonly string[],
    at: Point,
    mass: number,
    trait: TraitKind = 'normal',
  ): Worm {
    const angle = Math.atan2(-at.y, -at.x) + rand(-0.8, 0.8);
    const r = radiusOf(mass);
    const spacing = r * SEGMENT_SPACING;
    const segments: Point[] = [];
    for (let i = 0; i < segmentCount(mass); i++) {
      segments.push({
        x: at.x - Math.cos(angle) * spacing * i,
        y: at.y - Math.sin(angle) * spacing * i,
      });
    }
    return {
      id: this.nextId++,
      name,
      isPlayer,
      trait,
      colors,
      segments,
      angle,
      targetAngle: angle,
      mass,
      boosting: false,
      alive: true,
      kills: 0,
      dropAcc: 0,
      think: 0,
      wander: angle,
      effects: { magnet: 0, turbo: 0, shield: 0, double: 0, ghost: 0 },
      grace: 0,
      stamina: BOOST_STAMINA,
      exhausted: false,
      dashing: false,
    };
  }

  private spawnBot() {
    let at = randomInArena(400);
    for (let tries = 0; tries < 20; tries++) {
      const head = this.player.segments[0]!;
      if (Math.hypot(at.x - head.x, at.y - head.y) > SAFE_SPAWN_DISTANCE) break;
      at = randomInArena(400);
    }
    // 작은 지렁이가 더 자주 나온다
    const mass = BOT_MASS_MIN + (BOT_MASS_MAX - BOT_MASS_MIN) * Math.random() ** 2;
    const used = new Set(this.worms.filter((w) => w.alive).map((w) => w.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    const name = pick(free.length > 0 ? free : BOT_NAMES);
    this.worms.push(
      this.makeWorm(name, false, pick(BOT_COLORS), at, Math.round(mass), pickTrait()),
    );
  }

  private addFood(
    x: number,
    y: number,
    value: number,
    dropped: boolean,
    color?: string,
    golden = false,
  ) {
    this.food.push({
      golden,
      x,
      y,
      value,
      color: color ?? pick(FOOD_COLORS),
      r: 3.5 + Math.sqrt(value) * 2,
      dropped,
      life: dropped ? rand(25, 40) : Infinity,
      eaten: false,
      phase: Math.random() * Math.PI * 2,
    });
  }

  private spawnPower() {
    const total = POWERS.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * total;
    let kind: PowerKind = 'magnet';
    for (const p of POWERS) {
      roll -= p.weight;
      if (roll < 0) {
        kind = p.kind;
        break;
      }
    }
    const at = randomInArena(200);
    this.powerups.push({
      id: this.nextId++,
      kind,
      x: at.x,
      y: at.y,
      life: POWER_LIFE,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /** 황금 먹이 잔치 — 경기장 한 곳에 큰 먹이 무더기 */
  private startFeast(): Point {
    const c = randomInArena(ARENA_RADIUS * 0.3);
    for (let i = 0; i < FEAST_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * FEAST_RADIUS;
      this.addFood(
        c.x + Math.cos(a) * d,
        c.y + Math.sin(a) * d,
        FEAST_VALUE,
        true,
        FEAST_COLOR,
        true,
      );
      this.food[this.food.length - 1]!.life = FEAST_LIFE;
    }
    this.feast = c;
    return c;
  }

  private spawnFood() {
    const p = randomInArena(30);
    this.addFood(p.x, p.y, Math.round(rand(FOOD_VALUE_MIN, FOOD_VALUE_MAX)), false);
  }

  /** 플레이어 조종 — 가고 싶은 방향과 가속 */
  steerPlayer(angle: number, boost: boolean) {
    this.player.targetAngle = angle;
    this.player.boosting = boost;
  }

  /** 한 칸(dt) 진행 — 플레이어에게 일어난 일을 돌려준다 */
  step(dt: number): WorldEvents {
    const ev: WorldEvents = {};
    if (this.player.alive) this.time += dt;

    for (const w of this.worms) {
      if (!w.alive) continue;
      for (const k of Object.keys(w.effects) as PowerKind[]) {
        if (w.effects[k] > 0) w.effects[k] = Math.max(0, w.effects[k] - dt);
      }
      w.grace = Math.max(0, w.grace - dt);
      if (!w.isPlayer) this.thinkBot(w, dt);
      this.move(w, dt);
    }

    // 충돌 격자 다시 만들기
    this.segGrid.clear();
    for (const w of this.worms) {
      if (!w.alive) continue;
      const r = radiusOf(w.mass);
      w.segments.forEach((s, index) =>
        this.segGrid.add(s.x, s.y, { worm: w, index, x: s.x, y: s.y, r }),
      );
    }

    // 머리 충돌 · 벽
    const dead: { worm: Worm; by: Worm | null }[] = [];
    for (const w of this.worms) {
      if (!w.alive) continue;
      const head = w.segments[0]!;
      const r = radiusOf(w.mass);
      const dist = Math.hypot(head.x, head.y);
      if (dist + r > ARENA_RADIUS) {
        if (w.grace > 0 || this.useShield(w, ev)) {
          // 방패가 벽에서 튕겨 낸다
          const k = (ARENA_RADIUS - r - 4) / dist;
          head.x *= k;
          head.y *= k;
          w.angle = Math.atan2(-head.y, -head.x);
          w.targetAngle = w.angle;
          continue;
        }
        dead.push({ worm: w, by: null });
        continue;
      }
      // 유령이거나 방패 직후에는 다른 몸을 통과한다
      if (w.effects.ghost > 0 || w.grace > 0) continue;
      const hit: { by: Worm | null } = { by: null };
      this.segGrid.query(head.x, head.y, r + RADIUS_MAX, (s) => {
        if (hit.by || s.worm === w) return;
        const reach = r * 0.7 + s.r;
        const dx = s.x - head.x;
        const dy = s.y - head.y;
        if (dx * dx + dy * dy < reach * reach) hit.by = s.worm;
      });
      if (hit.by && !this.useShield(w, ev)) dead.push({ worm: w, by: hit.by });
    }
    for (const { worm, by } of dead) {
      if (!worm.alive) continue;
      const head = worm.segments[0]!;
      (ev.bursts ??= []).push({
        x: head.x,
        y: head.y,
        color: worm.colors[0]!,
        byPlayer: !!by?.isPlayer,
      });
      // 현상금 지렁이 — 플레이어가 잡으면 보너스 길이, 누가 잡든 현상금은 다음 지렁이로
      if (worm.id === this.bountyId) {
        if (by?.isPlayer) {
          const bonus = bountyReward(worm.mass);
          by.mass += bonus;
          this.runStats.bounties += 1;
          ev.bountyClaimed = { name: displayName(worm), bonus };
        }
        this.bountyId = null;
      }
      this.kill(worm);
      if (by) by.kills += 1;
      if (worm.isPlayer) ev.died = { by: by ? displayName(by) : null, byId: by ? by.id : null };
      else if (by?.isPlayer) {
        (ev.killed ??= []).push(displayName(worm));
        // 연속 킬 — 짧은 시간 안에 또 쓰러뜨리면 보너스 길이
        this.streak = this.time - this.lastKillAt <= STREAK_WINDOW ? this.streak + 1 : 1;
        this.lastKillAt = this.time;
        this.runStats.maxStreak = Math.max(this.runStats.maxStreak, this.streak);
        if (by.dashing) this.runStats.dashKills += 1;
        if (this.streak >= 2) {
          const bonus = (this.streak - 1) * STREAK_BONUS;
          by.mass += bonus;
          ev.streak = { count: this.streak, bonus };
        }
      }
    }

    // 먹이 — 가까우면 끌려오고, 닿으면 먹는다
    this.foodGrid.clear();
    for (const f of this.food) if (!f.eaten) this.foodGrid.add(f.x, f.y, f);
    for (const w of this.worms) {
      if (!w.alive) continue;
      const head = w.segments[0]!;
      const r = radiusOf(w.mass);
      const range = EAT_RANGE * (w.effects.magnet > 0 ? MAGNET_RANGE : 1) + r;
      const mul = w.effects.double > 0 ? 2 : 1;
      this.foodGrid.query(head.x, head.y, range, (f) => {
        if (f.eaten) return;
        const dx = head.x - f.x;
        const dy = head.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d < r + 2) {
          f.eaten = true;
          w.mass += f.value * mul;
          if (w.isPlayer) {
            ev.ate = (ev.ate ?? 0) + f.value * mul;
            this.runStats.food += 1;
            if (f.golden) this.runStats.golden += 1;
          }
        } else if (d < range) {
          const pull = Math.min(1, (dt * 9 * (range - d)) / range + dt * 3);
          f.x += dx * pull;
          f.y += dy * pull;
        }
      });
    }

    // 파워업 — 머리가 닿으면 먹는다 (AI 도 먹는다)
    for (const pu of this.powerups) {
      pu.life -= dt;
      if (pu.life <= 0) continue;
      for (const w of this.worms) {
        if (!w.alive) continue;
        const head = w.segments[0]!;
        const reach = radiusOf(w.mass) + 18;
        if ((head.x - pu.x) ** 2 + (head.y - pu.y) ** 2 < reach * reach) {
          w.effects[pu.kind] = findPower(pu.kind).seconds;
          pu.life = 0;
          if (w.isPlayer) {
            ev.power = pu.kind;
            this.runStats.powerups += 1;
          }
          break;
        }
      }
    }
    this.powerups = this.powerups.filter((pu) => pu.life > 0);
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      this.powerTimer = POWER_INTERVAL;
      if (this.powerups.length < POWER_MAX) this.spawnPower();
    }

    // 황금 먹이 잔치
    this.feastTimer -= dt;
    if (this.feastTimer <= 0) {
      this.feastTimer = FEAST_INTERVAL;
      ev.feast = this.startFeast();
    }

    // 떨어뜨린 먹이는 시간이 지나면 사라지고, 기본 먹이는 다시 채운다
    let natural = 0;
    this.food = this.food.filter((f) => {
      if (f.eaten) return false;
      if (f.dropped) {
        f.life -= dt;
        return f.life > 0;
      }
      natural += 1;
      return true;
    });
    for (let i = natural; i < FOOD_COUNT; i++) this.spawnFood();
    if (this.feast && !this.food.some((f) => f.golden)) this.feast = null;

    // 죽은 AI 는 잠시 뒤 새로
    this.worms = this.worms.filter((w) => w.alive || w.isPlayer);
    const bots = this.worms.filter((w) => !w.isPlayer).length;
    while (this.respawnTimers.length < BOT_COUNT - bots) this.respawnTimers.push(BOT_RESPAWN_DELAY);
    this.respawnTimers = this.respawnTimers
      .map((t) => t - dt)
      .filter((t) => {
        if (t > 0) return true;
        this.spawnBot();
        return false;
      });

    this.updateBounty(ev);

    if (this.player.alive) {
      this.bestMass = Math.min(MAX_SCORE, Math.max(this.bestMass, this.player.mass));
    }
    return ev;
  }

  /** 가장 긴 AI 에게 현상금 — 지금 대상보다 꽤 길어져야 옮겨 간다 */
  private updateBounty(ev: WorldEvents) {
    let top: Worm | null = null;
    for (const w of this.worms) {
      if (w.isPlayer || !w.alive) continue;
      if (!top || w.mass > top.mass) top = w;
    }
    const cur = this.bounty();
    if (cur && (!top || top === cur || top.mass < cur.mass * BOUNTY_SWITCH_RATIO)) return;
    const next = top && top.mass >= BOUNTY_MIN_MASS ? top : null;
    if (next?.id === this.bountyId) return;
    this.bountyId = next ? next.id : null;
    if (next) ev.bounty = displayName(next);
  }

  /** 현상금이 걸린 지렁이 (없으면 null) */
  bounty(): Worm | null {
    if (this.bountyId === null) return null;
    return this.worms.find((w) => w.id === this.bountyId && w.alive) ?? null;
  }

  /** 방패가 있으면 한 번 막아 주고 잠깐 무적 — 막았으면 true */
  private useShield(w: Worm, ev: WorldEvents): boolean {
    if (w.effects.shield <= 0) return false;
    w.effects.shield = 0;
    w.grace = SHIELD_GRACE;
    if (w.isPlayer) {
      ev.shieldSaved = true;
      this.runStats.shieldSaves += 1;
    }
    return true;
  }

  private move(w: Worm, dt: number) {
    // 돌기 — 한 번에 돌 수 있는 각도가 정해져 있다
    const turn = turnRateOf(w.mass) * dt;
    const d = angleDiff(w.angle, w.targetAngle);
    w.angle += Math.max(-turn, Math.min(turn, d));

    // 가속 — 길이를 깎아 뒤에 먹이로 떨어뜨린다
    // 터보는 게이지·길이를 쓰지 않는다. 아니면 게이지가 남아 있어야 가속
    const turbo = w.effects.turbo > 0;
    const boosting =
      turbo || (w.boosting && w.mass > MIN_BOOST_MASS && !w.exhausted && w.stamina > 0);
    w.dashing = boosting;
    const speed = boosting ? BOOST_SPEED : SPEED;
    if (boosting && !turbo) {
      w.stamina = Math.max(0, w.stamina - dt);
      if (w.stamina <= 0) w.exhausted = true;
    } else {
      w.stamina = Math.min(BOOST_STAMINA, w.stamina + STAMINA_REGEN * dt);
      if (w.exhausted && w.stamina >= BOOST_STAMINA * STAMINA_RESUME) w.exhausted = false;
    }
    if (boosting && !turbo) {
      // 길수록 한 번 가속이 비싸다
      const cost = Math.max(BOOST_COST, w.mass * BOOST_COST_RATIO) * dt;
      w.mass -= cost;
      w.dropAcc += cost;
      if (w.dropAcc >= 1.5) {
        const tail = w.segments[w.segments.length - 1]!;
        this.addFood(tail.x + rand(-4, 4), tail.y + rand(-4, 4), 1, true, w.colors[0]);
        w.dropAcc -= 1.5;
      }
    }

    const head = w.segments[0]!;
    head.x += Math.cos(w.angle) * speed * dt;
    head.y += Math.sin(w.angle) * speed * dt;

    // 마디가 앞 마디를 일정 간격으로 따라간다
    const spacing = radiusOf(w.mass) * SEGMENT_SPACING;
    for (let i = 1; i < w.segments.length; i++) {
      const prev = w.segments[i - 1]!;
      const cur = w.segments[i]!;
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist > spacing) {
        cur.x = prev.x + (dx / dist) * spacing;
        cur.y = prev.y + (dy / dist) * spacing;
      }
    }

    // 길이에 맞춰 마디 수 조절
    const want = segmentCount(w.mass);
    while (w.segments.length < want) {
      const tail = w.segments[w.segments.length - 1]!;
      w.segments.push({ x: tail.x, y: tail.y });
    }
    if (w.segments.length > want) w.segments.length = want;
  }

  /** 지렁이가 죽으면 몸이 큰 먹이로 변한다 */
  private kill(w: Worm) {
    w.alive = false;
    const total = w.mass * DEATH_DROP_RATIO;
    const step = Math.max(1, Math.floor(w.segments.length / 60));
    const pieces = Math.ceil(w.segments.length / step);
    const value = Math.max(1, total / pieces);
    const r = radiusOf(w.mass);
    for (let i = 0; i < w.segments.length; i += step) {
      const s = w.segments[i]!;
      this.addFood(
        s.x + rand(-r, r),
        s.y + rand(-r, r),
        Math.round(value * 10) / 10,
        true,
        w.colors[((i / 3) % w.colors.length) | 0],
      );
    }
  }

  /* ---------- AI ---------- */

  /** 앞쪽 방향 angle 로 dist 만큼 갔을 때 부딪힐 게 있는지 */
  private blocked(w: Worm, angle: number, dist: number): boolean {
    const head = w.segments[0]!;
    const r = radiusOf(w.mass);
    for (const k of [0.4, 0.75, 1]) {
      const x = head.x + Math.cos(angle) * dist * k;
      const y = head.y + Math.sin(angle) * dist * k;
      if (Math.hypot(x, y) + r + 20 > ARENA_RADIUS) return true;
      const hit = { found: false };
      this.segGrid.query(x, y, r + RADIUS_MAX, (s) => {
        if (hit.found) return;
        // 자기 몸은 머리 근처만 빼고 피한다
        if (s.worm === w && s.index < 12) return;
        const reach = r + s.r + 6;
        if ((s.x - x) ** 2 + (s.y - y) ** 2 < reach * reach) hit.found = true;
      });
      if (hit.found) return true;
    }
    return false;
  }

  private thinkBot(w: Worm, dt: number) {
    w.think -= dt;
    if (w.think > 0) return;
    w.think = rand(0.08, 0.16);
    const head = w.segments[0]!;
    // 겁쟁이는 더 멀리 내다보고 피한다
    const look = (BOT_LOOKAHEAD + radiusOf(w.mass) * 2) * (w.trait === 'coward' ? 1.3 : 1);

    // 1) 위험하면 가장 트인 쪽으로 피한다
    if (this.blocked(w, w.angle, look)) {
      w.boosting = false;
      for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
        const a = w.angle + off;
        if (!this.blocked(w, a, look)) {
          w.targetAngle = a;
          return;
        }
      }
      w.targetAngle = w.angle + Math.PI * 0.9;
      return;
    }

    // 2) 겁쟁이 — 나보다 큰 지렁이 머리가 가까우면 반대쪽으로 도망
    if (w.trait === 'coward') {
      let threat: Point | null = null;
      let best = COWARD_SIGHT;
      for (const o of this.worms) {
        if (o === w || !o.alive || o.mass < w.mass * 1.2) continue;
        const oh = o.segments[0]!;
        const d = Math.hypot(oh.x - head.x, oh.y - head.y);
        if (d < best) {
          best = d;
          threat = oh;
        }
      }
      if (threat) {
        const away = Math.atan2(head.y - threat.y, head.x - threat.x);
        // 벽으로 도망치다 죽지 않게 중심 쪽으로 조금 튼다
        const toCenter = Math.atan2(-head.y, -head.x);
        const far = Math.hypot(head.x, head.y) / ARENA_RADIUS;
        w.targetAngle = away + angleDiff(away, toCenter) * far * 0.5;
        w.boosting = best < COWARD_SIGHT * 0.7;
        return;
      }
    }

    // 3) 플레이어가 가까이 있고 내가 충분히 크면 앞을 막으러 간다 — 사냥꾼은 멀리서도, 작아도 덤빈다
    const p = this.player;
    const hunter = w.trait === 'hunter';
    const chases = hunter || w.trait === 'normal';
    const bigEnough = hunter
      ? w.mass > 30 && w.mass > p.mass * 0.4
      : w.mass > 50 && w.mass > p.mass * 0.7;
    if (chases && p.alive && bigEnough) {
      const ph = p.segments[0]!;
      const d = Math.hypot(ph.x - head.x, ph.y - head.y);
      if (d < (hunter ? HUNTER_SIGHT : 360) && Math.random() < (hunter ? 0.9 : 0.6)) {
        const ahead = 120 + radiusOf(p.mass) * 3;
        const tx = ph.x + Math.cos(p.angle) * ahead;
        const ty = ph.y + Math.sin(p.angle) * ahead;
        w.targetAngle = Math.atan2(ty - head.y, tx - head.x);
        w.boosting = hunter ? d < 380 && w.mass > 40 : d < 260 && w.mass > 80;
        return;
      }
    }
    w.boosting = false;

    // 4) 가까운 파워업은 꼭 챙긴다 — 먹보는 멀리 있어도 달려간다
    const glutton = w.trait === 'glutton';
    const sight = glutton ? GLUTTON_SIGHT : 260;
    const near = this.powerups.find(
      (pu) => (pu.x - head.x) ** 2 + (pu.y - head.y) ** 2 < sight * sight,
    );
    if (near) {
      w.targetAngle = Math.atan2(near.y - head.y, near.x - head.x);
      w.boosting = glutton && w.mass > 40 && Math.random() < 0.3;
      return;
    }

    // 5) 황금 먹이 잔치가 열리면 멀리서도 몰려간다 (셋 중 둘, 먹보는 전부 · 경기장 끝에서도)
    if (this.feast && (glutton || w.id % 3 !== 0)) {
      const d = Math.hypot(this.feast.x - head.x, this.feast.y - head.y);
      if (d > FEAST_RADIUS * 0.6 && d < (glutton ? ARENA_RADIUS * 2 : 1500)) {
        w.targetAngle = Math.atan2(this.feast.y - head.y, this.feast.x - head.x);
        w.boosting =
          d > 400 && w.mass > (glutton ? 40 : 70) && Math.random() < (glutton ? 0.7 : 0.4);
        return;
      }
    }

    // 6) 근처에서 먹을 게 가장 많은 쪽으로
    const found: { food: Food | null; score: number } = { food: null, score: 0 };
    this.foodGrid.query(head.x, head.y, 320, (f) => {
      if (f.eaten) return;
      const d = Math.hypot(f.x - head.x, f.y - head.y);
      const ahead = Math.cos(angleDiff(w.angle, Math.atan2(f.y - head.y, f.x - head.x)));
      const score = (f.value * (1.4 + ahead)) / (d + 40);
      if (score > found.score) {
        found.score = score;
        found.food = f;
      }
    });
    const f = found.food;
    if (f) {
      w.targetAngle = Math.atan2(f.y - head.y, f.x - head.x);
      // 큰 먹이(죽은 지렁이)를 보면 가끔 서둘러 간다
      w.boosting =
        f.value >= 3 && w.mass > (glutton ? 40 : 60) && Math.random() < (glutton ? 0.6 : 0.3);
      return;
    }

    // 7) 할 게 없으면 어슬렁 — 중심 쪽으로 조금씩
    w.wander += rand(-0.5, 0.5);
    const toCenter = Math.atan2(-head.y, -head.x);
    const far = Math.hypot(head.x, head.y) / ARENA_RADIUS;
    w.targetAngle = w.wander + angleDiff(w.wander, toCenter) * far * 0.6;
  }

  /** 길이 순위 (살아 있는 지렁이) */
  ranking(): Worm[] {
    return this.worms.filter((w) => w.alive).sort((a, b) => b.mass - a.mass);
  }
}
