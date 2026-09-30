/**
 * 게임 오브젝트 클래스 — Player, PlayerBullet, EnemyBullet, EnemyLaser, Enemy, Boss, Item, Particle.
 * 각 클래스는 자기 상태 갱신(update)과 그리기(draw)만 책임지고,
 * 충돌 판정·점수·스테이지 진행은 engine.ts 가 맡는다.
 */
import {
  ENEMY_STATS,
  VIEW_H,
  VIEW_W,
  type AircraftDef,
  type BossId,
  type EnemyKind,
  type StageDef,
} from './config';
import { drawChronos, drawGoliath, drawKraken, type BossLook } from './bossRender';
import { TAU, drawEnemyCraft, drawSprite, glowSprite } from './render';

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 적·보스가 탄을 쏘거나 이펙트를 낼 때 쓰는 게임 월드 창구 (engine 이 구현) */
export interface World {
  readonly player: Player;
  readonly stageDef: StageDef;
  fire(x: number, y: number, angle: number, speed: number, opts?: BulletOpts): EnemyBullet;
  addLaser(laser: EnemyLaser): void;
  explode(x: number, y: number, size: number): void;
  shake(amount: number): void;
  sfx(name: 'laser' | 'explode' | 'bigExplode'): void;
}

export interface BulletOpts {
  r?: number;
  color?: string;
  kind?: EnemyBullet['kind'];
  homing?: number;
  turn?: number;
  accel?: number;
}

/* =========================================================
 * Particle — 스파크·화염·연기·파편·충격파 링·점수 글자
 * ========================================================= */
export type ParticleKind = 'spark' | 'fire' | 'smoke' | 'debris' | 'ring' | 'text';

export class Particle {
  life: number;
  rot = rand(0, TAU);
  vr = rand(-8, 8);
  text = '';

  constructor(
    public kind: ParticleKind,
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public maxLife: number,
    public size: number,
    public color: string,
  ) {
    this.life = maxLife;
  }

  /** 가산 합성(빛)으로 그릴 종류인지 */
  get additive() {
    return this.kind === 'spark' || this.kind === 'fire' || this.kind === 'ring';
  }

  update(dt: number): boolean {
    this.life -= dt;
    const drag = this.kind === 'smoke' ? 0.96 : this.kind === 'debris' ? 0.985 : 0.92;
    const k = Math.pow(drag, dt * 60);
    this.vx *= k;
    this.vy *= k;
    if (this.kind === 'debris') this.vy += 220 * dt;
    if (this.kind === 'smoke') this.size += 18 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    return this.life > 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const p = Math.max(0, this.life / this.maxLife);
    switch (this.kind) {
      case 'spark': {
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = p;
        ctx.lineWidth = this.size;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03);
        ctx.stroke();
        break;
      }
      case 'fire': {
        const s = glowSprite(this.color, 8);
        const size = this.size * (0.6 + p * 0.6);
        ctx.globalAlpha = p;
        ctx.drawImage(s, this.x - size, this.y - size, size * 2, size * 2);
        break;
      }
      case 'smoke':
        ctx.globalAlpha = p * 0.35;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TAU);
        ctx.fill();
        break;
      case 'debris':
        ctx.globalAlpha = Math.min(1, p * 2);
        ctx.fillStyle = this.color;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillRect(-this.size, -this.size * 0.5, this.size * 2, this.size);
        ctx.restore();
        break;
      case 'ring':
        ctx.globalAlpha = p;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3 * p + 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 - p) + 4, 0, TAU);
        ctx.stroke();
        break;
      case 'text':
        ctx.globalAlpha = Math.min(1, p * 2);
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        break;
    }
    ctx.globalAlpha = 1;
  }
}

/* =========================================================
 * Player
 * ========================================================= */
export interface Drone {
  x: number;
  y: number;
}

