import {
  BOMB_CHANCE_MAX,
  BOMB_CHANCE_START,
  COMBO_BONUS_PER_FRUIT,
  COMBO_MIN,
  COMBO_WINDOW_SEC,
  FRUIT_TYPES,
  GRAVITY,
  MAX_SCORE,
  MAX_WAVE_SIZE,
  POINTS_PER_FRUIT,
  SPAWN_INTERVAL_MIN,
  SPAWN_INTERVAL_START,
  START_LIVES,
  VIEW_HEIGHT,
  type BladeDef,
  type BladeId,
} from './config';
import { Blade, Fruit, FruitHalf, Particle, Popup, Splat, pick, rand } from './entities';
import { TAU, bombFuseTip, drawBackground } from './render';
import type { QuestManager } from './QuestManager';

/* =========================================================
 * ScoreManager — 한 판의 점수 · 목숨 · 콤보 판정
 * ========================================================= */
interface ComboResult {
  count: number;
  bonus: number;
  x: number;
  y: number;
}

class ScoreManager {
  score = 0;
  lives = START_LIVES;
  private chain = 0;
  private lastSliceAt = -Infinity;
  private lastX = 0;
  private lastY = 0;

  addSlice(time: number, x: number, y: number) {
    this.add(POINTS_PER_FRUIT);
    // 직전 슬라이스로부터 COMBO_WINDOW_SEC 안이면 연속으로 친다
    this.chain = time - this.lastSliceAt <= COMBO_WINDOW_SEC ? this.chain + 1 : 1;
    this.lastSliceAt = time;
    this.lastX = x;
    this.lastY = y;
  }

  /** 콤보 대기 시간이 지나면 연속 기록을 확정한다. 3개 이상이면 보너스와 함께 결과를 돌려준다 */
  update(time: number): ComboResult | null {
    if (this.chain === 0 || time - this.lastSliceAt <= COMBO_WINDOW_SEC) return null;
    const count = this.chain;
    this.chain = 0;
    if (count < COMBO_MIN) return null;
    const bonus = count * COMBO_BONUS_PER_FRUIT;
    this.add(bonus);
    return { count, bonus, x: this.lastX, y: this.lastY };
  }

  private add(points: number) {
    this.score = Math.min(MAX_SCORE, this.score + points);
  }
}

/* =========================================================
 * FruitSlicerEngine — 게임 루프(requestAnimationFrame), 입력, 스폰, 렌더링
 * ========================================================= */
export interface EngineCallbacks {
  /** 퀘스트 달성으로 새 검이 열렸을 때 */
  onUnlock: (blades: BladeDef[]) => void;
  /** 게임이 끝났을 때 (연출이 끝난 뒤 한 번) */
  onGameOver: (score: number) => void;
}

/**
 * idle: 메뉴 화면 뒤에서 과일이 떠다니는 데모 상태
 * playing: 게임 중 / ending: 게임 오버 연출 중 / over: 결과 화면
 */
type EngineState = 'idle' | 'playing' | 'ending' | 'over';

const MAX_PARTICLES = 700;

