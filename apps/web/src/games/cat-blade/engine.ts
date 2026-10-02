/**
 * 캣 블레이드 — 게임 엔진
 * requestAnimationFrame 루프(60FPS 고정 스텝), 입력, 판정 처리, 스테이지 진행, HUD 그리기를 맡는다.
 */
import { createBoss, type Boss } from './boss';
import {
  ARENA_L,
  ARENA_R,
  COMBO_WINDOW,
  FISH_DROP_RATE,
  FISH_HEAL,
  FORMS,
  GROUND_Y,
  INPUT_BUFFER,
  MAX_SCORE,
  PARRY_HITSTOP,
  PLATFORMS,
  SCORE,
  STAGES,
  STAGE_CLEAR_HEAL,
  STEP,
  VIEW_H,
  VIEW_W,
  type EnemyKind,
  type StageDef,
} from './config';
import { Enemy } from './enemy';
import type { Beam, Hazard, Projectile } from './entities';
import {
  EffectManager,
  Pickup,
  makeHitbox,
  type Damageable,
  type HitInfo,
  type Hitbox,
  type HitboxInit,
  type World,
} from './entities';
import { Player, type Action, type InputSource } from './player';
import { createBackground, drawBackgroundFx, drawGlow, roundRect, withAlpha } from './render';
import { drawCat, drawFormIcon } from './renderCat';
import type { SfxName, SoundManager } from './sound';
import { TAU, circleRect, clamp, rand, rectsOverlap, shapeHitsRect } from './util';

/** 한 판이 끝났을 때 결과 */
export interface GameSummary {
  score: number;
  victory: boolean;
  stageReached: number;
  stagesCleared: number;
  timeSec: number;
  kills: number;
  parries: number;
  maxCombo: number;
  breakdown: { label: string; value: number }[];
}

export interface EngineCallbacks {
  /** 게임 오버/승리 연출이 끝난 뒤 한 번 호출 */
  onEnd: (summary: GameSummary) => void;
}

/** idle: 메뉴 뒤 배경 / playing: 게임 중 / ending: 게임 오버·승리 연출 / over: 결과 대기 */
type Mode = 'idle' | 'playing' | 'ending' | 'over';
/** 스테이지 진행 단계 */
type Flow = 'intro' | 'wave' | 'waveGap' | 'bossWarn' | 'boss' | 'bossDown' | 'clear';

/* =========================================================
 * 입력 — e.code 기준이라 한글 입력 상태에서도 동작한다
 * ========================================================= */

const KEY_MAP: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  KeyJ: 'attack',
  KeyZ: 'attack',
  KeyK: 'skill',
  KeyX: 'skill',
  KeyL: 'roll',
  KeyC: 'roll',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',
  KeyI: 'parry',
  KeyV: 'parry',
  KeyQ: 'formPrev',
  KeyE: 'formNext',
  Tab: 'formNext',
  Digit1: 'form1',
  Digit2: 'form2',
  Digit3: 'form3',
  Digit4: 'form4',
  Digit5: 'form5',
  Numpad1: 'form1',
  Numpad2: 'form2',
  Numpad3: 'form3',
  Numpad4: 'form4',
  Numpad5: 'form5',
};

class InputState implements InputSource {
  private heldSet = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  /** 게임 시간 — 히트스톱 동안 멈춰서 그 사이 누른 입력은 버퍼에 남는다 */
  now = 0;

  down(a: Action) {
    if (!this.heldSet.has(a)) this.pressedAt.set(a, this.now);
    this.heldSet.add(a);
  }

  up(a: Action) {
    this.heldSet.delete(a);
  }

  held(a: Action) {
    return this.heldSet.has(a);
  }

  pressed(a: Action) {
    const at = this.pressedAt.get(a);
    return at !== undefined && this.now - at <= INPUT_BUFFER;
  }

  consume(a: Action) {
    this.pressedAt.delete(a);
  }

  clear() {
    this.heldSet.clear();
    this.pressedAt.clear();
  }
}

const NO_INPUT: InputSource = {
  held: () => false,
  pressed: () => false,
  consume: () => undefined,
};

interface Banner {
  title: string;
  sub: string;
  color: string;
  t: number;
  dur: number;
  big: boolean;
}

const MAX_ENEMY_PROJECTILES = 500;
/** 동적 카메라 최대 확대 배율 */
const CAM_MAX_ZOOM = 1.32;

/** 점수 항목 (결과창 내역) */
type ScoreKind = 'hit' | 'kill' | 'parry' | 'stage' | 'bonus';

/* =========================================================
 * CatBladeEngine
 * ========================================================= */

export class CatBladeEngine implements World {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  /** 게임 시간 (슬로모션·히트스톱 반영) */
  t = 0;
  private realT = 0;
  private mode: Mode = 'idle';
  private paused = false;

