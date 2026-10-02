/**
 * 캣 블레이드 — 보스 3종 (각 2페이즈)
 *
 * 패턴은 제너레이터로 쓴다: yield N = N초 기다림, yield 0 = 다음 프레임.
 * 패링하면 패링 게이지(posture)가 쌓이고, 가득 차면 BREAK — 한동안 기절하며 1.5배 피해를 받는다.
 * 돌진·근접 공격(노란 반짝임)은 패링하면 짧게 경직된다.
 */
import { ARENA_L, ARENA_R, GRAVITY, GROUND_Y, STEP, VIEW_W } from './config';
import {
  Beam,
  Hazard,
  Projectile,
  type Damageable,
  type HitInfo,
  type ProjKind,
  type World,
} from './entities';
import { drawCatKing, drawHound, drawMechaRat } from './renderBosses';
import type { BossView } from './renderEnemies';
import { TAU, approach, clamp, easeOut, pick, rand, type Rect, type Shape } from './util';

type Gen = Generator<number, void, unknown>;

export abstract class Boss implements Damageable {
  readonly isBoss = true;
  abstract readonly name: string;
  abstract readonly english: string;
  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing = -1;
  readonly w: number;
  readonly h: number;
  hp: number;
  readonly maxHp: number;
  phase: 1 | 2 = 1;
  t = 0;
  protected dt = STEP;
  dead = false;
  flash = 0;
  stunT = 0;
  /** 패링 게이지 0~100 */
  posture = 0;
  invuln = true;
  /** 등장 연출 중 (HUD 에 이름 배너) */
  introducing = true;
  pose = 'idle';
  poseT = 0;
  windup = 0;
  scale = 1;
  alpha = 1;
  flying = false;
  onGround = true;
  /** 쓰러진 뒤 경과 시간 (엔진이 올린다) */
  defeatT = 0;

  private gen: Gen | null = null;
  private genWait = 0;
  private rest = 0;
  private started = false;
  protected group = new Set<object>();
  private last = '';
  /** 지금 공격이 패링당하면 짧게 경직되는지 */
  protected staggerable = false;