export class Player {
  x = VIEW_W / 2;
  y = VIEW_H - 90;
  power = 1;
  lives: number;
  bombs: number;
  /** 남은 무적 시간 */
  invincible = 0;
  /** 격추 후 재등장까지 남은 시간 (0 이면 살아 있음) */
  respawn = 0;
  bank = 0;
  shotCool = 0;
  subCool = 0;
  missileSide = 1;
  drones: Drone[] = [
    { x: VIEW_W / 2 - 34, y: VIEW_H - 80 },
    { x: VIEW_W / 2 + 34, y: VIEW_H - 80 },
  ];
  /** 신덴 빔이 닿은 지점 (그리기용) */
  beamEndY = 0;
  beamOn = false;

  constructor(
    public def: AircraftDef,
    lives: number,
    bombs: number,
  ) {
    this.lives = lives;
    this.bombs = bombs;
  }

  get alive() {
    return this.respawn <= 0;
  }

  move(dx: number, dy: number) {
    this.x = clamp(this.x + dx, 16, VIEW_W - 16);
    this.y = clamp(this.y + dy, 24, VIEW_H - 24);
    this.bank = clamp(this.bank + dx * 0.08, -1, 1);
  }

  update(dt: number) {
    this.bank *= Math.pow(0.85, dt * 60);
    if (this.invincible > 0) this.invincible -= dt;
    // 드론은 살짝 늦게 따라온다
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i]!;
      const tx = this.x + (i === 0 ? -34 : 34);
      const ty = this.y + 12;
      const k = 1 - Math.pow(0.001, dt * 1.6);
      d.x += (tx - d.x) * k;
      d.y += (ty - d.y) * k;
    }
  }
}

/* =========================================================
 * PlayerBullet — 주포 / 드론 / 관통탄 / 유도 미사일
 * ========================================================= */
export type Target = Enemy | Boss;

export class PlayerBullet {
  dead = false;
  age = 0;
  /** 관통탄이 이미 맞힌 대상 (같은 적을 두 번 맞히지 않도록) */
  hitSet: Set<Target> | null = null;
  target: Target | null = null;

  constructor(
    public kind: 'plasma' | 'pierce' | 'rapid' | 'drone' | 'missile',
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public damage: number,
    public r: number,
  ) {
    if (kind === 'pierce') this.hitSet = new Set();
  }

  update(dt: number, pickTarget: (x: number, y: number) => Target | null) {
    this.age += dt;
    if (this.kind === 'missile') {
      // 처음 0.18초는 좌우로 벌어졌다가 가장 가까운 적을 향해 꺾는다 (교차 유도)
      if (this.age > 0.18) {
        if (!this.target || this.target.dead) this.target = pickTarget(this.x, this.y);
        const speed = Math.min(620, Math.hypot(this.vx, this.vy) + 900 * dt);
        let ang = Math.atan2(this.vy, this.vx);
        if (this.target) {
          const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
          let diff = want - ang;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          ang += clamp(diff, -8 * dt, 8 * dt);
        } else {
          ang += clamp(-Math.PI / 2 - ang, -4 * dt, 4 * dt);
        }
        this.vx = Math.cos(ang) * speed;
        this.vy = Math.sin(ang) * speed;
      }
      if (this.age > 3) this.dead = true;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.y > VIEW_H + 30 || this.x < -30 || this.x > VIEW_W + 30) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    switch (this.kind) {
      case 'plasma': {
        const s = glowSprite('#3ab8ff', 6);
        ctx.drawImage(s, this.x - 6, this.y - 14, 12, 28);
        break;
      }
      case 'pierce': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
        const s = glowSprite('#ff9a2a', 6);
        ctx.drawImage(s, -5, -12, 10, 24);
        ctx.restore();
        break;
      }
      case 'rapid': {
        const s = glowSprite('#7dffb0', 5);
        ctx.drawImage(s, this.x - 4, this.y - 11, 8, 22);
        break;
      }
      case 'drone':
        drawSprite(ctx, glowSprite('#9ae6ff', 3), this.x, this.y);
        break;
      case 'missile': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        drawSprite(ctx, glowSprite('#ffcf5a', 4), -8, 0);
        ctx.fillStyle = '#e8f0e0';
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillStyle = '#ff5a3a';
        ctx.fillRect(4, -2, 3, 4);
        ctx.restore();
        break;
      }
    }
  }
}

