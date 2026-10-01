import { GRAVITY, type BladeId, type FruitType } from './config';
import { TAU, drawBomb, drawCutFace, drawFruitBody } from './render';

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/* =========================================================
 * Particle — 과즙, 불꽃, 연기, 꽃잎, 별 등 모든 입자
 * ========================================================= */
export type ParticleKind =
  | 'juice'
  | 'spark'
  | 'neon'
  | 'fire'
  | 'smoke'
  | 'petal'
  | 'star'
  | 'debris'
  | 'snow'
  | 'shard'
  | 'wisp'
  | 'nebula'
  | 'ring'
  | 'bubble'
  | 'crescent'
  | 'gust'
  | 'ray'
  | 'bloom'
  | 'arc';

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
  private spin = rand(-8, 8);

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

  /** 빛줄기처럼 방향이 정해진 입자 — 지정한 각도로 고정하고 회전하지 않는다 */
  setAngle(angle: number) {
    this.rot = angle;
    this.spin = 0;
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
      case 'snow': {
        // 6갈래 눈꽃 결정
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot * 0.3);
        const s = this.size;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          ctx.moveTo(0, 0);
          ctx.lineTo(cx * s, cy * s);
          // 가지 끝의 작은 V
          const bx = cx * s * 0.6;
          const by = cy * s * 0.6;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a + 0.7) * s * 0.3, by + Math.sin(a + 0.7) * s * 0.3);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a - 0.7) * s * 0.3, by + Math.sin(a - 0.7) * s * 0.3);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'shard': {
        // 반짝이는 결정 조각 (길쭉한 삼각형)
        ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        const s = this.size * (0.7 + 0.3 * Math.sin(this.age * 30));
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.45, s * 0.6);
        ctx.lineTo(-s * 0.45, s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wisp': {
        // 빛을 삼키는 검은 구체 + 보랏빛 테두리
        const s = this.size * (1 - t * 0.6);
        ctx.fillStyle = '#0c0018';
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        break;
      }
      case 'nebula': {
        // 부드럽게 번지는 성운 구름
        const s = this.size * (1 + t * 1.5);
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, s);
        g.addColorStop(0, this.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, TAU);
        ctx.fill();
        break;
      }
      case 'bubble': {
        // 물방울/독방울 — 테두리 + 작은 하이라이트
        const s = this.size * (0.8 + t * 0.4);
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.25;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x - s * 0.35, this.y - s * 0.35, s * 0.22, 0, TAU);
        ctx.fill();
        break;
      }
      case 'crescent': {
        // 초승달 모양 검기 — 큰 원에서 어긋난 원을 파낸 모양
        ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot * 0.4);
        const s = this.size;
        ctx.beginPath();
        ctx.arc(0, 0, s, Math.PI * 0.15, Math.PI * 1.85);
        ctx.arc(s * 0.45, 0, s * 0.82, Math.PI * 1.75, Math.PI * 0.25, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'gust': {
        // 바람 줄기 — 진행 방향으로 휘어지는 짧은 곡선
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const ux = this.vx / speed;
        const uy = this.vy / speed;
        const len = this.size * 4;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x - ux * len, this.y - uy * len);
        ctx.quadraticCurveTo(
          this.x - ux * len * 0.4 - uy * this.size * 1.6,
          this.y - uy * len * 0.4 + ux * this.size * 1.6,
          this.x,
          this.y,
        );
        ctx.stroke();
        break;
      }
      case 'ray': {
        // 사방으로 뻗는 빛줄기 (size = 길이, 방향 = rot)
        const len = this.size * (0.4 + 0.6 * (1 - (1 - t) ** 2));
        const w = 6 * (1 - t) + 0.5;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.35, this.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -w);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, w);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'bloom': {
        // 부드럽게 번지는 빛 — 가운데는 하얗고 바깥으로 색이 스며든다
        const ease = 1 - (1 - t) ** 3;
        const s = this.size * (0.45 + 0.75 * ease);
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, s);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.3, this.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, TAU);
        ctx.fill();
        break;
      }
      case 'arc': {
        // 초승달 모양 검광 — 가운데가 굵고 양 끝이 가늘게 빠지는 빛의 호
        const ease = 1 - (1 - t) ** 2;
        const r = this.size * (0.7 + 0.45 * ease);
        const span = 1.15;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.globalCompositeOperation = 'lighter';
        const steps = 14;
        for (const [width, color, a] of [
          [11, this.color, 0.28],
          [4, this.color, 0.85],
          [1.4, '#ffffff', 1],
        ] as const) {
          ctx.strokeStyle = color;
          for (let k = 0; k < steps; k++) {
            const a0 = -span + (k / steps) * span * 2;
            const a1 = -span + ((k + 1) / steps) * span * 2;
            const mid = 1 - Math.abs((k + 0.5) / steps - 0.5) * 2;
            ctx.globalAlpha = alpha * a * (0.3 + 0.7 * mid);
            ctx.lineWidth = width * (0.25 + 0.75 * mid) * (1 - t * 0.5);
            ctx.beginPath();
            ctx.arc(0, 0, r, a0, a1);
            ctx.stroke();
          }
        }
        ctx.restore();
        break;
      }
      case 'ring': {
        // 퍼져 나가는 충격파 고리 (size = 최종 반지름)
        const ease = 1 - (1 - t) ** 3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 4 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * ease, 0, TAU);
        ctx.stroke();
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
 * Popup — "10 COMBO!" 같은 떠오르는 글자
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
  /** 'rainbow' 이면 구간마다 색상(hue)이 흐른다 */
  color: string;
  alpha: number;
  glow: boolean;
}