  player = new Player();
  fx = new EffectManager();
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  projectiles: Projectile[] = [];
  private beams: Beam[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private hitboxes: Hitbox[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private input = new InputState();

  private stageIdx = 0;
  private flow: Flow = 'intro';
  private flowT = 0;
  private waveIdx = 0;
  private pendingSpawns = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgStage = 0;

  private shakeAmt = 0;
  private flashA = 0;
  private flashColor = '#ffffff';
  private stopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private zoom = 0;
  private zoomX = VIEW_W / 2;
  private zoomY = VIEW_H / 2;
  /** 동적 카메라 — 플레이어와 적이 들어오는 만큼 확대 (1 = 전체 화면) */
  private camX = VIEW_W / 2;
  private camZoom = 1;
  private banner: Banner | null = null;
  private seenPhase2 = false;

  // 기록
  private kills = 0;
  private parries = 0;
  private combo = 0;
  private comboT = 0;
  private comboPop = 0;
  private maxCombo = 0;
  private playTime = 0;
  private stagesCleared = 0;
  private victory = false;
  private endT = 0;
  private ended = false;
  private pts: Record<ScoreKind, number> = { hit: 0, kill: 0, parry: 0, stage: 0, bonus: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private sound: SoundManager,
    private cb: EngineCallbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저는 Canvas 를 지원하지 않아요.');
    this.ctx = ctx;
    this.resize();
    this.bg = createBackground(1, this.canvas.width / VIEW_W);
    this.bgStage = 1;
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.sound.stopBgm();
  }

  /* ---------------- 외부 제어 ---------------- */

  start() {
    this.player = new Player();
    this.fx.clear();
    this.enemies = [];
    this.boss = null;
    this.projectiles = [];
    this.beams = [];
    this.hazards = [];
    this.pickups = [];
    this.hitboxes = [];
    this.timers = [];
    this.input.clear();
    this.kills = 0;
    this.parries = 0;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.playTime = 0;
    this.stagesCleared = 0;
    this.victory = false;
    this.endT = 0;
    this.ended = false;
    this.stopT = 0;
    this.slowT = 0;
    this.pts = { hit: 0, kill: 0, parry: 0, stage: 0, bonus: 0 };
    this.paused = false;
    this.mode = 'playing';
    this.beginStage(0);
    this.fx.transform(this.player.x, this.player.y, FORMS[0]!.color, FORMS[0]!.glow);
  }

  /** 게임을 멈추고 메뉴 뒤 배경 상태로 돌아간다 (게임 홈으로) */
  idle() {
    this.mode = 'idle';
    this.paused = false;
    this.player = new Player();
    this.enemies = [];
    this.boss = null;
    this.projectiles = [];
    this.beams = [];
    this.hazards = [];
    this.pickups = [];
    this.hitboxes = [];
    this.timers = [];
    this.fx.clear();
    this.banner = null;
    this.input.clear();
    this.stopT = 0;
    this.slowT = 0;
    this.flashA = 0;
    this.shakeAmt = 0;
    this.bg = createBackground(1, this.canvas.width / VIEW_W);
    this.bgStage = 1;
    this.sound.stopBgm();
  }

  pause() {
    this.paused = true;
    this.input.clear();
  }

  resume() {
    this.paused = false;
    this.last = 0;
  }

  /** 화면 터치 버튼 */
  setVirtual(action: Action, down: boolean) {
    if (this.mode !== 'playing' || this.paused) return;
    if (down) this.input.down(action);
    else this.input.up(action);
  }

  /* ---------------- World 구현 ---------------- */

  addHitbox(init: HitboxInit) {
    this.hitboxes.push(makeHitbox(init));
  }

  addProjectile(p: Projectile) {
    if (p.team === 'enemy') {
      let n = 0;
      for (const q of this.projectiles) if (q.team === 'enemy') n++;
      if (n >= MAX_ENEMY_PROJECTILES) return;
    }
    this.projectiles.push(p);
  }

  addBeam(b: Beam) {
    this.beams.push(b);
  }

  addHazard(h: Hazard) {
    this.hazards.push(h);
  }

  addPickup(p: Pickup) {
    this.pickups.push(p);
  }

  schedule(delay: number, fn: () => void) {
    this.timers.push({ at: this.t + delay, fn });
  }

  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  flash(color: string, amount: number) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, amount);
  }

  hitstop(sec: number) {
    this.stopT = Math.max(this.stopT, sec);
  }

  slowmo(scale: number, sec: number) {
    this.slowScale = scale;
    this.slowT = sec;
  }

  sfx(name: SfxName) {
    this.sound.play(name);
  }

  clearEnemyProjectiles() {
    for (const p of this.projectiles) {
      if (p.team !== 'enemy') continue;
      p.dead = true;
      this.fx.flare(p.x, p.y, 14, p.color, 0.3);
    }
    for (const b of this.beams) if (b.team === 'enemy') b.done = true;
    for (const h of this.hazards) h.done = true;
    this.hitboxes = this.hitboxes.filter((h) => h.team !== 'enemy');
  }

  /* ---------------- 스테이지 진행 ---------------- */

  private get stage(): StageDef {
    return STAGES[this.stageIdx] as StageDef;
  }

  private beginStage(i: number) {
    this.stageIdx = i;
    this.enemies = [];
    this.boss = null;
    this.projectiles = [];
    this.beams = [];
    this.hazards = [];
    this.pickups = [];
    this.hitboxes = [];
    this.timers = [];
    this.flow = 'intro';
    this.flowT = 0;
    this.waveIdx = 0;
    this.pendingSpawns = 0;
    this.seenPhase2 = false;
    this.bg = createBackground(i + 1, this.canvas.width / VIEW_W);
    this.bgStage = i + 1;
    const p = this.player;
    p.x = 170;
    p.y = GROUND_Y;
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    this.showBanner(`STAGE ${i + 1}`, this.stage.name, '#ffe27a', 2.2, true);
    this.sound.playBgm(i + 1);
  }

  private showBanner(title: string, sub: string, color: string, dur: number, big: boolean) {
    this.banner = { title, sub, color, t: 0, dur, big };
  }

  private updateFlow(dt: number) {
    this.flowT += dt;
    switch (this.flow) {
      case 'intro':
        if (this.flowT >= 1.8) {
          this.flow = 'wave';
          this.flowT = 0;
          this.spawnWave(0);
        }
        break;
      case 'wave':
        if (this.pendingSpawns === 0 && this.enemies.length === 0) {
          this.flow = 'waveGap';
          this.flowT = 0;
        }
        break;
      case 'waveGap':
        if (this.flowT >= 1.1) {
          if (this.waveIdx + 1 < this.stage.waves.length) {
            this.waveIdx += 1;
            this.flow = 'wave';
            this.flowT = 0;
            this.spawnWave(this.waveIdx);
          } else {
            this.flow = 'bossWarn';
            this.flowT = 0;
            this.sound.stopBgm();
            this.sfx('warning');
            this.showBanner('WARNING', '거대한 기척이 다가온다…', '#ff4a5a', 2.2, true);
          }
        }
        break;
      case 'bossWarn':
        if (this.flowT >= 2.3) {
          this.boss = createBoss(this.stage.id);
          this.flow = 'boss';
          this.flowT = 0;
          this.showBanner(this.stage.bossName, this.stage.bossEnglish, this.boss.color, 2.8, false);
          this.sound.playBgm(4 + this.stageIdx);
        }
        break;
      case 'boss': {
        const b = this.boss;
        if (b && b.phase === 2 && !this.seenPhase2) {
          this.seenPhase2 = true;
          this.addScore('stage', SCORE.bossPhase);
          this.showBanner('PHASE 2', b.name, b.color, 1.8, false);
        }
        break;
      }
      case 'bossDown':
        if (this.boss) {
          this.boss.defeatT += dt;
          this.boss.alpha = Math.max(0, 1 - this.boss.defeatT / 1.8);
        }
        if (this.flowT >= 2.4) {
          this.stagesCleared += 1;
          this.addScore('stage', SCORE.stageClear);
          this.boss = null;
          if (this.stageIdx + 1 >= STAGES.length) {
            this.finish(true);
          } else {
            this.player.heal(STAGE_CLEAR_HEAL);
            this.fx.text(
              this.player.x,
              this.player.y - 70,
              `+${STAGE_CLEAR_HEAL} HP`,
              '#7affa0',
              18,
              1.2,
            );
            this.flow = 'clear';
            this.flowT = 0;
            this.sfx('clear');
            this.showBanner('STAGE CLEAR', `체력 +${STAGE_CLEAR_HEAL} 회복`, '#7affa0', 2.3, true);
          }
        }
        break;
      case 'clear':
        if (this.flowT >= 2.5) this.beginStage(this.stageIdx + 1);
        break;
    }
  }