/* =========================================================
 * EnemyBullet — 원형탄 / 바늘탄 / 유도 미사일
 * ========================================================= */
export class EnemyBullet {
  dead = false;
  age = 0;
  homing = 0;
  turn = 0;
  accel = 0;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public r: number,
    public color: string,
    public kind: 'orb' | 'needle' | 'missile',
  ) {}

  update(dt: number, player: Player) {
    this.age += dt;
    if (this.homing > 0 && player.alive) {
      this.homing -= dt;
      const ang = Math.atan2(this.vy, this.vx);
      let diff = Math.atan2(player.y - this.y, player.x - this.x) - ang;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const na = ang + clamp(diff, -this.turn * dt, this.turn * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp;
      this.vy = Math.sin(na) * sp;
    }
    if (this.accel !== 0) {
      const sp = Math.hypot(this.vx, this.vy);
      const ns = clamp(sp + this.accel * dt, 40, 520);
      this.vx *= ns / sp;
      this.vy *= ns / sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const m = 40;
    if (this.x < -m || this.x > VIEW_W + m || this.y < -m - 60 || this.y > VIEW_H + m) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.kind === 'orb') {
      drawSprite(ctx, glowSprite(this.color, this.r), this.x, this.y);
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    if (this.kind === 'needle') {
      const s = glowSprite(this.color, this.r);
      ctx.drawImage(s, -this.r * 3, -this.r, this.r * 6, this.r * 2);
    } else {
      drawSprite(ctx, glowSprite('#ffae3a', 5), -9, 0);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillStyle = '#ff3a3a';
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(13, 0);
      ctx.lineTo(8, 3);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* =========================================================
 * EnemyLaser — 경고선이 먼저 깜빡이고, 그 다음 굵은 빔이 나간다
 * ========================================================= */
export class EnemyLaser {
  dead = false;
  age = 0;
  private sounded = false;

  constructor(
    public x: number,
    public y: number,
    public angle: number,
    public width: number,
    public warn: number,
    public active: number,
    public rotSpeed = 0,
    /** 보스에 붙어 있는 레이저라면 매 프레임 발사 위치를 갱신한다 */
    public anchor: (() => { x: number; y: number }) | null = null,
    public color = '#ff4a6a',
  ) {}

  get firing() {
    return this.age >= this.warn && this.age < this.warn + this.active;
  }

  update(dt: number, world: World) {
    this.age += dt;
    if (this.anchor) {
      const p = this.anchor();
      this.x = p.x;
      this.y = p.y;
    }
    if (this.age > this.warn * 0.5) this.angle += this.rotSpeed * dt;
    if (this.firing && !this.sounded) {
      this.sounded = true;
      world.sfx('laser');
      world.shake(3);
    }
    if (this.age > this.warn + this.active + 0.25) this.dead = true;
  }

  /** 점(px,py)과 레이저 광선 사이 거리로 판정 */
  hits(px: number, py: number, r: number): boolean {
    if (!this.firing) return false;
    const dx = Math.cos(this.angle);
    const dy = Math.sin(this.angle);
    const rx = px - this.x;
    const ry = py - this.y;
    const along = rx * dx + ry * dy;
    if (along < 0) return false;
    const perp = Math.abs(rx * dy - ry * dx);
    return perp < this.width * 0.42 + r;
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    const len = 1400;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.age < this.warn) {
      // 경고선
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 40);
      ctx.fillStyle = this.color;
      ctx.fillRect(0, -1, len, 2);
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, -this.width / 2, len, this.width);
    } else {
      const since = this.age - this.warn;
      const left = this.warn + this.active - this.age;
      const grow = Math.min(1, since / 0.1) * clamp(left / 0.25 + 0.001, 0, 1);
      const w = this.width * grow * (1 + Math.sin(t * 50) * 0.08);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.3, this.color);
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(0.7, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, -w, len, w * 2);
      drawSprite(ctx, glowSprite(this.color, Math.max(4, w)), 0, 0);
    }
    ctx.restore();
  }
}

