import {
  BOMB_CHANCE_MAX,
  BOMB_CHANCE_START,
  COMBO_MILESTONE,
  COMBO_MILESTONE_BONUS,
  DIFFICULTY_FULL_SCORE,
  DIFFICULTY_FULL_SEC,
  FEVER_BOMB_POINTS,
  FEVER_COMBO_GOAL,
  FEVER_DURATION_SEC,
  FEVER_SCORE_MULTIPLIER,
  FRUIT_TYPES,
  GRAVITY,
  MAX_SCORE,
  MAX_WAVE_SIZE,
  POINTS_PER_FRUIT,
  SPAWN_INTERVAL_MIN,
  SPAWN_INTERVAL_START,
  START_LIVES,
  VIEW_HEIGHT,
  type BladeId,
  type ThemeId,
} from './config';
import { Blade, Fruit, FruitHalf, Particle, Popup, Splat, pick, rand } from './entities';
import { TAU, bombFuseTip } from './render';
import { ThemeAmbient, drawThemeAnimated, drawThemeBack, drawThemeFront } from './themes';
import type { QuestManager, Unlock } from './QuestManager';
import type { SoundManager } from './SoundManager';

/* =========================================================
 * ScoreManager — 한 판의 점수 · 목숨 · 콤보 판정
 * ========================================================= */
class ScoreManager {
  score = 0;
  lives = START_LIVES;
  /** 놓치지 않고 연속으로 벤 과일 수 */
  combo = 0;

  /**
   * 과일 1개를 벨 때마다 호출 — 콤보 +1.
   * 콤보가 COMBO_MILESTONE 단위에 닿으면 보너스를 더하고 그 값을 돌려준다 (없으면 0)
   */
  addFruit(points: number): number {
    this.add(points);
    this.combo += 1;
    if (this.combo % COMBO_MILESTONE !== 0) return 0;
    const bonus = this.combo * COMBO_MILESTONE_BONUS;
    this.add(bonus);
    return bonus;
  }

  /** 콤보와 상관없는 점수 (피버 중 폭탄 등) */
  add(points: number) {
    this.score = Math.min(MAX_SCORE, this.score + points);
  }

  breakCombo() {
    this.combo = 0;
  }
}

/* =========================================================
 * FruitSlicerEngine — 게임 루프(requestAnimationFrame), 입력, 스폰, 렌더링
 * ========================================================= */
export interface EngineCallbacks {
  /** 퀘스트 달성으로 새 검·테마가 열렸을 때 */
  onUnlock: (unlocks: Unlock[]) => void;
  /** 게임이 끝났을 때 (연출이 끝난 뒤 한 번) */
  onGameOver: (score: number) => void;
}

/**
 * idle: 메뉴 화면 뒤에서 과일이 떠다니는 데모 상태
 * playing: 게임 중 / ending: 게임 오버 연출 중 / over: 결과 화면
 */
type EngineState = 'idle' | 'playing' | 'ending' | 'over';

const MAX_PARTICLES = 700;

/** 발사 궤적 (시작 위치 + 초속도) */
interface Trajectory {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
/** 발사할 때 시험해 보는 후보 궤적 수 */
const LAUNCH_CANDIDATES = 16;
/** 필요 간격 = 두 반지름 합 × 배율 — 과일끼리는 살짝, 폭탄과 과일은 넉넉히 */
const FRUIT_GAP = 1.15;
const BOMB_GAP = 2.6;
/** 오른쪽 위 설정 버튼이 차지하는 CSS px (버튼 44 + 여백) — FruitSlicer.module.css 의 .settingsButton 과 맞출 것 */
const SETTINGS_BUTTON_SPACE_CSS = 60;

export class FruitSlicerEngine {
  private readonly ctx: CanvasRenderingContext2D;
  /** 테마 뒷배경 (하늘·먼 풍경) — 크기·테마가 바뀔 때만 다시 그린다 */
  private readonly bg = document.createElement('canvas');
  /** 테마 앞쪽 실루엣 — 움직이는 층 위에 덮는다 (없는 테마도 있다) */
  private readonly fg = document.createElement('canvas');
  private hasFront = false;
  private theme: ThemeId;
  private readonly ambient = new ThemeAmbient();
  private ambientReady = false;
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

