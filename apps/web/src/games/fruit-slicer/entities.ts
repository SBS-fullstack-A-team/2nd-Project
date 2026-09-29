import { GRAVITY, type BladeId, type FruitType } from './config';
import { TAU, drawBomb, drawCutFace, drawFruitBody } from './render';

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/* =========================================================
 * Particle — 과즙, 불꽃, 연기, 꽃잎, 별 등 모든 입자
 * ========================================================= */
export type ParticleKind =
  'juice' | 'spark' | 'neon' | 'fire' | 'smoke' | 'petal' | 'star' | 'debris';

export interface ParticleOptions {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  kind: ParticleKind;
  /** 중력 배율 (음수면 위로 떠오름) */
  gravity?: number;
  /** 공기 저항 (클수록 빨리 느려짐) */
  drag?: number;
}

export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly life: number;
  readonly size: number;
  readonly color: string;
  readonly kind: ParticleKind;
  private readonly gravity: number;
  private readonly drag: number;
  private age = 0;
  private rot = Math.random() * TAU;
  private readonly spin = rand(-8, 8);

  constructor(o: ParticleOptions) {
    this.x = o.x;
    this.y = o.y;
    this.vx = o.vx;
    this.vy = o.vy;
    this.life = o.life;
    this.size = o.size;
    this.color = o.color;
    this.kind = o.kind;
    this.gravity = o.gravity ?? 1;
    this.drag = o.drag ?? 0;
  }

  get alive() {
    return this.age < this.life;
  }

  update(dt: number) {
    this.age += dt;
    const damp = Math.exp(-this.drag * dt);
    this.vx *= damp;
    this.vy = this.vy * damp + GRAVITY * this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const t = Math.min(1, this.age / this.life);
    const alpha = 1 - t;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;

    switch (this.kind) {
      case 'juice': {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 - t * 0.5), 0, TAU);
        ctx.fill();
        break;
      }
      case 'spark':
      case 'neon': {
        // 속도 방향으로 꼬리가 달린 선
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035);
        ctx.stroke();
        break;
      }
      case 'fire': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 - t * 0.7), 0, TAU);
        ctx.fill();
        break;
      }
      case 'smoke': {
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 + t * 2.2), 0, TAU);
        ctx.fill();
        break;
      }
      case 'petal': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.scale(1, 0.55 + 0.45 * Math.sin(this.rot * 1.7));
        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.quadraticCurveTo(this.size * 0.9, 0, 0, this.size);
        ctx.quadraticCurveTo(-this.size * 0.9, 0, 0, -this.size);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'star': {
        ctx.globalCompositeOperation = 'lighter';
        const s = this.size * (0.6 + 0.4 * Math.sin(this.age * 25));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 === 0 ? s : s * 0.3;
          const a = (i / 8) * TAU;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'debris': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
        ctx.restore();
        break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* =========================================================
 * Fruit — 튀어 오르는 과일 / 폭탄 (type 이 null 이면 폭탄)
 * ========================================================= */
export class Fruit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot = Math.random() * TAU;
  readonly spin = rand(-3, 3);
  readonly r: number;
  readonly type: FruitType | null;

  constructor(type: FruitType | null, x: number, y: number, vx: number, vy: number) {
    this.type = type;
    this.r = type ? type.radius : 30;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  get isBomb() {
    return this.type === null;
  }

  update(dt: number) {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.type) drawFruitBody(ctx, this.type, this.r);
    else drawBomb(ctx, this.r, time);
    ctx.restore();
  }
}

/* =========================================================
 * FruitHalf — 절단 각도대로 잘린 과일 조각 (과일 1개당 2개)
 * ========================================================= */
export class FruitHalf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  private readonly spin: number;

  /**
   * @param cutAngle 과일 몸체 기준 절단선 각도 (월드 각도 - 과일 회전)
   * @param side +1 이면 절단선의 법선(+y) 쪽 절반, -1 이면 반대쪽 절반
   */
  constructor(
    readonly type: FruitType,
    readonly r: number,
    from: { x: number; y: number; rot: number },
    velocity: { vx: number; vy: number },
    private readonly cutAngle: number,
    private readonly side: 1 | -1,
  ) {
    this.x = from.x;
    this.y = from.y;
    this.rot = from.rot;
    this.vx = velocity.vx;
    this.vy = velocity.vy;
    this.spin = side * rand(2, 5);
  }

  update(dt: number) {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const r = this.r;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot + this.cutAngle);
    // 절단선(x 축) 한쪽만 보이도록 잘라서 본체를 그린다
    ctx.save();
    ctx.beginPath();
    ctx.rect(-r * 2, this.side > 0 ? 0 : -r * 2, r * 4, r * 2);
    ctx.clip();
    ctx.rotate(-this.cutAngle);
    drawFruitBody(ctx, this.type, r);
    ctx.restore();
    drawCutFace(ctx, this.type, r);
    ctx.restore();
  }
}

