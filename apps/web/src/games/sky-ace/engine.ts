import {
  BOMB_SEC,
  BOSS_WARNING_DELAY,
  BOSS_WARNING_SEC,
  INVINCIBLE_SEC,
  MAX_BOMBS,
  MAX_POWER,
  MAX_SCORE,
  PLAYER_BODY_RADIUS,
  PLAYER_FOCUS_SPEED,
  PLAYER_HIT_RADIUS,
  PLAYER_SPEED,
  POINTS_ALL_CLEAR,
  POINTS_BOMB_MAXED,
  POINTS_BOSS_PHASE,
  POINTS_ITEM_MAXED,
  POINTS_PER_BOMB_LEFT,
  POINTS_PER_LIFE_LEFT,
  POINTS_PER_SEC,
  POINTS_STAGE_CLEAR,
  STAGES,
  START_BOMBS,
  START_LIVES,
  STEP,
  VIEW_H,
  VIEW_W,
  ENEMY_STATS,
  getAircraft,
  type AircraftId,
  type StageDef,
  type WaveDef,
} from './config';
import {
  Boss,
  Enemy,
  EnemyBullet,
  type EnemyLaser,
  Item,
  Particle,
  Player,
  PlayerBullet,
  clamp,
  rand,
  type BulletOpts,
  type ParticleKind,
  type Target,
  type World,
} from './entities';
import {
  StageBackground,
  TAU,
  drawBigBomber,
  drawDrone,
  drawPlayerPlane,
  drawSprite,
  glowSprite,
} from './render';
import type { SoundManager, SfxName } from './sound';

/** 한 판이 끝났을 때 결과 */
export interface GameSummary {
  score: number;
  kills: number;
  timeSec: number;
  /** 도달한 스테이지 (1~3) */
  stageReached: number;
  /** 클리어한 스테이지 수 (0~3) */
  stagesCleared: number;
  allClear: boolean;
  aircraftName: string;
}

export interface EngineCallbacks {
  /** 게임 오버/올 클리어 연출이 끝난 뒤 한 번 호출 */
  onEnd: (summary: GameSummary) => void;
}

/**
 * idle: 메뉴 뒤에서 배경만 흐르는 상태 / playing: 게임 중
 * ending: 게임 오버·올 클리어 연출 / over: 결과 대기
 */
type Mode = 'idle' | 'playing' | 'ending' | 'over';

const MAX_PARTICLES = 900;
const MAX_ENEMY_BULLETS = 1400;

/* =========================================================
 * ScoreManager — 점수 · 격추 수 · 생존 시간
 * ========================================================= */
class ScoreManager {
  score = 0;
  kills = 0;
  time = 0;
  private secAcc = 0;

  add(points: number) {
    this.score = Math.min(MAX_SCORE, this.score + Math.round(points));
  }

  /** 살아 있는 동안 1초마다 생존 점수 */
  tick(dt: number) {
    this.time += dt;
    this.secAcc += dt;
    while (this.secAcc >= 1) {
      this.secAcc -= 1;
      this.add(POINTS_PER_SEC);
    }
  }
}

/* =========================================================
 * StageManager — 편대 스크립트 → 보스 경고 → 보스전 → 스테이지 클리어
 * ========================================================= */
type StagePhase = 'waves' | 'warning' | 'boss' | 'clear';

interface Pending {
  at: number;
  run: () => void;
}

class StageManager {
  index = 0;
  t = 0;
  phase: StagePhase = 'waves';
  phaseT = 0;
  cleared = 0;
  /** 스테이지 클리어 화면에 보여 줄 보너스 */
  clearBonus = 0;
  private waveIdx = 0;
  private pending: Pending[] = [];

  constructor(private engine: SkyAceEngine) {}

  get def(): StageDef {
    return STAGES[this.index]!;
  }

  start(index: number) {
    this.index = index;
    this.t = 0;
    this.phase = 'waves';
    this.phaseT = 0;
    this.waveIdx = 0;
    this.pending = [];
  }

  private setPhase(p: StagePhase) {
    this.phase = p;
    this.phaseT = 0;
  }

