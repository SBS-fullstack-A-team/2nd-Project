/**
 * 캣 블레이드 — 공용 엔티티: 판정(Hitbox)·투사체·레이저·바닥 표식·아이템·파티클(EffectManager)
 */
import { GROUND_Y, VIEW_W } from './config';
import type { Boss } from './boss';
import type { Enemy } from './enemy';
import type { Player } from './player';
import { drawGlow, pawPath, withAlpha } from './render';
import { drawCat, type CatPose } from './renderCat';
import type { SfxName } from './sound';
import { TAU, clamp, rand, segHitsRect, type Rect, type Shape } from './util';

/* =========================================================
 * 판정 · 월드 인터페이스
 * ========================================================= */

export type Team = 'player' | 'enemy';
export type HitSource = 'melee' | 'projectile' | 'beam' | 'skill' | 'counter';

export interface HitInfo {
  damage: number;
  /** 밀려나는 방향 (-1 / 1) */
  dir: number;
  knock: number;
  /** 위로 띄우는 힘 */
  launch: number;
  source: HitSource;
}

/** 공격을 받을 수 있는 적 (잡몹·보스 공통) */
export interface Damageable {
  readonly isBoss: boolean;
  dead: boolean;
  x: number;
  y: number;
  hurtbox(): Rect;
  canBeHit(): boolean;
  /** 피해를 받았으면 true, 막혔으면 false (고양이 왕의 반격 자세 등) */
  takeHit(hit: HitInfo, world: World): boolean;
  /** 플레이어가 이 적의 공격을 패링했다 */
  parried(world: World): void;
}

/** 근접 공격 판정 — 짧게 살아 있다가 사라진다. group 으로 한 공격이 같은 대상을 두 번 때리지 않게 한다 */
export interface Hitbox {
  team: Team;
  shape: Shape;
  damage: number;
  dir: number;
  knock: number;
  launch: number;
  parryable: boolean;
  source: Damageable | null;
  group: Set<object>;
  life: number;
  hitstop: number;
  shake: number;
  color: string;
  kind: HitSource;
}

export type HitboxInit = Partial<Hitbox> & Pick<Hitbox, 'team' | 'shape' | 'damage'>;

export function makeHitbox(init: HitboxInit): Hitbox {
  return {
    dir: 1,
    knock: 160,
    launch: 0,
    parryable: false,
    source: null,
    group: new Set(),
    life: 1 / 60,
    hitstop: 0.05,
    shake: 3,
    color: '#ffffff',
    kind: 'melee',
    ...init,
  };
}

/** 엔티티가 게임 월드에 요청할 수 있는 것들 (엔진이 구현) */
export interface World {
  readonly t: number;
  readonly player: Player;
  readonly fx: EffectManager;
  readonly enemies: readonly Enemy[];
  readonly boss: Boss | null;
  readonly projectiles: Projectile[];
  addHitbox(init: HitboxInit): void;
  addProjectile(p: Projectile): void;
  addBeam(b: Beam): void;
  addHazard(h: Hazard): void;
  addPickup(p: Pickup): void;
  /** delay 초 뒤에 fn 실행 (게임 시간 기준 — 일시정지·히트스톱 동안 멈춘다) */
  schedule(delay: number, fn: () => void): void;
  shake(amount: number): void;
  flash(color: string, amount: number): void;
  hitstop(sec: number): void;
  slowmo(scale: number, sec: number): void;
  sfx(name: SfxName): void;
  clearEnemyProjectiles(): void;
}

/* =========================================================
 * 파티클
 * ========================================================= */

export type ParticleKind =
  | 'dot'
  | 'spark'
  | 'smoke'
  | 'ring'
  | 'paw'
  | 'shard'
  | 'slash'
  | 'text'
  | 'ghost'
  | 'spike'
  | 'explosion'
  | 'flare'
  | 'line';

export class Particle {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  rot = 0;
  vr = 0;
  gravity = 0;
  drag = 0;
  /** ring: 최종 반지름 / slash·line: 끝 좌표 등에 쓰는 값 */
  grow = 0;
  a0 = 0;
  a1 = 0;
  width = 2;
  facing = 1;
  text = '';
  /** 화면 앞쪽 레이어(HUD 바로 아래)에 그릴지 */
  front = false;
  snap: CatPose | null = null;
  x2 = 0;
  y2 = 0;