/* =========================================================
 * Splat — 도마에 남는 과즙 얼룩 (서서히 사라짐)
 * ========================================================= */
export class Splat {
  private age = 0;
  private readonly life = 2.6;
  private readonly blobs: { dx: number; dy: number; r: number }[];

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly color: string,
    size: number,
  ) {
    this.blobs = Array.from({ length: 7 }, (_, i) => {
      const a = rand(0, TAU);
      const d = i === 0 ? 0 : rand(size * 0.4, size * 1.2);
      return {
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d,
        r: i === 0 ? size * 0.7 : rand(size * 0.12, size * 0.35),
      };
    });
  }

  get alive() {
    return this.age < this.life;
  }

  update(dt: number) {
    this.age += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = 0.45 * (1 - this.age / this.life);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    for (const b of this.blobs) {
      ctx.moveTo(this.x + b.dx + b.r, this.y + b.dy);
      ctx.arc(this.x + b.dx, this.y + b.dy, b.r, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* =========================================================
 * Popup — "COMBO x3!" 같은 떠오르는 글자
 * ========================================================= */
export class Popup {
  private age = 0;

  constructor(
    private readonly text: string,
    private readonly sub: string,
    private readonly x: number,
    private readonly y: number,
    private readonly color: string,
    private readonly size: number,
    private readonly life = 1.1,
  ) {}

  get alive() {
    return this.age < this.life;
  }

  update(dt: number) {
    this.age += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const t = this.age / this.life;
    // 튀어나오듯 커졌다가 제자리 → 위로 떠오르며 사라짐
    const scale = t < 0.12 ? 0.4 + (t / 0.12) * 0.9 : t < 0.22 ? 1.3 - ((t - 0.12) / 0.1) * 0.3 : 1;
    const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y - t * 40);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 ${this.size}px Pretendard, 'Malgun Gothic', sans-serif`;
    ctx.lineWidth = this.size * 0.18;
    ctx.strokeStyle = '#1a0f08';
    ctx.strokeText(this.text, 0, 0);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, 0, 0);
    if (this.sub) {
      ctx.font = `800 ${this.size * 0.55}px Pretendard, 'Malgun Gothic', sans-serif`;
      ctx.lineWidth = this.size * 0.12;
      ctx.strokeText(this.sub, 0, this.size * 0.85);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.sub, 0, this.size * 0.85);
    }
    ctx.restore();
  }
}

/* =========================================================
 * Blade — 마우스/터치 검기 궤적과 검 스킨별 이펙트
 * ========================================================= */
interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

interface TrailLayer {
  width: number;
  color: string;
  alpha: number;
  glow: boolean;
}

/** 스킨별 궤적 레이어 (바깥 광채 → 본체 → 가운데 심) */
const TRAIL_LAYERS: Record<BladeId, TrailLayer[]> = {
  basic: [
    { width: 2.2, color: '#9fb3cc', alpha: 0.25, glow: true },
    { width: 1, color: '#dfe8f3', alpha: 0.9, glow: false },
    { width: 0.35, color: '#ffffff', alpha: 1, glow: false },
  ],
  flame: [
    { width: 2.8, color: '#ff2a00', alpha: 0.35, glow: true },
    { width: 1.3, color: '#ff7b00', alpha: 0.9, glow: true },
    { width: 0.45, color: '#fff1a8', alpha: 1, glow: false },
  ],
  neon: [
    { width: 2.8, color: '#00e5ff', alpha: 0.3, glow: true },
    { width: 1.1, color: '#6ff6ff', alpha: 0.9, glow: true },
    { width: 0.35, color: '#ffffff', alpha: 1, glow: false },
  ],
  sakura: [
    { width: 2.4, color: '#ff6fae', alpha: 0.28, glow: true },
    { width: 1.1, color: '#ffb3d1', alpha: 0.95, glow: false },
    { width: 0.35, color: '#fff5fa', alpha: 1, glow: false },
  ],
  golden: [
    { width: 2.8, color: '#ffae00', alpha: 0.35, glow: true },
    { width: 1.2, color: '#ffd700', alpha: 0.95, glow: true },
    { width: 0.4, color: '#fffbe0', alpha: 1, glow: false },
  ],
};

const TRAIL_LIFE = 0.16;
const TRAIL_WIDTH = 9;

/** Catmull-Rom 보간으로 점 사이를 부드러운 곡선으로 채운다 */
function smooth(points: TrailPoint[], steps: number): TrailPoint[] {
  if (points.length < 3 || steps <= 1) return points;
  const out: TrailPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({
        x: cr(p0.x, p1.x, p2.x, p3.x),
        y: cr(p0.y, p1.y, p2.y, p3.y),
        t: p1.t + (p2.t - p1.t) * t,
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export class Blade {
  skin: BladeId = 'basic';
  /** 손을 뗐다 다시 누르면 새 획(stroke)으로 따로 그린다 */
  private strokes: TrailPoint[][] = [];

  beginStroke(x: number, y: number, t: number) {
    this.strokes.push([{ x, y, t }]);
  }

  addPoint(x: number, y: number, t: number) {
    const stroke = this.strokes[this.strokes.length - 1];
    if (!stroke) return;
    stroke.push({ x, y, t });
    if (stroke.length > 48) stroke.shift();
  }

  /** 오래된 점을 지워 궤적이 끝에서부터 사라지게 한다 */
  update(time: number) {
    for (const stroke of this.strokes) {
      while (stroke.length > 0 && time - stroke[0]!.t > TRAIL_LIFE) stroke.shift();
    }
    // 마지막(현재) 획은 비어 있어도 남겨 둔다 — 누르고 있는 동안 다음 점을 이어 붙인다
    this.strokes = this.strokes.filter((s, i) => s.length > 0 || i === this.strokes.length - 1);
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    for (const stroke of this.strokes) {
      if (stroke.length < 2) continue;
      const pts = smooth(stroke, stroke.length > 20 ? 2 : 4);
      const n = pts.length;
      ctx.lineCap = 'round';
      for (const layer of TRAIL_LAYERS[this.skin]) {
        ctx.globalCompositeOperation = layer.glow ? 'lighter' : 'source-over';
        ctx.strokeStyle = layer.color;
        for (let i = 1; i < n; i++) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          const fade = Math.max(0, 1 - (time - b.t) / TRAIL_LIFE);
          // 꼬리(오래된 쪽)는 가늘고, 머리(최신)는 굵게
          const taper = i / (n - 1);
          let w = TRAIL_WIDTH * layer.width * taper * (0.35 + 0.65 * fade);
          if (this.skin === 'flame') w *= 0.8 + Math.random() * 0.4;
          if (w < 0.3) continue;
          ctx.globalAlpha = layer.alpha * fade;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (this.skin === 'neon') this.drawLightning(ctx, pts, time);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 네온 사이버 — 궤적을 따라 지글거리는 번개 2줄 (파랑·핑크) */
  private drawLightning(ctx: CanvasRenderingContext2D, pts: TrailPoint[], time: number) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    for (const [color, amp] of [
      ['#ff2bd6', 11],
      ['#2b8cff', 8],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i += 3) {
        const p = pts[i]!;
        const fade = Math.max(0, 1 - (time - p.t) / TRAIL_LIFE);
        if (fade <= 0) continue;
        const ox = rand(-amp, amp) * fade;
        const oy = rand(-amp, amp) * fade;
        if (!started) {
          ctx.moveTo(p.x + ox, p.y + oy);
          started = true;
        } else {
          ctx.lineTo(p.x + ox, p.y + oy);
        }
      }
      ctx.globalAlpha = 0.85;
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
  }

  /** 드래그 중 궤적에서 흩날리는 스킨별 입자 */
  emitTrail(out: Particle[], x: number, y: number, dx: number, dy: number) {
    const speed = Math.hypot(dx, dy);
    if (speed < 3) return;
    const back = { vx: -dx * 4, vy: -dy * 4 };
    switch (this.skin) {
      case 'basic':
        if (Math.random() < 0.25) {
          out.push(
            new Particle({
              x,
              y,
              vx: back.vx + rand(-60, 60),
              vy: back.vy + rand(-60, 60),
              life: 0.25,
              size: 1.5,
              color: '#e8f0ff',
              kind: 'spark',
              gravity: 0.3,
            }),
          );
        }
        break;
      case 'flame':
        for (let i = 0; i < 2; i++) {
          out.push(
            new Particle({
              x,
              y,
              vx: rand(-50, 50),
              vy: rand(-120, -30),
              life: rand(0.3, 0.55),
              size: rand(3, 6),
              color: pick(['#ff4d00', '#ff9500', '#ffd23f']),
              kind: 'fire',
              gravity: -0.25,
              drag: 2,
            }),
          );
        }
        if (Math.random() < 0.5) {
          out.push(
            new Particle({
              x,
              y,
              vx: rand(-20, 20),
              vy: rand(-70, -30),
              life: rand(0.6, 1),
              size: rand(4, 7),
              color: '#4a4040',
              kind: 'smoke',
              gravity: -0.08,
              drag: 1.5,
            }),
          );
        }
        break;
      case 'neon':
        for (let i = 0; i < 2; i++) {
          out.push(
            new Particle({
              x,
              y,
              vx: back.vx * 0.5 + rand(-140, 140),
              vy: back.vy * 0.5 + rand(-140, 140),
              life: rand(0.2, 0.35),
              size: 1.8,
              color: pick(['#00e5ff', '#ff2bd6', '#8a7dff']),
              kind: 'neon',
              gravity: 0,
              drag: 3,
            }),
          );
        }
        break;
      case 'sakura':
        if (Math.random() < 0.6) {
          out.push(
            new Particle({
              x,
              y,
              vx: rand(-60, 60),
              vy: rand(-40, 20),
              life: rand(1, 1.6),
              size: rand(4, 6.5),
              color: pick(['#ffb3d1', '#ff8fbd', '#ffd6e6']),
              kind: 'petal',
              gravity: 0.08,
              drag: 1.2,
            }),
          );
        }
        break;
      case 'golden':
        if (Math.random() < 0.7) {
          out.push(
            new Particle({
              x: x + rand(-6, 6),
              y: y + rand(-6, 6),
              vx: rand(-40, 40),
              vy: rand(-60, 10),
              life: rand(0.4, 0.8),
              size: rand(3, 6),
              color: pick(['#ffd700', '#fff3a0', '#ffb700']),
              kind: 'star',
              gravity: 0.15,
              drag: 1.5,
            }),
          );
        }
        break;
    }
  }

  /** 과일을 벤 순간 터지는 스킨별 입자 */
  emitSlice(out: Particle[], x: number, y: number) {
    // 360도 무작위 방향으로 count 개를 흩뿌린다 (k: 속도 배율)
    const burst = (
      count: number,
      k: number,
      opts: () => Omit<ParticleOptions, 'x' | 'y' | 'vx' | 'vy'>,
    ) => {
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const s = rand(80, 320) * k;
        out.push(new Particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ...opts() }));
      }
    };
    switch (this.skin) {
      case 'basic':
        burst(6, 1, () => ({ life: 0.3, size: 2, color: '#ffffff', kind: 'spark', gravity: 0.4 }));
        break;
      case 'flame':
        burst(12, 0.6, () => ({
          life: rand(0.35, 0.6),
          size: rand(4, 8),
          color: pick(['#ff4d00', '#ff9500', '#ffd23f']),
          kind: 'fire',
          gravity: -0.3,
          drag: 2.5,
        }));
        break;
      case 'neon':
        burst(14, 1.3, () => ({
          life: 0.35,
          size: 2.2,
          color: pick(['#00e5ff', '#ff2bd6']),
          kind: 'neon',
          gravity: 0,
          drag: 3,
        }));
        break;
      case 'sakura':
        burst(10, 0.5, () => ({
          life: rand(1, 1.5),
          size: rand(4, 7),
          color: pick(['#ffb3d1', '#ff8fbd', '#ffd6e6']),
          kind: 'petal',
          gravity: 0.1,
          drag: 1.5,
        }));
        break;
      case 'golden':
        burst(12, 0.8, () => ({
          life: rand(0.5, 0.9),
          size: rand(4, 8),
          color: pick(['#ffd700', '#fff3a0', '#ffb700']),
          kind: 'star',
          gravity: 0.2,
          drag: 2,
        }));
        break;
    }
  }
}