  update(dt: number) {
    this.t += dt;
    this.phaseT += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      if (p.at <= this.t) {
        this.pending.splice(i, 1);
        p.run();
      }
    }
    const waves = this.def.waves;
    switch (this.phase) {
      case 'waves': {
        while (this.waveIdx < waves.length && waves[this.waveIdx]!.t <= this.t) {
          this.spawnWave(waves[this.waveIdx]!);
          this.waveIdx += 1;
        }
        const lastT = waves[waves.length - 1]?.t ?? 0;
        if (this.waveIdx >= waves.length && this.t >= lastT + BOSS_WARNING_DELAY) {
          this.setPhase('warning');
          this.engine.onWarning();
        }
        break;
      }
      case 'warning':
        if (this.phaseT >= BOSS_WARNING_SEC) {
          this.setPhase('boss');
          this.engine.spawnBoss(this.def);
        }
        break;
      case 'boss':
        break;
      case 'clear':
        if (this.phaseT >= 5) {
          if (this.index + 1 < STAGES.length) this.engine.beginStage(this.index + 1);
          else this.engine.finish(true);
        }
        break;
    }
  }

  bossDefeated(bonus: number) {
    this.cleared += 1;
    this.clearBonus = bonus;
    this.setPhase('clear');
  }

  private later(delay: number, run: () => void) {
    this.pending.push({ at: this.t + delay, run });
  }

  private spawnWave(w: WaveDef) {
    const e = this.engine;
    const X = (r: number) => clamp(r * VIEW_W, 30, VIEW_W - 30);
    switch (w.f) {
      case 'line': {
        const gap = w.gap ?? 64;
        for (let i = 0; i < w.n; i++) {
          const x = clamp(X(w.x) + (i - (w.n - 1) / 2) * gap, 24, VIEW_W - 24);
          e.addEnemy(this.fighter(x, -30, 0, 150));
        }
        break;
      }
      case 'v': {
        for (let i = 0; i < w.n; i++) {
          const k = i - (w.n - 1) / 2;
          const x = clamp(X(w.x) + k * 38, 24, VIEW_W - 24);
          e.addEnemy(this.fighter(x, -30 - Math.abs(k) * 30, 0, 165));
        }
        break;
      }
      case 'swoop': {
        const s = w.side === 'L' ? 1 : -1;
        const mx = (x: number) => (s === 1 ? x : VIEW_W - x);
        for (let i = 0; i < w.n; i++) {
          this.later(i * 0.28, () => {
            const en = new Enemy('swooper', mx(-30), 100);
            en.swoop = {
              p0: [mx(-30), 100],
              p1: [mx(VIEW_W * 1.05), 140],
              p2: [mx(VIEW_W * 0.55), 580],
              p3: [mx(-60), 420],
              dur: 4.4,
            };
            e.addEnemy(en);
          });
        }
        break;
      }
      case 'gunship': {
        const en = new Enemy('gunship', X(w.x), -40);
        en.holdY = rand(110, 190);
        e.addEnemy(en);
        break;
      }
      case 'heavy': {
        const en = new Enemy('heavy', X(w.x), -70);
        en.holdY = 150;
        e.addEnemy(en);
        break;
      }
      case 'rain': {
        for (let i = 0; i < w.n; i++) {
          this.later(rand(0, w.dur), () => {
            const x = rand(30, VIEW_W - 30);
            const toward = clamp((e.player.x - x) * 0.25, -60, 60);
            e.addEnemy(this.fighter(x, -30, toward, rand(170, 230)));
          });
        }
        break;
      }
    }
  }

  private fighter(x: number, y: number, vx: number, vy: number) {
    const en = new Enemy('fighter', x, y);
    en.vx = vx;
    en.vy = vy;
    return en;
  }
}

/* =========================================================
 * 필살기 상태
 * ========================================================= */
interface Slash {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  at: number;
  done: boolean;
}

interface BombState {
  kind: AircraftId;
  t: number;
  tick: number;
  slashes: Slash[];
}

const VORTEX_X = VIEW_W / 2;
const VORTEX_Y = VIEW_H * 0.42;
const VORTEX_R = 170;

/* =========================================================
 * SkyAceEngine — 게임 루프(requestAnimationFrame), 입력, 충돌, 렌더링
 * ========================================================= */
export class SkyAceEngine implements World {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private mode: Mode = 'idle';
  private paused = false;