  constructor(maxHp: number, x: number, w: number, h: number) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.x = x;
    this.w = w;
    this.h = h;
  }

  /* ---------------- Damageable ---------------- */

  hurtbox(): Rect {
    const w = this.w * this.scale;
    const h = this.h * this.scale;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  canBeHit() {
    return !this.dead && !this.invuln;
  }

  /** 고양이 왕의 반격 자세처럼 공격을 막아 내면 true */
  protected deflect(_hit: HitInfo, _world: World): boolean {
    return false;
  }

  takeHit(hit: HitInfo, world: World): boolean {
    if (!this.canBeHit()) return false;
    if (this.deflect(hit, world)) return false;
    const mult = this.stunT > 0 ? 1.5 : 1;
    this.hp = Math.max(0, this.hp - hit.damage * mult);
    this.flash = 1;
    if (this.hp <= 0) {
      this.dead = true;
      this.gen = null;
      this.vx = 0;
      this.windup = 0;
      this.setPose('stun');
      return true;
    }
    this.addPosture(hit.damage * 0.08, world);
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this.startPhase2(world);
    return true;
  }

  parried(world: World) {
    const wasStaggerable = this.staggerable;
    this.addPosture(34, world);
    if (this.stunT <= 0 && wasStaggerable) this.stun(0.6);
  }

  private addPosture(n: number, world: World) {
    if (this.stunT > 0 || this.invuln) return;
    this.posture += n;
    if (this.posture >= 100) {
      this.posture = 0;
      this.stun(2.2);
      const hb = this.hurtbox();
      world.fx.text(this.x, hb.y - 20, 'BREAK!', '#fff27a', 34, 1.2);
      world.fx.ring(this.x, hb.y + hb.h / 2, 10, 180, '#fff27a', 0.5, 8);
      world.flash('#fff27a', 0.35);
      world.shake(10);
      world.sfx('break');
    }
  }

  stun(sec: number) {
    this.stunT = sec;
    this.gen = null;
    this.genWait = 0;
    this.vx = 0;
    this.windup = 0;
    this.staggerable = false;
    this.invuln = false;
    this.alpha = 1;
    this.flying = false;
    this.onStunned();
    this.setPose('stun');
  }

  /** 기절할 때 보스별 정리 (자세 해제 등) */
  protected onStunned() {}

  private startPhase2(world: World) {
    this.phase = 2;
    this.gen = this.transform(world);
    this.genWait = 0;
    this.stunT = 0;
    this.posture = 0;
    this.invuln = true;
    this.windup = 0;
    this.staggerable = false;
    this.vx = 0;
    world.clearEnemyProjectiles();
    world.sfx('roar');
    world.shake(14);
  }

  /* ---------------- 매 프레임 ---------------- */

  update(dt: number, world: World) {
    this.dt = dt;
    this.t += dt;
    this.poseT += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.dead) {
      this.vx = approach(this.vx, 0, 600 * dt);
      this.flying = false;
      this.physics(dt);
      return;
    }
    if (!this.started) {
      this.started = true;
      this.gen = this.intro(world);
      this.genWait = 0;
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx = approach(this.vx, 0, 1500 * dt);
      if (this.stunT <= 0) {
        this.setPose('idle');
        this.rest = 0.35;
      }
      this.physics(dt);
      return;
    }
    if (this.posture > 0) this.posture = Math.max(0, this.posture - dt * 4);

    if (this.gen) {
      this.genWait -= dt;
      if (this.genWait <= 0) {
        const r = this.gen.next();
        if (r.done) {
          this.gen = null;
          this.staggerable = false;
          this.windup = 0;
          this.invuln = false;
          this.introducing = false;
          this.alpha = 1;
          this.setPose('idle');
          this.rest = this.phase === 2 ? rand(0.35, 0.7) : rand(0.6, 1.1);
        } else {
          this.genWait = r.value;
        }
      }
    } else {
      this.rest -= dt;
      this.idle(dt, world);
      if (this.rest <= 0) {
        const list = this.patterns(world);
        const choices = list.length > 1 ? list.filter((n) => n !== this.last) : list;
        const name = pick(choices.length > 0 ? choices : list);
        this.last = name;
        this.gen = this.run(name, world);
        this.genWait = 0;
      }
    }
    this.physics(dt);
  }

  protected physics(dt: number) {
    if (!this.flying) this.vy = Math.min(this.vy + GRAVITY * dt, 1400);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      if (this.vy > 0) this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (!this.introducing) {
      const half = (this.w * this.scale) / 2;
      this.x = clamp(this.x, ARENA_L + half, ARENA_R - half);
    }
  }

  /* ---------------- 패턴 도우미 ---------------- */

  protected setPose(p: string) {
    if (this.pose !== p) {
      this.pose = p;
      this.poseT = 0;
    }
  }

  protected face(world: World) {
    this.facing = world.player.x >= this.x ? 1 : -1;
  }

  protected newAttack() {
    this.group = new Set();
  }

  /** 이번 프레임에만 살아 있는 공격 판정 */
  protected hit(
    world: World,
    shape: Shape,
    damage: number,
    opts: { parryable?: boolean; knock?: number; launch?: number } = {},
  ) {
    world.addHitbox({
      team: 'enemy',
      shape,
      damage,
      dir: this.facing,
      knock: opts.knock ?? 300,
      launch: opts.launch ?? 0,
      parryable: opts.parryable ?? false,
      source: this,
      group: this.group,
      life: this.dt * 1.5,
      kind: 'melee',
    });
  }

  /** 앞쪽 근접 판정 사각형 */
  protected front(reach: number, top: number, height: number, back = 0): Shape {
    const x = this.facing > 0 ? this.x - back : this.x - reach;
    return { kind: 'rect', x, y: this.y - top, w: reach + back, h: height };
  }

  protected shoot(
    world: World,
    kind: ProjKind,
    x: number,
    y: number,
    angle: number,
    speed: number,
    opts: { r: number; damage: number; color: string; parryable?: boolean; life?: number },
  ) {
    const p = new Projectile(
      kind,
      'enemy',
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      opts,
    );
    p.source = this;
    world.addProjectile(p);
    return p;
  }

  /** 땅을 타고 양옆으로 퍼지는 충격파 (점프로 넘는다, 패링 불가) */
  protected groundWaves(world: World, x: number, speed: number, color: string, damage: number) {
    for (const dir of [-1, 1]) {
      const p = this.shoot(
        world,
        'groundWave',
        x + dir * 40,
        GROUND_Y - 18,
        dir > 0 ? 0 : Math.PI,
        speed,
        {
          r: 18,
          damage,
          color,
          life: 2.6,
        },
      );
      p.grounded = true;
    }
  }

  /** 예고 (windup 0→1) — 패링 가능한 공격의 노란 반짝임 */
  protected *windupFor(sec: number): Gen {
    let t = 0;
    while (t < sec) {
      t += this.dt;
      this.windup = clamp(t / sec, 0, 1);
      yield 0;
    }
    this.windup = 0;
  }

  protected *moveTo(tx: number, ty: number, speed: number): Gen {
    for (let guard = 0; guard < 600; guard++) {
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) break;
      const s = Math.min(speed, d / this.dt);
      this.vx = (dx / d) * s;
      this.vy = (dy / d) * s;
      if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
      yield 0;
    }
    this.vx = 0;
    this.vy = 0;
  }

  protected *waitLand(maxSec: number): Gen {
    let t = 0;
    while (!this.onGround && t < maxSec) {
      t += this.dt;
      yield 0;
    }
  }

  view(): BossView {
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      t: this.t,
      pose: this.pose,
      poseT: this.poseT,
      phase: this.phase,
      flash: this.flash,
      windup: this.windup,
      scale: this.scale,
      alpha: this.alpha,
      stunned: this.stunT > 0,
    };
  }

  /* ---------------- 보스별 ---------------- */

  protected abstract intro(world: World): Gen;
  protected abstract transform(world: World): Gen;
  protected abstract patterns(world: World): string[];
  protected abstract run(name: string, world: World): Gen;
  protected abstract idle(dt: number, world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  /** 보스 테마 색 (HUD·이펙트) */
  abstract readonly color: string;
}

