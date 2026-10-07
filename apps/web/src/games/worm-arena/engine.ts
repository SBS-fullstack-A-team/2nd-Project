/**
 * 지렁이 아레나 엔진 — 캔버스 그리기 · 게임 루프 · 입력.
 * 계산은 World 가 하고, 여기서는 고정 간격으로 World.step 을 부르고 매 프레임 그린다.
 */
import {
  ARENA_RADIUS,
  BOOST_STAMINA,
  BOUNTY_COLOR,
  FEAST_COLOR,
  LEADERBOARD_SIZE,
  MAGNET_RANGE,
  EAT_RANGE,
  MIN_BOOST_MASS,
  POWERS,
  STREAK_NAMES,
  TICK,
  ZOOM_MAX,
  ZOOM_MIN,
  bountyReward,
  findPower,
  findTrait,
  type PowerKind,
} from './config';
import { drawIcon, type IconId } from './icons';
import { World, displayName, radiusOf, type RunStats, type Worm, type WorldEvents } from './world';

export interface Hud {
  length: number;
  best: number;
  kills: number;
  rank: number;
  total: number;
  leaders: { name: string; length: number; me: boolean; bounty: boolean }[];
  /** 지금 현상금이 걸린 지렁이와 보상 (없으면 null) */
  bounty: { name: string; reward: number } | null;
  boosting: boolean;
  canBoost: boolean;
  /** 지금 걸려 있는 파워업 (남은 시간 · 전체 시간) */
  effects: { kind: PowerKind; left: number; max: number }[];
  /** 황금 먹이 잔치가 열려 있는지 */
  feast: boolean;
  /** 대시 게이지 0~1 · 다 써서 잠겼는지 */
  stamina: number;
  exhausted: boolean;
}

export type EngineEvent =
  'eat' | 'kill' | 'die' | 'power' | 'streak' | 'shield' | 'feast' | 'bounty' | 'bountyClaim';

export interface Summary {
  score: number;
  length: number;
  kills: number;
  bestRank: number;
  seconds: number;
  by: string | null;
  run: RunStats;
}

export interface Callbacks {
  onHud: (hud: Hud) => void;
  onEnd: (summary: Summary) => void;
  onEvent: (kind: EngineEvent, text?: string) => void;
}

/** 플레이어가 죽고 결과로 넘어가기 전 잠깐 보여 주는 시간(초) */
const DEATH_DELAY = 2.6;
/** 죽은 뒤 다시 보기 — 이 배율로 느리게 흘러가며 나를 잡은 지렁이를 비춘다 */
const DEATH_SLOWMO = 0.3;
/** 화면 짧은 변 기준으로 이만큼(월드 단위)이 보이게 */
const VIEW_SPAN = 760;