/* =========================================================
 * Item — [P] 파워업 / [B] 필살기. 화면 안에서 튕겨 다니다가 결국 아래로 빠져나간다
 * ========================================================= */
export class Item {
  dead = false;
  age = 0;
  vx = rand(-90, 90);
  vy = rand(-120, -60);

  constructor(
    public kind: 'P' | 'B',
    public x: number,
    public y: number,
  ) {}

  update(dt: number) {
    this.age += dt;
    this.vy = Math.min(this.vy + 90 * dt, 70);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 14 || this.x > VIEW_W - 14) {
      this.vx *= -1;
      this.x = clamp(this.x, 14, VIEW_W - 14);
    }
    // 8초 동안은 위쪽 벽에서도 튕긴다
    if (this.age < 8 && this.y < 20 && this.vy < 0) this.vy *= -1;
    if (this.y > VIEW_H + 20) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    const blink = this.age > 7 && Math.floor(t * 10) % 2 === 0;
    if (blink) return;
    const color = this.kind === 'P' ? '#ff4a4a' : '#3a8aff';
    ctx.save();
    ctx.translate(this.x, this.y);
    drawSprite(ctx, glowSprite(color, 12), 0, 0);
    ctx.rotate(Math.sin(t * 4) * 0.2);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-11, -9, 22, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.kind, 0, 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }
}

/* =========================================================
 * Enemy — 정면 진입 / 곡선 유도 / 체공 포격 / 대형 중장갑
 * ========================================================= */
export interface SwoopPath {
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
  dur: number;
}