/* =========================================================
 * Stage 1 — 버려진 개집의 거대 들개 (Goliath Hound)
 * ========================================================= */

export class GoliathHound extends Boss {
  readonly name = '버려진 개집의 거대 들개';
  readonly english = 'GOLIATH HOUND';
  readonly color = '#ff5a3a';

  constructor() {
    super(1000, VIEW_W + 160, 150, 108);
  }

  protected *intro(world: World): Gen {
    this.facing = -1;
    this.setPose('walk');
    while (this.x > 740) {
      this.vx = -280;
      if (Math.random() < 0.3) world.fx.dust(this.x + 50, this.y, -1, 2);
      yield 0;
    }
    this.vx = 0;
    this.introducing = false;
    this.setPose('howl');
    world.sfx('roar');
    world.shake(10);
    world.fx.ring(this.x - 70, this.y - 90, 10, 220, '#ffd0a0', 0.6, 8);
    yield 1.3;
  }

  protected *transform(world: World): Gen {
    this.setPose('howl');
    world.flash('#ff2a2a', 0.5);
    world.fx.text(this.x, this.y - 170, '광폭화!', '#ff4a4a', 30, 1.4);
    for (let i = 0; i < 3; i++) {
      world.fx.ring(this.x, this.y - 70, 20, 260, '#ff2a2a', 0.6, 10);
      world.fx.burst(this.x, this.y - 70, '#ff3a3a', 20, 420, 12);
      world.sfx('roar');
      world.shake(10);
      yield 0.5;
    }
    yield 0.3;
  }

  protected idle(dt: number, world: World) {
    this.face(world);
    const dx = world.player.x - this.x;
    const adx = Math.abs(dx);
    const speed = this.phase === 2 ? 180 : 130;
    let target = 0;
    if (adx > 330) target = this.facing * speed;
    else if (adx < 170) target = -this.facing * speed * 0.6;
    this.vx = approach(this.vx, target, 900 * dt);
    this.setPose(Math.abs(this.vx) > 30 ? 'walk' : 'idle');
  }

  protected patterns(world: World): string[] {
    const near = Math.abs(world.player.x - this.x) < 250;
    if (this.phase === 1) return near ? ['charge', 'bark', 'bite'] : ['charge', 'bark'];
    return near ? ['charge', 'barrage', 'slam', 'bite'] : ['charge', 'barrage', 'slam', 'bark'];
  }

  protected run(name: string, world: World): Gen {
    switch (name) {
      case 'charge':
        return this.charge(world);
      case 'bark':
        return this.bark(world);
      case 'bite':
        return this.bite(world);
      case 'barrage':
        return this.barrage(world);
      default:
        return this.slam(world);
    }
  }

  /** 3연속 돌진 사냥 — 노란 반짝임에 패링하면 돌진이 끊긴다 */
  private *charge(world: World): Gen {
    const speed = this.phase === 2 ? 980 : 830;
    for (let i = 0; i < 3; i++) {
      this.face(world);
      this.setPose('crouch');
      this.staggerable = true;
      yield* this.windupFor(this.phase === 2 ? 0.4 : 0.55);
      this.setPose('charge');
      this.newAttack();
      world.sfx('roll');
      let t = 0;
      while (t < 1.4) {
        t += this.dt;
        this.vx = this.facing * speed;
        const hb = this.hurtbox();
        this.hit(
          world,
          { kind: 'rect', x: hb.x + 10, y: hb.y + 10, w: hb.w - 20, h: hb.h - 10 },
          16,
          {
            parryable: true,
            knock: 440,
          },
        );
        if (Math.random() < 0.4) world.fx.dust(this.x - this.facing * 50, this.y, this.facing, 2);
        const half = (this.w * this.scale) / 2;
        if (
          (this.facing > 0 && this.x >= ARENA_R - half - 2) ||
          (this.facing < 0 && this.x <= ARENA_L + half + 2)
        ) {
          break;
        }
        yield 0;
      }
      this.vx = 0;
      this.staggerable = false;
      this.setPose('skid');
      world.shake(6);
      world.fx.dust(this.x + this.facing * 60, this.y, -this.facing, 8);
      world.sfx('heavy');
      yield this.phase === 2 ? 0.22 : 0.32;
    }
  }