  player: Player = new Player(getAircraft('p38'), START_LIVES, START_BOMBS);
  private bullets: PlayerBullet[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private lasers: EnemyLaser[] = [];
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private items: Item[] = [];
  private particles: Particle[] = [];
  private bg = new StageBackground();
  private score = new ScoreManager();
  private stage: StageManager = new StageManager(this);
  private bomb: BombState | null = null;
  private timeStop = 0;
  private shakeAmt = 0;
  private flash = 0;
  private flashColor = '#ffffff';
  private endT = 0;
  private allClear = false;
  private killsSincePower = 0;
  private stageBannerT = 0;

  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private sound: SoundManager,
    private cb: EngineCallbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저는 Canvas 를 지원하지 않아요.');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  /* ---------------- 외부 제어 ---------------- */

  start(aircraft: AircraftId) {
    this.player = new Player(getAircraft(aircraft), START_LIVES, START_BOMBS);
    this.player.invincible = 2;
    this.bullets = [];
    this.enemyBullets = [];
    this.lasers = [];
    this.enemies = [];
    this.items = [];
    this.particles = [];
    this.boss = null;
    this.bomb = null;
    this.timeStop = 0;
    this.score = new ScoreManager();
    this.stage = new StageManager(this);
    this.allClear = false;
    this.killsSincePower = 0;
    this.endT = 0;
    this.paused = false;
    this.mode = 'playing';
    this.beginStage(0);
  }

  pause() {
    this.paused = true;
    this.keys.clear();
    this.drag = null;
  }

  resume() {
    this.paused = false;
    this.last = performance.now();
  }

  get playing() {
    return this.mode === 'playing';
  }

  /** 필살기 발동 (키보드 X/B, 모바일 버튼) */
  useBomb() {
    const p = this.player;
    if (this.mode !== 'playing' || this.paused || !p.alive || this.bomb || p.bombs <= 0) return;
    p.bombs -= 1;
    p.invincible = Math.max(p.invincible, BOMB_SEC + 0.4);
    this.bomb = { kind: p.def.id, t: 0, tick: 0, slashes: [] };
    for (const l of this.lasers) l.dead = true;
    this.shake(16);
    this.flash = 0.9;
    this.sound.play('bomb');
    if (p.def.id === 'p38') {
      this.flashColor = '#ffffff';
      this.clearEnemyBullets();
    } else if (p.def.id === 'shinden') {
      this.flashColor = '#ffb060';
    } else {
      this.flashColor = '#a8c8ff';
      this.timeStop = BOMB_SEC;
      // 화면을 가르는 환영 칼날 7줄
      for (let i = 0; i < 7; i++) {
        const horizontal = i % 2 === 0;
        const c = rand(120, VIEW_H - 200);
        const tilt = rand(-140, 140);
        this.bomb.slashes.push(
          horizontal
            ? {
                x1: -40,
                y1: c - tilt,
                x2: VIEW_W + 40,
                y2: c + tilt,
                at: 0.15 + i * 0.3,
                done: false,
              }
            : {
                x1: rand(60, VIEW_W - 60) - tilt * 0.5,
                y1: -40,
                x2: rand(60, VIEW_W - 60) + tilt * 0.5,
                y2: VIEW_H + 40,
                at: 0.15 + i * 0.3,
                done: false,
              },
        );
      }
    }
  }

  /* ---------------- World 구현 (적·보스가 사용) ---------------- */

  get stageDef(): StageDef {
    return this.stage.def;
  }

  fire(x: number, y: number, angle: number, speed: number, opts: BulletOpts = {}): EnemyBullet {
    const b = new EnemyBullet(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      opts.r ?? 5,
      opts.color ?? '#ff5a5a',
      opts.kind ?? 'orb',
    );
    b.homing = opts.homing ?? 0;
    b.turn = opts.turn ?? 0;
    b.accel = opts.accel ?? 0;
    // 필살기 중이거나 너무 많으면 화면에 넣지 않는다
    if (!this.bomb && this.enemyBullets.length < MAX_ENEMY_BULLETS) this.enemyBullets.push(b);
    return b;
  }

  addLaser(laser: EnemyLaser) {
    if (this.bomb) return;
    this.lasers.push(laser);
  }

  explode(x: number, y: number, size: number) {
    const n = Math.round(10 * size);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 160) * size;
      this.particle(
        'fire',
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.3, 0.7),
        rand(8, 14) * size,
        i % 3 === 0 ? '#ffd24a' : '#ff6a1a',
      );
    }
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(150, 420) * Math.sqrt(size);
      this.particle('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), 2, '#fff2b0');
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const a = rand(0, TAU);
      const s = rand(60, 200) * size;
      this.particle(
        'debris',
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s - 60,
        rand(0.6, 1.2),
        rand(2, 4),
        '#3a3530',
      );
    }
    for (let i = 0; i < Math.ceil(n / 4); i++) {
      this.particle(
        'smoke',
        x + rand(-10, 10),
        y + rand(-10, 10),
        rand(-20, 20),
        rand(10, 40),
        rand(0.8, 1.4),
        rand(6, 12) * size,
        '#5a5550',
      );
    }
    this.particle('ring', x, y, 0, 0, 0.4, 50 * size, '#ffe0a0');
  }

  shake(amount: number) {
    this.shakeAmt = Math.min(24, Math.max(this.shakeAmt, amount));
  }

  sfx(name: SfxName) {
    this.sound.play(name);
  }

  /* ---------------- StageManager 콜백 ---------------- */

  addEnemy(e: Enemy) {
    this.enemies.push(e);
  }

  beginStage(index: number) {
    this.stage.start(index);
    this.bg.reset(index + 1);
    this.stageBannerT = 3;
    this.sound.playBgm(index + 1);
  }

  onWarning() {
    this.sound.stopBgm();
    this.sound.play('warning');
  }

  spawnBoss(def: StageDef) {
    this.boss = new Boss(def.boss, def.bossHp);
    this.sound.playBgm(4);
  }

  finish(allClear: boolean) {
    if (this.mode !== 'playing') return;
    this.allClear = allClear;
    if (allClear) {
      const p = this.player;
      this.score.add(
        POINTS_ALL_CLEAR + p.lives * POINTS_PER_LIFE_LEFT + p.bombs * POINTS_PER_BOMB_LEFT,
      );
    }
    this.mode = 'ending';
    this.endT = 0;
    this.sound.stopBgm();
    if (allClear) this.sound.play('clear');
  }

  /* ---------------- 루프 ---------------- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP);
        this.acc -= STEP;
        steps += 1;
      }
      if (steps === 5) this.acc = 0;
    }
    this.draw();
  };

  private step(dt: number) {
    this.t += dt;
    this.bg.update(dt, this.timeStop > 0 ? 0.15 : 1);
    this.shakeAmt *= Math.pow(0.88, dt * 60);
    if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.stageBannerT > 0) this.stageBannerT -= dt;
    this.updateParticles(dt);
    if (this.mode === 'idle' || this.mode === 'over') return;

    const p = this.player;
    const playing = this.mode === 'playing';
    if (playing) {
      this.score.tick(dt);
      this.stage.update(dt);
      this.updatePlayer(dt);
      this.updateBomb(dt);
    }

    // 시간 정지 중에는 적과 적탄이 멈춘다
    const edt = this.timeStop > 0 ? 0 : dt;
    if (this.timeStop > 0) {
      this.timeStop -= dt;
      if (this.timeStop <= 0) this.clearEnemyBullets();
    }
    for (const e of this.enemies) e.update(edt, this);
    if (this.boss) {
      this.boss.update(edt, this);
      if (this.boss.dead) this.onBossDestroyed();
    }
    for (const b of this.enemyBullets) b.update(edt, p);
    for (const l of this.lasers) l.update(edt, this);
    for (const b of this.bullets) b.update(dt, this.pickTarget);
    for (const it of this.items) it.update(dt);

    if (playing) this.collide();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.lasers = this.lasers.filter((l) => !l.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.items = this.items.filter((i) => !i.dead);

    if (this.mode === 'ending') {
      this.endT += dt;
      if (this.endT > 2.8) {
        this.mode = 'over';
        this.cb.onEnd(this.summary());
      }
    }
  }

  private summary(): GameSummary {
    const cleared = this.stage.cleared;
    return {
      score: this.score.score,
      kills: this.score.kills,
      timeSec: Math.floor(this.score.time),
      stageReached: Math.min(STAGES.length, this.stage.index + 1),
      stagesCleared: cleared,
      allClear: this.allClear,
      aircraftName: this.player.def.name,
    };
  }

  /* ---------------- 플레이어 ---------------- */

  private updatePlayer(dt: number) {
    const p = this.player;
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        p.x = VIEW_W / 2;
        p.y = VIEW_H - 90;
        p.invincible = INVINCIBLE_SEC;
        p.bombs = Math.max(p.bombs, START_BOMBS);
      }
      return;
    }
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (k.has('arrowleft') || k.has('a')) dx -= 1;
    if (k.has('arrowright') || k.has('d')) dx += 1;
    if (k.has('arrowup') || k.has('w')) dy -= 1;
    if (k.has('arrowdown') || k.has('s')) dy += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = (k.has('shift') ? PLAYER_FOCUS_SPEED : PLAYER_SPEED * p.def.speed) * dt;
      p.move((dx / len) * speed, (dy / len) * speed);
    }
    p.update(dt);
    this.firePlayer(dt);
  }

  private shot(
    kind: PlayerBullet['kind'],
    x: number,
    y: number,
    angle: number,
    speed: number,
    dmg: number,
    r: number,
  ) {
    this.bullets.push(
      new PlayerBullet(kind, x, y, Math.sin(angle) * speed, -Math.cos(angle) * speed, dmg, r),
    );
  }

  private firePlayer(dt: number) {
    const p = this.player;
    const lv = p.power;
    p.shotCool -= dt;
    p.subCool -= dt;
    const firing = this.stage.phase !== 'clear';
    p.beamOn = false;
    if (!firing) return;

    if (p.def.id === 'p38') {
      if (p.shotCool <= 0) {
        p.shotCool += 0.09;
        const xs = lv === 1 ? [-6, 6] : [-15, -5, 5, 15];
        for (const ox of xs) this.shot('plasma', p.x + ox, p.y - 16, 0, 900, 1.1, 6);
        if (lv === 3) {
          this.shot('plasma', p.x - 20, p.y - 8, -0.14, 880, 0.9, 6);
          this.shot('plasma', p.x + 20, p.y - 8, 0.14, 880, 0.9, 6);
        }
        this.sound.play('shot');
      }
      if (p.subCool <= 0) {
        p.subCool += [0.22, 0.18, 0.14][lv - 1]!;
        for (const d of p.drones) {
          this.shot('drone', d.x, d.y - 8, 0, 800, 0.9, 4);
          if (lv === 3) this.shot('drone', d.x, d.y - 8, d.x < p.x ? -0.08 : 0.08, 800, 0.9, 4);
        }
      }
    } else if (p.def.id === 'shinden') {
      if (p.shotCool <= 0) {
        p.shotCool += 0.12;
        const ways = [3, 5, 7][lv - 1]!;
        for (let i = 0; i < ways; i++) {
          const a = (i - (ways - 1) / 2) * 0.13;
          this.shot('pierce', p.x + a * 30, p.y - 14, a, 820, 1, 6);
        }
        this.sound.play('shot');
      }
      this.fireBeam(dt);
    } else {
      if (p.shotCool <= 0) {
        p.shotCool += 0.065;
        if (lv === 1) {
          p.missileSide *= -1;
          this.shot('rapid', p.x + p.missileSide * 4, p.y - 18, 0, 1000, 1.2, 5);
        } else if (lv === 2) {
          this.shot('rapid', p.x - 5, p.y - 18, 0, 1000, 1, 5);
          this.shot('rapid', p.x + 5, p.y - 18, 0, 1000, 1, 5);
        } else {
          this.shot('rapid', p.x, p.y - 20, 0, 1000, 1, 5);
          this.shot('rapid', p.x - 7, p.y - 16, -0.07, 1000, 1, 5);
          this.shot('rapid', p.x + 7, p.y - 16, 0.07, 1000, 1, 5);
        }
        this.sound.play('shot');
      }
      if (p.subCool <= 0) {
        p.subCool += [0.6, 0.5, 0.4][lv - 1]!;
        // 왼쪽에서 오른쪽으로, 오른쪽에서 왼쪽으로 교차 발사
        for (const s of [-1, 1]) {
          const m = new PlayerBullet('missile', p.x + s * 10, p.y, -s * 260, -120, 3, 6);
          this.bullets.push(m);
        }
      }
    }
  }

  /** 신덴 빔 — 가장 가까운 대상에서 멈추고 초당 데미지를 준다 */
  private fireBeam(dt: number) {
    const p = this.player;
    const lv = p.power;
    const w = [10, 14, 18][lv - 1]!;
    const dps = [18, 24, 30][lv - 1]!;
    let endY = -20;
    let target: Target | null = null;
    for (const e of this.enemies) {
      if (e.dead || e.y > p.y || e.y < -e.radius) continue;
      if (Math.abs(e.x - p.x) > e.radius + w / 2) continue;
      const bottom = e.y + e.radius * 0.6;
      if (bottom > endY) {
        endY = bottom;
        target = e;
      }
    }
    const b = this.boss;
    if (b && !b.dead && b.y < p.y && b.state !== 'dying') {
      const dx = (p.x - b.x) / (b.rx + w / 2);
      if (Math.abs(dx) < 1) {
        const bottom = b.y + b.ry * Math.sqrt(1 - dx * dx);
        if (bottom > endY && bottom < p.y) {
          endY = bottom;
          target = b;
        }
      }
    }
    p.beamOn = true;
    p.beamEndY = endY;
    if (target) {
      if (Math.random() < 0.5) {
        this.particle(
          'spark',
          p.x + rand(-w / 2, w / 2),
          endY,
          rand(-160, 160),
          rand(40, 200),
          0.25,
          2,
          '#ffd08a',
        );
      }
      this.damage(target, dps * dt);
    }
  }

  private pickTarget = (x: number, y: number): Target | null => {
    let best: Target | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.y < -10 || e.y > VIEW_H) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    const b = this.boss;
    if (b && b.vulnerable) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2 - 80 * 80;
      if (d < bestD) best = b;
    }
    return best;
  };

  /* ---------------- 필살기 ---------------- */

  private updateBomb(dt: number) {
    const bomb = this.bomb;
    if (!bomb) return;
    bomb.t += dt;
    bomb.tick += dt;
    const tick = bomb.tick >= 0.1;
    if (tick) bomb.tick -= 0.1;

    if (bomb.kind === 'p38') {
      // 폭격기 편대가 지나가는 줄 아래로 폭발이 이어진다
      const k = bomb.t / BOMB_SEC;
      const by = VIEW_H + 100 - (VIEW_H + 260) * k;
      if (tick) {
        for (let i = 0; i < 3; i++) {
          this.explode(rand(20, VIEW_W - 20), clamp(by + rand(30, 200), 0, VIEW_H), rand(1, 1.8));
        }
        this.shake(8);
        this.sound.play('explode');
        this.bombDamage(() => true, 3, 2.2);
      }
    } else if (bomb.kind === 'shinden') {
      // 회오리가 적탄을 끌어당겨 흡수한다
      const r = VORTEX_R * Math.min(1, bomb.t / 0.4);
      for (const b of this.enemyBullets) {
        const dx = VORTEX_X - b.x;
        const dy = VORTEX_Y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < r) {
          b.dead = true;
          this.score.add(10);
          this.particle('spark', b.x, b.y, dx * 2, dy * 2, 0.3, 2, '#ffc070');
        } else {
          const pull = 900 / Math.max(60, d);
          b.vx += (dx / d) * pull * 60 * dt;
          b.vy += (dy / d) * pull * 60 * dt;
        }
      }
      if (tick) {
        this.shake(5);
        this.bombDamage((x, y, rad) => Math.hypot(x - VORTEX_X, y - VORTEX_Y) < r + rad, 4, 3);
      }
    } else {
      for (const s of bomb.slashes) {
        if (!s.done && bomb.t >= s.at) {
          s.done = true;
          this.shake(10);
          this.flash = Math.max(this.flash, 0.35);
          this.sound.play('laser');
          this.bombDamage(() => true, 8, 9);
          for (let i = 0; i < 16; i++) {
            const k = Math.random();
            this.particle(
              'spark',
              s.x1 + (s.x2 - s.x1) * k,
              s.y1 + (s.y2 - s.y1) * k,
              rand(-200, 200),
              rand(-200, 200),
              0.4,
              2,
              '#d8f0ff',
            );
          }
        }
      }
    }

    if (bomb.t >= BOMB_SEC) {
      this.bomb = null;
      if (bomb.kind !== 'spitfire') this.clearEnemyBullets();
    }
  }

  /** 필살기 범위 안의 적과 보스에 데미지 */
  private bombDamage(
    inRange: (x: number, y: number, r: number) => boolean,
    enemyDmg: number,
    bossDmg: number,
  ) {
    for (const e of this.enemies) {
      if (!e.dead && e.y > -e.radius && inRange(e.x, e.y, e.radius)) this.damage(e, enemyDmg);
    }
    const b = this.boss;
    if (b && inRange(b.x, b.y, b.rx * 0.5)) this.damage(b, bossDmg);
  }

  /* ---------------- 충돌 ---------------- */

  private collide() {
    const p = this.player;

    // 플레이어 탄 → 적 / 보스
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || (b.hitSet && b.hitSet.has(e))) continue;
        const rr = e.radius + b.r;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > rr * rr) continue;
        this.hitSpark(b.x, b.y);
        this.damage(e, b.damage);
        if (b.hitSet) b.hitSet.add(e);
        else {
          b.dead = true;
          break;
        }
      }
      const boss = this.boss;
      if (
        !b.dead &&
        boss &&
        boss.state !== 'dying' &&
        boss.y > -60 &&
        !(b.hitSet && b.hitSet.has(boss))
      ) {
        if (boss.contains(b.x, b.y, b.r)) {
          this.hitSpark(b.x, b.y);
          this.damage(boss, b.damage);
          if (b.hitSet) b.hitSet.add(boss);
          else b.dead = true;
        }
      }
    }

    // 아이템
    if (p.alive) {
      for (const it of this.items) {
        if ((it.x - p.x) ** 2 + (it.y - p.y) ** 2 < 28 * 28) {
          it.dead = true;
          this.pickup(it);
        }
      }
    }

    if (!p.alive || p.invincible > 0) return;

    // 적탄 → 플레이어
    for (const b of this.enemyBullets) {
      const rr = b.r * 0.7 + PLAYER_HIT_RADIUS;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < rr * rr) {
        b.dead = true;
        this.playerHit();
        return;
      }
    }
    for (const l of this.lasers) {
      if (l.hits(p.x, p.y, PLAYER_HIT_RADIUS)) {
        this.playerHit();
        return;
      }
    }
    // 적 기체와 몸통 충돌
    for (const e of this.enemies) {
      const rr = e.radius * 0.7 + PLAYER_BODY_RADIUS * 0.5;
      if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
        this.damage(e, 10);
        this.playerHit();
        return;
      }
    }
    const boss = this.boss;
    if (boss && boss.state === 'fight' && boss.contains(p.x, p.y, -8)) {
      this.playerHit();
    }
  }

  private hitSpark(x: number, y: number) {
    if (this.particles.length > MAX_PARTICLES * 0.8) return;
    for (let i = 0; i < 2; i++) {
      this.particle('spark', x, y, rand(-180, 180), rand(-60, 160), 0.18, 1.5, '#fff6c0');
    }
    this.sound.play('hit');
  }

  /** 적/보스에 데미지를 주고 격추·단계 변화를 처리 */
  private damage(target: Target, amount: number) {
    if (target instanceof Enemy) {
      if (target.hit(amount)) this.onEnemyKilled(target);
      return;
    }
    const result = target.hit(amount);
    if (result === 'phase') {
      this.score.add(POINTS_BOSS_PHASE);
      this.popup(target.x, target.y + 60, `+${POINTS_BOSS_PHASE.toLocaleString()}`, '#ffe07a', 22);
      this.clearEnemyBullets();
      for (const l of this.lasers) l.dead = true;
      this.flash = 0.8;
      this.flashColor = '#ffffff';
      this.shake(18);
      this.sound.play('phase');
    } else if (result === 'dead') {
      this.clearEnemyBullets();
      for (const l of this.lasers) l.dead = true;
      for (const e of this.enemies) {
        if (!e.dead) {
          e.dead = true;
          this.explode(e.x, e.y, 1);
        }
      }
      this.sound.stopBgm();
      this.sound.play('bigExplode');
    }
  }

  private onEnemyKilled(e: Enemy) {
    this.score.add(e.points);
    this.score.kills += 1;
    const big = e.kind === 'heavy' || e.kind === 'gunship';
    this.explode(e.x, e.y, e.kind === 'heavy' ? 2.6 : big ? 1.6 : 0.9);
    this.sound.play(e.kind === 'heavy' ? 'bigExplode' : 'explode');
    if (e.kind === 'heavy') this.shake(12);
    if (big) this.popup(e.x, e.y - 10, `+${e.points}`, '#ffffff', 16);

    const st = ENEMY_STATS[e.kind];
    this.killsSincePower += 1;
    // 오래 못 먹었으면 [P] 를 보장해 준다
    const pity = this.player.power < MAX_POWER && this.killsSincePower >= 28;
    if (Math.random() < st.dropP || pity) {
      this.items.push(new Item('P', e.x, e.y));
      this.killsSincePower = 0;
    }
    if (Math.random() < st.dropB) this.items.push(new Item('B', e.x + 10, e.y));
  }

  private onBossDestroyed() {
    const b = this.boss!;
    const def = this.stage.def;
    this.boss = null;
    const p = this.player;
    const bonus =
      def.bossPoints +
      POINTS_STAGE_CLEAR * def.stage +
      p.lives * POINTS_PER_LIFE_LEFT +
      p.bombs * POINTS_PER_BOMB_LEFT;
    this.score.add(bonus);
    this.stage.bossDefeated(bonus);
    this.flash = 1;
    this.flashColor = '#ffffff';
    this.popup(b.x, b.y, `+${def.bossPoints.toLocaleString()}`, '#ffe07a', 26);
    if (def.stage < STAGES.length) this.sound.play('clear');
  }

  private pickup(it: Item) {
    const p = this.player;
    if (it.kind === 'P') {
      if (p.power < MAX_POWER) {
        p.power += 1;
        this.popup(p.x, p.y - 30, p.power === MAX_POWER ? 'MAX POWER!' : 'POWER UP', '#ff8a8a', 16);
      } else {
        this.score.add(POINTS_ITEM_MAXED);
        this.popup(p.x, p.y - 30, `+${POINTS_ITEM_MAXED}`, '#ff8a8a', 14);
      }
      this.sound.play('power');
    } else {
      if (p.bombs < MAX_BOMBS) {
        p.bombs += 1;
        this.popup(p.x, p.y - 30, 'BOMB +1', '#8ab8ff', 16);
      } else {
        this.score.add(POINTS_BOMB_MAXED);
        this.popup(p.x, p.y - 30, `+${POINTS_BOMB_MAXED}`, '#8ab8ff', 14);
      }
      this.sound.play('bombItem');
    }
  }

  private playerHit() {
    const p = this.player;
    this.explode(p.x, p.y, 2);
    this.shake(18);
    this.flash = 0.6;
    this.flashColor = '#ff6a4a';
    this.sound.play('die');
    // 격추되면 파워 1단계를 떨어뜨려 다시 주울 수 있게 한다
    if (p.power > 1) {
      p.power -= 1;
      this.items.push(new Item('P', p.x, p.y - 20));
    }
    p.lives -= 1;
    p.respawn = 1.4;
    p.beamOn = false;
    this.clearEnemyBullets();
    for (const l of this.lasers) l.dead = true;
    if (p.lives <= 0) {
      p.respawn = Infinity;
      this.finish(false);
    }
  }

  /** 화면의 적탄을 전부 반짝이며 지운다 */
  private clearEnemyBullets() {
    for (const b of this.enemyBullets) {
      if (this.particles.length < MAX_PARTICLES) {
        this.particle('fire', b.x, b.y, 0, -30, 0.3, 6, b.color);
      }
    }
    this.enemyBullets = [];
  }

  /* ---------------- 파티클 ---------------- */

  private particle(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
  ) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push(new Particle(kind, x, y, vx, vy, life, size, color));
  }

  private popup(x: number, y: number, text: string, color: string, size: number) {
    const pt = new Particle('text', x, y, 0, -40, 1.2, size, color);
    pt.text = text;
    this.particles.push(pt);
  }

  private updateParticles(dt: number) {
    this.particles = this.particles.filter((p) => p.update(dt));
  }

  /* ---------------- 그리기 ---------------- */

  private resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(VIEW_W * dpr);
    this.canvas.height = Math.round(VIEW_H * dpr);
  };

  private draw() {
    const ctx = this.ctx;
    const scale = this.canvas.width / VIEW_W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    if (this.shakeAmt > 0 && !this.paused) {
      ctx.translate(rand(-1, 1) * this.shakeAmt, rand(-1, 1) * this.shakeAmt);
    }
    this.bg.draw(ctx, this.t);

    if (this.mode !== 'idle') {
      for (const it of this.items) it.draw(ctx, this.t);
      for (const e of this.enemies) e.draw(ctx, this.t);
      this.boss?.draw(ctx);
      for (const l of this.lasers) l.draw(ctx, this.t);

      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bullets) b.draw(ctx);
      this.drawBeam(ctx);
      ctx.globalCompositeOperation = 'source-over';

      this.drawPlayer(ctx);
      this.drawBombFx(ctx);

      for (const b of this.enemyBullets) b.draw(ctx);
    }

    for (const pt of this.particles) if (!pt.additive) pt.draw(ctx);
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of this.particles) if (pt.additive) pt.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    if (this.timeStop > 0) {
      ctx.fillStyle = 'rgba(70,110,220,0.22)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash) * 0.7;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    if (this.mode !== 'idle') {
      this.drawHud(ctx);
      this.drawBanners(ctx);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    if (!p.alive) return;
    if (p.invincible > 0 && !this.bomb && Math.floor(this.t * 20) % 2 === 0) return;
    if (p.def.id === 'p38') for (const d of p.drones) drawDrone(ctx, d.x, d.y, this.t);
    drawPlayerPlane(ctx, p.def.id, p.x, p.y, this.t, p.bank, p.def.color, p.def.accent);
    // 진짜 피격 판정 위치
    drawSprite(ctx, glowSprite('#ff3a6a', 3), p.x, p.y);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_HIT_RADIUS - 1.5, 0, TAU);
    ctx.fill();
  }

  private drawBeam(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    if (!p.beamOn || !p.alive) return;
    const w = [10, 14, 18][p.power - 1]! * (1 + Math.sin(this.t * 60) * 0.12);
    const top = p.beamEndY;
    const bottom = p.y - 22;
    if (bottom <= top) return;
    const g = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
    g.addColorStop(0, 'rgba(255,120,20,0)');
    g.addColorStop(0.3, 'rgba(255,140,40,0.8)');
    g.addColorStop(0.5, '#fff6e0');
    g.addColorStop(0.7, 'rgba(255,140,40,0.8)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - w, top, w * 2, bottom - top);
    drawSprite(ctx, glowSprite('#ff9a3a', w * 0.8), p.x, bottom);
    drawSprite(ctx, glowSprite('#ffd08a', w), p.x, top);
  }

  private drawBombFx(ctx: CanvasRenderingContext2D) {
    const bomb = this.bomb;
    if (!bomb) return;
    const t = bomb.t;
    if (bomb.kind === 'p38') {
      const k = t / BOMB_SEC;
      const by = VIEW_H + 100 - (VIEW_H + 260) * k;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      for (const fx of [0.22, 0.5, 0.78]) {
        ctx.beginPath();
        ctx.ellipse(fx * VIEW_W + 30, by + 60 + (fx === 0.5 ? -30 : 0), 70, 20, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const fx of [0.22, 0.5, 0.78]) {
        drawBigBomber(ctx, fx * VIEW_W, by + (fx === 0.5 ? -30 : 0), 1.25, this.t);
      }
    } else if (bomb.kind === 'shinden') {
      const fade = Math.min(1, (BOMB_SEC - t) / 0.4);
      const r = VORTEX_R * Math.min(1, t / 0.4);
      ctx.save();
      ctx.translate(VORTEX_X, VORTEX_Y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      core.addColorStop(0, 'rgba(255,255,255,0.9)');
      core.addColorStop(0.3, 'rgba(255,150,50,0.5)');
      core.addColorStop(1, 'rgba(160,40,255,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      // 회전하는 나선 팔
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 5; arm++) {
        ctx.strokeStyle = arm % 2 ? 'rgba(255,190,90,0.8)' : 'rgba(200,120,255,0.8)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const q = s / 24;
          const a = this.t * 7 + arm * (TAU / 5) + q * 4;
          const rr = r * q * 1.05;
          if (s === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.restore();
    } else {
      // 환영 칼날 — 궤적을 따라 기체 잔상이 지나간다
      for (const s of bomb.slashes) {
        const since = t - s.at;
        if (since < -0.12 || since > 0.45) continue;
        const k = clamp((since + 0.12) / 0.2, 0, 1);
        const fade = since > 0.15 ? 1 - (since - 0.15) / 0.3 : 1;
        const ex = s.x1 + (s.x2 - s.x1) * k;
        const ey = s.y1 + (s.y2 - s.y1) * k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, fade);
        ctx.strokeStyle = '#bfe4ff';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        if (k < 1) {
          const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) + Math.PI / 2;
          for (let g = 0; g < 3; g++) {
            const gk = Math.max(0, k - g * 0.06);
            ctx.save();
            ctx.globalAlpha = 0.5 - g * 0.15;
            ctx.translate(s.x1 + (s.x2 - s.x1) * gk, s.y1 + (s.y2 - s.y1) * gk);
            ctx.rotate(ang);
            drawPlayerPlane(ctx, 'spitfire', 0, 0, this.t, 0, '#cfe8ff', '#ffffff');
            ctx.restore();
          }
        }
      }
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('SCORE', 12, 20);
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.fillText(this.score.score.toLocaleString(), 12, 42);
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`STAGE ${this.stage.def.stage}`, VIEW_W - 12, 20);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`격추 ${this.score.kills}`, VIEW_W - 12, 38);

    // 남은 기체
    ctx.textAlign = 'left';
    for (let i = 0; i < p.lives; i++) {
      ctx.save();
      ctx.translate(18 + i * 22, VIEW_H - 40);
      ctx.fillStyle = p.def.color;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 남은 폭탄
    for (let i = 0; i < p.bombs; i++) {
      const x = 18 + i * 22;
      const y = VIEW_H - 16;
      ctx.fillStyle = '#3a8aff';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('B', x, y + 4);
    }
    // 파워
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('POWER', VIEW_W - 64, VIEW_H - 14);
    for (let i = 0; i < MAX_POWER; i++) {
      ctx.fillStyle = i < p.power ? '#ff5a5a' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(VIEW_W - 58 + i * 16, VIEW_H - 24, 12, 12);
    }
    ctx.restore();

    // 보스 체력
    const b = this.boss;
    if (b && b.state !== 'enter') {
      const x = 20;
      const y = 54;
      const w = VIEW_W - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 2, y - 2, w + 4, 12);
      const ratio = b.hp / b.maxHp;
      ctx.fillStyle = b.phase === 1 ? '#ffb03a' : '#ff3a5a';
      ctx.fillRect(x, y, w * ratio, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x + w / 2 - 1, y - 2, 2, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${this.stage.def.bossName} · ${b.phase}단계`, x, y + 24);
    }
  }

  private drawBanners(ctx: CanvasRenderingContext2D) {
    const def = this.stage.def;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;

    if (this.stageBannerT > 0 && this.mode === 'playing') {
      const a = Math.min(1, this.stageBannerT / 0.5, (3 - this.stageBannerT) / 0.3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'italic 900 42px system-ui, sans-serif';
      ctx.fillText(`STAGE ${def.stage}`, VIEW_W / 2, VIEW_H * 0.4);
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = '#ffe07a';
      ctx.fillText(def.name, VIEW_W / 2, VIEW_H * 0.4 + 34);
    }

    if (this.stage.phase === 'warning') {
      const on = Math.floor(this.stage.phaseT * 3) % 2 === 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(200,0,0,0.25)';
      ctx.fillRect(0, VIEW_H * 0.36, VIEW_W, 100);
      ctx.fillStyle = '#ffdd33';
      for (let x = -40 + ((this.t * 120) % 40); x < VIEW_W; x += 40) {
        ctx.fillRect(x, VIEW_H * 0.36, 20, 6);
        ctx.fillRect(x, VIEW_H * 0.36 + 94, 20, 6);
      }
      if (on) {
        ctx.fillStyle = '#ff3a3a';
        ctx.font = 'italic 900 48px system-ui, sans-serif';
        ctx.fillText('WARNING', VIEW_W / 2, VIEW_H * 0.36 + 56);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`${def.bossName} 접근 중`, VIEW_W / 2, VIEW_H * 0.36 + 84);
    }

    if (this.stage.phase === 'clear' && this.mode === 'playing') {
      const a = Math.min(1, this.stage.phaseT / 0.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#7dffb0';
      ctx.font = 'italic 900 38px system-ui, sans-serif';
      ctx.fillText('STAGE CLEAR!', VIEW_W / 2, VIEW_H * 0.4);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(
        `보너스 +${this.stage.clearBonus.toLocaleString()}`,
        VIEW_W / 2,
        VIEW_H * 0.4 + 36,
      );
    }

    if (this.mode === 'ending' || this.mode === 'over') {
      const a = Math.min(1, this.endT / 0.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = this.allClear ? '#ffe07a' : '#ff5a5a';
      ctx.font = 'italic 900 40px system-ui, sans-serif';
      ctx.fillText(this.allClear ? 'ALL CLEAR!' : 'GAME OVER', VIEW_W / 2, VIEW_H * 0.42);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.fillText(this.score.score.toLocaleString(), VIEW_W / 2, VIEW_H * 0.42 + 40);
    }
    ctx.restore();
  }

  /* ---------------- 입력 ---------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'playing' || this.paused) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) e.preventDefault();
    this.keys.add(key);
    if ((key === 'x' || key === 'b') && !e.repeat) this.useBomb();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    // Shift 를 누른 채 방향키를 떼면 key 값이 달라질 수 있어 함께 정리
    if (e.key === 'Shift') this.keys.delete('shift');
  };

  private onBlur = () => {
    this.keys.clear();
    this.drag = null;
  };

  /** 화면 좌표 → 게임 좌표 배율 */
  private viewScale() {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width > 0 ? VIEW_W / rect.width : 1;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode !== 'playing' || this.paused) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 캡처 실패는 무시
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId || this.mode !== 'playing' || this.paused) return;
    const s = this.viewScale() * 1.2;
    const p = this.player;
    if (p.alive) p.move((e.clientX - d.x) * s, (e.clientY - d.y) * s);
    d.x = e.clientX;
    d.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  };
}