/** 지렁이가 쓰러질 때 튀는 빛 조각 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export class WormEngine {
  private ctx: CanvasRenderingContext2D;
  private world: World | null = null;
  private raf = 0;
  private last = -1;
  private acc = 0;
  private running = false;
  private paused = false;
  private deadFor = -1;
  private bestRank = 99;
  private deathBy: string | null = null;
  /** 나를 잡은 지렁이 id (벽이면 null) */
  private killerId: number | null = null;
  private hudTimer = 0;
  private resizeObserver: ResizeObserver;
  private dpr = 1;
  private cam = { x: 0, y: 0, zoom: 1 };
  private hex: CanvasPattern | null = null;
  private particles: Particle[] = [];
  /** 화면 흔들림 세기 (초 단위로 줄어든다) */
  private shake = 0;

  /** 입력 */
  private pointer: { x: number; y: number } | null = null;
  private turnKey = 0;
  private boostHeld = false;
  private keyAngle = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: Callbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 캔버스를 쓸 수 없어요.');
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.hex = this.makeHexPattern();
    // 메뉴 화면 뒤에서도 경기장이 보이도록 미리 만들어 둔다
    this.world = new World(['#ff7aa8', '#ff9ec0']);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 플레이어 머리 위에 그릴 모자 아이콘 (없으면 빈 문자열) · 업적 모자의 빛 색 */
  private hat: IconId | '' = '';
  private hatGlow: string | null = null;
  /** 모자 기울기(라디안) — 방향이 바뀌면 천천히 따라간다 */
  private hatTilt = 0;

  start(colors: readonly string[], hat: IconId | '' = '', hatGlow: string | null = null) {
    this.hat = hat;
    this.hatGlow = hatGlow;
    this.hatTilt = 0;
    this.world = new World(colors);
    this.running = true;
    this.paused = false;
    this.deadFor = -1;
    this.killerId = null;
    this.bestRank = 99;
    this.deathBy = null;
    this.acc = 0;
    this.particles = [];
    this.shake = 0;
    this.keyAngle = this.world.player.angle;
    this.pointer = null;
  }

  pause() {
    this.paused = true;
    this.boostHeld = false;
  }

  resume() {
    this.paused = false;
    this.last = -1;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  /* ---------- 입력 ---------- */

  /** 화면 좌표의 포인터 — 화면 가운데(내 머리)에서 그쪽으로 간다 */
  setPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  setBoost(on: boolean) {
    this.boostHeld = on;
  }

  /** 키보드 돌기 -1(왼쪽) · 0 · 1(오른쪽) — 누르면 마우스 방향 대신 쓴다 */
  setTurn(dir: number) {
    if (dir !== 0 && this.world) {
      this.pointer = null;
      if (this.turnKey === 0) this.keyAngle = this.world.player.angle;
    }
    this.turnKey = dir;
  }

  /* ---------- 루프 ---------- */

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    if (this.last < 0) this.last = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running && !this.paused) this.update(dt);
    else if (!this.running && this.world) {
      // 메뉴 화면 — AI 지렁이만 돌아다닌다
      this.world.player.alive = false;
      this.addBursts(this.world.step(Math.min(dt, TICK * 2)));
    }
    this.draw(dt);
  }

  private update(dt: number) {
    const world = this.world!;
    const player = world.player;

    if (player.alive) {
      if (this.turnKey !== 0) {
        this.keyAngle += this.turnKey * 3.4 * dt;
        world.steerPlayer(this.keyAngle, this.boostHeld);
      } else if (this.pointer && Math.hypot(this.pointer.x, this.pointer.y) > 6) {
        world.steerPlayer(Math.atan2(this.pointer.y, this.pointer.x), this.boostHeld);
      } else {
        world.steerPlayer(player.targetAngle, this.boostHeld);
      }
    }

    // 죽은 뒤에는 느린 화면으로
    this.acc += this.deadFor >= 0 ? dt * DEATH_SLOWMO : dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      const ev = world.step(TICK);
      this.addBursts(ev);
      if (ev.ate) this.cb.onEvent('eat');
      for (const name of ev.killed ?? []) this.cb.onEvent('kill', name);
      if (ev.streak) {
        const name = STREAK_NAMES[Math.min(ev.streak.count, STREAK_NAMES.length - 1)] || '연속 킬!';
        this.cb.onEvent('streak', `${name} +${ev.streak.bonus}`);
        this.shake = Math.max(this.shake, 0.5);
      }
      if (ev.power) this.cb.onEvent('power', ev.power);
      if (ev.shieldSaved) {
        this.cb.onEvent('shield');
        this.shake = Math.max(this.shake, 0.3);
      }
      if (ev.feast) this.cb.onEvent('feast');
      if (ev.bounty && player.alive) this.cb.onEvent('bounty', ev.bounty);
      if (ev.bountyClaimed) {
        this.cb.onEvent('bountyClaim', `${ev.bountyClaimed.name} +${ev.bountyClaimed.bonus}`);
        this.shake = Math.max(this.shake, 0.6);
      }
      if (ev.died) {
        this.deathBy = ev.died.by;
        this.killerId = ev.died.byId;
        this.deadFor = 0;
        this.cb.onEvent('die', ev.died.by ?? undefined);
      }
    }

    if (this.deadFor >= 0) {
      this.deadFor += dt;
      if (this.deadFor >= DEATH_DELAY && this.running) {
        this.running = false;
        this.cb.onEnd({
          score: Math.floor(world.bestMass),
          length: Math.floor(world.bestMass),
          kills: player.kills,
          bestRank: this.bestRank,
          seconds: Math.floor(world.time),
          by: this.deathBy,
          run: { ...world.runStats },
        });
      }
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && player.alive) {
      this.hudTimer = 0.2;
      const ranking = world.ranking();
      const rank = ranking.indexOf(player) + 1;
      const bounty = world.bounty();
      if (rank > 0) this.bestRank = Math.min(this.bestRank, rank);
      this.cb.onHud({
        length: Math.floor(player.mass),
        best: Math.floor(world.bestMass),
        kills: player.kills,
        rank,
        total: ranking.length,
        leaders: ranking.slice(0, LEADERBOARD_SIZE).map((w) => ({
          name: displayName(w),
          length: Math.floor(w.mass),
          me: w.isPlayer,
          bounty: w === bounty,
        })),
        bounty: bounty ? { name: displayName(bounty), reward: bountyReward(bounty.mass) } : null,
        boosting: player.dashing,
        canBoost: player.effects.turbo > 0 || (player.mass > MIN_BOOST_MASS && !player.exhausted),
        stamina: player.effects.turbo > 0 ? 1 : player.stamina / BOOST_STAMINA,
        exhausted: player.exhausted && player.effects.turbo <= 0,
        effects: POWERS.filter((p) => player.effects[p.kind] > 0).map((p) => ({
          kind: p.kind,
          left: player.effects[p.kind],
          max: p.seconds,
        })),
        feast: world.feast !== null,
      });
    }
  }

  /** 쓰러진 지렁이 자리에 빛 조각을 뿌린다 */
  private addBursts(ev: WorldEvents) {
    for (const b of ev.bursts ?? []) {
      const n = b.byPlayer ? 36 : 18;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 80 + Math.random() * (b.byPlayer ? 320 : 180);
        const life = 0.5 + Math.random() * 0.6;
        this.particles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life,
          max: life,
          size: 3 + Math.random() * 5,
          color: i % 3 === 0 ? '#fff' : b.color,
        });
      }
      if (b.byPlayer) this.shake = Math.max(this.shake, 0.35);
    }
  }

  /* ---------- 그리기 ---------- */

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** 슬리더리오 느낌의 육각 무늬 바닥 */
  private makeHexPattern(): CanvasPattern | null {
    const size = 28;
    const w = size * 3;
    const h = Math.round(size * Math.sqrt(3));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h * 2;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#161c26';
    g.fillRect(0, 0, c.width, c.height);
    const hexAt = (cx: number, cy: number) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = cx + Math.cos(a) * (size - 2);
        const y = cy + Math.sin(a) * (size - 2);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      const grad = g.createRadialGradient(cx, cy - 6, 2, cx, cy, size);
      grad.addColorStop(0, '#222a37');
      grad.addColorStop(1, '#1a212c');
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = '#0e131a';
      g.lineWidth = 2.5;
      g.stroke();
    };
    for (const [cx, cy] of [
      [0, 0],
      [w, 0],
      [size * 1.5, h / 2],
      [0, h],
      [w, h],
      [size * 1.5, h * 1.5],
      [0, h * 2],
      [w, h * 2],
    ] as const) {
      hexAt(cx, cy);
    }
    return this.ctx.createPattern(c, 'repeat');
  }

  private draw(dt: number) {
    const ctx = this.ctx;
    const world = this.world;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!world) return;
    const player = world.player;

    // 카메라 — 내 머리를 따라가고, 길어질수록 멀리 본다.
    // 죽은 뒤에는 나를 잡은 지렁이를 가까이 비춘다
    const killer =
      this.deadFor >= 0 && this.killerId !== null
        ? world.worms.find((w) => w.id === this.killerId && w.alive)
        : undefined;
    const focus = (killer ?? player).segments[0]!;
    const targetZoom = killer
      ? 1.15
      : this.running
        ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, 1.12 - radiusOf(player.mass) / 70))
        : 0.7;
    const k = Math.min(1, dt * (killer ? 2.5 : 4));
    this.cam.x += (focus.x - this.cam.x) * k;
    this.cam.y += (focus.y - this.cam.y) * k;
    this.cam.zoom += (targetZoom - this.cam.zoom) * Math.min(1, dt * 1.5);
    const scale = (Math.min(W, H) / VIEW_SPAN) * this.cam.zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, W, H);

    this.shake = Math.max(0, this.shake - dt);
    const jolt = this.shake * 16 * this.dpr;
    const sx = (Math.random() - 0.5) * jolt;
    const sy = (Math.random() - 0.5) * jolt;
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      W / 2 - this.cam.x * scale + sx,
      H / 2 - this.cam.y * scale + sy,
    );
    const view = {
      x0: this.cam.x - W / 2 / scale,
      x1: this.cam.x + W / 2 / scale,
      y0: this.cam.y - H / 2 / scale,
      y1: this.cam.y + H / 2 / scale,
    };
    const visible = (x: number, y: number, r: number) =>
      x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;

    // 바닥 (경기장 안만)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    if (this.hex) {
      ctx.fillStyle = this.hex;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    }
    ctx.restore();
    // 경기장 테두리
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgb(255 60 80 / 0.25)';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff4060';
    ctx.stroke();

    // 먹이 — 은은한 빛 + 알맹이
    const t = performance.now() / 1000;
    for (const f of world.food) {
      if (!visible(f.x, f.y, f.r * 3)) continue;
      const pulse = 1 + Math.sin(t * 3 + f.phase) * 0.15;
      const fade = f.dropped ? Math.min(1, f.life / 3) : 1;
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.4 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7 * fade;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      if (f.golden) {
        // 황금 먹이 — 반짝이는 십자 별
        const tw = 0.5 + Math.sin(t * 6 + f.phase) * 0.5;
        ctx.globalAlpha = tw * fade;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        const l = f.r * 1.8;
        ctx.beginPath();
        ctx.moveTo(f.x - l, f.y);
        ctx.lineTo(f.x + l, f.y);
        ctx.moveTo(f.x, f.y - l);
        ctx.lineTo(f.x, f.y + l);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 파워업 — 둥실 떠다니는 큰 구슬 + 아이콘
    for (const pu of world.powerups) {
      if (!visible(pu.x, pu.y, 60)) continue;
      const def = findPower(pu.kind);
      const bob = Math.sin(t * 3 + pu.phase) * 4;
      const blink = pu.life < 5 ? 0.4 + Math.abs(Math.sin(t * 8)) * 0.6 : 1;
      ctx.globalAlpha = 0.25 * blink;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y + bob, 30 + Math.sin(t * 5 + pu.phase) * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#141822';
      ctx.beginPath();
      ctx.arc(pu.x, pu.y + bob, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = def.color;
      ctx.stroke();
      drawIcon(ctx, def.icon, pu.x, pu.y + bob, 26);
    }
    ctx.globalAlpha = 1;

    // 지렁이 — 작은 것부터 그려서 큰 지렁이가 위에 오게
    const worms = world.worms.filter((w) => w.alive).sort((a, b) => a.mass - b.mass);
    for (const w of worms) this.drawWorm(w, visible, t);

    // 현상금 지렁이 — 금빛 고리와 머리 위 왕관
    const bounty = world.bounty();
    if (bounty && bounty !== killer) {
      const h = bounty.segments[0]!;
      const r = radiusOf(bounty.mass);
      if (visible(h.x, h.y, r * 4)) {
        ctx.strokeStyle = BOUNTY_COLOR;
        ctx.globalAlpha = 0.55 + Math.sin(t * 5) * 0.25;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(h.x, h.y, r * 2.2, -t, -t + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const size = Math.max(24, r * 1.9);
        drawIcon(ctx, 'crown', h.x, h.y - r * 1.15 + Math.sin(t * 4) * 2, size);
      }
    }

    // 나를 잡은 지렁이 표시
    if (killer) {
      const h = killer.segments[0]!;
      const r = radiusOf(killer.mass);
      ctx.strokeStyle = `rgb(255 70 70 / ${0.6 + Math.sin(t * 8) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r * 2.4 + Math.sin(t * 8) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '700 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('나를 잡은 지렁이', h.x, h.y + r * 2.6);
    }

    // 빛 조각
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.5;
      p.vy *= 1 - dt * 2.5;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + (p.life / p.max) * 0.5), 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;

    // 이름 — 성격이 있으면 이름 앞에 아이콘 배지
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    for (const w of worms) {
      const head = w.segments[0]!;
      const r = radiusOf(w.mass);
      if (!visible(head.x, head.y, 200)) continue;
      const fontSize = Math.max(12, 13 / this.cam.zoom);
      ctx.font = `700 ${fontSize}px sans-serif`;
      const isBounty = w === bounty;
      // 모자 · 왕관을 쓴 지렁이는 이름을 그 위로
      const lift = w.isPlayer && this.hat ? r * 2.5 : isBounty ? r * 1.9 : 0;
      const y = head.y - r - 8 - lift;
      const icon = findTrait(w.trait).icon;
      const iconSize = icon ? fontSize * 1.5 : 0;
      const gap = icon ? fontSize * 0.25 : 0;
      const left = head.x - (iconSize + gap + ctx.measureText(w.name).width) / 2;
      if (icon) drawIcon(ctx, icon, left + iconSize / 2, y - fontSize * 0.55, iconSize);
      ctx.fillStyle = w.isPlayer ? '#fff' : isBounty ? BOUNTY_COLOR : 'rgb(255 255 255 / 0.75)';
      ctx.fillText(w.name, left + iconSize + gap, y);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 죽은 순간 붉게 번쩍 → 화면 가장자리가 어두워진다
    if (this.deadFor >= 0) {
      const flash = Math.max(0, 0.45 - this.deadFor * 0.6);
      if (flash > 0) {
        ctx.fillStyle = `rgb(220 40 40 / ${flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.3,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.7,
      );
      g.addColorStop(0, 'rgb(0 0 0 / 0)');
      g.addColorStop(1, `rgb(0 0 0 / ${Math.min(0.6, this.deadFor * 0.4)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.running && world.feast && player.alive) {
      const fx = (world.feast.x - this.cam.x) * scale + W / 2;
      const fy = (world.feast.y - this.cam.y) * scale + H / 2;
      if (fx < 0 || fx > W || fy < 0 || fy > H)
        this.drawEdgeArrow(fx, fy, W, H, t, 'star', FEAST_COLOR);
    }
    if (this.running && bounty && player.alive) {
      const h = bounty.segments[0]!;
      const bx = (h.x - this.cam.x) * scale + W / 2;
      const by = (h.y - this.cam.y) * scale + H / 2;
      if (bx < 0 || bx > W || by < 0 || by > H)
        this.drawEdgeArrow(bx, by, W, H, t, 'crown', BOUNTY_COLOR);
    }
    this.drawMinimap(world, W, H);
  }

  private drawWorm(w: Worm, visible: (x: number, y: number, r: number) => boolean, t: number) {
    const ctx = this.ctx;
    const r = radiusOf(w.mass);
    const segs = w.segments;
    const boosting = w.dashing;
    // 유령이면 반투명
    const ghost = w.effects.ghost > 0 || w.grace > 0;
    const bodyAlpha = ghost ? 0.45 + Math.sin(t * 10) * 0.1 : 1;

    const fx = w.effects;
    // 자석 — 끌어당기는 범위를 옅은 고리로
    if (fx.magnet > 0 && w.isPlayer) {
      const h = segs[0]!;
      ctx.globalAlpha = 0.18 + Math.sin(t * 6) * 0.06;
      ctx.strokeStyle = findPower('magnet').color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.arc(
        h.x,
        h.y,
        EAT_RANGE * MAGNET_RANGE + r,
        t % (Math.PI * 2),
        (t % (Math.PI * 2)) + Math.PI * 2,
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // 가속 중이면 몸 둘레가 빛난다 (터보는 주황 불꽃)
    if (boosting || fx.turbo > 0) {
      ctx.globalAlpha = 0.25 + Math.sin(t * 20) * 0.08;
      ctx.fillStyle = fx.turbo > 0 ? '#ffb020' : w.colors[0]!;
      for (let i = segs.length - 1; i >= 0; i -= 2) {
        const s = segs[i]!;
        if (!visible(s.x, s.y, r * 2)) continue;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 몸통 — 꼬리부터 머리 쪽으로, 마디마다 그림자 · 색 · 윤기
    ctx.globalAlpha = bodyAlpha;
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]!;
      if (!visible(s.x, s.y, r)) continue;
      const color = w.colors[Math.floor(i / 3) % w.colors.length]!;
      ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
      ctx.beginPath();
      ctx.arc(s.x, s.y + r * 0.15, r * 1.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(255 255 255 / 0.18)';
      ctx.beginPath();
      ctx.arc(s.x - r * 0.25, s.y - r * 0.3, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 눈 — 가는 방향을 본다
    const head = segs[0]!;
    if (!visible(head.x, head.y, r * 2)) {
      ctx.globalAlpha = 1;
      return;
    }
    const a = w.angle;
    for (const side of [-1, 1]) {
      const ex = head.x + Math.cos(a) * r * 0.35 + Math.cos(a + (side * Math.PI) / 2) * r * 0.48;
      const ey = head.y + Math.sin(a) * r * 0.35 + Math.sin(a + (side * Math.PI) / 2) * r * 0.48;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * r * 0.14, ey + Math.sin(a) * r * 0.14, r * 0.19, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 모자 — 머리 위에 세우고, 가는 방향 반대로 살짝 기울이고, 움직이면 통통 튄다
    if (w.isPlayer && this.hat) this.drawHat(this.hat, head, r, w.angle, boosting, bodyAlpha, t);

    // 방패 — 머리를 감싼 비눗방울
    if (fx.shield > 0) {
      const g = ctx.createRadialGradient(head.x, head.y, r * 0.8, head.x, head.y, r * 2.1);
      g.addColorStop(0, 'rgb(79 195 247 / 0)');
      g.addColorStop(0.8, 'rgb(79 195 247 / 0.25)');
      g.addColorStop(1, 'rgb(180 235 255 / 0.7)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(head.x, head.y, r * 2.1 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHat(
    hat: IconId,
    head: { x: number; y: number },
    r: number,
    angle: number,
    boosting: boolean,
    alpha: number,
    t: number,
  ) {
    const ctx = this.ctx;
    const size = r * 2.4;
    // 오른쪽으로 가면 모자 끝이 왼쪽(뒤)으로 — 바람을 받는 느낌
    const targetTilt = -Math.cos(angle) * (boosting ? 0.42 : 0.28);
    this.hatTilt += (targetTilt - this.hatTilt) * 0.12;
    const hop = Math.abs(Math.sin(t * (boosting ? 18 : 10))) * r * 0.14;
    const x = head.x - Math.cos(angle) * r * 0.15;
    const y = head.y - r * 1.25 - hop;

    ctx.save();
    ctx.globalAlpha = alpha;
    // 업적 모자 — 뒤에 은은한 빛 + 주위를 도는 반짝이
    if (this.hatGlow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 1.1);
      g.addColorStop(0, this.hatGlow);
      g.addColorStop(1, `${this.hatGlow}00`);
      ctx.globalAlpha = alpha * (0.55 + Math.sin(t * 3) * 0.15);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    ctx.translate(x, y + size * 0.4);
    ctx.rotate(this.hatTilt);
    drawIcon(ctx, hat, 0, -size * 0.4, size);
    ctx.restore();

    if (this.hatGlow) {
      for (let i = 0; i < 3; i++) {
        const twinkle = Math.sin(t * 3.2 + i * 2.1);
        if (twinkle <= 0) continue;
        const a = t * 1.6 + (i * Math.PI * 2) / 3;
        ctx.save();
        ctx.globalAlpha = alpha * twinkle;
        drawIcon(
          ctx,
          'sparkle',
          x + Math.cos(a) * size * 0.7,
          y + Math.sin(a) * size * 0.5,
          size * 0.45 * (0.7 + twinkle * 0.3),
        );
        ctx.restore();
      }
    }
  }

  /** 화면 밖 목표(황금 먹이 잔치 · 현상금 지렁이) 쪽을 가리키는 화살표 */
  private drawEdgeArrow(
    fx: number,
    fy: number,
    W: number,
    H: number,
    t: number,
    icon: IconId,
    color: string,
  ) {
    const ctx = this.ctx;
    const a = Math.atan2(fy - H / 2, fx - W / 2);
    const m = 34 * this.dpr;
    // 화면 가장자리에 붙인다
    const k = Math.min(
      Math.abs((W / 2 - m) / (Math.cos(a) || 1e-6)),
      Math.abs((H / 2 - m) / (Math.sin(a) || 1e-6)),
    );
    const x = W / 2 + Math.cos(a) * k;
    const y = H / 2 + Math.sin(a) * k;
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.dpr * pulse, this.dpr * pulse);
    ctx.fillStyle = 'rgb(0 0 0 / 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, icon, 0, 0, 24);
    ctx.fillStyle = color;
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(20, -8);
    ctx.lineTo(20, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawMinimap(world: World, W: number, H: number) {
    const ctx = this.ctx;
    const size = Math.min(W, H) * 0.2;
    const cx = W - size / 2 - 12 * this.dpr;
    const cy = H - size / 2 - 12 * this.dpr;
    const s = size / 2 / ARENA_RADIUS;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgb(10 14 20 / 0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgb(255 64 96 / 0.6)';
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.stroke();
    for (const pu of world.powerups) {
      ctx.fillStyle = findPower(pu.kind).color;
      ctx.fillRect(
        cx + pu.x * s - 1.5 * this.dpr,
        cy + pu.y * s - 1.5 * this.dpr,
        3 * this.dpr,
        3 * this.dpr,
      );
    }
    if (world.feast) {
      drawIcon(ctx, 'star', cx + world.feast.x * s, cy + world.feast.y * s, 13 * this.dpr);
    }
    for (const w of world.worms) {
      if (!w.alive) continue;
      const h = w.segments[0]!;
      const big = Math.max(1.5, Math.min(5, radiusOf(w.mass) / 6)) * this.dpr;
      ctx.fillStyle = w.isPlayer ? '#fff' : w.colors[0]!;
      ctx.beginPath();
      ctx.arc(cx + h.x * s, cy + h.y * s, w.isPlayer ? 3.5 * this.dpr : big, 0, Math.PI * 2);
      ctx.fill();
      if (w.id === world.bountyId) {
        ctx.strokeStyle = BOUNTY_COLOR;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx + h.x * s, cy + h.y * s, big + 3 * this.dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
