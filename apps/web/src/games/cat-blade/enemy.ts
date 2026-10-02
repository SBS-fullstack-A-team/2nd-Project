/**
 * 캣 블레이드 — 잡몹 (Enemy)
 * 모든 공격은 예고(windup, 노란 반짝임) → 공격 → 회복 순서라서 패링 타이밍을 읽을 수 있다.
 */
import { ARENA_L, ARENA_R, GRAVITY, GROUND_Y, type EnemyKind } from './config';
import { Projectile, type Damageable, type HitInfo, type World } from './entities';
import { drawMinion } from './renderEnemies';
import { approach, clamp, rand, type Rect } from './util';

interface EnemyStats {
  hp: number;
  w: number;
  h: number;
  speed: number;
  flyer: boolean;
  /** 예고 시간 */
  windup: number;
  /** 공격 후 빈틈 */
  recover: number;
}

const STATS: Record<EnemyKind, EnemyStats> = {
  pup: { hp: 50, w: 44, h: 34, speed: 150, flyer: false, windup: 0.5, recover: 0.5 },
  crow: { hp: 32, w: 36, h: 26, speed: 170, flyer: true, windup: 0.55, recover: 0.6 },
  ratbot: { hp: 60, w: 38, h: 46, speed: 110, flyer: false, windup: 0.45, recover: 0.4 },
  drone: { hp: 42, w: 40, h: 30, speed: 130, flyer: true, windup: 0.5, recover: 0.4 },
  shade: { hp: 72, w: 30, h: 56, speed: 190, flyer: false, windup: 0.42, recover: 0.45 },
  wisp: { hp: 46, w: 30, h: 30, speed: 90, flyer: true, windup: 0.6, recover: 0.5 },
};

type EState = 'spawn' | 'move' | 'windup' | 'attack' | 'recover' | 'stun' | 'hurt';

const SPAWN_SEC = 0.6;

export class Enemy implements Damageable {
  readonly isBoss = false;
  readonly kind: EnemyKind;
  private readonly stats: EnemyStats;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  facing = -1;
  state: EState = 'spawn';
  stateT = 0;
  private stunDur = 0;
  private cd: number;
  dead = false;
  flash = 0;
  private t = rand(0, 10);
  private hoverY: number;
  private group = new Set<object>();
  private willBlink = false;

  constructor(kind: EnemyKind, x: number, y: number) {
    this.kind = kind;
    this.stats = STATS[kind];
    this.x = x;
    this.y = y;
    this.hp = this.stats.hp;
    this.maxHp = this.stats.hp;
    this.cd = rand(0.8, 1.6);
    this.hoverY = y;
  }

  get flyer() {
    return this.stats.flyer;
  }