  private spawnWave(idx: number) {
    const kinds = this.stage.waves[idx] ?? [];
    kinds.forEach((k, i) => {
      this.pendingSpawns += 1;
      this.schedule(0.15 + i * 0.5, () => {
        this.pendingSpawns -= 1;
        if (this.mode !== 'playing') return;
        this.spawnEnemy(k, i);
      });
    });
  }

  private spawnEnemy(kind: EnemyKind, i: number) {
    const p = this.player;
    const flyer = kind === 'crow' || kind === 'drone' || kind === 'wisp';
    let x: number;
    let y: number;
    if (flyer) {
      x = rand(140, VIEW_W - 140);
      for (let k = 0; k < 10 && Math.abs(x - p.x) < 220; k++) x = rand(140, VIEW_W - 140);
      y = GROUND_Y - rand(190, 250);
    } else {
      // 플레이어 반대편에서 등장 (번갈아 양쪽)
      const far = p.x < VIEW_W / 2 ? 1 : -1;
      const side = i % 3 === 2 ? -far : far;
      x = side > 0 ? rand(720, 880) : rand(80, 240);
      if (Math.abs(x - p.x) < 180) x = clamp(p.x + side * 260, ARENA_L + 40, ARENA_R - 40);
      y = GROUND_Y;
    }
    const e = new Enemy(kind, x, y);
    e.facing = p.x >= x ? 1 : -1;
    this.enemies.push(e);
    const cy = flyer ? y : y - 24;
    this.fx.ring(x, cy, 60, 6, '#b48aff', 0.5, 4);
    this.fx.smoke(x, cy, 6, 'rgba(80,40,110,1)');
  }

  /** 게임 끝 — 보너스 정산 후 연출 */
  private finish(victory: boolean) {
    if (this.mode !== 'playing') return;
    this.victory = victory;
    this.mode = 'ending';
    this.endT = 0;
    this.addScore('bonus', this.maxCombo * SCORE.maxCombo);
    this.sound.stopBgm();
    if (victory) {
      const timeBonus = Math.max(0, SCORE.timeBaseSec - this.playTime) * SCORE.timePerSec;
      this.addScore('bonus', timeBonus + this.player.hp * SCORE.hpLeft);
      this.sfx('victory');
      this.showBanner('VICTORY!', '그림자 왕국에 평화가 찾아왔다냥', '#ffe27a', 3.2, true);
      this.fx.paws(this.player.x, this.player.y - 30, 14, '#ffe27a');
      for (let i = 0; i < 6; i++) {
        this.schedule(i * 0.35, () => {
          const fx = rand(160, VIEW_W - 160);
          const fy = rand(80, 260);
          const col = ['#ffe27a', '#ff8ad0', '#7affd0', '#8ab4ff'][i % 4] ?? '#ffffff';
          this.fx.burst(fx, fy, col, 30, 360, 10);
          this.fx.ring(fx, fy, 6, 90, col, 0.6, 4);
          this.sfx('boom');
        });
      }
    } else {
      this.sfx('gameover');
      this.slowmo(0.35, 1.2);
      this.showBanner(
        'GAME OVER',
        `STAGE ${this.stageIdx + 1} · ${this.stage.name}`,
        '#ff5a6a',
        3,
        true,
      );
    }
  }

  private summary(): GameSummary {
    const score = Math.min(MAX_SCORE, Math.round(this.totalScore));
    return {
      score,
      victory: this.victory,
      stageReached: this.stageIdx + 1,
      stagesCleared: this.stagesCleared,
      timeSec: Math.floor(this.playTime),
      kills: this.kills,
      parries: this.parries,
      maxCombo: this.maxCombo,
      breakdown: [
        { label: '타격·콤보', value: Math.round(this.pts.hit) },
        { label: '적 처치', value: Math.round(this.pts.kill) },
        { label: '패링', value: Math.round(this.pts.parry) },
        { label: '스테이지·보스', value: Math.round(this.pts.stage) },
        { label: '보너스 (최대 콤보·시간·체력)', value: Math.round(this.pts.bonus) },
      ],
    };
  }

  private get totalScore() {
    const p = this.pts;
    return p.hit + p.kill + p.parry + p.stage + p.bonus;
  }