  /** 충격파 짖기 — 땅을 타는 파동 (점프로 넘는다) */
  private *bark(world: World): Gen {
    for (let i = 0; i < 2; i++) {
      this.face(world);
      this.setPose('rear');
      yield 0.5;
      this.setPose('bark');
      world.sfx('roar');
      world.shake(7);
      const mx = this.x + this.facing * 90;
      world.fx.ring(mx, this.y - 100, 10, 150, '#ffd0a0', 0.45, 6);
      world.fx.ring(mx, this.y - 100, 10, 100, '#ffffff', 0.3, 3);
      this.groundWaves(world, this.x, 430, '#ffb070', 14);
      yield 0.75;
    }
  }

  private *bite(world: World): Gen {
    this.face(world);
    this.setPose('crouch');
    this.staggerable = true;
    yield* this.windupFor(0.38);
    this.setPose('bite');
    this.newAttack();
    world.sfx('heavy');
    let t = 0;
    while (t < 0.22) {
      t += this.dt;
      this.vx = this.facing * 560;
      this.hit(world, this.front(130, 120, 84, -40), 18, { parryable: true, knock: 380 });
      yield 0;
    }
    this.vx = 0;
    this.staggerable = false;
    this.setPose('idle');
    yield 0.35;
  }

  /** 붉은 핏빛 탄막 사격 — 탄 하나하나를 패링으로 되받아칠 수 있다 */
  private *barrage(world: World): Gen {
    this.setPose('howl');
    world.sfx('roar');
    yield 0.45;
    for (let v = 0; v < 4; v++) {
      this.face(world);
      this.setPose('bark');
      const mx = this.x + this.facing * 95;
      const my = this.y - 90;
      const p = world.player;
      const base = Math.atan2(p.y - 22 - my, p.x - mx);
      const n = 7;
      const spread = 0.95;
      const offset = v % 2 ? spread / (n - 1) / 2 : 0;
      for (let i = 0; i < n; i++) {
        const a = base - spread / 2 + (i * spread) / (n - 1) + offset;
        this.shoot(world, 'blood', mx, my, a, 330, {
          r: 9,
          damage: 11,
          color: '#ff2a3a',
          parryable: true,
          life: 4,
        });
      }
      world.fx.flare(mx, my, 40, '#ff2a3a', 0.2);
      world.sfx('fire');
      yield 0.42;
    }
    this.setPose('idle');
    yield 0.3;
  }

  /** 360도 연속 내려찍기 — 플레이어 위치로 도약해 착지 충격 + 사방 탄막 */
  private *slam(world: World): Gen {
    for (let i = 0; i < 3; i++) {
      this.face(world);
      const half = (this.w * this.scale) / 2;
      const tx = clamp(world.player.x, ARENA_L + half, ARENA_R - half);
      this.setPose('leapPrep');
      world.fx.ring(tx, GROUND_Y - 4, 110, 30, '#ff3a3a', 0.55, 4);
      yield 0.34;
      this.setPose('leap');
      const air = 0.8;
      this.vy = (-GRAVITY * air) / 2;
      this.vx = (tx - this.x) / air;
      this.onGround = false;
      world.sfx('jump');
      yield 0.05;
      yield* this.waitLand(2);
      this.vx = 0;
      this.setPose('land');
      world.shake(13);
      world.sfx('boom');
      world.fx.ring(this.x, this.y - 6, 20, 220, '#ff3a3a', 0.45, 10);
      world.fx.shards(this.x, GROUND_Y, '#8a6a5a', 14, 460);
      this.newAttack();
      this.hit(world, { kind: 'circle', x: this.x, y: this.y - 40, r: 115 }, 22, {
        knock: 440,
        launch: 320,
      });
      const n = 16;
      for (let k = 0; k < n; k++) {
        const a = (k * TAU) / n + (i % 2 ? TAU / n / 2 : 0);
        this.shoot(world, 'blood', this.x, this.y - 70, a, 270, {
          r: 9,
          damage: 12,
          color: '#ff2a3a',
          parryable: true,
          life: 4,
        });
      }
      this.groundWaves(world, this.x, 470, '#ff6a4a', 14);
      yield 0.55;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawHound(ctx, this.view());
  }
}

/* =========================================================
 * Stage 2 — 강철 레이저 로봇 쥐 (Mecha Rat Prime)
 * ========================================================= */

export class MechaRatPrime extends Boss {
  readonly name = '강철 레이저 로봇 쥐';
  readonly english = 'MECHA RAT PRIME';
  readonly color = '#28c8ff';

  constructor() {
    super(1300, 760, 130, 104);
    this.y = -160;
    this.flying = true;
  }

  private get hoverY() {
    return this.phase === 2 ? GROUND_Y - 60 : GROUND_Y - 14;
  }