const RAINBOW = 'rainbow';

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
  // ----- 에픽 등급 -----
  gale: [
    { width: 2.8, color: '#5fe3a8', alpha: 0.3, glow: true },
    { width: 1.2, color: '#b8ffe0', alpha: 0.9, glow: true },
    { width: 0.35, color: '#ffffff', alpha: 1, glow: false },
  ],
  tide: [
    { width: 3.0, color: '#1f8fff', alpha: 0.35, glow: true },
    { width: 1.4, color: '#5cc8ff', alpha: 0.8, glow: true },
    { width: 0.45, color: '#e6fbff', alpha: 1, glow: false },
  ],
  venom: [
    { width: 3.0, color: '#4caf1a', alpha: 0.4, glow: true },
    { width: 1.3, color: '#9dff3c', alpha: 0.85, glow: true },
    { width: 0.45, color: '#f0ffd0', alpha: 1, glow: false },
  ],
  amethyst: [
    { width: 3.0, color: '#7a3cff', alpha: 0.35, glow: true },
    { width: 1.3, color: '#c49bff', alpha: 0.9, glow: true },
    { width: 0.4, color: '#f6eeff', alpha: 1, glow: false },
  ],
  crimson: [
    { width: 3.2, color: '#c3002f', alpha: 0.45, glow: true },
    { width: 1.3, color: '#ff4d6d', alpha: 0.9, glow: true },
    { width: 0.4, color: '#ffe3e8', alpha: 1, glow: false },
  ],
  // ----- 전설 등급 -----
  frost: [
    { width: 3.2, color: '#3fb8ff', alpha: 0.3, glow: true },
    { width: 1.6, color: '#9fe8ff', alpha: 0.55, glow: true },
    { width: 0.9, color: '#e6fbff', alpha: 0.95, glow: false },
    { width: 0.3, color: '#ffffff', alpha: 1, glow: false },
  ],
  thunder: [
    { width: 3.4, color: '#3a48ff', alpha: 0.35, glow: true },
    { width: 1.2, color: '#9aa6ff', alpha: 0.9, glow: true },
    { width: 0.4, color: '#ffffff', alpha: 1, glow: false },
  ],
  void: [
    // 보랏빛 광채 안에 검은 심 — 빛을 삼키는 느낌
    { width: 3.6, color: '#6b21ff', alpha: 0.45, glow: true },
    { width: 1.7, color: '#c77dff', alpha: 0.8, glow: true },
    { width: 1.0, color: '#0a0014', alpha: 1, glow: false },
  ],
  prism: [
    { width: 3.2, color: RAINBOW, alpha: 0.35, glow: true },
    { width: 1.3, color: RAINBOW, alpha: 0.9, glow: true },
    { width: 0.4, color: '#ffffff', alpha: 1, glow: false },
  ],
  galaxy: [
    { width: 3.8, color: '#4b1fd6', alpha: 0.4, glow: true },
    { width: 2.0, color: '#ff5ec8', alpha: 0.45, glow: true },
    { width: 1.0, color: '#7dd8ff', alpha: 0.7, glow: true },
    { width: 0.35, color: '#ffffff', alpha: 1, glow: false },
  ],
  // ----- 랭커 전용 -----
  // 여명의 검은 겹치는 선 대신 리본 다각형으로 직접 그린다 (drawDawn)
  dawn: [],
};