  private addScore(kind: ScoreKind, n: number) {
    this.pts[kind] += n;
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
        try {
          this.step(STEP);
        } catch (err) {
          // 한 프레임의 예외로 게임 전체가 멈추지 않게 — 콘솔에만 남긴다
          console.error('[cat-blade] step error', err);
        }
        this.acc -= STEP;
        steps += 1;
      }
      if (steps === 5) this.acc = 0;
    }
    try {
      this.draw();
    } catch (err) {
      console.error('[cat-blade] draw error', err);
    }
  };

  private step(dt: number) {
    this.realT += dt;
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }
    // 히트스톱 — 화면 전체가 잠깐 멈춘다
    if (this.stopT > 0) {
      this.stopT -= dt;
      return;
    }
    this.zoom = Math.max(0, this.zoom - dt * 4);
    let sdt = dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      sdt = dt * this.slowScale;
    }
    this.t += sdt;
    this.input.now = this.t;
    this.shakeAmt *= Math.pow(0.86, dt * 60);
    if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    this.comboPop = Math.max(0, this.comboPop - dt * 5);
    this.updateCamera(dt);

    this.fx.update(sdt);
    this.runTimers();

    const playing = this.mode === 'playing';
    if (playing) {
      this.playTime += dt;
      this.comboT -= sdt;
      if (this.comboT <= 0) this.combo = 0;
      this.updateFlow(sdt);
    } else if (this.mode === 'ending' && this.boss && this.boss.dead) {
      this.boss.defeatT += sdt;
      this.boss.alpha = Math.max(0, 1 - this.boss.defeatT / 1.8);
    }

    this.player.update(sdt, playing ? this.input : NO_INPUT, this);
    if (this.mode === 'idle') return;

    for (const e of this.enemies) e.update(sdt, this);
    this.boss?.update(sdt, this);
    for (const p of this.projectiles) p.update(sdt, this);
    for (const b of this.beams) b.update(sdt);
    for (const h of this.hazards) h.update(sdt, this);
    for (const k of this.pickups) k.update(sdt);

    if (playing) this.resolveCollisions();

    for (const h of this.hitboxes) h.life -= sdt;
    this.hitboxes = this.hitboxes.filter((h) => h.life > 0);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.beams = this.beams.filter((b) => !b.done);
    this.hazards = this.hazards.filter((h) => !h.done);
    this.pickups = this.pickups.filter((k) => !k.done);
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.mode === 'ending') {
      this.endT += dt;
      if (this.endT >= (this.victory ? 3.4 : 2.8)) {
        this.mode = 'over';
        if (!this.ended) {
          this.ended = true;
          this.cb.onEnd(this.summary());
        }
      }
    }
  }

  private runTimers() {
    if (this.timers.length === 0) return;
    const due = this.timers.filter((tm) => tm.at <= this.t);
    if (due.length === 0) return;
    this.timers = this.timers.filter((tm) => tm.at > this.t);
    for (const tm of due) tm.fn();
  }

  /* ---------------- 판정 ---------------- */

  private targets(): Damageable[] {
    const list: Damageable[] = [...this.enemies];
    if (this.boss && !this.boss.dead) list.push(this.boss);
    return list;
  }

  private resolveCollisions() {
    const player = this.player;
    const targets = this.targets();
    const phb = player.hurtbox();

    // 1) 근접 판정
    for (const h of this.hitboxes) {
      if (h.team === 'player') {
        for (const target of targets) {
          if (h.group.has(target) || !target.canBeHit()) continue;
          const hb = target.hurtbox();
          if (!shapeHitsRect(h.shape, hb)) continue;
          h.group.add(target);
          const cx = clamp(player.x + player.facing * 30, hb.x, hb.x + hb.w);
          const cy = hb.y + hb.h * 0.45;
          const ok = this.damageTarget(
            target,
            { damage: h.damage, dir: h.dir, knock: h.knock, launch: h.launch, source: h.kind },
            cx,
            cy,
            h.color,
            h.hitstop,
          );
          if (ok) this.shake(h.shake);
        }
      } else if (!h.group.has(player) && !player.dead) {
        if (!shapeHitsRect(h.shape, phb)) continue;
        const src = h.source;
        const cx = src ? (player.x + clamp(src.x, player.x - 40, player.x + 40)) / 2 : player.x;
        const res = this.hitPlayer(h.damage, h.dir, src, cx, player.y - 26);
        if (res !== 'miss') h.group.add(player);
      }
    }

    // 2) 투사체
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.team === 'player') {
        for (const target of targets) {
          if (p.dead) break;
          if (p.hitGroup.has(target) || !target.canBeHit()) continue;
          if (!circleRect(p.x, p.y, p.r, target.hurtbox())) continue;
          p.hitGroup.add(target);
          const ok = this.damageTarget(
            target,
            {
              damage: p.damage,
              dir: Math.sign(p.vx) || 1,
              knock: p.knock,
              launch: p.launch,
              source: 'projectile',
            },
            p.x,
            p.y,
            p.color,
            p.reflected ? 0.06 : 0.02,
          );
          if (!ok) {
            p.dead = true;
            break;
          }
          if (p.kind === 'missile') this.fx.explosion(p.x, p.y, 40, '#ffb04a');
          p.pierce -= 1;
          if (p.pierce <= 0) {
            p.dead = true;
            this.fx.burst(p.x, p.y, p.color, 6, 160, 6);
          }
        }
      } else if (!player.dead && !p.hitGroup.has(player)) {
        if (!circleRect(p.x, p.y, p.r, phb)) continue;
        if (player.isParrying()) {
          this.doParry(null, p.x, p.y);
          p.reflect(this);
          continue;
        }
        const res = this.hitPlayer(p.damage, Math.sign(p.vx) || 1, p.source, p.x, p.y);
        if (res === 'hit') {
          if (p.grounded) {
            p.hitGroup.add(player);
          } else {
            p.dead = true;
            if (p.kind === 'missile') this.fx.explosion(p.x, p.y, 34, '#ff8a3a');
          }
        }
      }
    }

    // 3) 레이저
    for (const b of this.beams) {
      if (!b.isActive) continue;
      if (b.team === 'enemy') {
        if (player.dead || !b.canHit(player, this.t) || !b.hits(phb)) continue;
        const res = this.hitPlayer(
          b.damage,
          player.x < b.x ? -1 : 1,
          null,
          player.x,
          player.y - 24,
        );
        if (res !== 'miss') b.lastHit.set(player, this.t);
      } else {
        for (const target of targets) {
          if (!target.canBeHit() || !b.canHit(target, this.t)) continue;
          const hb = target.hurtbox();
          if (!b.hits(hb)) continue;
          b.lastHit.set(target, this.t);
          this.damageTarget(
            target,
            {
              damage: b.damage,
              dir: Math.cos(b.angle) >= 0 ? 1 : -1,
              knock: 260,
              launch: 0,
              source: 'beam',
            },
            hb.x + hb.w / 2,
            hb.y + hb.h / 2,
            b.color,
            0.06,
          );
        }
      }
    }

    // 4) 생선 아이템
    for (const k of this.pickups) {
      if (k.done || !rectsOverlap(k.rect(), phb)) continue;
      k.done = true;
      const before = player.hp;
      player.heal(k.heal);
      this.fx.text(player.x, player.y - 64, `+${Math.round(player.hp - before)}`, '#7affa0', 16);
      this.fx.burst(k.x, k.y, '#7ad8ff', 10, 160, 7);
      this.sfx('pickup');
    }
  }

  /** 적에게 피해 — 실제로 맞았으면 true */
  private damageTarget(
    target: Damageable,
    hit: HitInfo,
    x: number,
    y: number,
    color: string,
    hitstop: number,
  ): boolean {
    if (!target.canBeHit()) return false;
    const ok = target.takeHit(hit, this);
    if (!ok) {
      this.fx.sparks(x, y, hit.dir > 0 ? Math.PI : 0, 0.6, '#cfd8ff', 6, 300);
      return false;
    }
    this.registerHit();
    const big = hit.damage >= 30;
    this.fx.sparks(x, y, hit.dir > 0 ? 0 : Math.PI, 0.9, color, big ? 14 : 8, big ? 620 : 460);
    this.fx.flare(x, y, big ? 46 : 28, color, 0.14);
    this.fx.text(
      x + rand(-10, 10),
      y - 20,
      `${Math.round(hit.damage)}`,
      big ? '#ffe27a' : '#ffffff',
      big ? 22 : 15,
      0.6,
    );
    this.sfx(big ? 'bigHit' : 'hit');
    if (hitstop > 0) this.hitstop(hitstop);
    if (target.dead) {
      if (target.isBoss) this.onBossDefeated();
      else this.onEnemyKilled(target as Enemy);
    }
    return true;
  }

  private registerHit() {
    this.combo += 1;
    this.comboT = COMBO_WINDOW;
    this.comboPop = 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.addScore('hit', SCORE.hit * (1 + Math.floor(this.combo / 10) * 0.5));
  }

  private onEnemyKilled(e: Enemy) {
    this.kills += 1;
    this.addScore('kill', SCORE.kill);
    const cy = e.centerY();
    this.fx.burst(e.x, cy, '#ff8ad0', 18, 340, 10);
    this.fx.paws(e.x, cy, 4);
    this.fx.ring(e.x, cy, 6, 60, '#ffffff', 0.3, 3);
    this.fx.smoke(e.x, cy, 6, 'rgba(60,40,60,1)');
    this.fx.text(e.x, cy - 30, `+${SCORE.kill}`, '#ffe27a', 14, 0.7);
    this.sfx('enemyDie');
    this.shake(4);
    if (Math.random() < FISH_DROP_RATE) this.addPickup(new Pickup(e.x, cy, FISH_HEAL));
  }

  private onBossDefeated() {
    const b = this.boss;
    if (!b) return;
    this.kills += 1;
    this.addScore('kill', SCORE.bossKill);
    this.flow = 'bossDown';
    this.flowT = 0;
    this.clearEnemyProjectiles();
    this.enemies = [];
    this.slowmo(0.3, 1.4);
    this.flash('#ffffff', 0.85);
    this.shake(16);
    this.sound.stopBgm();
    this.sfx('boom');
    this.sfx('roar');
    const hb = b.hurtbox();
    for (let i = 0; i < 8; i++) {
      this.schedule(i * 0.16, () => {
        const ex = hb.x + rand(0, hb.w);
        const ey = hb.y + rand(0, hb.h);
        this.fx.explosion(ex, ey, rand(50, 90), b.color);
        this.fx.burst(ex, ey, '#ffffff', 10, 300, 8);
        this.shake(8);
        this.sfx('boom');
      });
    }
    this.fx.text(b.x, hb.y - 30, `+${SCORE.bossKill}`, '#ffe27a', 26, 1.6);
  }

  /** 적 공격이 플레이어에 닿았다 — 패링·무적·피격 처리 */
  private hitPlayer(
    damage: number,
    dir: number,
    source: Damageable | null,
    cx: number,
    cy: number,
  ): 'parry' | 'hit' | 'miss' {
    const p = this.player;
    if (p.dead || this.mode !== 'playing') return 'miss';
    // 타이밍만 맞으면 모든 공격(레이저·충격파·바닥 폭발 포함)을 받아친다
    if (p.isParrying()) {
      this.doParry(source, cx, cy);
      return 'parry';
    }
    if (p.isInvulnerable()) return 'miss';
    const hpBefore = p.hp;
    if (!p.damage(damage, dir)) return 'miss';
    this.combo = 0;
    this.comboT = 0;
    this.fx.burst(p.x, p.y - 24, '#ff4a5a', 14, 280, 9);
    this.fx.text(p.x, p.y - 60, `-${hpBefore - p.hp}`, '#ff6a7a', 18, 0.8);
    this.sfx('hurt');
    this.shake(8);
    this.flash('#ff2a3a', 0.22);
    this.hitstop(0.06);
    if (p.dead) {
      this.fx.paws(p.x, p.y - 24, 8, '#ffb0c0');
      this.finish(false);
    }
    return 'hit';
  }

  /** 패링 성공 — 히트스톱 0.15초 + 섬광 + 적 기절 + 반격 */
  private doParry(source: Damageable | null, cx: number, cy: number) {
    const p = this.player;
    const form = p.form;
    p.onParrySuccess();
    this.parries += 1;
    this.addScore('parry', SCORE.parry);
    this.hitstop(PARRY_HITSTOP);
    this.flash('#ffffff', 0.55);
    this.shake(9);
    this.zoom = 1;
    this.zoomX = cx;
    this.zoomY = cy;
    this.sfx('parry');
    this.fx.sparks(cx, cy, p.facing > 0 ? 0 : Math.PI, 1.4, '#fff27a', 18, 700);
    this.fx.sparks(cx, cy, 0, Math.PI, '#ffffff', 10, 500);
    this.fx.ring(cx, cy, 6, 70, '#fff27a', 0.35, 6);
    this.fx.flare(cx, cy, 80, '#fff27a', 0.3);
    this.fx.paws(cx, cy, 3, '#ffe27a');
    this.fx.text(cx, cy - 40, 'PARRY!', '#fff27a', 24, 0.8);

    if (source && !source.dead) {
      source.parried(this);
      if (source.canBeHit()) {
        const hb = source.hurtbox();
        this.damageTarget(
          source,
          { damage: form.parryCounter, dir: p.facing, knock: 220, launch: 0, source: 'counter' },
          clamp(cx, hb.x, hb.x + hb.w),
          hb.y + hb.h * 0.45,
          '#fff27a',
          0,
        );
      }
    }

    if (form.id === 'knight') {
      // 나이트 캣 — 광범위 충격파 + 주변 탄 반사
      this.addHitbox({
        team: 'player',
        shape: { kind: 'circle', x: p.x, y: p.y - 24, r: 210 },
        damage: 30,
        dir: p.facing,
        knock: 360,
        launch: 200,
        hitstop: 0,
        shake: 6,
        color: '#ffe9a8',
        kind: 'counter',
        life: 0.06,
      });
      for (const q of this.projectiles) {
        if (q.team === 'enemy' && !q.dead && Math.hypot(q.x - p.x, q.y - (p.y - 24)) < 240)
          q.reflect(this);
      }
      this.fx.ring(p.x, p.y - 24, 20, 230, '#ffe9a8', 0.5, 10);
      this.fx.ring(p.x, p.y - 24, 10, 160, '#ffffff', 0.35, 4);
      this.sfx('heavy');
    }
  }

  /* ---------------- 키 입력 ---------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'playing' || this.paused) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const a = KEY_MAP[e.code];
    if (!a) return;
    e.preventDefault();
    this.input.down(a);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const a = KEY_MAP[e.code];
    if (a) this.input.up(a);
  };

  private onBlur = () => {
    this.input.clear();
  };

  /* ---------------- 그리기 ---------------- */

  /** 다른 캔버스로 옮겨 그린다 (크게 보기 모드 전환 시 캔버스가 새로 만들어진다) */
  attach(canvas: HTMLCanvasElement) {
    if (canvas === this.canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.canvas = canvas;
    this.ctx = ctx;
    this.canvas.width = 0;
    this.resize();
  }

  /* ---------------- 카메라 ---------------- */

  private updateCamera(dt: number) {
    let targetZ = 1;
    let targetX = VIEW_W / 2;
    if (this.mode === 'playing' || this.mode === 'ending') {
      const p = this.player;
      let lo = p.x;
      let hi = p.x;
      const include = (x: number) => {
        // 너무 멀리 있는 적까지 담으려고 확대를 포기하지 않도록 플레이어 ±480 까지만
        const cx = clamp(x, p.x - 480, p.x + 480);
        lo = Math.min(lo, cx);
        hi = Math.max(hi, cx);
      };
      for (const e of this.enemies) include(e.x);
      const b = this.boss;
      if (b && b.alpha > 0.05 && b.x > ARENA_L - 40 && b.x < ARENA_R + 40) include(b.x);
      targetZ = clamp(VIEW_W / (hi - lo + 320), 1, CAM_MAX_ZOOM);
      targetX = (lo + hi) / 2;
      // 화면 전체를 쓰는 패턴(회전 레이저·탄막·바닥 표식)은 넓게 보여 준다
      const wide =
        this.beams.some((bm) => bm.team === 'enemy') ||
        this.hazards.length > 0 ||
        (b !== null && b.flying && b.y < GROUND_Y - 120);
      if (wide) targetZ = Math.min(targetZ, 1.04);
    }
    const k = Math.min(1, dt * 3);
    this.camZoom += (targetZ - this.camZoom) * k;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 4);
    const half = VIEW_W / 2 / this.camZoom;
    this.camX = clamp(this.camX, half, VIEW_W - half);
  }

  /** 월드 좌표 → 화면: 가로는 camX 를 가운데로, 세로는 바닥이 화면 아래에 붙도록 */
  private applyCamera(ctx: CanvasRenderingContext2D) {
    const z = this.camZoom;
    if (z <= 1.001) return;
    const camY = VIEW_H - VIEW_H / 2 / z;
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.scale(z, z);
    ctx.translate(-this.camX, -camY);
  }

  private toScreen(x: number, y: number) {
    const z = this.camZoom;
    if (z <= 1.001) return { x, y };
    const camY = VIEW_H - VIEW_H / 2 / z;
    return { x: (x - this.camX) * z + VIEW_W / 2, y: (y - camY) * z + VIEW_H / 2 };
  }

  /** 카메라 밖에 있는 적 — 화면 가장자리에 화살표 */
  private drawOffscreen(ctx: CanvasRenderingContext2D) {
    if (this.camZoom <= 1.01) return;
    const list: { x: number; y: number; boss: boolean }[] = this.enemies.map((e) => ({
      x: e.x,
      y: e.centerY(),
      boss: false,
    }));
    const b = this.boss;
    if (b && !b.dead && b.alpha > 0.05) {
      const hb = b.hurtbox();
      list.push({ x: b.x, y: hb.y + hb.h / 2, boss: true });
    }
    for (const it of list) {
      const s = this.toScreen(it.x, it.y);
      if (s.x >= 0 && s.x <= VIEW_W) continue;
      const left = s.x < 0;
      const ax = left ? 14 : VIEW_W - 14;
      const ay = clamp(s.y, 150, VIEW_H - 70);
      const size = it.boss ? 13 : 9;
      const pulse = 0.65 + Math.sin(this.realT * 8) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = it.boss ? '#ff3a5a' : '#ffb04a';
      ctx.strokeStyle = 'rgba(10,6,20,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const dir = left ? -1 : 1;
      ctx.moveTo(ax + dir * size, ay);
      ctx.lineTo(ax - dir * size * 0.6, ay - size);
      ctx.lineTo(ax - dir * size * 0.6, ay + size);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(VIEW_W * dpr);
    const h = Math.round(VIEW_H * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.bgStage > 0) this.bg = createBackground(this.bgStage, w / VIEW_W);
  };

  private draw() {
    const ctx = this.ctx;
    const scale = this.canvas.width / VIEW_W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    // 화면 흔들림 → 카메라(확대·추적) → 패링 순간 살짝 확대
    if (this.shakeAmt > 0 && !this.paused) {
      ctx.translate(rand(-1, 1) * this.shakeAmt, rand(-1, 1) * this.shakeAmt);
    }
    this.applyCamera(ctx);
    if (this.zoom > 0) {
      const z = 1 + this.zoom * 0.05;
      ctx.translate(this.zoomX, this.zoomY);
      ctx.scale(z, z);
      ctx.translate(-this.zoomX, -this.zoomY);
    }
    if (this.bg) ctx.drawImage(this.bg, -20, -20, VIEW_W + 40, VIEW_H + 40);
    else {
      ctx.fillStyle = '#120a1a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawBackgroundFx(ctx, this.bgStage || 1, this.t);

    for (const h of this.hazards) h.draw(ctx, this.t);
    this.drawShadows(ctx);
    for (const k of this.pickups) k.draw(ctx, this.t);
    this.boss?.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const e of this.enemies) e.drawHp(ctx);
    this.fx.draw(ctx, false);
    this.drawPlayer(ctx);
    for (const p of this.projectiles) p.draw(ctx, this.t);
    for (const b of this.beams) b.draw(ctx, this.t);
    this.fx.draw(ctx, true);
    ctx.restore();

    // 체력이 낮으면 붉은 테두리가 맥박친다
    if (this.mode === 'playing' && this.player.hp <= 30) {
      const a = 0.25 + Math.sin(this.realT * 6) * 0.1;
      const g = ctx.createRadialGradient(
        VIEW_W / 2,
        VIEW_H / 2,
        VIEW_H * 0.35,
        VIEW_W / 2,
        VIEW_H / 2,
        VIEW_W * 0.65,
      );
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, `rgba(255,0,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.flashA > 0) {
      ctx.globalAlpha = Math.min(1, this.flashA);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }

    if (this.mode !== 'idle') this.drawHud(ctx);
    this.drawBanner(ctx);
  }

  private drawShadows(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    const shadow = (x: number, y: number, w: number) => {
      // 발 밑이 발판인지 바닥인지 찾는다
      let gy = GROUND_Y;
      for (const p of PLATFORMS) if (x >= p.x1 && x <= p.x2 && y <= p.y + 1) gy = Math.min(gy, p.y);
      const lift = clamp((gy - y) / 300, 0, 0.7);
      ctx.beginPath();
      ctx.ellipse(x, gy + 1, w * (1 - lift), 5 * (1 - lift), 0, 0, TAU);
      ctx.fill();
    };
    shadow(this.player.x, this.player.y, 18);
    for (const e of this.enemies) shadow(e.x, e.flyer ? GROUND_Y - 1 : e.y, 18);
    if (this.boss && this.boss.alpha > 0.1) {
      shadow(
        this.boss.x,
        this.boss.flying ? GROUND_Y - 1 : this.boss.y,
        (this.boss.w * this.boss.scale) / 2.2,
      );
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    if (p.isParrying()) {
      // 패링 판정 중 — 앞쪽에 금빛 방패 호
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = p.x + p.facing * 12;
      const cy = p.y - 26;
      ctx.strokeStyle = 'rgba(255,240,140,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const a = p.facing > 0 ? 0 : Math.PI;
      ctx.arc(cx, cy, 30, a - 1.1, a + 1.1);
      ctx.stroke();
      drawGlow(ctx, cx + p.facing * 22, cy, 26, '#fff27a', 0.5);
      ctx.restore();
    }
    drawCat(ctx, p.pose());
  }

  /* ---------------- HUD ---------------- */

  private drawHud(ctx: CanvasRenderingContext2D) {
    this.drawOffscreen(ctx);
    const p = this.player;
    const form = p.form;
    ctx.save();

    // 초상화 + 체력바
    ctx.fillStyle = 'rgba(8,6,20,0.55)';
    roundRect(ctx, 10, 10, 330, 112, 12);
    ctx.fill();
    drawFormIcon(ctx, form.id, 46, 46, 28, form.color);
    ctx.strokeStyle = form.glow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(46, 46, 28, 0, TAU);
    ctx.stroke();

    const bx = 84;
    const by = 22;
    const bw = 244;
    const bh = 16;
    ctx.fillStyle = '#1a1424';
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#ff5a6a';
    roundRect(ctx, bx, by, Math.max(0, bw * (p.hpLag / p.maxHp)), bh, 8);
    ctx.fill();
    const hpK = p.hp / p.maxHp;
    const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, hpK > 0.3 ? '#4affa0' : '#ff8a3a');
    hg.addColorStop(1, hpK > 0.3 ? '#2ad8ff' : '#ff3a5a');
    ctx.fillStyle = hg;
    if (p.hp > 0) {
      roundRect(ctx, bx, by, Math.max(10, bw * hpK), bh, 8);
      ctx.fill();
    }
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, bx + 8, by + bh / 2 + 0.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = form.glow;
    ctx.fillText(`${form.name} · ${form.type}`, bx + bw, by - 8);

    // 폼 슬롯 5개
    FORMS.forEach((f, i) => {
      const sx = bx + 16 + i * 46;
      const sy = 62;
      const on = i === p.forms.index;
      drawFormIcon(ctx, f.id, sx, sy, on ? 17 : 14, f.color);
      // 스킬 대기 (어두운 부채꼴)
      const cd = p.forms.skillCd[f.id];
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, on ? 17 : 14, -Math.PI / 2, -Math.PI / 2 + TAU * (cd / f.skillCooldown));
        ctx.closePath();
        ctx.fill();
      }
      if (!on && p.forms.cooldown > 0) {
        ctx.fillStyle = 'rgba(10,10,20,0.45)';
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = on ? '#ffe27a' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = on ? 2.5 : 1;
      ctx.beginPath();
      ctx.arc(sx, sy, on ? 17 : 14, 0, TAU);
      ctx.stroke();
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#ffe27a' : '#aab0d0';
      ctx.fillText(String(i + 1), sx + 12, sy + 13);
    });

    // 스킬 · 구르기 · 패링 상태
    const skillCd = p.forms.skillCd[form.id];
    const items: { label: string; ready: boolean; k: number }[] = [
      { label: `K 스킬 ${form.skill}`, ready: skillCd <= 0, k: 1 - skillCd / form.skillCooldown },
      { label: 'L 구르기', ready: p.rollCd <= 0, k: 1 - p.rollCd / 0.79 },
      { label: 'I 패링', ready: p.parryCd <= 0, k: 1 - p.parryCd / 0.5 },
    ];
    let ix = 20;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (const it of items) {
      const w = ctx.measureText(it.label).width + 16;
      ctx.fillStyle = it.ready ? 'rgba(255,226,122,0.18)' : 'rgba(255,255,255,0.06)';
      roundRect(ctx, ix, 92, w, 20, 10);
      ctx.fill();
      if (!it.ready) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(ctx, ix, 92, w * clamp(it.k, 0, 1), 20, 10);
        ctx.fill();
      }
      ctx.fillStyle = it.ready ? '#ffe27a' : '#8a90b0';
      ctx.fillText(it.label, ix + 8, 102.5);
      ix += w + 6;
    }

    // 점수 · 시간 · 스테이지 (오른쪽 위)
    ctx.textAlign = 'right';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,6,20,0.8)';
    const scoreText = Math.round(Math.min(MAX_SCORE, this.totalScore)).toLocaleString();
    ctx.strokeText(scoreText, VIEW_W - 18, 30);
    ctx.fillStyle = '#ffe27a';
    ctx.fillText(scoreText, VIEW_W - 18, 30);
    ctx.font = '700 13px system-ui, sans-serif';
    const mm = Math.floor(this.playTime / 60);
    const ss = Math.floor(this.playTime % 60);
    const info = `STAGE ${this.stageIdx + 1} · ${this.stage.name}  ⏱ ${mm}:${ss.toString().padStart(2, '0')}`;
    ctx.strokeText(info, VIEW_W - 18, 54);
    ctx.fillStyle = '#e8e4ff';
    ctx.fillText(info, VIEW_W - 18, 54);
    ctx.fillStyle = '#aab0d0';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`처치 ${this.kills} · 패링 ${this.parries}`, VIEW_W - 18, 74);

    // 콤보
    if (this.combo >= 2) {
      const a = clamp(this.comboT / 0.6, 0, 1);
      const pop = 1 + this.comboPop * 0.35;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(VIEW_W - 70, 140);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(10,6,20,0.85)';
      ctx.strokeText(String(this.combo), 0, 0);
      const cg = ctx.createLinearGradient(0, -20, 0, 20);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(1, this.combo >= 30 ? '#ff5adf' : this.combo >= 10 ? '#ffb02e' : '#ffe27a');
      ctx.fillStyle = cg;
      ctx.fillText(String(this.combo), 0, 0);
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText('COMBO', 0, 26);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('COMBO', 0, 26);
      ctx.restore();
    }

    // 보스 체력바 (아래)
    const b = this.boss;
    if (b && !b.dead && this.flow === 'boss') {
      const w = 600;
      const x = (VIEW_W - w) / 2;
      const y = VIEW_H - 34;
      ctx.fillStyle = 'rgba(8,6,20,0.6)';
      roundRect(ctx, x - 10, y - 26, w + 20, 54, 10);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.name, x, y - 12);
      ctx.textAlign = 'right';
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.fillStyle = b.color;
      ctx.fillText(`${b.english}${b.phase === 2 ? ' · PHASE 2' : ''}`, x + w, y - 12);
      ctx.fillStyle = '#1a1424';
      roundRect(ctx, x, y - 2, w, 12, 6);
      ctx.fill();
      const k = clamp(b.hp / b.maxHp, 0, 1);
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#ff2a4a');
      g.addColorStop(1, b.color);
      ctx.fillStyle = g;
      if (k > 0) {
        roundRect(ctx, x, y - 2, Math.max(8, w * k), 12, 6);
        ctx.fill();
      }
      // 페이즈 전환 지점
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x + w * 0.5 - 1, y - 4, 2, 16);
      // 패링 게이지
      const pk = clamp(b.posture / 100, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + w * 0.25, y + 14, w * 0.5, 4);
      ctx.fillStyle = b.stunT > 0 ? '#ffffff' : '#fff27a';
      const pw = b.stunT > 0 ? w * 0.5 : w * 0.5 * pk;
      ctx.fillRect(x + w * 0.5 - pw / 2, y + 14, pw, 4);
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    const bn = this.banner;
    if (!bn) return;
    const fadeIn = clamp(bn.t / 0.25, 0, 1);
    const fadeOut = clamp((bn.dur - bn.t) / 0.4, 0, 1);
    const a = Math.min(fadeIn, fadeOut);
    const cy = bn.big ? VIEW_H * 0.36 : VIEW_H * 0.24;
    ctx.save();
    ctx.globalAlpha = a;
    // 띠
    const g = ctx.createLinearGradient(0, 0, VIEW_W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.2, 'rgba(8,4,16,0.75)');
    g.addColorStop(0.8, 'rgba(8,4,16,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, cy - (bn.big ? 48 : 36), VIEW_W, bn.big ? 96 : 72);
    ctx.fillStyle = withAlpha(bn.color.startsWith('#') ? bn.color : '#ffffff', 0.8);
    const lineW = VIEW_W * 0.6 * fadeIn;
    ctx.fillRect((VIEW_W - lineW) / 2, cy - (bn.big ? 48 : 36), lineW, 2);
    ctx.fillRect((VIEW_W - lineW) / 2, cy + (bn.big ? 46 : 34), lineW, 2);
    const slide = (1 - fadeIn) * 40;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${bn.big ? 46 : 30}px system-ui, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,6,20,0.9)';
    ctx.strokeText(bn.title, VIEW_W / 2 + slide, cy - 8);
    ctx.fillStyle = bn.color;
    ctx.fillText(bn.title, VIEW_W / 2 + slide, cy - 8);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText(bn.sub, VIEW_W / 2 - slide, cy + (bn.big ? 28 : 22));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(bn.sub, VIEW_W / 2 - slide, cy + (bn.big ? 28 : 22));
    ctx.restore();
  }
}