  protected *intro(world: World): Gen {
    this.flying = true;
    this.facing = -1;
    this.setPose('idle');
    yield* this.moveTo(760, GROUND_Y - 14, 520);
    this.introducing = false;
    world.shake(8);
    world.fx.dust(this.x - 40, GROUND_Y, -1, 8);
    world.fx.dust(this.x + 40, GROUND_Y, 1, 8);
    this.setPose('core');
    world.sfx('charge');
    world.fx.ring(this.x - 10, this.y - 54, 10, 200, '#28f0ff', 0.6, 6);
    yield 1.2;
  }

  protected *transform(world: World): Gen {
    this.flying = true;
    this.setPose('core');
    world.flash('#ffa02a', 0.5);
    world.fx.text(this.x, this.y - 170, 'OVERDRIVE!', '#ffa02a', 30, 1.4);
    yield* this.moveTo(this.x, GROUND_Y - 60, 300);
    for (let i = 0; i < 4; i++) {
      world.fx.sparks(this.x, this.y - 54, rand(0, TAU), Math.PI, '#ffd23a', 14, 520);
      world.fx.ring(this.x - 10, this.y - 54, 10, 200, '#ff7a2a', 0.5, 6);
      world.sfx('charge');
      world.shake(6);
      yield 0.4;
    }
  }

  protected onStunned() {
    // 기절하면 바닥으로 떨어진다 (idle 로 돌아오면 다시 떠오른다)
    this.vy = 0;
  }

  protected idle(dt: number, world: World) {
    this.flying = true;
    this.face(world);
    const p = world.player;
    let tx = p.x + (this.x < p.x ? -320 : 320);
    if (tx < ARENA_L + 90 || tx > ARENA_R - 90) tx = p.x + (this.x < p.x ? 320 : -320);
    tx = clamp(tx, ARENA_L + 90, ARENA_R - 90);
    this.vx = approach(this.vx, clamp((tx - this.x) * 2, -220, 220), 700 * dt);
    const ty = this.hoverY + Math.sin(this.t * 2.4) * 6;
    this.vy = approach(this.vy, (ty - this.y) * 4, 1500 * dt);
    this.setPose(Math.abs(this.vx) > 40 ? 'move' : 'idle');
  }

  protected patterns(world: World): string[] {
    const near = Math.abs(world.player.x - this.x) < 230;
    if (this.phase === 1)
      return near ? ['missiles', 'laserSweep', 'tailStab'] : ['missiles', 'laserSweep'];
    return ['missiles', 'rotLaser', 'teleThrust', 'laserSweep'];
  }

  protected run(name: string, world: World): Gen {
    switch (name) {
      case 'missiles':
        return this.missiles(world);
      case 'laserSweep':
        return this.laserSweep(world);
      case 'tailStab':
        return this.tailStab(world);
      case 'rotLaser':
        return this.rotLaser(world);
      default:
        return this.teleThrust(world);
    }
  }

