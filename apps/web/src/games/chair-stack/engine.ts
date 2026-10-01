import { Bodies, Body, Composite, Engine } from 'matter-js';
import { createChairBody, randomChair, type ChairPick } from './chairs';
import {
  CAMERA_TOP_MARGIN,
  FALL_OUT_Y,
  GAME_OVER_DELAY,
  HOLD_GAP_ABOVE_TOWER,
  HOLD_MAX_X,
  HOLD_MIN_X,
  HOLD_MOVE_SPEED,
  MAX_SCORE,
  PLATFORM,
  ROTATE_STEP,
  SETTLE_ANGULAR_SPEED,
  SETTLE_SPEED,
  SETTLE_TIME,
  SETTLE_TIMEOUT,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type DifficultyDef,
} from './config';

/** 화면 위에 React 로 보여 줄 값 — 바뀔 때만 알린다 */
export interface Hud {
  /** 지금 탑 높이 (cm) */
  height: number;
  /** 이번 판 최고 높이 (cm) = 점수 */
  best: number;
  /** 쌓은(떨어뜨려서 멈춘) 의자 수 */
  chairs: number;
  next: ChairPick;
}

export interface GameSummary {
  /** 최고 높이 × 난이도 배율 */
  score: number;
  bestHeight: number;
  chairs: number;
  difficulty: DifficultyDef;
}

interface Callbacks {
  onHud: (hud: Hud) => void;
  onEnd: (summary: GameSummary) => void;
}

/**
 * 진행 상태
 * - idle: 시작 전 (받침대만 보인다)
 * - holding: 의자를 들고 자리를 고르는 중
 * - settling: 떨어뜨린 의자가 멈추기를 기다리는 중
 * - fallen: 의자가 떨어져서 결과로 넘어가기 직전
 * - over: 끝
 */
type State = 'idle' | 'holding' | 'settling' | 'fallen' | 'over';

const STEP_MS = 1000 / 60;
/** 화면 아래쪽 받침대가 보이는 처음 카메라 위치 */
const BASE_CAMERA_TOP = -(VIEW_HEIGHT - 130);
/** 받침대 아래 기둥이 끝나는 땅 높이 (장식) */
const GROUND_Y = 320;