  /**
   * 피버 게이지 — 피버가 아닐 때 쌓은 콤보 수. 과일을 놓치면 콤보와 함께 0,
   * FEVER_COMBO_GOAL 이 되면 피버 발동 후 0 부터 다시 채운다
   */
  private feverGauge = 0;
  /** HUD 콤보 숫자가 커졌다 돌아오는 연출용 (초) */
  private comboPulse = 0;
  /** 피버 타임 남은 시간(초). 0 보다 크면 피버 중 */
  private feverTime = 0;

  /** 일시정지 중엔 게임 시간을 멈추고 화면만 그린다 */
  private paused = false;
  /** 오른쪽 위 설정 버튼 자리 (논리 px) — 목숨 표시가 버튼에 가리지 않게 비워 둔다 */
  private hudInsetRight = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly quests: QuestManager,
    private readonly sound: SoundManager,
    private readonly callbacks: EngineCallbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 를 사용할 수 없습니다.');
    this.ctx = ctx;
    this.blade.skin = quests.selected;
    this.theme = quests.selectedTheme;

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
    this.feverGauge = 0;
    this.stopFever();
    this.paused = false;
    this.releasePointer();
    this.state = 'playing';
    this.sound.stopBgm();
    this.sound.startBgm();
  }

  /** 메뉴로 돌아갈 때 — 데모 모드 (진행 중인 판은 기록 없이 끝난다) */
  idle() {
    this.state = 'idle';
    this.timeScale = 1;
    this.pending = [];
    this.stopFever();
    this.paused = false;
    this.releasePointer();
    this.sound.stopBgm();
    this.quests.save();
  }