  /** 유도 미사일 폭격 — 패링하면 보스에게 되돌아간다 */
  private *missiles(world: World): Gen {
    this.vx = 0;
    this.vy = 0;
    this.face(world);
    this.setPose('pods');
    world.sfx('charge');
    yield 0.5;
    const n = this.phase === 2 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-0.5, 0.5) - this.facing * 0.35;
      const p = this.shoot(world, 'missile', this.x - this.facing * 14, this.y - 112, a, 300, {
        r: 9,
        damage: 14,
        color: '#ff8a3a',
        parryable: true,
        life: 4.6,
      });
      p.homing = 2.4;
      world.fx.flare(this.x - this.facing * 14, this.y - 112, 24, '#ffb04a', 0.15);
      world.sfx('missile');
      yield 0.14;
    }
    yield 0.4;
    this.setPose('idle');
  }

  /** 레이저 가로지르기 — 낮게 오면 점프, 높게 오면 그대로 서 있기 (발판 위는 안전) */
  private *laserSweep(world: World): Gen {
    const side = world.player.x < VIEW_W / 2 ? 1 : -1;
    const tx = side > 0 ? ARENA_R - 80 : ARENA_L + 80;
    this.flying = true;
    this.setPose('move');
    yield* this.moveTo(tx, GROUND_Y - 14, 600);
    this.facing = -side;
    const n = this.phase === 2 ? 3 : 2;
    let low = Math.random() < 0.5;
    for (let k = 0; k < n; k++) {
      this.setPose('charge');
      const by = low ? GROUND_Y - 20 : GROUND_Y - 78;
      const beam = new Beam(this.x + this.facing * 60, by, this.facing > 0 ? 0 : Math.PI, {
        length: 1000,
        width: 24,
        warn: 0.8,
        active: 0.6,
        team: 'enemy',
        damage: 18,
        color: '#ff3b6b',
      });
      beam.onFire = () => {
        world.sfx('laser');
        world.shake(5);
      };
      world.addBeam(beam);
      world.sfx('charge');
      world.fx.text(this.x, this.y - 140, low ? '점프!' : '숙여!', '#ff8aa0', 16, 0.8);
      yield 0.8;
      this.setPose('fire');
      yield 0.75;
      low = !low;
    }
    this.setPose('idle');
    yield 0.2;
  }

  private *tailStab(world: World): Gen {
    this.face(world);
    this.vx = 0;
    this.setPose('charge');
    this.staggerable = true;
    yield* this.windupFor(0.45);
    this.setPose('thrust');
    this.newAttack();
    world.sfx('roll');
    let t = 0;
    while (t < 0.25) {
      t += this.dt;
      this.vx = this.facing * 520;
      this.hit(world, this.front(140, 92, 60, -40), 16, { parryable: true, knock: 380 });
      yield 0;
    }
    this.vx = 0;
    this.staggerable = false;
    this.setPose('idle');
    yield 0.35;
  }

  /** 시계 방향 회전 레이저 포격 — 구르기 무적으로 광선을 통과한다 */
  private *rotLaser(world: World): Gen {
    this.flying = true;
    this.setPose('move');
    yield* this.moveTo(VIEW_W / 2, GROUND_Y - 250, 620);
    this.setPose('core');
    world.sfx('charge');
    world.fx.text(this.x, this.y - 140, '구르기로 통과!', '#ffb06a', 16, 1);
    const cx = this.x - 10 * this.facing;
    const cy = this.y - 54;
    const a0 = rand(0, TAU);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const b = new Beam(cx, cy, a0 + (i * TAU) / n, {
        length: 1200,
        width: 18,
        warn: 1.1,
        active: 4.6,
        team: 'enemy',
        damage: 16,
        color: '#ff5a2a',
        spin: 0.8,
      });
      if (i === 0) {
        b.onFire = () => {
          world.sfx('laser');
          world.shake(6);
        };
      }
      world.addBeam(b);
    }
    yield 1.1 + 4.6;
    this.setPose('move');
    yield* this.moveTo(this.x, this.hoverY, 500);
  }

  /** 고속 텔레포트 찌르기 — 나타난 뒤 노란 반짝임에 패링 */
  private *teleThrust(world: World): Gen {
    for (let i = 0; i < 3; i++) {
      this.setPose('vanish');
      this.invuln = true;
      let t = 0;
      while (t < 0.25) {
        t += this.dt;
        this.alpha = 1 - t / 0.25;
        yield 0;
      }
      const px = world.player.x;
      let side = Math.random() < 0.5 ? -1 : 1;
      let nx = px + side * 230;
      if (nx < ARENA_L + 80 || nx > ARENA_R - 80) {
        side = -side;
        nx = px + side * 230;
      }
      this.x = clamp(nx, ARENA_L + 80, ARENA_R - 80);
      this.y = GROUND_Y - 14;
      this.vx = 0;
      this.vy = 0;
      this.facing = px >= this.x ? 1 : -1;
      world.fx.ring(this.x, this.y - 50, 70, 10, '#ff8a3a', 0.3, 3);
      world.fx.sparks(this.x, this.y - 50, 0, Math.PI, '#ff8a3a', 10, 300);
      this.alpha = 1;
      this.invuln = false;
      this.setPose('appear');
      this.staggerable = true;
      yield* this.windupFor(0.42);
      this.setPose('thrust');
      this.newAttack();
      world.sfx('roll');
      t = 0;
      while (t < 0.3) {
        t += this.dt;
        this.vx = this.facing * 1250;
        this.hit(world, this.front(150, 92, 60, -40), 18, { parryable: true, knock: 420 });
        if (Math.random() < 0.5)
          world.fx.sparks(
            this.x - this.facing * 40,
            this.y - 30,
            this.facing > 0 ? Math.PI : 0,
            0.4,
            '#ffa02a',
            1,
            300,
          );
        yield 0;
      }
      this.vx = 0;
      this.staggerable = false;
      this.setPose('idle');
      yield 0.25;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawMechaRat(ctx, this.view());
  }
}

/* =========================================================
 * Stage 3 — 타락한 고양이 왕 (Shadow Cat King)
 * ========================================================= */

export class ShadowCatKing extends Boss {
  readonly name = '타락한 고양이 왕';
  readonly english = 'SHADOW CAT KING';
  readonly color = '#c84aff';
  private stance = false;
  private countered = false;

  constructor() {
    super(1500, 720, 64, 128);
    this.alpha = 0;
  }

  protected deflect(_hit: HitInfo, world: World): boolean {
    if (!this.stance) return false;
    this.countered = true;
    const hb = this.hurtbox();
    world.fx.sparks(
      this.x + this.facing * 20,
      hb.y + 40,
      this.facing > 0 ? Math.PI : 0,
      0.8,
      '#9ad8ff',
      12,
      500,
    );
    world.fx.text(this.x, hb.y - 14, '막기!', '#9ad8ff', 18, 0.7);
    world.sfx('clank');
    return true;
  }