function bezier(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

export class Enemy {
  dead = false;
  /** 화면 밖으로 빠져나감 (점수 없음) */
  escaped = false;
  age = 0;
  hp: number;
  maxHp: number;
  radius: number;
  points: number;
  flash = 0;
  angle = Math.PI;
  vx = 0;
  vy = 0;
  fireCool: number;
  swoop: SwoopPath | null = null;
  /** gunship/heavy — 멈춰서 싸울 높이 */
  holdY = 150;
  private shotsLeft: number;

  constructor(
    public kind: EnemyKind,
    public x: number,
    public y: number,
  ) {
    const s = ENEMY_STATS[kind];
    this.hp = s.hp;
    this.maxHp = s.hp;
    this.radius = s.radius;
    this.points = s.points;
    this.fireCool = rand(0.6, 1.6);
    this.shotsLeft = kind === 'fighter' || kind === 'swooper' ? 1 : 999;
  }

  hit(damage: number): boolean {
    this.hp -= damage;
    this.flash = 0.06;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  update(dt: number, w: World) {
    this.age += dt;
    this.flash -= dt;
    const st = w.stageDef;
    const px = w.player.x;
    const py = w.player.y;
    const aim = Math.atan2(py - this.y, px - this.x);

    switch (this.kind) {
      case 'fighter':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        break;
      case 'swooper': {
        const p = this.swoop!;
        const k = Math.min(1, this.age / p.dur);
        const nx = bezier(p.p0[0], p.p1[0], p.p2[0], p.p3[0], k);
        const ny = bezier(p.p0[1], p.p1[1], p.p2[1], p.p3[1], k);
        if (dt > 0) this.angle = Math.atan2(ny - this.y, nx - this.x) + Math.PI / 2;
        this.x = nx;
        this.y = ny;
        if (k >= 1) this.escape();
        break;
      }
      case 'gunship':
      case 'heavy': {
        const stay = this.kind === 'gunship' ? 7 : 13;
        const enter = this.kind === 'gunship' ? 90 : 55;
        if (this.age < stay && this.y < this.holdY) {
          this.y = Math.min(this.holdY, this.y + enter * dt * (this.kind === 'gunship' ? 1.6 : 1));
        } else if (this.age >= stay) {
          this.y += enter * 0.7 * dt;
        }
        this.x += Math.sin(this.age * 0.8) * (this.kind === 'gunship' ? 40 : 18) * dt;
        break;
      }
    }

    // 사격 — 화면 안쪽, 플레이어와 너무 가깝지 않을 때만
    if (this.y > 20 && this.y < VIEW_H * 0.72 && w.player.alive && this.shotsLeft > 0) {
      this.fireCool -= dt * st.fireRate;
      if (this.fireCool <= 0) this.shoot(w, aim);
    }

    if (this.y > VIEW_H + 80 || this.x < -140 || this.x > VIEW_W + 140) this.escape();
  }

  private escape() {
    if (this.dead) return;
    this.dead = true;
    this.escaped = true;
  }

  private shoot(w: World, aim: number) {
    const bs = w.stageDef.bulletSpeed;
    const stage = w.stageDef.stage;
    switch (this.kind) {
      case 'fighter':
      case 'swooper':
        this.shotsLeft -= 1;
        if (Math.random() < 0.65) {
          w.fire(this.x, this.y + 8, aim, 170 * bs, { color: '#ff6a4a' });
        }
        break;
      case 'gunship': {
        const ways = stage >= 2 ? 5 : 3;
        for (let i = 0; i < ways; i++) {
          const a = aim + (i - (ways - 1) / 2) * 0.2;
          w.fire(this.x, this.y + 14, a, 160 * bs, { color: '#ffb03a', kind: 'needle', r: 4 });
        }
        this.fireCool = 1.6;
        break;
      }
      case 'heavy': {
        if (Math.random() < 0.5) {
          const n = 14 + stage * 4;
          const off = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            w.fire(this.x, this.y, off + (i / n) * TAU, 110 * bs, { color: '#ff5ab0', r: 5 });
          }
        } else {
          for (let i = 0; i < 9; i++) {
            const a = Math.PI / 2 + (i - 4) * 0.16;
            w.fire(this.x, this.y + 30, a, 150 * bs, { color: '#ffd84a' });
          }
        }
        this.fireCool = 2.2;
        break;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    drawEnemyCraft(ctx, this.kind, this.x, this.y, this.angle, t, this.flash > 0);
    if ((this.kind === 'heavy' || this.kind === 'gunship') && this.hp < this.maxHp) {
      const w = this.radius * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 12, w, 4);
      ctx.fillStyle = '#ffda4a';
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 12, (w * this.hp) / this.maxHp, 4);
    }
  }
}

/* =========================================================
 * Boss — 등장 → 1단계 → 변신 → 2단계 → 격파 연출
 * ========================================================= */
export type BossState = 'enter' | 'fight' | 'transform' | 'dying';

/** 보스 판정 타원 (단계별) */
const BOSS_HITBOX: Record<BossId, [[number, number], [number, number]]> = {
  goliath: [
    [145, 52],
    [112, 40],
  ],
  kraken: [
    [145, 62],
    [145, 62],
  ],
  chronos: [
    [62, 72],
    [62, 72],
  ],
};

export class Boss {
  dead = false;
  x = VIEW_W / 2;
  y = -170;
  t = 0;
  hp: number;
  maxHp: number;
  phase: 1 | 2 = 1;
  state: BossState = 'enter';
  stateT = 0;
  flash = 0;
  open = 0;
  /** 패턴별 쿨다운 */
  private cool = new Map<string, number>();
  private spinA = 0;
  private spinB = 0;
  private laserDir = 1;
  private lastLaserEnd = 0;

  constructor(
    public id: BossId,
    hp: number,
  ) {
    this.hp = hp;
    this.maxHp = hp;
  }

  get rx() {
    return BOSS_HITBOX[this.id][this.phase === 1 ? 0 : 1][0];
  }
  get ry() {
    return BOSS_HITBOX[this.id][this.phase === 1 ? 0 : 1][1];
  }

  /** 점이 보스 판정 타원 안에 있는지 (r 만큼 여유) */
  contains(px: number, py: number, r: number) {
    const dx = (px - this.x) / (this.rx + r);
    const dy = (py - this.y) / (this.ry + r);
    return dx * dx + dy * dy <= 1;
  }

  get vulnerable() {
    return this.state === 'fight';
  }

  /** 데미지 — 'phase' 는 2단계 돌입, 'dead' 는 격파 */
  hit(damage: number): 'phase' | 'dead' | null {
    if (!this.vulnerable) return null;
    this.hp -= damage;
    this.flash = 0.05;
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.hp = this.maxHp / 2;
      this.state = 'transform';
      this.stateT = 0;
      return 'phase';
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.stateT = 0;
      return 'dead';
    }
    return null;
  }

  private ready(name: string, dt: number, interval: number, first = interval * 0.5): boolean {
    const v = (this.cool.get(name) ?? first) - dt;
    if (v <= 0) {
      this.cool.set(name, v + interval);
      return true;
    }
    this.cool.set(name, v);
    return false;
  }

  update(dt: number, w: World) {
    this.t += dt;
    this.stateT += dt;
    this.flash -= dt;
    switch (this.state) {
      case 'enter':
        this.y += (140 - this.y) * (1 - Math.pow(0.2, dt));
        if (this.stateT > 3.2) {
          this.state = 'fight';
          this.stateT = 0;
        }
        break;
      case 'transform':
        if (Math.random() < 0.4) {
          w.explode(this.x + rand(-this.rx, this.rx), this.y + rand(-this.ry, this.ry), rand(1, 2));
        }
        w.shake(6);
        if (this.id === 'kraken') this.open = Math.min(1, this.stateT / 2);
        if (this.stateT > 2.2) {
          this.phase = 2;
          this.state = 'fight';
          this.stateT = 0;
          this.cool.clear();
        }
        break;
      case 'dying':
        if (Math.random() < 0.5) {
          w.explode(
            this.x + rand(-this.rx, this.rx),
            this.y + rand(-this.ry, this.ry),
            rand(1, 2.5),
          );
          w.sfx('explode');
        }
        w.shake(8);
        this.y += 18 * dt;
        if (this.stateT > 3) {
          this.dead = true;
          for (let i = 0; i < 6; i++) {
            w.explode(this.x + rand(-60, 60), this.y + rand(-40, 40), 3);
          }
          w.sfx('bigExplode');
          w.shake(20);
        }
        break;
      case 'fight':
        this.move(dt);
        if (this.id === 'goliath') this.goliath(dt, w);
        else if (this.id === 'kraken') this.kraken(dt, w);
        else this.chronos(dt, w);
        break;
    }
  }

  private move(dt: number) {
    const t = this.t;
    let tx = VIEW_W / 2;
    let ty = 140;
    if (this.id === 'goliath') {
      tx += Math.sin(t * (this.phase === 1 ? 0.5 : 0.9)) * (this.phase === 1 ? 70 : 110);
      ty += Math.sin(t * 0.8) * 12;
    } else if (this.id === 'kraken') {
      tx += Math.sin(t * 0.35) * 60;
      ty += 10 + Math.sin(t * 0.6) * 8;
    } else {
      tx += Math.sin(t * (this.phase === 1 ? 0.6 : 1.1)) * (this.phase === 1 ? 80 : 120);
      ty += 10 + Math.sin(t * (this.phase === 1 ? 0.9 : 1.7)) * (this.phase === 1 ? 14 : 30);
    }
    const k = 1 - Math.pow(0.05, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  private aim(w: World, fx: number, fy: number) {
    return Math.atan2(w.player.y - fy, w.player.x - fx);
  }

  /* ---------- Stage 1: 거대 비행선 골리앗 ---------- */
  private goliath(dt: number, w: World) {
    const bs = w.stageDef.bulletSpeed;
    if (this.phase === 1) {
      // 부채꼴 7-Way
      if (this.ready('fan', dt, 1.25)) {
        const off = Math.sin(this.t * 1.7) * 0.25;
        for (let i = 0; i < 7; i++) {
          const a = Math.PI / 2 + off + (i - 3) * 0.17;
          w.fire(this.x, this.y + 40, a, 150 * bs, { color: '#ff5a5a', r: 5 });
        }
      }
      if (this.ready('snipe', dt, 0.9)) {
        w.fire(this.x, this.y + 40, this.aim(w, this.x, this.y + 40), 190 * bs, {
          color: '#ffd84a',
          kind: 'needle',
          r: 4,
        });
      }
      // 2연장 레이저 — 양쪽 포드에서 안쪽으로 쓸어온다
      if (this.ready('laser', dt, 5.5, 2.5)) {
        for (const s of [-1, 1]) {
          w.addLaser(
            new EnemyLaser(0, 0, Math.PI / 2 + s * 0.28, 24, 0.9, 1.5, -s * 0.2, () => ({
              x: this.x + s * 92,
              y: this.y + 28,
            })),
          );
        }
      }
    } else {
      // 조준탄 — 양쪽 포드에서 번갈아 3발
      if (this.ready('aimed', dt, 0.8)) {
        const s = Math.floor(this.t / 0.8) % 2 === 0 ? -1 : 1;
        const fx = this.x + s * 60;
        const fy = this.y + 16;
        const a = this.aim(w, fx, fy);
        for (let i = -1; i <= 1; i++) {
          w.fire(fx, fy, a + i * 0.12, 220 * bs, { color: '#ff4a8a', kind: 'needle', r: 4 });
        }
      }
      // 고속 회전 탄막 — 2.6초 쏘고 1.4초 쉰다
      const cycle = this.stateT % 4;
      if (cycle < 2.6 && this.ready('spin', dt, 0.06)) {
        this.spinA += 0.23;
        for (let k = 0; k < 3; k++) {
          w.fire(this.x, this.y, this.spinA + (k * TAU) / 3, 145 * bs, { color: '#ff9ad0', r: 4 });
        }
      }
    }
  }

  /* ---------- Stage 2: 해상 요새 크라켄 ---------- */
  private kraken(dt: number, w: World) {
    const bs = w.stageDef.bulletSpeed;
    if (this.phase === 1) {
      // 유도 미사일 폭격
      if (this.ready('missile', dt, 2.8, 1.2)) {
        for (const mx of [-112, -70, 70, 112]) {
          const a = -Math.PI / 2 + (mx < 0 ? -0.6 : 0.6);
          w.fire(this.x + mx, this.y - 15, a, 170 * bs, {
            kind: 'missile',
            r: 6,
            homing: 1.8,
            turn: 2.4,
          });
        }
      }
      // 유기적인 탄막 물결 — 촉수 끝에서 사인파로 흔들리며 쏟아진다
      if (this.ready('wave', dt, 0.12)) {
        for (const s of [-1, 1]) {
          const a = Math.PI / 2 + s * 0.25 + Math.sin(this.t * 2.2 + s) * 0.75;
          const sp = (135 + Math.sin(this.t * 3.1) * 30) * bs;
          w.fire(this.x + s * 90, this.y + 118, a, sp, { color: '#5ad0ff', r: 5 });
        }
      }
    } else {
      // 코어 개방 — 전방 방사형 레이저 5줄
      if (this.ready('radial', dt, 6.2, 1.5)) {
        this.laserDir *= -1;
        for (let i = 0; i < 5; i++) {
          w.addLaser(
            new EnemyLaser(
              0,
              0,
              Math.PI / 2 + (i - 2) * 0.42,
              18,
              1.1,
              1.9,
              this.laserDir * 0.2,
              () => ({ x: this.x, y: this.y + 8 }),
              '#ff3a5a',
            ),
          );
        }
        this.lastLaserEnd = this.t + 3;
      }
      const lasering = this.t < this.lastLaserEnd;
      if (this.ready('ring', dt, lasering ? 2.2 : 1.3)) {
        const n = 22;
        const off = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          w.fire(this.x, this.y + 8, off + (i / n) * TAU, 125 * bs, { color: '#ff7a9a', r: 5 });
        }
      }
      if (!lasering && this.ready('needle', dt, 0.7)) {
        for (const s of [-1, 1]) {
          const fx = this.x + s * 90;
          const fy = this.y + 118;
          w.fire(fx, fy, this.aim(w, fx, fy), 230 * bs, { color: '#5ad0ff', kind: 'needle', r: 4 });
        }
      }
    }
  }

  /* ---------- Stage 3: 시공간 메카 크로노스 ---------- */
  private chronos(dt: number, w: World) {
    const bs = w.stageDef.bulletSpeed;
    if (this.phase === 1) {
      const sealing = this.t < this.lastLaserEnd;
      // 나선형 소용돌이 — 서로 반대로 도는 두 나선
      if (this.ready('spiral', dt, sealing ? 0.2 : 0.1)) {
        this.spinA += 0.19;
        this.spinB -= 0.14;
        for (let k = 0; k < 3; k++) {
          w.fire(this.x, this.y, this.spinA + (k * TAU) / 3, 140 * bs, { color: '#c88aff', r: 5 });
          w.fire(this.x, this.y, this.spinB + (k * TAU) / 3, 110 * bs, { color: '#8ad8ff', r: 4 });
        }
      }
      // 봉인 레이저 — 플레이어 좌우와 위를 막는 우리
      if (this.ready('seal', dt, 8, 3)) {
        const p = w.player;
        const left = clamp(p.x - 80, 18, VIEW_W - 178);
        const right = left + 160;
        const top = clamp(p.y - 130, 260, VIEW_H - 200);
        const color = '#b86aff';
        w.addLaser(new EnemyLaser(left, -20, Math.PI / 2, 14, 1.2, 2.6, 0, null, color));
        w.addLaser(new EnemyLaser(right, -20, Math.PI / 2, 14, 1.2, 2.6, 0, null, color));
        w.addLaser(new EnemyLaser(-20, top, 0, 14, 1.2, 2.6, 0, null, color));
        this.lastLaserEnd = this.t + 3.8;
      }
    } else {
      // 광란 — 360도 헬파이어
      w.shake(2);
      if (this.ready('ring', dt, 0.55)) {
        this.spinA += 0.11;
        const n = 30;
        const color = Math.floor(this.t / 0.55) % 2 === 0 ? '#ff5a3a' : '#ffb03a';
        for (let i = 0; i < n; i++) {
          w.fire(this.x, this.y, this.spinA + (i / n) * TAU, 140 * bs, { color, r: 5 });
        }
      }
      if (this.ready('needles', dt, 1.3)) {
        const a = this.aim(w, this.x, this.y + 40);
        for (let i = -2; i <= 2; i++) {
          w.fire(this.x, this.y + 40, a + i * 0.09, 280 * bs, {
            color: '#ffffff',
            kind: 'needle',
            r: 4,
          });
        }
      }
      if (this.ready('accel', dt, 2.1, 1)) {
        // 느리게 퍼졌다가 가속하는 꽃잎탄
        for (let i = 0; i < 16; i++) {
          const b = w.fire(this.x, this.y, (i / 16) * TAU + this.spinA, 50, {
            color: '#ff3a8a',
            r: 6,
            accel: 120,
          });
          b.accel = 120 * bs;
        }
      }
    }
  }

  /** px, py: 플레이어 위치 (포탑이 조준하는 방향) */
  draw(ctx: CanvasRenderingContext2D, px: number, py: number) {
    const look: BossLook = {
      x: this.x,
      y: this.y,
      t: this.t,
      phase: this.phase,
      flash: this.flash > 0,
      morph: this.state === 'transform' ? Math.min(1, this.stateT / 2.2) : 0,
      open: this.open,
      hp: this.hp / this.maxHp,
      aim: Math.atan2(py - this.y, px - this.x),
    };
    if (this.id === 'goliath') drawGoliath(ctx, look);
    else if (this.id === 'kraken') drawKraken(ctx, look);
    else drawChronos(ctx, look);
  }
}