  /** 일시정지 — 게임 시간·피버·스폰이 모두 멈춘다 */
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.releasePointer();
    this.quests.save();
  }

  resume() {
    this.paused = false;
  }

  /** 게임 진행 중(연출 포함)인지 — 일시정지 가능 여부 판단용 */
  get inGame() {
    return this.state === 'playing' || this.state === 'ending';
  }

  /** 누르고 있던 손가락/마우스를 놓은 것으로 처리 (일시정지·화면 전환 시) */
  private releasePointer() {
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        // 이미 풀려 있으면 무시
      }
    }
    this.pointerId = null;
    this.lastPointer = null;
    this.swipeCount = 0;
  }

  private get fever() {
    return this.feverTime > 0;
  }

  setBlade(id: BladeId) {
    this.blade.skin = id;
  }

  /** 배경 테마 바꾸기 — 메뉴에서 고르면 뒤에 보이는 데모 화면도 바로 바뀐다 */
  setTheme(id: ThemeId) {
    if (this.theme === id) return;
    this.theme = id;
    this.ambient.setTheme(id, this.width, this.height);
    this.paintTheme();
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
    // 설정 버튼(44px + 여백) 만큼을 논리 좌표로 환산
    this.hudInsetRight = (SETTINGS_BUTTON_SPACE_CSS * this.height) / cssH;

    // 배경은 크기가 바뀔 때만 다시 그린다 (입자는 처음 한 번만 만들고, 이후엔 비율대로 옮긴다)
    if (this.ambientReady) this.ambient.resize(this.width, this.height);
    else this.ambient.setTheme(this.theme, this.width, this.height);
    this.ambientReady = true;
    this.paintTheme();
  }

  /** 테마의 정지된 두 층(뒷배경·앞 실루엣)을 오프스크린 캔버스에 그린다 */
  private paintTheme() {
    for (const layer of [this.bg, this.fg]) {
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
    }
    const bctx = this.bg.getContext('2d');
    if (bctx) {
      bctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      drawThemeBack(bctx, this.theme, this.width, this.height);
    }
    const fctx = this.fg.getContext('2d');
    this.hasFront = false;
    if (fctx) {
      fctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.hasFront = drawThemeFront(fctx, this.theme, this.width, this.height);
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
    if (this.pointerId !== null || this.paused) return;
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
    if (e.pointerId !== this.pointerId || !this.lastPointer || this.paused) return;
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
      if (this.state === 'playing') {
        // 빠르게 휘두를 때만 바람 소리 (SoundManager 가 너무 자주 나지 않게 간격을 둔다)
        if (dx * dx + dy * dy > 18 * 18) this.sound.play('swoosh');
        this.checkSlices(from, p);
      }
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
    // 피버 중엔 칼날 판정이 넓어진다
    const reach = this.fever ? 1.35 : 0.95;
    for (const fruit of [...this.fruits]) {
      if (this.state !== 'playing') return;
      // 선분과 과일 중심 사이 최단 거리
      const t = Math.max(0, Math.min(1, ((fruit.x - a.x) * dx + (fruit.y - a.y) * dy) / len2));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const dist2 = (fruit.x - cx) ** 2 + (fruit.y - cy) ** 2;
      if (dist2 <= (fruit.r * reach) ** 2) this.slice(fruit, Math.atan2(dy, dx), dx, dy);
    }
  }

  private slice(fruit: Fruit, angle: number, dx: number, dy: number) {
    this.fruits = this.fruits.filter((f) => f !== fruit);
    if (!fruit.type) {
      // 피버 중엔 폭탄도 안전하게 벨 수 있다
      if (this.fever) this.defuse(fruit);
      else this.explode(fruit);
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

    // 과일 1개 = 콤보 +1 (한 번에 여러 개를 베면 그만큼 연달아 오른다)
    const points = POINTS_PER_FRUIT * (this.fever ? FEVER_SCORE_MULTIPLIER : 1);
    const bonus = this.scoreBoard.addFruit(points);
    const combo = this.scoreBoard.combo;
    this.comboPulse = 0.25;
    this.sound.play('slice');
    if (bonus > 0) {
      this.sound.play('combo');
      this.popups.push(
        new Popup(
          `${combo} COMBO!`,
          `+${bonus}`,
          this.clampX(fruit.x),
          Math.max(70, fruit.y - 40),
          '#ffe36e',
          40,
        ),
      );
    }
    this.swipeCount += 1;
    this.unlock(this.quests.recordSlice());
    this.unlock(this.quests.recordSwipe(this.swipeCount));
    this.unlock(this.quests.recordCombo(combo));
    this.unlock(this.quests.recordScore(this.scoreBoard.score));

    if (!this.fever) {
      this.feverGauge += 1;
      if (this.feverGauge >= FEVER_COMBO_GOAL) this.startFever();
    }
  }

  /** 피버 중 벤 폭탄 — 터지지 않고 불꽃만 튀며 점수를 준다 */
  private defuse(bomb: Fruit) {
    const { x, y } = bomb;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU);
      const s = rand(120, 420);
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rand(0.3, 0.6),
          size: rand(2, 3),
          color: pick(['#ffe36e', '#ffffff', '#ff9a3c']),
          kind: 'spark',
          gravity: 0.3,
          drag: 2,
        }),
      );
    }
    this.particles.push(
      new Particle({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.45,
        size: 80,
        color: '#ffe36e',
        kind: 'ring',
        gravity: 0,
      }),
    );
    this.blade.emitSlice(this.particles, x, y);
    this.sound.play('defuse');
    this.popups.push(new Popup(`+${FEVER_BOMB_POINTS}`, '', x, y - 10, '#ffe36e', 28, 0.8));
    // 폭탄은 과일이 아니므로 콤보·스와이프 개수에는 넣지 않는다
    this.scoreBoard.add(FEVER_BOMB_POINTS);
    this.unlock(this.quests.recordDefuse());
    this.unlock(this.quests.recordScore(this.scoreBoard.score));
  }

  // ---------------- 피버 타임 ----------------

  private startFever() {
    this.feverTime = FEVER_DURATION_SEC;
    this.feverGauge = 0;
    this.blade.fever = true;
    // 지금 대기 중인 웨이브를 비우고 바로 과일 러시 시작
    this.pending = [];
    this.spawnTimer = 0.3;
    this.shakeFor(0.35, 6);
    const cx = this.width / 2;
    const cy = this.height * 0.42;
    this.popups.push(new Popup('FEVER TIME!', '무엇이든 벨 수 있다!', cx, cy, '#ff5ec8', 52, 1.8));
    for (const [color, size] of [
      ['#ffe36e', 260],
      ['#ff5ec8', 200],
      ['#7dd8ff', 140],
    ] as const) {
      this.particles.push(
        new Particle({
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          life: 0.8,
          size,
          color,
          kind: 'ring',
          gravity: 0,
        }),
      );
    }
    this.sound.play('fever');
    this.sound.setBgmFast(true);
    this.unlock(this.quests.recordFever());
  }

  private stopFever() {
    this.feverTime = 0;
    this.blade.fever = false;
    this.sound.setBgmFast(false);
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
    this.sound.play('bomb');
    this.scoreBoard.lives = 0;
    this.endGame(1.6, 0.35);
  }

  private unlock(unlocks: Unlock[]) {
    if (unlocks.length > 0) this.callbacks.onUnlock(unlocks);
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
    this.stopFever();
    this.endTimer = delay;
    this.timeScale = timeScale;
    this.pending = [];
    this.releasePointer();
    this.sound.stopBgm();
    // 끝까지 마친 판만 판 수·누적 점수에 들어간다 (중간에 홈으로 나가면 기록 없음)
    this.unlock(this.quests.recordGameEnd(this.scoreBoard.score));
    this.quests.save();
  }

  // ---------------- 스폰 ----------------

  /** 0 → 1 로 오르는 난이도 (시간 + 점수) */
  private difficulty() {
    const byTime = this.elapsed / DIFFICULTY_FULL_SEC;
    const byScore = this.scoreBoard.score / DIFFICULTY_FULL_SCORE;
    return Math.min(1, (byTime + byScore) / 2);
  }

  private scheduleWave() {
    if (this.fever) {
      // 피버 러시: 과일(가끔 폭탄)이 쉴 새 없이 쏟아진다
      const size = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < size; i++) {
        this.pending.push({ delay: i * rand(0.05, 0.12), bomb: Math.random() < 0.15 });
      }
      this.spawnTimer = rand(0.55, 0.8);
      return;
    }
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

  /**
   * 과일/폭탄 발사 — 후보 궤적을 여러 개 만들어 보고, 이미 날고 있는 것들과
   * 가장 덜 겹치는 궤적을 고른다. (폭탄 ↔ 과일은 특히 넉넉히 떨어뜨린다)
   */
  private launch(bomb: boolean) {
    const type = bomb ? null : pick(FRUIT_TYPES);
    const r = type ? type.radius : 30;
    let best: Trajectory | null = null;
    let bestClearance = -Infinity;
    for (let i = 0; i < LAUNCH_CANDIDATES; i++) {
      const cand = this.randomTrajectory(r);
      const clearance = this.clearance(cand, r, bomb);
      if (clearance > bestClearance) {
        best = cand;
        bestClearance = clearance;
      }
      if (clearance >= 0) break; // 충분히 떨어진 궤적이면 바로 사용
    }
    if (!best) return;
    this.fruits.push(new Fruit(type, best.x, best.y, best.vx, best.vy));
  }

  private randomTrajectory(r: number): Trajectory {
    const W = this.width;
    const H = this.height;
    const x = rand(W * 0.12, W * 0.88);
    const y = H + r;
    // 정점 높이를 정하고, 그 높이까지 올라갈 초속도를 역산한다 (포물선)
    const peakY = rand(H * 0.08, H * 0.42);
    const vy = -Math.sqrt(2 * GRAVITY * (y - peakY));
    const tPeak = -vy / GRAVITY;
    const vx = ((W / 2 - x) / (tPeak * 2)) * rand(0.2, 0.9) + rand(-30, 30);
    return { x, y, vx, vy };
  }

  /**
   * 후보 궤적이 날고 있는 물체들과 얼마나 떨어져 지나가는지 (필요 간격을 뺀 최소 거리).
   * 모두 같은 중력을 받으므로 두 물체의 상대 위치는 직선으로 변한다 → 시간별로 샘플링해 비교.
   * 음수면 어딘가에서 필요 간격보다 가까워진다는 뜻
   */
  private clearance(c: Trajectory, r: number, bomb: boolean): number {
    let min = Infinity;
    for (const f of this.fruits) {
      const gap = bomb !== f.isBomb ? BOMB_GAP : FRUIT_GAP;
      const need = (r + f.r) * gap;
      for (let k = 0; k <= 12; k++) {
        const t = k * 0.12;
        const dx = c.x - f.x + (c.vx - f.vx) * t;
        const dy = c.y - f.y + (c.vy - f.vy) * t;
        min = Math.min(min, Math.hypot(dx, dy) - need);
      }
    }
    return min;
  }

  // ---------------- 루프 ----------------

  private frame = (now: number) => {
    // 탭 전환 등으로 프레임이 오래 멈췄을 때 튀지 않도록 dt 상한
    const realDt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 1 / 30) : 1 / 60;
    this.lastFrame = now;
    // 일시정지 중엔 시간을 흘리지 않고 마지막 장면만 그린다 (밝기 변경이 바로 보이도록)
    if (!this.paused) this.update(realDt);
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
    this.ambient.update(dt);

    if (this.state === 'playing' && this.fever) {
      this.feverTime = Math.max(0, this.feverTime - realDt);
      if (this.feverTime === 0) {
        this.stopFever();
        this.sound.play('feverEnd');
        this.popups.push(
          new Popup('FEVER 종료', '', this.width / 2, this.height * 0.4, '#ffffff', 34, 1),
        );
      }
    }

    if (this.comboPulse > 0) this.comboPulse = Math.max(0, this.comboPulse - realDt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - realDt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - realDt * 1.1);

    if (this.state === 'ending') {
      this.endTimer -= realDt;
      if (this.endTimer <= 0) {
        this.state = 'over';
        this.timeScale = 1;
        this.fruits = [];
        this.spawnTimer = 1.5;
        this.sound.play('gameOver');
        this.callbacks.onGameOver(this.scoreBoard.score);
      }
    }
  }

  private miss(fruit: Fruit) {
    // 피버 중엔 놓쳐도 목숨과 콤보가 그대로다
    if (this.state !== 'playing' || this.fever) return;
    if (this.scoreBoard.combo >= 5) {
      this.popups.push(
        new Popup('COMBO BREAK', '', this.width / 2, this.height * 0.3, '#ff8a8a', 28, 0.9),
      );
    }
    this.scoreBoard.breakCombo();
    this.feverGauge = 0;
    this.scoreBoard.lives -= 1;
    this.sound.play('miss');
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
    // 테마: 움직이는 층 → 앞 실루엣 → 흩날리는 입자
    drawThemeAnimated(ctx, this.theme, W, H, this.time);
    if (this.hasFront) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.fg, 0, 0);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    }
    this.ambient.draw(ctx);

    if (this.fever) this.drawFeverBackdrop(ctx);

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

    if (this.fever) this.drawFeverFrame(ctx);
    if (this.state === 'playing' || this.state === 'ending') this.drawHud(ctx);
  }

  /** 피버 배경 — 색이 도는 은은한 빛 + 중앙에서 뻗는 빛줄기 */
  private drawFeverBackdrop(ctx: CanvasRenderingContext2D) {
    const W = this.width;
    const H = this.height;
    const hue = (this.time * 90) % 360;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, `hsla(${hue}, 100%, 60%, 0.22)`);
    g.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 50%, 0.05)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 천천히 도는 빛줄기 12갈래
    ctx.translate(W / 2, H / 2);
    ctx.rotate(this.time * 0.4);
    const len = Math.max(W, H);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.fillStyle = `hsla(${(hue + i * 30) % 360}, 100%, 70%, 0.05)`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, -len * 0.09);
      ctx.lineTo(len, len * 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 피버 테두리 — 맥동하는 무지개 틀 */
  private drawFeverFrame(ctx: CanvasRenderingContext2D) {
    const W = this.width;
    const H = this.height;
    const hue = (this.time * 200) % 360;
    const g = ctx.createLinearGradient(0, 0, W, H);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(hue + i * 60) % 360}, 100%, 60%)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 12);
    ctx.strokeStyle = g;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.restore();
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

    this.drawFeverGauge(ctx, font);
    this.drawCombo(ctx, font);

    // 목숨: 오른쪽 위 X 3개 — 잃은 만큼 빨갛게
    const lost = START_LIVES - Math.max(0, this.scoreBoard.lives);
    for (let i = 0; i < START_LIVES; i++) {
      const cx = this.width - 30 - this.hudInsetRight - (START_LIVES - 1 - i) * 36;
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

  /**
   * HUD 배치 — 넓은 화면은 게이지를 맨 위 가운데에,
   * 좁은 화면(모바일 세로)은 목숨·설정 버튼과 겹치지 않게 한 줄 아래로 내린다
   */
  private hudLayout() {
    const compact = this.width < 600;
    return compact ? { gaugeY: 96, comboY: 150 } : { gaugeY: 22, comboY: 78 };
  }

  /** 게이지 아래 현재 콤보 — 벨 때마다 톡 커졌다가 돌아온다 */
  private drawCombo(ctx: CanvasRenderingContext2D, font: string) {
    const combo = this.scoreBoard.combo;
    if (combo < 1) return;
    const scale = 1 + this.comboPulse * 1.4;
    ctx.save();
    ctx.translate(this.width / 2, this.hudLayout().comboY);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 30px ${font}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a0f08';
    const text = `${combo} COMBO`;
    ctx.strokeText(text, 0, 0);
    // 콤보가 높을수록 노랑 → 주황 → 분홍으로 달아오른다
    const heat = Math.min(1, combo / 60);
    ctx.fillStyle = `hsl(${50 - heat * 70}, 100%, ${65 - heat * 5}%)`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /** 가운데 위 피버 게이지 — 평소엔 콤보 진행도, 피버 중엔 남은 시간 */
  private drawFeverGauge(ctx: CanvasRenderingContext2D, font: string) {
    const w = Math.min(220, this.width * 0.38);
    const h = 12;
    const x = (this.width - w) / 2;
    const y = this.hudLayout().gaugeY;
    const ratio = this.fever
      ? this.feverTime / FEVER_DURATION_SEC
      : Math.min(1, this.feverGauge / FEVER_COMBO_GOAL);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 9);
    ctx.fill();
    if (ratio > 0) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      if (this.fever) {
        const hue = (this.time * 200) % 360;
        for (let i = 0; i <= 4; i++)
          g.addColorStop(i / 4, `hsl(${(hue + i * 70) % 360}, 100%, 60%)`);
      } else {
        g.addColorStop(0, '#ff9a3c');
        g.addColorStop(1, '#ff5ec8');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w * ratio, h, 6);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.font = `900 13px ${font}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a0f08';
    const label = this.fever
      ? `FEVER TIME ${this.feverTime.toFixed(1)}s`
      : `피버까지 ${this.feverGauge} / ${FEVER_COMBO_GOAL}`;
    ctx.strokeText(label, this.width / 2, y + h + 6);
    ctx.fillStyle = this.fever ? '#ffe36e' : '#ffffff';
    ctx.fillText(label, this.width / 2, y + h + 6);
    ctx.textAlign = 'left';
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