  protected onStunned() {
    this.stance = false;
  }

  protected *intro(world: World): Gen {
    this.facing = -1;
    this.introducing = false;
    this.setPose('idle');
    let t = 0;
    while (t < 1) {
      t += this.dt;
      this.alpha = t;
      if (Math.random() < 0.5)
        world.fx.smoke(this.x + rand(-30, 30), this.y - rand(0, 120), 1, 'rgba(90,30,140,1)');
      yield 0;
    }
    this.alpha = 1;
    world.sfx('roar');
    world.fx.ring(this.x, this.y - 70, 10, 200, '#c84aff', 0.6, 6);
    world.shake(8);
    yield 1;
  }

  protected *transform(world: World): Gen {
    this.flying = false;
    this.setPose('cast');
    world.fx.text(this.x, this.y - 190, '최종 변신', '#ff4a8a', 30, 1.6);
    let t = 0;
    let burst = 0;
    while (t < 1.8) {
      t += this.dt;
      burst -= this.dt;
      this.scale = 1 + 0.35 * easeOut(Math.min(1, t / 1.8));
      if (Math.random() < 0.6)
        world.fx.smoke(this.x + rand(-50, 50), this.y - rand(0, 160), 1, 'rgba(60,0,40,1)');
      if (burst <= 0) {
        burst = 0.45;
        world.fx.ring(this.x, this.y - 80, 20, 260, '#ff2a6a', 0.5, 8);
        world.sfx('charge');
      }
      yield 0;
    }
    world.flash('#ff2a6a', 0.6);
    world.shake(16);
    world.sfx('roar');
    world.fx.burst(this.x, this.y - 90, '#ff4a8a', 40, 520, 14);
    yield 0.4;
  }

  protected idle(dt: number, world: World) {
    this.face(world);
    const adx = Math.abs(world.player.x - this.x);
    const speed = this.phase === 2 ? 260 : 210;
    const target = adx > 260 ? this.facing * speed : adx < 120 ? -this.facing * speed * 0.5 : 0;
    this.vx = approach(this.vx, target, 1200 * dt);
    this.setPose(Math.abs(this.vx) > 40 ? 'run' : 'idle');
  }

  protected patterns(_world: World): string[] {
    if (this.phase === 1) return ['tripleSlash', 'counterStance', 'kunai'];
    return ['phantomBarrage', 'catStrike', 'tripleSlash'];
  }

  protected run(name: string, world: World): Gen {
    switch (name) {
      case 'tripleSlash':
        return this.tripleSlash(world);
      case 'counterStance':
        return this.counterStance(world);
      case 'kunai':
        return this.kunai(world);
      case 'phantomBarrage':
        return this.phantomBarrage(world);
      default:
        return this.catStrike(world);
    }
  }

  private *slashOnce(world: World, i: number, damage: number, windup: number): Gen {
    this.face(world);
    this.setPose('windup');
    this.staggerable = true;
    yield* this.windupFor(windup);
    this.setPose(i % 2 === 0 ? 'slash0' : 'slash1');
    this.newAttack();
    const [a0, a1] = i % 2 === 0 ? [-2.3, 1.2] : [1.2, -2.1];
    const s = this.scale;
    world.fx.slash(
      this.x + this.facing * 20 * s,
      this.y - 70 * s,
      this.facing,
      72 * s,
      a0,
      a1,
      this.phase === 2 ? '#ff4a8a' : '#c88aff',
      16,
      0.22,
    );
    world.sfx('slash');
    this.vx = this.facing * 240;
    let t = 0;
    while (t < 0.12) {
      t += this.dt;
      this.hit(world, this.front(124 * s, 124 * s, 114 * s, 10), damage, {
        parryable: true,
        knock: 280,
      });
      yield 0;
    }
    this.vx = 0;
    yield 0.1;
  }