export class ChairStackEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: Callbacks;
  private readonly physics = Engine.create({
    enableSleeping: true,
    positionIterations: 10,
    velocityIterations: 8,
  });
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private paused = false;

  private state: State = 'idle';
  private difficulty: DifficultyDef | null = null;
  private chairs: Body[] = [];
  private holding: Body | null = null;
  private next: ChairPick = randomChair();
  private nextPreview: Body = createChairBody(this.next, 0, 0);
  private dropped: Body | null = null;
  private settleTimer = 0;
  private settleElapsed = 0;
  private fallenTimer = 0;

  private holdX = VIEW_WIDTH / 2;
  private holdY = -HOLD_GAP_ABOVE_TOWER;
  private holdAngle = 0;
  private targetAngle = 0;
  private moveDir = 0;

  private towerTop = 0;
  private best = 0;
  private stacked = 0;
  private cameraTop = BASE_CAMERA_TOP;

  constructor(canvas: HTMLCanvasElement, callbacks: Callbacks) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 게임 화면을 그릴 수 없어요.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.resetWorld();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────── 바깥에서 부르는 조작 ─────────────

  start(difficulty: DifficultyDef) {
    this.difficulty = difficulty;
    this.resetWorld();
    // 시작 전 미리 뽑아 둔 다음 의자는 난이도와 상관없이 뽑혔으므로 다시 뽑는다
    this.pickNext();
    this.state = 'holding';
    this.paused = false;
    this.spawnNext();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.lastTime = performance.now();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    Composite.clear(this.physics.world, false);
    Engine.clear(this.physics);
  }

  /** 키보드 좌우 이동 (-1 왼쪽, 0 멈춤, 1 오른쪽) */
  setMoveDir(dir: number) {
    this.moveDir = dir;
  }

  /** 화면 좌표(client)를 받아 의자를 그 x 로 옮긴다 — 마우스·터치용 */
  setHoldXFromClient(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    this.holdX = clamp(x, HOLD_MIN_X, HOLD_MAX_X);
  }

  /** dir: 1 시계 방향, -1 반시계 방향 */
  rotate(dir: 1 | -1) {
    if (this.state !== 'holding' || this.paused) return;
    this.targetAngle += dir * ROTATE_STEP;
  }

  drop() {
    if (this.state !== 'holding' || this.paused || !this.holding) return;
    const body = this.holding;
    this.holdAngle = this.targetAngle;
    this.placeHolding();
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    Composite.add(this.physics.world, body);
    this.chairs.push(body);
    this.holding = null;
    this.dropped = body;
    this.settleTimer = 0;
    this.settleElapsed = 0;
    this.state = 'settling';
  }

  // ───────────── 진행 ─────────────

  private resetWorld() {
    Composite.clear(this.physics.world, false);
    const platform = Bodies.rectangle(
      VIEW_WIDTH / 2,
      PLATFORM.height / 2,
      PLATFORM.width,
      PLATFORM.height,
      { isStatic: true, friction: 1, frictionStatic: 1.5, label: 'platform' },
    );
    Composite.add(this.physics.world, platform);
    this.chairs = [];
    this.holding = null;
    this.dropped = null;
    this.towerTop = 0;
    this.best = 0;
    this.stacked = 0;
    this.cameraTop = BASE_CAMERA_TOP;
    this.holdX = VIEW_WIDTH / 2;
    this.holdY = this.holdTargetY();
    this.holdAngle = 0;
    this.targetAngle = 0;
    this.fallenTimer = 0;
    this.accumulator = 0;
    this.state = 'idle';
  }

  private spawnNext() {
    this.holding = createChairBody(this.next, this.holdX, this.holdY);
    this.holdAngle = 0;
    this.targetAngle = 0;
    this.pickNext();
    this.emitHud();
  }

  private pickNext() {
    this.next = randomChair(this.difficulty?.chairIds);
    this.nextPreview = createChairBody(this.next, 0, 0);
  }

  private holdTargetY() {
    return this.towerTop - HOLD_GAP_ABOVE_TOWER;
  }

  private placeHolding() {
    if (!this.holding) return;
    Body.setPosition(this.holding, { x: this.holdX, y: this.holdY });
    Body.setAngle(this.holding, this.holdAngle);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastTime ? Math.min(0.05, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    if (!this.paused && this.state !== 'idle' && this.state !== 'over') this.update(dt);
    this.render();
  };

  private update(dt: number) {
    // 들고 있는 의자 — 좌우 이동, 부드럽게 회전, 탑 위 높이 따라가기
    if (this.state === 'holding' && this.holding) {
      this.holdX = clamp(this.holdX + this.moveDir * HOLD_MOVE_SPEED * dt, HOLD_MIN_X, HOLD_MAX_X);
      this.holdAngle += (this.targetAngle - this.holdAngle) * Math.min(1, dt * 18);
      this.holdY += (this.holdTargetY() - this.holdY) * Math.min(1, dt * 6);
      this.placeHolding();
    }

    // 물리는 고정 간격으로 돌린다 (화면 주사율과 상관없이 같은 결과)
    this.accumulator += dt * 1000;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < 5) {
      Engine.update(this.physics, STEP_MS);
      this.accumulator -= STEP_MS;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;

    // 받침대 아래로 떨어진 의자가 있으면 게임 오버
    if (this.state !== 'fallen' && this.chairs.some((c) => c.position.y > FALL_OUT_Y)) {
      this.state = 'fallen';
      this.fallenTimer = 0;
      if (this.holding) this.holding = null;
    }

    if (this.state === 'settling' && this.dropped) {
      const b = this.dropped;
      const still =
        b.isSleeping || (b.speed < SETTLE_SPEED && Math.abs(b.angularSpeed) < SETTLE_ANGULAR_SPEED);
      this.settleTimer = still ? this.settleTimer + dt : 0;
      this.settleElapsed += dt;
      if (this.settleTimer >= SETTLE_TIME || this.settleElapsed >= SETTLE_TIMEOUT) {
        this.dropped = null;
        this.stacked++;
        this.measureTower();
        this.state = 'holding';
        this.spawnNext();
      }
    }

    if (this.state === 'fallen') {
      this.fallenTimer += dt;
      if (this.fallenTimer >= GAME_OVER_DELAY) this.finish();
    }

    // 카메라 — 탑 꼭대기가 화면 위쪽에 여유를 두고 보이게
    const cameraTarget = Math.min(BASE_CAMERA_TOP, this.towerTop - CAMERA_TOP_MARGIN);
    this.cameraTop += (cameraTarget - this.cameraTop) * Math.min(1, dt * 3);
  }

  /** 받침대 위에 올라가 있는 의자 중 가장 높은 곳 */
  private measureTower() {
    let top = 0;
    for (const c of this.chairs) {
      if (c.position.y < PLATFORM.height) top = Math.min(top, c.bounds.min.y);
    }
    this.towerTop = top;
    this.best = Math.max(this.best, Math.round(-top));
    this.emitHud();
  }

  private finish() {
    this.state = 'over';
    const difficulty = this.difficulty!;
    this.callbacks.onEnd({
      score: Math.min(MAX_SCORE, Math.round(this.best * difficulty.multiplier)),
      bestHeight: this.best,
      chairs: this.stacked,
      difficulty,
    });
  }

  private emitHud() {
    this.callbacks.onHud({
      height: Math.round(-this.towerTop),
      best: this.best,
      chairs: this.stacked,
      next: this.next,
    });
  }

  // ───────────── 그리기 ─────────────

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private render() {
    const { ctx, canvas } = this;
    const k = canvas.width / VIEW_WIDTH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSky();

    // 월드 좌표로 그리기 (1 = 1cm)
    ctx.setTransform(k, 0, 0, k, 0, -this.cameraTop * k);
    this.drawClouds();
    this.drawRuler();
    this.drawGroundAndPlatform();
    this.drawBestLine();
    for (const c of this.chairs) drawChair(ctx, c, 1);
    if (this.holding) {
      this.drawDropGuide(this.holding);
      drawChair(ctx, this.holding, 0.92);
    }

    // 화면 좌표로 그리기 — 다음 의자 미리보기
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.state !== 'idle') this.drawNextPreview();
  }

  /** 높이 올라갈수록 하늘이 저녁 → 밤으로 */
  private drawSky() {
    const { ctx, canvas } = this;
    const t = clamp(-this.cameraTop / 4000, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, mix('#7fbff5', '#0b1440', t));
    g.addColorStop(1, mix('#e4f3ff', '#33407a', t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (t > 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${(t - 0.3) * 1.2})`;
      for (let i = 0; i < 40; i++) {
        const x = ((i * 97) % 400) / 400;
        const y = (((i * 61 + this.cameraTop * 0.1) % 600) + 600) % 600;
        ctx.fillRect(x * canvas.width, (y / 600) * canvas.height, 2, 2);
      }
    }
  }

  /** 높이를 가늠할 수 있게 일정 간격으로 구름을 둔다 */
  private drawClouds() {
    const { ctx } = this;
    const from = Math.floor(this.cameraTop / 350) - 1;
    const to = Math.ceil((this.cameraTop + VIEW_HEIGHT) / 350) + 1;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = from; i <= to; i++) {
      if (i >= 0) continue; // 받침대 아래에는 구름을 두지 않는다
      const y = i * 350;
      const x = 40 + ((((i * 137) % 320) + 320) % 320);
      ctx.beginPath();
      ctx.ellipse(x, y, 46, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 26, y - 9, 28, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 22, y - 5, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 왼쪽 눈금자 — 50cm 마다 눈금, 1m 마다 숫자 */
  private drawRuler() {
    const { ctx } = this;
    const from = Math.floor(this.cameraTop / 50) * 50;
    const to = Math.min(0, this.cameraTop + VIEW_HEIGHT);
    ctx.font = '600 11px sans-serif';
    ctx.textBaseline = 'middle';
    for (let y = from; y <= to; y += 50) {
      const meter = y % 100 === 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(0, y - 0.5, meter ? 14 : 8, 1);
      if (meter && y < 0) {
        ctx.fillStyle = 'rgba(20,30,60,0.75)';
        ctx.fillText(`${-y / 100}m`, 17, y);
      }
    }
  }

  private drawGroundAndPlatform() {
    const { ctx } = this;
    const cx = VIEW_WIDTH / 2;
    // 기둥
    ctx.fillStyle = '#8a7f74';
    ctx.fillRect(cx - 34, PLATFORM.height, 68, GROUND_Y - PLATFORM.height);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(cx + 14, PLATFORM.height, 20, GROUND_Y - PLATFORM.height);
    // 땅
    ctx.fillStyle = '#5aa04a';
    ctx.fillRect(-10, GROUND_Y, VIEW_WIDTH + 20, 400);
    ctx.fillStyle = '#4a8a3c';
    ctx.fillRect(-10, GROUND_Y, VIEW_WIDTH + 20, 8);
    // 받침대
    const left = cx - PLATFORM.width / 2;
    ctx.fillStyle = '#6b5644';
    roundRect(ctx, left, 0, PLATFORM.width, PLATFORM.height, 4);
    ctx.fill();
    ctx.fillStyle = '#8c7058';
    ctx.fillRect(left + 2, 0, PLATFORM.width - 4, 6);
  }

  private drawBestLine() {
    if (this.best <= 0) return;
    const { ctx } = this;
    const y = -this.best;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,90,90,0.85)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(VIEW_WIDTH, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#d63a3a';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`최고 ${this.best}cm`, VIEW_WIDTH - 6, y - 2);
    ctx.textAlign = 'left';
  }

  /** 들고 있는 의자에서 아래로 떨어질 자리 안내선 */
  private drawDropGuide(body: Body) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of [body.bounds.min.x, body.bounds.max.x]) {
      ctx.moveTo(x, body.bounds.max.y + 4);
      ctx.lineTo(x, this.cameraTop + VIEW_HEIGHT);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawNextPreview() {
    const { ctx } = this;
    const box = { x: VIEW_WIDTH - 86, y: 10, w: 76, h: 76 };
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('다음', box.x + box.w / 2, box.y + 4);
    ctx.textAlign = 'left';

    const b = this.nextPreview;
    const bw = b.bounds.max.x - b.bounds.min.x;
    const bh = b.bounds.max.y - b.bounds.min.y;
    const s = Math.min(60 / bw, 50 / bh, 0.75);
    ctx.save();
    ctx.translate(box.x + box.w / 2, box.y + 44);
    ctx.scale(s, s);
    ctx.translate(-(b.bounds.min.x + bw / 2), -(b.bounds.min.y + bh / 2));
    drawChair(ctx, b, 1);
    ctx.restore();
  }
}

function drawChair(ctx: CanvasRenderingContext2D, body: Body, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  for (const part of parts) {
    const v = part.vertices;
    ctx.beginPath();
    ctx.moveTo(v[0]!.x, v[0]!.y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i]!.x, v[i]!.y);
    ctx.closePath();
    ctx.fillStyle = part.render.fillStyle ?? '#c8894d';
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** #rrggbb 두 색을 t(0~1) 비율로 섞는다 */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