  constructor(kind: ParticleKind, x: number, y: number, life: number, size: number, color: string) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
  }

  update(dt: number): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;
    if (this.drag > 0) {
      const k = Math.pow(1 - this.drag, dt * 60);
      this.vx *= k;
      this.vy *= k;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    if ((this.kind === 'shard' || this.kind === 'dot') && this.gravity > 0 && this.y > GROUND_Y) {
      this.y = GROUND_Y;
      this.vy *= -0.35;
      this.vx *= 0.7;
    }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = clamp(this.life / this.maxLife, 0, 1);
    switch (this.kind) {
      case 'dot':
        drawGlow(ctx, this.x, this.y, this.size * (0.4 + k * 0.6), this.color, k);
        break;
      case 'flare':
        drawGlow(ctx, this.x, this.y, this.size * (1.4 - k * 0.4), this.color, k * k);
        break;
      case 'spark': {
        const len = this.size * (0.3 + k * 0.7);
        const sp = Math.hypot(this.vx, this.vy) || 1;
        ctx.globalAlpha = k;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * (0.5 + k * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - (this.vx / sp) * len, this.y - (this.vy / sp) * len);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'smoke':
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1.6 - k * 0.6), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case 'ring': {
        const r = this.size + (this.grow - this.size) * (1 - k * k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * k + 0.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.1, r), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'paw':
        ctx.globalAlpha = Math.min(1, k * 1.6) * 0.85;
        ctx.fillStyle = this.color;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        pawPath(ctx, 0, 0, this.size);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      case 'shard':
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = this.color;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.beginPath();
        ctx.moveTo(-this.size, -this.size * 0.5);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(-this.size * 0.4, this.size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      case 'slash': {
        // 초승달 모양 검기 궤적
        const p = 1 - k;
        const r = this.size;
        const span = this.a1 - this.a0;
        const e1 = this.a0 + span * Math.min(1, p * 3.2);
        const e2 = this.a0 + span * Math.max(0, p * 1.6 - 0.25);
        // 위에서 아래로·아래에서 위로 베기 모두 같은 방식으로 그린다
        const head = Math.max(e1, e2);
        const tail = Math.min(e1, e2);
        if (head - tail <= 0.01) break;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.facing, 1);
        ctx.globalAlpha = Math.min(1, k * 1.8);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, r, tail, head);
        ctx.arc(0, 0, r - this.width, head, tail, true);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, r, tail, head);
        ctx.arc(0, 0, r - this.width * 0.3, head, tail, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'text': {
        ctx.globalAlpha = Math.min(1, k * 2.5);
        const pop = 1 + Math.max(0, (k - 0.82) * 3);
        ctx.font = `900 ${Math.round(this.size * pop)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,6,20,0.85)';
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
        break;
      }
      case 'ghost':
        if (this.snap) {
          ctx.save();
          drawGlow(ctx, this.snap.x, this.snap.y - 22, 30, this.color, k * 0.35);
          drawCat(ctx, { ...this.snap, alpha: k * 0.45, flash: 0.6 });
          ctx.restore();
        }
        break;
      case 'spike': {
        // 땅에서 솟구쳤다 꺼지는 바위 가시
        const p = 1 - k;
        const rise = p < 0.25 ? p / 0.25 : p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
        const h = this.size * rise;
        if (h <= 1) break;
        ctx.save();
        ctx.translate(this.x, this.y);
        const g = ctx.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, '#fff2b0');
        g.addColorStop(0.3, this.color);
        g.addColorStop(1, '#6a4a2a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-this.width / 2, 0);
        ctx.lineTo(-this.width * 0.15, -h * 0.75);
        ctx.lineTo(0, -h);
        ctx.lineTo(this.width * 0.2, -h * 0.7);
        ctx.lineTo(this.width / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,20,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'explosion': {
        const p = 1 - k;
        drawGlow(ctx, this.x, this.y, this.size * (0.6 + p * 0.8), this.color, k);
        drawGlow(ctx, this.x, this.y, this.size * 0.5 * (1 - p * 0.5), '#ffffff', k * k);
        break;
      }
      case 'line': {
        ctx.globalAlpha = k;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  /** 'lighter' 합성으로 그릴 종류 (빛나는 효과) */
  get additive() {
    return (
      this.kind === 'dot' ||
      this.kind === 'spark' ||
      this.kind === 'slash' ||
      this.kind === 'ring' ||
      this.kind === 'flare' ||
      this.kind === 'explosion' ||
      this.kind === 'line' ||
      this.kind === 'ghost'
    );
  }
}

const MAX_PARTICLES = 900;

/** 파티클 생성 도우미 모음 */
export class EffectManager {
  particles: Particle[] = [];

  add(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
    return p;
  }

  clear() {
    this.particles = [];
  }

  update(dt: number) {
    this.particles = this.particles.filter((p) => p.update(dt));
  }

  draw(ctx: CanvasRenderingContext2D, front: boolean) {
    // 일반 → 발광 순서로 두 번 나눠 그린다 (합성 모드 전환 최소화)
    for (const p of this.particles) if (p.front === front && !p.additive) p.draw(ctx);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) if (p.front === front && p.additive) p.draw(ctx);
    ctx.restore();
  }

  burst(x: number, y: number, color: string, n: number, speed = 260, size = 8) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.3, 1) * speed;
      const p = this.add(new Particle('dot', x, y, rand(0.25, 0.6), rand(size * 0.5, size), color));
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.drag = 0.08;
    }
  }

  sparks(
    x: number,
    y: number,
    angle: number,
    spread: number,
    color: string,
    n: number,
    speed = 520,
  ) {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread);
      const s = rand(0.4, 1) * speed;
      const p = this.add(new Particle('spark', x, y, rand(0.15, 0.35), rand(10, 22), color));
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.drag = 0.1;
      p.width = rand(1.5, 3);
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.35, width = 4) {
    const p = this.add(new Particle('ring', x, y, life, r0, color));
    p.grow = r1;
    p.width = width;
    return p;
  }

  flare(x: number, y: number, size: number, color: string, life = 0.25) {
    return this.add(new Particle('flare', x, y, life, size, color));
  }

  explosion(x: number, y: number, size: number, color: string) {
    this.add(new Particle('explosion', x, y, 0.4, size, color));
    this.sparks(x, y, -Math.PI / 2, Math.PI, color, 10, 420);
    this.smoke(x, y, 4, 'rgba(60,40,40,1)');
  }

  slash(
    x: number,
    y: number,
    facing: number,
    radius: number,
    a0: number,
    a1: number,
    color: string,
    width = 12,
    life = 0.22,
  ) {
    const p = this.add(new Particle('slash', x, y, life, radius, color));
    p.facing = facing;
    p.a0 = a0;
    p.a1 = a1;
    p.width = width;
    return p;
  }

  text(x: number, y: number, str: string, color: string, size = 18, life = 0.8) {
    const p = this.add(new Particle('text', x, y, life, size, color));
    p.text = str;
    p.vy = -60;
    p.drag = 0.06;
    p.front = true;
    return p;
  }

  paws(x: number, y: number, n: number, color = '#ffd0e0') {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 220);
      const p = this.add(new Particle('paw', x, y, rand(0.5, 0.9), rand(5, 8), color));
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - 60;
      p.drag = 0.07;
      p.rot = rand(-0.6, 0.6);
      p.vr = rand(-3, 3);
    }
  }

  /** 땅에 남는 발자국 하나 */
  footprint(x: number, y: number, color: string) {
    const p = this.add(new Particle('paw', x, y - 2, 0.7, 4, color));
    p.rot = 0;
  }

  smoke(x: number, y: number, n: number, color = 'rgba(200,190,180,1)') {
    for (let i = 0; i < n; i++) {
      const p = this.add(
        new Particle(
          'smoke',
          x + rand(-8, 8),
          y + rand(-4, 4),
          rand(0.35, 0.7),
          rand(5, 10),
          color,
        ),
      );
      p.vx = rand(-60, 60);
      p.vy = rand(-70, -10);
      p.drag = 0.06;
    }
  }

  dust(x: number, y: number, dir: number, n = 5) {
    for (let i = 0; i < n; i++) {
      const p = this.add(
        new Particle('smoke', x, y - 3, rand(0.25, 0.45), rand(3, 6), 'rgba(220,200,180,1)'),
      );
      p.vx = -dir * rand(40, 140) + rand(-30, 30);
      p.vy = rand(-60, -10);
      p.drag = 0.1;
    }
  }

  shards(x: number, y: number, color: string, n: number, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = rand(0.4, 1) * speed;
      const p = this.add(new Particle('shard', x, y, rand(0.5, 0.9), rand(3, 6), color));
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.gravity = 1200;
      p.vr = rand(-12, 12);
    }
  }

  ghost(snap: CatPose, color: string, life = 0.28) {
    const p = this.add(new Particle('ghost', snap.x, snap.y, life, 0, color));
    p.snap = { ...snap };
    return p;
  }

  spike(x: number, color: string, height = 110, width = 40) {
    const p = this.add(new Particle('spike', x, GROUND_Y, 0.55, height, color));
    p.width = width;
    this.shards(x, GROUND_Y, '#a07a4a', 4, 260);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 6, life = 0.25) {
    const p = this.add(new Particle('line', x1, y1, life, 0, color));
    p.x2 = x2;
    p.y2 = y2;
    p.width = width;
    return p;
  }

  /** 폼 체인지 — 색깔 고리 + 별가루 + 발자국 */
  transform(x: number, y: number, color: string, glow: string) {
    this.ring(x, y - 22, 6, 70, color, 0.45, 6);
    this.ring(x, y - 22, 4, 46, glow, 0.35, 3);
    this.burst(x, y - 22, color, 22, 320, 10);
    this.burst(x, y - 22, glow, 10, 180, 7);
    this.paws(x, y - 22, 5, glow);
    this.flare(x, y - 22, 60, color, 0.3);
  }
}

/* =========================================================
 * 투사체
 * ========================================================= */

export type ProjKind =
  | 'fireWave'
  | 'neon'
  | 'orb'
  | 'blood'
  | 'missile'
  | 'kunai'
  | 'crescent'
  | 'groundWave'
  | 'pellet'
  | 'shockwave';

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  team: Team;
  damage: number;
  kind: ProjKind;
  color: string;
  parryable: boolean;
  life: number;
  /** 몇 명까지 꿰뚫는지 (Infinity = 무제한) */
  pierce = 1;
  /** 초당 회전(유도) 각도 — 0 이면 직진 */
  homing = 0;
  speed: number;
  source: Damageable | null = null;
  hitGroup = new Set<object>();
  dead = false;
  age = 0;
  knock = 160;
  launch = 0;
  /** 땅을 타고 가는 충격파 — 높이 = r * 2 */
  grounded = false;
  reflected = false;

  constructor(
    kind: ProjKind,
    team: Team,
    x: number,
    y: number,
    vx: number,
    vy: number,
    opts: { r: number; damage: number; color: string; parryable?: boolean; life?: number },
  ) {
    this.kind = kind;
    this.team = team;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r;
    this.damage = opts.damage;
    this.color = opts.color;
    this.parryable = opts.parryable ?? false;
    this.life = opts.life ?? 4;
    this.speed = Math.hypot(vx, vy);
  }

  update(dt: number, world: World) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      if (this.kind === 'missile') world.fx.explosion(this.x, this.y, 30, '#ff8a3a');
      return;
    }
    if (this.homing > 0 && this.age > 0.35) {
      const target = this.homingTarget(world);
      if (target) {
        const want = Math.atan2(target.y - this.y, target.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        let d = want - cur;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        const turn = clamp(d, -this.homing * dt, this.homing * dt);
        const na = cur + turn;
        this.speed = Math.min(this.speed + 260 * dt, this.reflected ? 760 : 380);
        this.vx = Math.cos(na) * this.speed;
        this.vy = Math.sin(na) * this.speed;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.grounded) this.y = GROUND_Y - this.r;
    // 연기 꼬리
    if (this.kind === 'missile' && Math.random() < 0.6) {
      const p = world.fx.add(new Particle('smoke', this.x, this.y, 0.4, 4, 'rgba(180,170,170,1)'));
      p.vy = -20;
    }
    if (this.kind === 'fireWave' && Math.random() < 0.7) {
      const p = world.fx.add(
        new Particle('dot', this.x + rand(-8, 8), this.y + rand(-12, 12), 0.3, 8, '#ff8a2a'),
      );
      p.vx = -this.vx * 0.1;
      p.vy = -40;
    }
    // 화면 밖 · 바닥
    if (this.x < -80 || this.x > VIEW_W + 80 || this.y < -120 || this.y > GROUND_Y + 10) {
      if (
        this.y > GROUND_Y + 10 &&
        (this.kind === 'missile' || this.kind === 'blood' || this.kind === 'orb')
      ) {
        world.fx.explosion(this.x, GROUND_Y, this.kind === 'missile' ? 30 : 16, this.color);
      }
      this.dead = true;
    }
  }

  private homingTarget(world: World): { x: number; y: number } | null {
    if (this.team === 'enemy') {
      const p = world.player;
      return { x: p.x, y: p.y - 22 };
    }
    const boss = world.boss;
    if (boss && !boss.dead) {
      const hb = boss.hurtbox();
      return { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
    }
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? { x: best.x, y: best.y - 16 } : null;
  }

  shape(): Shape {
    return { kind: 'circle', x: this.x, y: this.y, r: this.r };
  }

  /** 패링으로 되받아친다 — 아군 탄이 되어 원래 주인에게 날아간다 */
  reflect(world: World) {
    this.team = 'player';
    this.reflected = true;
    this.damage = Math.round(this.damage * 2.4);
    this.hitGroup = new Set();
    this.life = 2.5;
    this.pierce = 1;
    this.color = '#ffe27a';
    if (this.grounded) {
      // 땅 충격파는 땅을 타고 그대로 되돌아간다
      const sp = Math.max(560, Math.abs(this.vx) * 1.4);
      this.vx = (this.vx > 0 ? -1 : 1) * sp;
      this.vy = 0;
      this.speed = sp;
      this.homing = 0;
      world.fx.ring(this.x, this.y, 4, 40, '#fff27a', 0.3, 4);
      return;
    }
    const src = this.source;
    let ang = Math.atan2(-this.vy, -this.vx);
    if (src && !src.dead) {
      const hb = src.hurtbox();
      ang = Math.atan2(hb.y + hb.h / 2 - this.y, hb.x + hb.w / 2 - this.x);
    }
    const sp = Math.max(520, this.speed * 1.5);
    this.speed = sp;
    this.vx = Math.cos(ang) * sp;
    this.vy = Math.sin(ang) * sp;
    this.homing = this.kind === 'missile' ? 5 : 0;
    world.fx.ring(this.x, this.y, 4, 30, '#fff27a', 0.25, 3);
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    const ang = Math.atan2(this.vy, this.vx);
    switch (this.kind) {
      case 'fireWave': {
        // 초승달 화염 검기
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, this.r * 2.2, '#ff5a1a', 0.8);
        ctx.fillStyle = 'rgba(255,200,80,0.95)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.6, 0, this.r * 1.3, -1.2, 1.2);
        ctx.arc(-this.r * 1.1, 0, this.r * 1.05, 1.1, -1.1, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'neon': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = this.reflected ? '#fff27a' : this.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - Math.cos(ang) * 30, this.y - Math.sin(ang) * 30);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawGlow(ctx, this.x, this.y, 12, this.color, 0.9);
        ctx.restore();
        break;
      }
      case 'missile': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(ang);
        ctx.fillStyle = this.reflected ? '#ffe27a' : '#c8d2e2';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(4, -4.5);
        ctx.lineTo(-10, -4.5);
        ctx.lineTo(-10, 4.5);
        ctx.lineTo(4, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff3a3a';
        ctx.fillRect(-10, -7, 5, 14);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, -14, 0, 10 + Math.sin(t * 40) * 2, '#ff9a2a', 0.9);
        if (this.parryable) drawGlow(ctx, 10, 0, 12, '#fff27a', 0.35 + Math.sin(t * 16) * 0.2);
        ctx.restore();
        break;
      }
      case 'kunai': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, 16, this.reflected ? '#fff27a' : '#b44aff', 0.6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#e8e0ff';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(0, -4);
        ctx.lineTo(0, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2a1a3a';
        ctx.fillRect(-10, -1.5, 10, 3);
        ctx.strokeStyle = '#2a1a3a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-12, 0, 3, 0, TAU);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'crescent': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, this.r * 2, this.reflected ? '#fff27a' : this.color, 0.55);
        ctx.fillStyle = this.reflected ? 'rgba(255,240,150,0.95)' : 'rgba(255,170,210,0.95)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.4, 0, this.r * 1.1, -1.3, 1.3);
        ctx.arc(-this.r * 0.85, 0, this.r * 0.9, 1.2, -1.2, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'groundWave':
      case 'shockwave': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const dir = Math.sign(this.vx) || 1;
        const h = this.r * 2;
        const g = ctx.createLinearGradient(this.x - dir * 30, 0, this.x + dir * 10, 0);
        g.addColorStop(0, withAlpha(this.color, 0));
        g.addColorStop(1, withAlpha(this.color, 0.9));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(this.x - dir * 34, GROUND_Y);
        ctx.quadraticCurveTo(
          this.x - dir * 6,
          GROUND_Y - h * 1.1,
          this.x + dir * 10,
          GROUND_Y - h * 0.2,
        );
        ctx.lineTo(this.x + dir * 12, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        drawGlow(ctx, this.x, GROUND_Y - h * 0.4, h * 0.8, this.color, 0.6);
        ctx.restore();
        break;
      }
      default: {
        // orb · blood · pellet — 빛나는 구슬
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const col = this.reflected ? '#ffe27a' : this.color;
        drawGlow(ctx, this.x, this.y, this.r * 2.6, col, 0.85);
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.55, 0, TAU);
        ctx.fill();
        if (this.parryable && !this.reflected && this.team === 'enemy') {
          // 패링 가능한 탄은 노란 테두리
          ctx.strokeStyle = 'rgba(255,240,120,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r + 1.5, 0, TAU);
          ctx.stroke();
        }
      }
    }
  }
}

/* =========================================================
 * 레이저 (예고선 → 발사)
 * ========================================================= */

export class Beam {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  /** 예고 시간 (이 동안은 판정 없음) */
  warn: number;
  /** 발사 지속 시간 */
  active: number;
  /** 초당 회전 각도 (양수 = 화면상 시계 방향) */
  spin = 0;
  team: Team;
  damage: number;
  color: string;
  age = 0;
  /** 같은 대상을 다시 때리기까지 간격 */
  tick = 0.45;
  lastHit = new Map<object, number>();
  /** 아군 레이저 — 한 대상에게 한 번만 */
  once = false;
  done = false;
  private fired = false;
  onFire: (() => void) | null = null;

  constructor(
    x: number,
    y: number,
    angle: number,
    opts: {
      length: number;
      width: number;
      warn: number;
      active: number;
      team: Team;
      damage: number;
      color: string;
      spin?: number;
    },
  ) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.length = opts.length;
    this.width = opts.width;
    this.warn = opts.warn;
    this.active = opts.active;
    this.team = opts.team;
    this.damage = opts.damage;
    this.color = opts.color;
    this.spin = opts.spin ?? 0;
  }

  get isActive() {
    return this.age >= this.warn && this.age < this.warn + this.active;
  }

  get endX() {
    return this.x + Math.cos(this.angle) * this.length;
  }

  get endY() {
    return this.y + Math.sin(this.angle) * this.length;
  }

  update(dt: number) {
    this.age += dt;
    this.angle += this.spin * dt;
    if (!this.fired && this.age >= this.warn) {
      this.fired = true;
      this.onFire?.();
    }
    if (this.age >= this.warn + this.active) this.done = true;
  }

  hits(r: Rect) {
    return segHitsRect(this.x, this.y, this.endX, this.endY, this.width, r);
  }

  /** 이 대상에게 지금 피해를 줄 수 있는지 (간격 관리) */
  canHit(target: object, now: number) {
    const last = this.lastHit.get(target);
    if (last === undefined) return true;
    if (this.once) return false;
    return now - last >= this.tick;
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    ctx.save();
    if (this.age < this.warn) {
      // 예고선 — 점점 진해지며 깜빡인다
      const k = this.age / this.warn;
      ctx.globalAlpha = 0.25 + k * 0.5 + Math.sin(t * 40) * 0.12;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5 + k * 2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.endX, this.endY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, this.x, this.y, 14 + k * 26, this.color, 0.6 + k * 0.4);
    } else {
      const left = this.warn + this.active - this.age;
      const k = Math.min(1, (this.age - this.warn) * 12, left * 8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.globalAlpha = k;
      ctx.strokeStyle = withAlpha(this.color, 0.45);
      ctx.lineWidth = this.width * (1.6 + Math.sin(t * 50) * 0.1);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.endX, this.endY);
      ctx.stroke();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.width * 0.8;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = this.width * 0.3;
      ctx.stroke();
      drawGlow(ctx, this.x, this.y, this.width * 2.4, this.color, k);
    }
    ctx.restore();
  }
}

/* =========================================================
 * 바닥 표식 (예고 후 폭발)
 * ========================================================= */

export class Hazard {
  x: number;
  y: number;
  r: number;
  warn: number;
  damage: number;
  color: string;
  age = 0;
  done = false;
  exploded = false;

  constructor(x: number, y: number, r: number, warn: number, damage: number, color: string) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.warn = warn;
    this.damage = damage;
    this.color = color;
  }

  update(dt: number, world: World) {
    this.age += dt;
    if (!this.exploded && this.age >= this.warn) {
      this.exploded = true;
      world.addHitbox({
        team: 'enemy',
        shape: { kind: 'circle', x: this.x, y: this.y, r: this.r },
        damage: this.damage,
        parryable: false,
        knock: 300,
        launch: 300,
        life: 0.12,
        kind: 'skill',
        dir: world.player.x < this.x ? -1 : 1,
      });
      world.fx.explosion(this.x, this.y, this.r * 1.3, this.color);
      world.fx.ring(this.x, this.y, 10, this.r * 1.3, this.color, 0.4, 8);
      world.fx.paws(this.x, this.y, 3, '#ffb0d0');
      world.shake(7);
      world.sfx('boom');
    }
    if (this.age >= this.warn + 0.4) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    if (this.exploded) return;
    const k = clamp(this.age / this.warn, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    // 바깥 원
    ctx.strokeStyle = withAlpha(this.color, 0.5 + k * 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, TAU);
    ctx.stroke();
    // 차오르는 안쪽
    ctx.fillStyle = withAlpha(
      this.color,
      0.15 + k * 0.25 + (Math.sin(t * 30) > 0 && k > 0.7 ? 0.15 : 0),
    );
    ctx.beginPath();
    ctx.arc(0, 0, this.r * k, 0, TAU);
    ctx.fill();
    // 고양이 발자국 문양
    ctx.rotate(t * 0.8);
    ctx.fillStyle = withAlpha(this.color, 0.5 + k * 0.4);
    pawPath(ctx, 0, 0, this.r * 0.45);
    ctx.fill();
    ctx.restore();
  }
}

/* =========================================================
 * 아이템 (생선 — 체력 회복)
 * ========================================================= */

export class Pickup {
  x: number;
  y: number;
  vy = -320;
  vx: number;
  age = 0;
  done = false;
  heal: number;

  constructor(x: number, y: number, heal: number) {
    this.x = x;
    this.y = y;
    this.heal = heal;
    this.vx = rand(-60, 60);
  }

  update(dt: number) {
    this.age += dt;
    this.vy += 1400 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y - 8) {
      this.y = GROUND_Y - 8;
      this.vy = 0;
      this.vx = 0;
    }
    if (this.age > 10) this.done = true;
  }

  rect(): Rect {
    return { x: this.x - 14, y: this.y - 10, w: 28, h: 20 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    // 사라지기 직전 깜빡임
    if (this.age > 8 && Math.sin(t * 30) > 0) return;
    const bob = this.vy === 0 ? Math.sin(t * 4 + this.x) * 2 : 0;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, 22, '#5ad8ff', 0.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#7ac8ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-17, -6);
    ctx.lineTo(-17, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8f0ff';
    ctx.beginPath();
    ctx.ellipse(1, 2, 7, 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a2a3a';
    ctx.beginPath();
    ctx.arc(6, -1.5, 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