  /** 닌자 연속 참격 (2페이즈는 5연격) */
  private *tripleSlash(world: World): Gen {
    this.face(world);
    this.setPose('run');
    let t = 0;
    while (Math.abs(world.player.x - this.x) > 100 * this.scale && t < 1.2) {
      t += this.dt;
      this.face(world);
      this.vx = this.facing * (this.phase === 2 ? 720 : 600);
      if (Math.random() < 0.3)
        world.fx.smoke(this.x - this.facing * 20, this.y - 40, 1, 'rgba(90,30,140,1)');
      yield 0;
    }
    this.vx = 0;
    const n = this.phase === 2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      yield* this.slashOnce(world, i, 14, this.phase === 2 ? 0.2 : 0.26);
    }
    this.staggerable = false;
    this.setPose('idle');
    yield 0.3;
  }

  /** 무적 반격 자세 — 이 자세에 공격하면 막고 등 뒤로 순간이동해 벤다 (그 반격도 패링 가능) */
  private *counterStance(world: World): Gen {
    this.face(world);
    this.vx = 0;
    this.setPose('stance');
    this.stance = true;
    this.countered = false;
    world.fx.text(this.x, this.y - 150, '반격 자세', '#9ad8ff', 15, 1);
    world.sfx('clank');
    let t = 0;
    while (t < 1.6 && !this.countered) {
      t += this.dt;
      yield 0;
    }
    this.stance = false;
    if (this.countered) {
      const p = world.player;
      world.fx.smoke(this.x, this.y - 60, 10, 'rgba(90,30,140,1)');
      this.x = clamp(p.x - p.facing * 80, ARENA_L + 40, ARENA_R - 40);
      world.fx.smoke(this.x, this.y - 60, 10, 'rgba(90,30,140,1)');
      yield* this.slashOnce(world, 0, 22, 0.24);
      this.staggerable = false;
      yield 0.3;
    } else {
      yield* this.kunai(world);
    }
  }

  /** 뒤로 뛰며 쿠나이 투척 */
  private *kunai(world: World): Gen {
    this.face(world);
    this.setPose('throw');
    this.vy = -620;
    this.vx = -this.facing * 260;
    this.onGround = false;
    yield 0.22;
    const spreads = this.phase === 2 ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.16, 0, 0.16];
    const sx = this.x + this.facing * 20;
    const sy = this.y - 80 * this.scale;
    const p = world.player;
    const base = Math.atan2(p.y - 24 - sy, p.x - sx);
    for (const off of spreads) {
      this.shoot(world, 'kunai', sx, sy, base + off, 540, {
        r: 7,
        damage: 10,
        color: '#b44aff',
        parryable: true,
        life: 3,
      });
    }
    world.sfx('slash');
    yield* this.waitLand(1.5);
    this.vx = 0;
    this.setPose('idle');
    yield 0.25;
  }

  /** 화면 전역 360도 환영 검기 탄막 — 고리 3번 + 나선 */
  private *phantomBarrage(world: World): Gen {
    this.flying = true;
    this.setPose('cast');
    yield* this.moveTo(VIEW_W / 2, GROUND_Y - 200, 640);
    world.sfx('charge');
    world.fx.text(this.x, this.y - 200, '환영 검무', '#ff8aaa', 18, 1);
    yield 0.45;
    const cx = this.x;
    const cy = this.y - 70 * this.scale;
    for (let ring = 0; ring < 3; ring++) {
      const n = 22;
      const off = ring * (TAU / n / 2) + rand(0, 0.2);
      for (let i = 0; i < n; i++) {
        this.shoot(world, 'crescent', cx, cy, off + (i * TAU) / n, 210, {
          r: 12,
          damage: 12,
          color: '#ff4a8a',
          parryable: true,
          life: 6,
        });
      }
      world.fx.ring(cx, cy, 10, 120, '#ff4a8a', 0.4, 6);
      world.sfx('slash');
      world.shake(3);
      yield 0.75;
    }
    for (let k = 0; k < 30; k++) {
      const a = k * 0.42;
      for (const arm of [0, Math.PI]) {
        this.shoot(world, 'crescent', cx, cy, a + arm, 250, {
          r: 11,
          damage: 11,
          color: '#ff4a8a',
          parryable: true,
          life: 6,
        });
      }
      if (k % 3 === 0) world.sfx('slash');
      yield 0.07;
    }
    yield 0.5;
    this.flying = false;
    this.setPose('idle');
    yield* this.waitLand(2);
  }

  /** 캣 스트라이크 — 바닥에 발자국 표식, 잠시 뒤 차례로 폭발 (패링 불가, 발판 위는 안전) */
  private *catStrike(world: World): Gen {
    this.vx = 0;
    this.setPose('cast');
    world.sfx('charge');
    for (let wave = 0; wave < 2; wave++) {
      const xs = [clamp(world.player.x, ARENA_L + 60, ARENA_R - 60)];
      const want = wave === 0 ? 4 : 5;
      for (let tries = 0; tries < 60 && xs.length < want; tries++) {
        const c = rand(ARENA_L + 60, ARENA_R - 60);
        if (xs.every((x) => Math.abs(x - c) > 120)) xs.push(c);
      }
      xs.forEach((hx, i) =>
        world.addHazard(new Hazard(hx, GROUND_Y - 30, 82, 0.95 + i * 0.12, 24, '#ff3a8a')),
      );
      world.fx.flare(this.x, this.y - 140 * this.scale, 60, '#ff4a8a', 0.4);
      yield 1.1 + xs.length * 0.12;
    }
    this.setPose('idle');
    yield 0.3;
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawCatKing(ctx, this.view());
  }
}

export function createBoss(stage: number): Boss {
  if (stage === 1) return new GoliathHound();
  if (stage === 2) return new MechaRatPrime();
  return new ShadowCatKing();
}