/** 피버 타임 중 칼날 바깥에 한 겹 더 두르는 무지개 광채 */
const FEVER_LAYER: TrailLayer = { width: 4.5, color: RAINBOW, alpha: 0.3, glow: true };

const TRAIL_LIFE = 0.16;
const TRAIL_WIDTH = 9;

/**
 * 여명의 검 빛의 띠 — 띠 안의 위치 from~to (-1 = 한쪽 가장자리, 1 = 반대쪽).
 * 경계를 딱 맞춰 나눠 띠끼리 겹치지 않게 해서 색이 탁해지지 않는다.
 */
const DAWN_BANDS = [
  { from: 0.6, to: 1, rgb: '255,196,92', alpha: 0.78 }, // 금빛
  { from: 0.2, to: 0.6, rgb: '255,92,170', alpha: 0.8 }, // 장밋빛
  { from: -0.2, to: 0.2, rgb: '255,240,250', alpha: 0.95 }, // 하얀 심
  { from: -0.6, to: -0.2, rgb: '72,196,255', alpha: 0.8 }, // 하늘빛
  { from: -1, to: -0.6, rgb: '150,110,255', alpha: 0.78 }, // 라벤더
] as const;

const DAWN_GLITTER = ['#ffe6a8', '#ffc2e2', '#bfe6ff', '#d8c8ff', '#ffffff'] as const;

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
  /** 피버 타임 중이면 무지개 광채가 더해진다 */
  fever = false;
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
      const layers = TRAIL_LAYERS[this.skin];
      for (const layer of this.fever ? [FEVER_LAYER, ...layers] : layers) {
        ctx.globalCompositeOperation = layer.glow ? 'lighter' : 'source-over';
        const rainbow = layer.color === RAINBOW;
        if (!rainbow) ctx.strokeStyle = layer.color;
        for (let i = 1; i < n; i++) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          const fade = Math.max(0, 1 - (time - b.t) / TRAIL_LIFE);
          // 꼬리(오래된 쪽)는 가늘고, 머리(최신)는 굵게
          const taper = i / (n - 1);
          let w = TRAIL_WIDTH * layer.width * taper * (0.35 + 0.65 * fade);
          if (this.skin === 'flame') w *= 0.8 + Math.random() * 0.4;
          if (w < 0.3) continue;
          // 무지개: 시간이 지나며 색이 궤적을 따라 흐른다
          if (rainbow) ctx.strokeStyle = `hsl(${(time * 360 + i * 9) % 360}, 100%, 62%)`;
          ctx.globalAlpha = layer.alpha * fade;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (this.skin === 'neon') this.drawLightning(ctx, pts, time);
      if (this.skin === 'thunder') this.drawBranchingBolt(ctx, pts, time);
      if (this.skin === 'galaxy') this.drawStarDust(ctx, pts, time);
      if (this.skin === 'dawn') this.drawDawn(ctx, pts, time);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 뇌신의 검 — 궤적을 따라 치는 굵은 번개 + 옆으로 갈라지는 가지 */
  private drawBranchingBolt(ctx: CanvasRenderingContext2D, pts: TrailPoint[], time: number) {
    const nodes: { x: number; y: number; fade: number }[] = [];
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i]!;
      const fade = Math.max(0, 1 - (time - p.t) / TRAIL_LIFE);
      if (fade > 0) nodes.push({ x: p.x + rand(-9, 9) * fade, y: p.y + rand(-9, 9) * fade, fade });
    }
    if (nodes.length < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    const strokePath = (width: number, color: string, alpha: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(nodes[0]!.x, nodes[0]!.y);
      for (const nd of nodes) ctx.lineTo(nd.x, nd.y);
      ctx.stroke();
    };
    strokePath(7, '#4b5cff', 0.35);
    strokePath(2.4, '#e8ecff', 0.95);

    // 갈라지는 가지 (매 프레임 새로 — 지직거리는 느낌)
    ctx.strokeStyle = '#fff6a8';
    ctx.lineWidth = 1.3;
    for (const nd of nodes) {
      if (Math.random() > 0.35) continue;
      let x = nd.x;
      let y = nd.y;
      const dir = rand(0, TAU);
      ctx.globalAlpha = 0.8 * nd.fade;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += Math.cos(dir + rand(-0.8, 0.8)) * rand(8, 16);
        y += Math.sin(dir + rand(-0.8, 0.8)) * rand(8, 16);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
  }

  /**
   * 여명의 검 — 형상 없이 빛과 색만으로 그린다.
   * 라벤더·하늘빛·하얀 심·장밋빛·금빛 5겹 띠가 하나의 비단 리본처럼 흐르고(꼬리에서 투명하게 사라짐),
   * 리본을 따라 광택이 미끄러진다. 그 위로 빛실 두 가닥이 교차하고, 빛가루와 칼끝 별빛 반사가 반짝인다.
   */
  private drawDawn(ctx: CanvasRenderingContext2D, pts: TrailPoint[], time: number) {
    const n = pts.length;
    if (n < 3) return;

    // 점마다 진행 방향의 수직 벡터와 리본 반폭 — 머리 쪽이 넓고 꼬리로 갈수록 가늘게 모인다
    const f = pts.map((p, i) => {
      const q = pts[Math.min(n - 1, i + 1)]!;
      const o = pts[Math.max(0, i - 1)]!;
      const len = Math.hypot(q.x - o.x, q.y - o.y) || 1;
      const fade = Math.max(0, 1 - (time - p.t) / TRAIL_LIFE);
      // 칼끝 몇 점은 둥글게 오므려 끝이 네모나게 잘리지 않게 한다
      const d = n - 1 - i;
      const tip = d < 4 ? Math.sqrt(1 - ((4 - d) / 4.6) ** 2) : 1;
      const shape = Math.sin(Math.min(1, (i / (n - 1)) * 1.08) * Math.PI * 0.5) * tip;
      return {
        x: p.x,
        y: p.y,
        nx: -(q.y - o.y) / len,
        ny: (q.x - o.x) / len,
        fade,
        half: TRAIL_WIDTH * 1.25 * shape * (0.3 + 0.7 * fade),
      };
    });
    const tail = f[0]!;
    const head = f[n - 1]!;

    /** 리본 한 조각 — from~to 번째 점 구간에서, 띠 안 위치 e0~e1 사이를 채운다 */
    const ribbon = (e0: number, e1: number, from = 0, to = n - 1) => {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const p = f[i]!;
        ctx.lineTo(p.x + p.nx * p.half * e1, p.y + p.ny * p.half * e1);
      }
      for (let i = to; i >= from; i--) {
        const p = f[i]!;
        ctx.lineTo(p.x + p.nx * p.half * e0, p.y + p.ny * p.half * e0);
      }
      ctx.closePath();
      ctx.fill();
    };
    /** 꼬리에서 투명 → 머리 쪽으로 진해지는 색 */
    const along = (rgb: string, a: number) => {
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.5, `rgba(${rgb},${a * 0.65})`);
      g.addColorStop(1, `rgba(${rgb},${a})`);
      return g;
    };

    // 1) 리본 바깥으로 은은하게 번지는 빛 — 얇은 겹을 쌓아 가장자리가 부드럽게 사라진다
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, rgb] of [
      [2.4, '255,110,190'],
      [2.0, '255,120,200'],
      [1.7, '170,150,255'],
      [1.4, '120,200,255'],
    ] as const) {
      ctx.fillStyle = along(rgb, 0.07);
      ribbon(-w, w);
    }

    // 2) 색 띠 5겹 — 일반 혼합으로 칠해 색이 섞여 탁해지지 않게
    ctx.globalCompositeOperation = 'source-over';
    for (const band of DAWN_BANDS) {
      ctx.fillStyle = along(band.rgb, band.alpha);
      ribbon(band.from, band.to);
    }

    // 3) 가운데로 갈수록 밝아지는 빛 + 하얗게 빛나는 칼날 심 + 리본을 따라 미끄러지는 광택
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = along('255,255,255', 0.14);
    ribbon(-0.55, 0.55);
    ctx.fillStyle = along('255,255,255', 0.9);
    ribbon(-0.12, 0.12);
    const sheen = Math.floor(((time * 2.2) % 1) * n);
    for (let k = 0; k < 3; k++) {
      const s0 = Math.max(0, sheen - 2 - k * 2);
      const s1 = Math.min(n - 1, sheen + 2 + k * 2);
      if (s1 <= s0) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.16 - k * 0.04})`;
      ribbon(-0.95, 0.95, s0, s1);
    }

    // 4) 빛실 두 가닥 — 리본 위를 물결치듯 넘나들며 서로 교차한다
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.9;
    for (const [phase, rgb] of [
      [0, '255,226,240'],
      [Math.PI, '220,240,255'],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = f[i]!;
        const w = Math.sin(i * 0.22 - time * 12 + phase) * p.half * 1.25;
        ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w);
      }
      ctx.strokeStyle = along(rgb, 0.8);
      ctx.stroke();
    }

    // 5) 빛가루 — 리본 언저리에서 제자리 반짝임
    for (let i = 2; i < n; i += 3) {
      const p = f[i]!;
      if (p.fade <= 0) continue;
      const seed = pts[i]!.t * 1000 + i;
      const side = Math.sin(seed * 12.9898);
      const ox = p.nx * p.half * 1.6 * side + Math.cos(seed * 4.1) * 3;
      const oy = p.ny * p.half * 1.6 * side + Math.sin(seed * 7.3) * 3;
      const tw = 0.5 + 0.5 * Math.sin(time * 28 + seed);
      ctx.globalAlpha = p.fade * tw;
      ctx.fillStyle = DAWN_GLITTER[i % DAWN_GLITTER.length]!;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, 0.7 + tw * 1.3, 0, TAU);
      ctx.fill();
    }

    // 6) 칼끝 — 부드러운 번짐 + 가로로 길게 뻗는 별빛 반사
    if (head.fade > 0) {
      ctx.globalAlpha = head.fade;
      const halo = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 22);
      halo.addColorStop(0, 'rgba(255,255,255,0.8)');
      halo.addColorStop(0.4, 'rgba(255,150,210,0.3)');
      halo.addColorStop(1, 'rgba(120,190,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 22, 0, TAU);
      ctx.fill();
      const tw = 0.8 + 0.2 * Math.sin(time * 20);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(time * 0.8);
      ctx.fillStyle = '#ffffff';
      for (const [len, wid, rot] of [
        [28 * tw, 1.5, 0],
        [16 * tw, 1.3, Math.PI / 2],
        [8, 1, Math.PI / 4],
        [8, 1, -Math.PI / 4],
      ] as const) {
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, -wid);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, wid);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 갤럭시 세이버 — 궤적 주변에 반짝이는 작은 별무리 */
  private drawStarDust(ctx: CanvasRenderingContext2D, pts: TrailPoint[], time: number) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i]!;
      const fade = Math.max(0, 1 - (time - p.t) / TRAIL_LIFE);
      if (fade <= 0) continue;
      // 점의 시간값으로 위치를 고정해 별이 제자리에서 반짝이게 한다
      const seed = p.t * 1000 + i;
      const ox = Math.sin(seed * 12.9898) * 14;
      const oy = Math.cos(seed * 78.233) * 14;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 30 + seed);
      ctx.globalAlpha = fade * twinkle;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, 0.8 + twinkle * 1.4, 0, TAU);
      ctx.fill();
    }
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
      // ----- 에픽 등급 -----
      case 'gale':
        if (Math.random() < 0.6) {
          add({
            x,
            y,
            vx: back.vx * 0.6 + rand(-60, 60),
            vy: back.vy * 0.6 + rand(-60, 60),
            life: rand(0.25, 0.45),
            size: rand(3, 5),
            color: pick(['#d9fff0', '#7ee8b8']),
            kind: 'gust',
            gravity: 0,
            drag: 2.5,
          });
        }
        if (Math.random() < 0.25) {
          add({
            x,
            y,
            vx: rand(-80, 80),
            vy: rand(-60, 10),
            life: rand(0.8, 1.3),
            size: rand(4, 6),
            color: pick(['#5fcf5a', '#8fe36b', '#c7f06a']),
            kind: 'petal',
            gravity: 0.1,
            drag: 1.2,
          });
        }
        break;
      case 'tide':
        if (Math.random() < 0.5) {
          add({
            x: x + rand(-6, 6),
            y: y + rand(-6, 6),
            vx: rand(-20, 20),
            vy: rand(-70, -30),
            life: rand(0.6, 1),
            size: rand(2.5, 5),
            color: '#8fdcff',
            kind: 'bubble',
            gravity: -0.05,
            drag: 1.5,
          });
        }
        if (Math.random() < 0.5) {
          add({
            x,
            y,
            vx: rand(-60, 60),
            vy: rand(-40, 20),
            life: rand(0.35, 0.6),
            size: rand(1.8, 3),
            color: pick(['#5cc8ff', '#c7f0ff']),
            kind: 'juice',
            gravity: 0.8,
            drag: 0.8,
          });
        }
        break;
      case 'venom':
        if (Math.random() < 0.45) {
          add({
            x,
            y,
            vx: rand(-20, 20),
            vy: rand(-10, 40),
            life: rand(0.5, 0.9),
            size: rand(2.5, 4.5),
            color: '#9dff3c',
            kind: 'bubble',
            gravity: 0.05,
            drag: 1.5,
          });
        }
        if (Math.random() < 0.5) {
          add({
            x,
            y,
            vx: rand(-15, 15),
            vy: rand(20, 60),
            life: rand(0.5, 0.8),
            size: rand(2, 3.5),
            color: pick(['#6bd425', '#b6ff4d']),
            kind: 'juice',
            gravity: 0.9,
            drag: 0.5,
          });
        }
        break;
      case 'amethyst':
        if (Math.random() < 0.6) {
          add({
            x: x + rand(-5, 5),
            y: y + rand(-5, 5),
            vx: rand(-50, 50),
            vy: rand(-60, 20),
            life: rand(0.4, 0.7),
            size: rand(3, 5.5),
            color: pick(['#9b5cff', '#c49bff', '#e2c6ff']),
            kind: 'shard',
            gravity: 0.3,
            drag: 1.8,
          });
        }
        break;
      case 'crimson':
        if (Math.random() < 0.35) {
          add({
            x,
            y,
            vx: back.vx * 0.3 + rand(-30, 30),
            vy: back.vy * 0.3 + rand(-30, 30),
            life: rand(0.35, 0.6),
            size: rand(5, 8),
            color: pick(['#ff4d6d', '#c3002f']),
            kind: 'crescent',
            gravity: 0,
            drag: 2.5,
          });
        }
        if (Math.random() < 0.4) {
          add({
            x,
            y,
            vx: rand(-80, 80),
            vy: rand(-80, 80),
            life: rand(0.2, 0.35),
            size: 1.5,
            color: '#ffb3c1',
            kind: 'spark',
            gravity: 0.2,
            drag: 3,
          });
        }
        break;
      // ----- 전설 등급 -----
      case 'frost':
        if (Math.random() < 0.55) {
          add({
            x: x + rand(-5, 5),
            y: y + rand(-5, 5),
            vx: rand(-30, 30),
            vy: rand(-20, 30),
            life: rand(0.7, 1.2),
            size: rand(4, 7),
            color: pick(['#dff8ff', '#9fe8ff']),
            kind: 'snow',
            gravity: 0.06,
            drag: 1.5,
          });
        }
        if (Math.random() < 0.4) {
          add({
            x,
            y,
            vx: rand(-15, 15),
            vy: rand(-10, 20),
            life: rand(0.6, 1),
            size: rand(5, 9),
            color: '#bfeaff',
            kind: 'smoke',
            gravity: 0.02,
            drag: 1.5,
          });
        }
        break;
      case 'thunder':
        for (let i = 0; i < 2; i++) {
          add({
            x,
            y,
            vx: rand(-260, 260),
            vy: rand(-260, 260),
            life: rand(0.12, 0.25),
            size: 1.6,
            color: pick(['#ffffff', '#fff6a8', '#9aa6ff']),
            kind: 'spark',
            gravity: 0,
            drag: 4,
          });
        }
        break;
      case 'void':
        if (Math.random() < 0.6) {
          add({
            x: x + rand(-4, 4),
            y: y + rand(-4, 4),
            vx: back.vx * 0.2 + rand(-25, 25),
            vy: back.vy * 0.2 + rand(-25, 25),
            life: rand(0.4, 0.7),
            size: rand(3, 6),
            color: pick(['#9d4dff', '#c77dff']),
            kind: 'wisp',
            gravity: -0.05,
            drag: 2.5,
          });
        }
        break;
      case 'prism':
        if (Math.random() < 0.7) {
          add({
            x,
            y,
            vx: rand(-90, 90),
            vy: rand(-90, 40),
            life: rand(0.4, 0.8),
            size: rand(3, 6),
            color: `hsl(${Math.floor(rand(0, 360))}, 100%, 65%)`,
            kind: 'shard',
            gravity: 0.25,
            drag: 1.8,
          });
        }
        break;
      case 'galaxy':
        if (Math.random() < 0.5) {
          add({
            x,
            y,
            vx: rand(-20, 20),
            vy: rand(-20, 20),
            life: rand(0.6, 1),
            size: rand(8, 14),
            color: pick(['rgba(123,77,255,0.9)', 'rgba(255,94,200,0.9)', 'rgba(125,216,255,0.9)']),
            kind: 'nebula',
            gravity: 0,
            drag: 2,
          });
        }
        if (Math.random() < 0.4) {
          add({
            x: x + rand(-8, 8),
            y: y + rand(-8, 8),
            vx: rand(-30, 30),
            vy: rand(-30, 30),
            life: rand(0.5, 0.9),
            size: rand(2.5, 4.5),
            color: '#ffffff',
            kind: 'star',
            gravity: 0,
            drag: 2,
          });
        }
        break;
      // ----- 랭커 전용 -----
      case 'dawn':
        // 파스텔 빛가루가 궤적 뒤로 흩날리고, 가는 빛줄기가 스친다
        if (Math.random() < 0.75) {
          add({
            x: x + rand(-5, 5),
            y: y + rand(-5, 5),
            vx: back.vx * 0.15 + rand(-35, 35),
            vy: back.vy * 0.15 + rand(-45, 15),
            life: rand(0.45, 0.85),
            size: rand(1.6, 3.4),
            color: pick(['#ffe6a8', '#ffc2e2', '#bfe6ff', '#d8c8ff', '#ffffff']),
            kind: 'star',
            gravity: 0.05,
            drag: 2,
          });
        }
        if (Math.random() < 0.5) {
          add({
            x,
            y,
            vx: back.vx * 0.4 + rand(-70, 70),
            vy: back.vy * 0.4 + rand(-70, 70),
            life: rand(0.2, 0.35),
            size: 1.3,
            color: pick(['#ffc2e2', '#bfe6ff', '#ffe6a8']),
            kind: 'neon',
            gravity: 0,
            drag: 3,
          });
        }
        break;
    }

    function add(o: ParticleOptions) {
      out.push(new Particle(o));
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
      // ----- 에픽 등급: 입자 + 가는 고리 한 겹 -----
      case 'gale':
        ring('#b8ffe0', 55);
        burst(12, 1.2, () => ({
          life: rand(0.3, 0.5),
          size: rand(3, 6),
          color: pick(['#d9fff0', '#7ee8b8']),
          kind: 'gust',
          gravity: 0,
          drag: 2.5,
        }));
        burst(6, 0.6, () => ({
          life: rand(0.9, 1.3),
          size: rand(4, 7),
          color: pick(['#5fcf5a', '#8fe36b', '#c7f06a']),
          kind: 'petal',
          gravity: 0.12,
          drag: 1.4,
        }));
        break;
      case 'tide':
        ring('#5cc8ff', 55);
        burst(10, 0.4, () => ({
          life: rand(0.7, 1.1),
          size: rand(3, 6),
          color: '#8fdcff',
          kind: 'bubble',
          gravity: -0.08,
          drag: 1.5,
        }));
        burst(10, 1, () => ({
          life: rand(0.4, 0.7),
          size: rand(2, 3.5),
          color: pick(['#5cc8ff', '#c7f0ff']),
          kind: 'juice',
          gravity: 1,
          drag: 0.6,
        }));
        break;
      case 'venom':
        ring('#9dff3c', 55);
        burst(10, 0.4, () => ({
          life: rand(0.6, 1),
          size: rand(3, 6),
          color: '#9dff3c',
          kind: 'bubble',
          gravity: 0.05,
          drag: 1.5,
        }));
        burst(8, 0.8, () => ({
          life: rand(0.5, 0.8),
          size: rand(2.5, 4),
          color: pick(['#6bd425', '#b6ff4d']),
          kind: 'juice',
          gravity: 1,
          drag: 0.5,
        }));
        break;
      case 'amethyst':
        ring('#c49bff', 55);
        burst(14, 1, () => ({
          life: rand(0.5, 0.8),
          size: rand(4, 7),
          color: pick(['#9b5cff', '#c49bff', '#e2c6ff']),
          kind: 'shard',
          gravity: 0.5,
          drag: 1.8,
        }));
        break;
      case 'crimson':
        ring('#ff4d6d', 55);
        burst(5, 0.7, () => ({
          life: rand(0.4, 0.6),
          size: rand(8, 12),
          color: pick(['#ff4d6d', '#c3002f']),
          kind: 'crescent',
          gravity: 0,
          drag: 2.5,
        }));
        burst(12, 1.2, () => ({
          life: rand(0.2, 0.35),
          size: 1.8,
          color: '#ffb3c1',
          kind: 'spark',
          gravity: 0.2,
          drag: 3,
        }));
        break;
      // ----- 전설 등급: 입자 + 충격파 고리 -----
      case 'frost':
        ring('#9fe8ff', 70);
        burst(10, 0.6, () => ({
          life: rand(0.8, 1.3),
          size: rand(5, 9),
          color: pick(['#dff8ff', '#9fe8ff']),
          kind: 'snow',
          gravity: 0.15,
          drag: 2,
        }));
        burst(8, 1.2, () => ({
          life: 0.5,
          size: rand(3, 6),
          color: '#e6fbff',
          kind: 'shard',
          gravity: 0.6,
          drag: 1.5,
        }));
        break;
      case 'thunder':
        ring('#9aa6ff', 80);
        ring('#ffffff', 45);
        burst(18, 1.6, () => ({
          life: rand(0.15, 0.3),
          size: 2,
          color: pick(['#ffffff', '#fff6a8', '#9aa6ff']),
          kind: 'spark',
          gravity: 0,
          drag: 3,
        }));
        break;
      case 'void':
        ring('#9d4dff', 75);
        burst(12, 0.5, () => ({
          life: rand(0.5, 0.9),
          size: rand(4, 8),
          color: pick(['#9d4dff', '#c77dff']),
          kind: 'wisp',
          gravity: -0.1,
          drag: 2.5,
        }));
        break;
      case 'prism':
        ring('#ffffff', 70);
        burst(16, 1, () => ({
          life: rand(0.5, 0.9),
          size: rand(4, 8),
          color: `hsl(${Math.floor(rand(0, 360))}, 100%, 65%)`,
          kind: 'shard',
          gravity: 0.4,
          drag: 1.8,
        }));
        break;
      case 'galaxy':
        ring('#ff5ec8', 85);
        burst(6, 0.3, () => ({
          life: rand(0.7, 1.1),
          size: rand(14, 22),
          color: pick(['rgba(123,77,255,0.9)', 'rgba(255,94,200,0.9)', 'rgba(125,216,255,0.9)']),
          kind: 'nebula',
          gravity: 0,
          drag: 2,
        }));
        burst(14, 0.9, () => ({
          life: rand(0.6, 1),
          size: rand(3, 6),
          color: '#ffffff',
          kind: 'star',
          gravity: 0,
          drag: 2,
        }));
        break;
      // ----- 랭커 전용: 리본과 같은 색의 3겹 초승달 검광 2개(엇갈림) + 짧은 하얀 섬광 + 파스텔 빛가루 -----
      case 'dawn': {
        out.push(
          new Particle({
            x,
            y,
            vx: 0,
            vy: 0,
            life: 0.2,
            size: 26,
            color: 'rgba(255,240,250,0.7)',
            kind: 'bloom',
            gravity: 0,
          }),
        );
        const angle = rand(0, TAU);
        for (const [base, da] of [
          [54, 0],
          [38, Math.PI],
        ] as const) {
          // 바깥부터 금빛 → 장밋빛 → 하늘빛, 반지름을 조금씩 줄여 한 줄기 리본처럼 겹친다
          (['#ffc45c', '#ff5caa', '#48c4ff'] as const).forEach((color, k) => {
            const arc = new Particle({
              x,
              y,
              vx: 0,
              vy: 0,
              life: 0.42,
              size: base - k * 4,
              color,
              kind: 'arc',
              gravity: 0,
            });
            arc.setAngle(angle + da);
            out.push(arc);
          });
        }
        burst(18, 0.9, () => ({
          life: rand(0.5, 0.9),
          size: rand(2, 4.5),
          color: pick(['#ffe6a8', '#ffc2e2', '#bfe6ff', '#d8c8ff', '#ffffff']),
          kind: 'star',
          gravity: 0.08,
          drag: 2,
        }));
        burst(12, 1.5, () => ({
          life: rand(0.25, 0.45),
          size: 1.6,
          color: pick(['#ffc2e2', '#bfe6ff', '#ffe6a8']),
          kind: 'neon',
          gravity: 0,
          drag: 3,
        }));
        break;
      }
    }
    if (this.fever) ring('#ffe36e', 95);

    function ring(color: string, radius: number) {
      out.push(
        new Particle({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 0.45,
          size: radius,
          color,
          kind: 'ring',
          gravity: 0,
        }),
      );
    }
  }
}