  hurtbox(): Rect {
    const { w, h } = this.stats;
    if (this.flyer) return { x: this.x - w / 2, y: this.y - h / 2, w, h };
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  /** 몸 가운데 (이펙트 위치) */
  centerY() {
    return this.flyer ? this.y : this.y - this.stats.h / 2;
  }

  canBeHit() {
    return !this.dead && this.state !== 'spawn';
  }

  takeHit(hit: HitInfo, _world: World): boolean {
    if (!this.canBeHit()) return false;
    this.hp -= hit.damage;
    this.flash = 1;
    this.vx = hit.dir * hit.knock * (this.flyer ? 0.7 : 1);
    if (hit.launch > 0) this.vy = -hit.launch * (this.flyer ? 0.4 : 1);
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    // 기절 중이 아니면 경직 — 돌진 중 약한 공격은 버틴다
    if (this.state !== 'stun' && (this.state !== 'attack' || hit.damage >= 14)) {
      this.state = 'hurt';
      this.stateT = 0;
    }
    return true;
  }

  stun(sec: number) {
    this.state = 'stun';
    this.stateT = 0;
    this.stunDur = sec;
  }

  parried(_world: World) {
    this.stun(1.6);
  }

  private enter(s: EState) {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, world: World) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.cd -= dt;
    const p = world.player;
    const dx = p.x - this.x;
    const adx = Math.abs(dx);
    const toward = dx >= 0 ? 1 : -1;
    const s = this.stats;

    switch (this.state) {
      case 'spawn':
        if (this.stateT >= SPAWN_SEC) this.enter('move');
        break;
      case 'hurt':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.22) this.enter('move');
        break;
      case 'stun':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= this.stunDur) {
          this.enter('move');
          this.cd = 0.8;
        }
        break;
      case 'move':
        this.facing = toward;
        this.moveAI(dt, world, dx, adx);
        break;
      case 'windup':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT < s.windup - 0.1) this.facing = toward;
        if (this.stateT >= s.windup) this.startAttack(world);
        break;
      case 'attack':
        this.updateAttack(dt, world);
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT >= s.recover) this.enter('move');
        break;
    }
    this.physics(dt);
  }

  private moveAI(dt: number, world: World, dx: number, adx: number) {
    const s = this.stats;
    const p = world.player;
    const accel = 900 * dt;
    switch (this.kind) {
      case 'pup': {
        this.vx = approach(this.vx, adx > 110 ? this.facing * s.speed : 0, accel);
        if (this.cd <= 0 && adx < 200 && Math.abs(p.y - this.y) < 90) this.enter('windup');
        break;
      }
      case 'crow': {
        const tx = p.x - Math.sign(dx || 1) * 150;
        this.vx = approach(this.vx, clamp((tx - this.x) * 2, -s.speed, s.speed), accel);
        if (this.cd <= 0 && adx < 320) this.enter('windup');
        break;
      }
      case 'ratbot': {
        let target = 0;
        if (adx < 220) target = -this.facing * s.speed;
        else if (adx > 380) target = this.facing * s.speed;
        this.vx = approach(this.vx, target, accel);
        if (this.cd <= 0 && adx < 560) this.enter('windup');
        break;
      }
      case 'drone': {
        const tx = clamp(p.x + (this.x < p.x ? -220 : 220), ARENA_L + 40, ARENA_R - 40);
        this.vx = approach(this.vx, clamp((tx - this.x) * 1.5, -s.speed, s.speed), accel);
        if (this.cd <= 0) this.enter('windup');
        break;
      }
      case 'shade': {
        this.vx = approach(this.vx, adx > 100 ? this.facing * s.speed : 0, accel * 1.4);
        if (this.cd <= 0) {
          if (adx < 140) {
            this.enter('windup');
          } else if (this.willBlink) {
            // 그림자 순간이동 — 플레이어 등 뒤로
            world.fx.smoke(this.x, this.y - 28, 8, 'rgba(90,40,140,1)');
            this.x = clamp(p.x - p.facing * 90, ARENA_L + 30, ARENA_R - 30);
            this.facing = p.x >= this.x ? 1 : -1;
            world.fx.smoke(this.x, this.y - 28, 8, 'rgba(90,40,140,1)');
            this.willBlink = false;
            this.enter('windup');
          }
        }
        break;
      }
      case 'wisp': {
        const tx = clamp(p.x + Math.sin(this.t * 0.8) * 220, ARENA_L + 40, ARENA_R - 40);
        this.vx = approach(this.vx, clamp((tx - this.x) * 1.2, -s.speed, s.speed), accel);
        if (this.cd <= 0) this.enter('windup');
        break;
      }
    }
  }

  private startAttack(world: World) {
    this.enter('attack');
    this.group = new Set();
    const p = world.player;
    switch (this.kind) {
      case 'pup':
        this.vx = this.facing * 620;
        world.sfx('roll');
        break;
      case 'crow': {
        const a = Math.atan2(p.y - 22 - this.y, p.x - this.x);
        this.vx = Math.cos(a) * 560;
        this.vy = Math.sin(a) * 560;
        break;
      }
      case 'ratbot':
        this.shoot(world, this.x + this.facing * 26, this.y - 24, 360, '#ff5a3a', [0]);
        break;
      case 'drone':
        this.shoot(world, this.x, this.y + 18, 380, '#28c8ff', [0]);
        break;
      case 'shade':
        this.vx = this.facing * 240;
        world.fx.slash(
          this.x + this.facing * 10,
          this.y - 30,
          this.facing,
          46,
          -2.2,
          1.0,
          '#b48aff',
          12,
          0.2,
        );
        world.sfx('slash');
        break;
      case 'wisp':
        this.shoot(world, this.x + this.facing * 12, this.y, 220, '#c84aff', [-0.28, 0, 0.28]);
        break;
    }
  }

  private shoot(
    world: World,
    x: number,
    y: number,
    speed: number,
    color: string,
    spreads: number[],
  ) {
    const p = world.player;
    const base = Math.atan2(p.y - 22 - y, p.x - x);
    for (const off of spreads) {
      const a = base + off;
      const pr = new Projectile('pellet', 'enemy', x, y, Math.cos(a) * speed, Math.sin(a) * speed, {
        r: 7,
        damage: 9,
        color,
        parryable: true,
        life: 3.5,
      });
      pr.source = this;
      world.addProjectile(pr);
    }
    world.fx.flare(x, y, 18, color, 0.15);
    world.sfx('neon');
  }

  private updateAttack(dt: number, world: World) {
    const hit = (
      shape: Rect | { x: number; y: number; r: number },
      damage: number,
      knock: number,
    ) => {
      world.addHitbox({
        team: 'enemy',
        shape: 'r' in shape ? { kind: 'circle', ...shape } : { kind: 'rect', ...shape },
        damage,
        dir: this.facing,
        knock,
        parryable: true,
        source: this,
        group: this.group,
        life: dt * 1.5,
      });
    };
    switch (this.kind) {
      case 'pup': {
        hit({ x: this.x + this.facing * 8 - 25, y: this.y - 34, w: 50, h: 30 }, 10, 260);
        if (this.stateT >= 0.26) this.endAttack(rand(1.2, 1.8));
        break;
      }
      case 'crow': {
        hit({ x: this.x, y: this.y, r: 18 }, 9, 200);
        if (this.y >= GROUND_Y - 24 || this.stateT > 0.75) {
          this.vy = 0;
          this.vx *= 0.3;
          this.endAttack(rand(2, 2.6));
        }
        break;
      }
      case 'shade': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (this.stateT < 0.12) {
          const x = this.facing > 0 ? this.x : this.x - 84;
          hit({ x, y: this.y - 62, w: 84, h: 60 }, 12, 240);
        }
        if (this.stateT >= 0.16) {
          this.willBlink = Math.random() < 0.35;
          this.endAttack(rand(1.1, 1.6));
        }
        break;
      }
      default:
        // 원거리 몹은 발사하고 바로 회복
        if (this.stateT >= 0.05)
          this.endAttack(this.kind === 'wisp' ? rand(2.2, 3) : rand(1.6, 2.4));
        break;
    }
  }

  private endAttack(cd: number) {
    this.cd = cd;
    this.enter('recover');
  }

  private physics(dt: number) {
    const s = this.stats;
    if (this.flyer) {
      const diving = this.state === 'attack' && this.kind === 'crow';
      if (!diving) {
        const ty = this.hoverY + Math.sin(this.t * 2.2) * 10 + (this.state === 'windup' ? -16 : 0);
        this.vy = approach(this.vy, (ty - this.y) * 3, 1400 * dt);
      }
      if (this.state === 'hurt' || this.state === 'stun') this.vx *= Math.pow(0.9, dt * 60);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.y = clamp(this.y, 50, GROUND_Y - 16);
    } else {
      this.vy = Math.min(this.vy + GRAVITY * dt, 1000);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
      }
    }
    this.x = clamp(this.x, ARENA_L + s.w / 2, ARENA_R - s.w / 2);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.stats;
    drawMinion(ctx, {
      kind: this.kind,
      x: this.x,
      y: this.y,
      facing: this.facing,
      t: this.t,
      windup: this.state === 'windup' ? clamp(this.stateT / s.windup, 0, 1) : 0,
      attacking: this.state === 'attack',
      flash: this.flash,
      stunned: this.state === 'stun',
      spawn: this.state === 'spawn' ? clamp(this.stateT / SPAWN_SEC, 0, 1) : 1,
      moving: Math.abs(this.vx) > 20,
    });
  }

  /** HP 바 (맞은 적만) */
  drawHp(ctx: CanvasRenderingContext2D) {
    if (this.hp >= this.maxHp || this.dead) return;
    const hb = this.hurtbox();
    const w = 36;
    const x = this.x - w / 2;
    const y = hb.y - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#ff4a5a';
    ctx.fillRect(x, y, w * clamp(this.hp / this.maxHp, 0, 1), 3);
  }
}