export class FruitSlicerEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg = document.createElement('canvas');
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private lastFrame = 0;
  /** 게임 시간(초) — 느린 화면(slow motion) 중엔 천천히 흐른다 */
  private time = 0;

  /** 논리 좌표계 크기 — 높이는 VIEW_HEIGHT 고정, 너비는 화면 비율에 맞춘다 */
  private width = VIEW_HEIGHT * 1.6;
  private readonly height = VIEW_HEIGHT;
  private scale = 1;

  private state: EngineState = 'idle';
  private fruits: Fruit[] = [];
  private halves: FruitHalf[] = [];
  private particles: Particle[] = [];
  private splats: Splat[] = [];
  private popups: Popup[] = [];
  private readonly blade = new Blade();
  private scoreBoard = new ScoreManager();

  private elapsed = 0;
  private spawnTimer = 0;
  private pending: { delay: number; bomb: boolean }[] = [];
  private endTimer = 0;
  private timeScale = 1;

  private shakeTime = 0;
  private shakeDuration = 1;
  private shakeMagnitude = 0;
  private flash = 0;

  private pointerId: number | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  private swipeCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly quests: QuestManager,
    private readonly callbacks: EngineCallbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 를 사용할 수 없습니다.');
    this.ctx = ctx;
    this.blade.skin = quests.selected;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointercancel', this.handleUp);

    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointercancel', this.handleUp);
  }

  /** 새 판 시작 */
  start() {
    this.fruits = [];
    this.halves = [];
    this.popups = [];
    this.pending = [];
    this.scoreBoard = new ScoreManager();
    this.elapsed = 0;
    this.spawnTimer = 0.6;
    this.timeScale = 1;
    this.flash = 0;
    this.shakeTime = 0;
    this.state = 'playing';
  }

  /** 메뉴로 돌아갈 때 — 데모 모드 */
  idle() {
    this.state = 'idle';
    this.timeScale = 1;
    this.pending = [];
  }

  setBlade(id: BladeId) {
    this.blade.skin = id;
  }

  // ---------------- 크기 ----------------

  private resize() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.width = (this.height * cssW) / cssH;
    this.scale = this.canvas.height / this.height;

    // 배경은 크기가 바뀔 때만 다시 그린다
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const bctx = this.bg.getContext('2d');
    if (bctx) {
      bctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      drawBackground(bctx, this.width, this.height);
    }
  }

  // ---------------- 입력 ----------------

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.width,
      y: ((e.clientY - rect.top) / rect.height) * this.height,
    };
  }

  private handleDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 캡처를 못 해도 게임은 동작한다
    }
    const p = this.toLocal(e);
    this.lastPointer = p;
    this.swipeCount = 0;
    this.blade.beginStroke(p.x, p.y, this.time);
  };

  private handleMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.lastPointer) return;
    e.preventDefault();
    // 빠르게 그을 때 빠진 좌표까지 받아서 궤적을 촘촘하게
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length > 0 ? events : [e]) {
      const p = this.toLocal(ev);
      const from = this.lastPointer;
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      if (dx * dx + dy * dy < 1) continue;
      this.blade.addPoint(p.x, p.y, this.time);
      this.blade.emitTrail(this.particles, p.x, p.y, dx, dy);
      if (this.state === 'playing') this.checkSlices(from, p);
      this.lastPointer = p;
    }
  };

  private handleUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.lastPointer = null;
    this.swipeCount = 0;
  };

  // ---------------- 슬라이스 판정 ----------------

  /** 이번 이동 선분(a→b)에 닿은 과일을 벤다 */
  private checkSlices(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    for (const fruit of [...this.fruits]) {
      if (this.state !== 'playing') return;
      // 선분과 과일 중심 사이 최단 거리
      const t = Math.max(0, Math.min(1, ((fruit.x - a.x) * dx + (fruit.y - a.y) * dy) / len2));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const dist2 = (fruit.x - cx) ** 2 + (fruit.y - cy) ** 2;
      if (dist2 <= (fruit.r * 0.95) ** 2) this.slice(fruit, Math.atan2(dy, dx), dx, dy);
    }
  }

  private slice(fruit: Fruit, angle: number, dx: number, dy: number) {
    this.fruits = this.fruits.filter((f) => f !== fruit);
    if (!fruit.type) {
      this.explode(fruit);
      return;
    }
    const type = fruit.type;

    // 절단선의 법선 방향으로 두 조각을 벌려서 날린다
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const len = Math.hypot(dx, dy) || 1;
    const push = 110;
    const carry = 70;
    for (const side of [1, -1] as const) {
      this.halves.push(
        new FruitHalf(
          type,
          fruit.r,
          { x: fruit.x + nx * side * 3, y: fruit.y + ny * side * 3, rot: fruit.rot },
          {
            vx: fruit.vx * 0.6 + nx * side * push + (dx / len) * carry,
            vy: Math.min(fruit.vy * 0.4, 0) + ny * side * push + (dy / len) * carry - 60,
          },
          angle - fruit.rot,
          side,
        ),
      );
    }

    // 과즙 15~20개 — 360도로 튀며 중력을 받는다
    const juiceCount = 15 + Math.floor(Math.random() * 6);
    for (let i = 0; i < juiceCount; i++) {
      const a = rand(0, TAU);
      const s = rand(120, 420);
      this.particles.push(
        new Particle({
          x: fruit.x,
          y: fruit.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 80,
          life: rand(0.5, 0.9),
          size: rand(2.5, 5.5),
          color: type.juice,
          kind: 'juice',
          gravity: 1,
          drag: 0.6,
        }),
      );
    }
    this.splats.push(new Splat(fruit.x, fruit.y, type.juice, fruit.r * 0.8));
    this.blade.emitSlice(this.particles, fruit.x, fruit.y);

    this.scoreBoard.addSlice(this.time, fruit.x, fruit.y);
    this.swipeCount += 1;
    this.unlock(this.quests.recordSlice());
    this.unlock(this.quests.recordSwipe(this.swipeCount));
    this.unlock(this.quests.recordScore(this.scoreBoard.score));
  }

  /** 폭탄 — 화면 흔들림 + 붉은 플래시 + 폭발 입자, 곧바로 게임 오버 */
  private explode(bomb: Fruit) {
    const { x, y } = bomb;
    for (let i = 0; i < 50; i++) {
      const a = rand(0, TAU);
      const s = rand(100, 650);
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rand(0.5, 1.1),
          size: rand(5, 12),
          color: pick(['#ff3b1f', '#ff8a00', '#ffd23f', '#ffffff']),
          kind: 'fire',
          gravity: 0.2,
          drag: 2.2,
        }),
      );
    }
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      const s = rand(40, 200);
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rand(1, 1.8),
          size: rand(10, 18),
          color: '#3a3333',
          kind: 'smoke',
          gravity: -0.1,
          drag: 1.2,
        }),
      );
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(200, 500);
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 1.2,
          size: rand(4, 8),
          color: '#1c1c22',
          kind: 'debris',
          gravity: 1,
        }),
      );
    }
    this.shakeFor(0.8, 18);
    this.flash = 1;
    this.popups.push(new Popup('BOOM!', '', x, y - 20, '#ff3b1f', 56, 1.4));
    this.scoreBoard.lives = 0;
    this.endGame(1.6, 0.35);
  }

  private unlock(blades: BladeDef[]) {
    if (blades.length > 0) this.callbacks.onUnlock(blades);
  }

  private shakeFor(duration: number, magnitude: number) {
    // 더 센 흔들림이 진행 중이면 덮어쓰지 않는다
    if (this.shakeTime > 0 && this.shakeMagnitude > magnitude) return;
    this.shakeTime = duration;
    this.shakeDuration = duration;
    this.shakeMagnitude = magnitude;
  }

  private endGame(delay: number, timeScale: number) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endTimer = delay;
    this.timeScale = timeScale;
    this.pending = [];
    this.pointerId = null;
    this.lastPointer = null;
    this.quests.recordScore(this.scoreBoard.score);
    this.quests.save();
  }

  // ---------------- 스폰 ----------------

  /** 0 → 1 로 오르는 난이도 (시간 + 점수) */
  private difficulty() {
    return Math.min(1, this.elapsed / 100 + this.scoreBoard.score / 4000);
  }

  private scheduleWave() {
    const d = this.difficulty();
    const maxWave = 1 + Math.round(d * (MAX_WAVE_SIZE - 1));
    const size = 1 + Math.floor(Math.random() * maxWave);
    const bombChance = BOMB_CHANCE_START + (BOMB_CHANCE_MAX - BOMB_CHANCE_START) * d;
    // 가끔은 한꺼번에, 보통은 살짝씩 시간차를 두고 튀어 오른다
    const together = Math.random() < 0.35;
    let bombs = 0;
    for (let i = 0; i < size; i++) {
      const bomb = bombs < 2 && Math.random() < bombChance;
      if (bomb) bombs += 1;
      this.pending.push({ delay: together ? rand(0, 0.08) : i * rand(0.12, 0.3), bomb });
    }
    // 폭탄만 나오는 웨이브는 만들지 않는다
    if (bombs === size) this.pending[0]!.bomb = false;
    const interval = SPAWN_INTERVAL_START - (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN) * d;
    this.spawnTimer = interval * rand(0.85, 1.2) + (together ? 0 : size * 0.12);
  }

  private launch(bomb: boolean) {
    const type = bomb ? null : pick(FRUIT_TYPES);
    const r = type ? type.radius : 30;
    const W = this.width;
    const H = this.height;
    const x = rand(W * 0.12, W * 0.88);
    const y = H + r;
    // 정점 높이를 정하고, 그 높이까지 올라갈 초속도를 역산한다 (포물선)
    const peakY = rand(H * 0.08, H * 0.42);
    const vy = -Math.sqrt(2 * GRAVITY * (y - peakY));
    const tPeak = -vy / GRAVITY;
    const vx = ((W / 2 - x) / (tPeak * 2)) * rand(0.2, 0.9) + rand(-30, 30);
    this.fruits.push(new Fruit(type, x, y, vx, vy));
  }

  // ---------------- 루프 ----------------

  private frame = (now: number) => {
    // 탭 전환 등으로 프레임이 오래 멈췄을 때 튀지 않도록 dt 상한
    const realDt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 1 / 30) : 1 / 60;
    this.lastFrame = now;
    this.update(realDt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(realDt: number) {
    const dt = realDt * this.timeScale;
    this.time += dt;

    if (this.state === 'playing') {
      this.elapsed += dt;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.pending.length === 0) this.scheduleWave();
    } else if (this.state === 'idle' || this.state === 'over') {
      // 메뉴 뒤 데모: 과일만 천천히 띄운다
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.pending.push({ delay: 0, bomb: Math.random() < 0.1 });
        this.spawnTimer = rand(0.9, 1.6);
      }
    }

    for (const p of this.pending) p.delay -= dt;
    for (const p of this.pending.filter((q) => q.delay <= 0)) this.launch(p.bomb);
    this.pending = this.pending.filter((q) => q.delay > 0);

    // 과일 이동 + 놓친 과일 처리
    for (const fruit of this.fruits) {
      fruit.update(dt);
      if (fruit.isBomb && Math.random() < 0.6) this.emitFuseSpark(fruit);
    }
    const fallen = this.fruits.filter((f) => f.vy > 0 && f.y - f.r * 1.6 > this.height);
    if (fallen.length > 0) {
      this.fruits = this.fruits.filter((f) => !fallen.includes(f));
      for (const f of fallen) if (!f.isBomb) this.miss(f);
    }

    for (const h of this.halves) h.update(dt);
    this.halves = this.halves.filter((h) => h.y - h.r * 2 < this.height);
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => p.alive);
    if (this.particles.length > MAX_PARTICLES)
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    for (const s of this.splats) s.update(dt);
    this.splats = this.splats.filter((s) => s.alive);
    for (const p of this.popups) p.update(realDt);
    this.popups = this.popups.filter((p) => p.alive);
    this.blade.update(this.time);

    if (this.state === 'playing') {
      const combo = this.scoreBoard.update(this.time);
      if (combo) {
        this.popups.push(
          new Popup(
            `COMBO x${combo.count}!`,
            `+${combo.bonus}`,
            this.clampX(combo.x),
            Math.max(60, combo.y - 30),
            '#ffe36e',
            40,
          ),
        );
        this.unlock(this.quests.recordCombo());
        this.unlock(this.quests.recordScore(this.scoreBoard.score));
      }
    }

    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - realDt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - realDt * 1.1);

    if (this.state === 'ending') {
      this.endTimer -= realDt;
      if (this.endTimer <= 0) {
        this.state = 'over';
        this.timeScale = 1;
        this.fruits = [];
        this.spawnTimer = 1.5;
        this.callbacks.onGameOver(this.scoreBoard.score);
      }
    }
  }

  private miss(fruit: Fruit) {
    if (this.state !== 'playing') return;
    this.scoreBoard.lives -= 1;
    this.shakeFor(0.25, 5);
    this.popups.push(
      new Popup('✕', '', this.clampX(fruit.x), this.height - 40, '#ff4d4d', 44, 0.9),
    );
    if (this.scoreBoard.lives <= 0) this.endGame(1.1, 0.5);
  }

  private emitFuseSpark(bomb: Fruit) {
    const tip = bombFuseTip(bomb.r);
    const c = Math.cos(bomb.rot);
    const s = Math.sin(bomb.rot);
    this.particles.push(
      new Particle({
        x: bomb.x + tip.x * c - tip.y * s,
        y: bomb.y + tip.x * s + tip.y * c,
        vx: rand(-80, 80),
        vy: rand(-120, 20),
        life: rand(0.15, 0.3),
        size: 1.6,
        color: pick(['#fff3a0', '#ffb300']),
        kind: 'spark',
        gravity: 0.5,
      }),
    );
  }

  private clampX(x: number) {
    return Math.max(90, Math.min(this.width - 90, x));
  }

  // ---------------- 렌더링 ----------------

  private render() {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // 화면 흔들림
    ctx.save();
    if (this.shakeTime > 0) {
      const m = this.shakeMagnitude * (this.shakeTime / this.shakeDuration);
      ctx.translate(rand(-m, m), rand(-m, m));
    }
    for (const s of this.splats) s.draw(ctx);
    for (const h of this.halves) h.draw(ctx);
    for (const f of this.fruits) f.draw(ctx, this.time);
    for (const p of this.particles) p.draw(ctx);
    this.blade.draw(ctx, this.time);
    for (const p of this.popups) p.draw(ctx);
    ctx.restore();

    // 폭발 플래시 (처음엔 하얗게, 곧 붉게)
    if (this.flash > 0) {
      ctx.fillStyle =
        this.flash > 0.85
          ? `rgba(255,240,220,${(this.flash - 0.85) * 5})`
          : `rgba(255,30,20,${this.flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.state === 'playing' || this.state === 'ending') this.drawHud(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const font = "Pretendard, 'Malgun Gothic', sans-serif";
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';

    ctx.font = `900 40px ${font}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#1a0f08';
    ctx.fillStyle = '#ffe36e';
    const scoreText = String(this.scoreBoard.score);
    ctx.strokeText(scoreText, 20, 16);
    ctx.fillText(scoreText, 20, 16);

    ctx.font = `800 16px ${font}`;
    ctx.lineWidth = 4;
    const best = `BEST ${Math.max(this.quests.highScore, this.scoreBoard.score)}`;
    ctx.strokeText(best, 22, 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(best, 22, 60);

    // 목숨: 오른쪽 위 X 3개 — 잃은 만큼 빨갛게
    const lost = START_LIVES - Math.max(0, this.scoreBoard.lives);
    for (let i = 0; i < START_LIVES; i++) {
      const cx = this.width - 30 - (START_LIVES - 1 - i) * 36;
      const cy = 34;
      const isLost = i >= START_LIVES - lost;
      const m = isLost ? 13 : 10;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1a0f08';
      ctx.lineWidth = isLost ? 11 : 9;
      this.cross(ctx, cx, cy, m);
      ctx.strokeStyle = isLost ? '#ff3b3b' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = isLost ? 6 : 4;
      this.cross(ctx, cx, cy, m);
    }
  }

  private cross(ctx: CanvasRenderingContext2D, x: number, y: number, m: number) {
    ctx.beginPath();
    ctx.moveTo(x - m, y - m);
    ctx.lineTo(x + m, y + m);
    ctx.moveTo(x + m, y - m);
    ctx.lineTo(x - m, y + m);
    ctx.stroke();
  }
}
