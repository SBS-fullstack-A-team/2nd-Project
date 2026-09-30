import type { TrailId } from './looks';
import { hex, v3, type RGB, type Scene, type Vec3 } from './r3d';

/**
 * 달리기 효과 — 발을 디딜 때마다, 착지할 때, 달리는 동안 발밑에 생기는 연출.
 * 땅에 남은 것은 달리는 속도만큼 뒤로(-z) 흘러간다. 화면 연출이라 판정과는 상관없다.
 *
 * - 발걸음: 걸음 위상이 π 를 넘을 때마다 한 번 (왼발·오른발 번갈아)
 * - 착지: 공중에 있다가 땅에 닿는 순간 둥글게 크게 터진다
 * - 빨리 달릴수록, 부스트 중엔 더 많이 나온다
 */

/** 이번 프레임에 효과가 보는 캐릭터 상태 */
export interface TrailInput {
  /** 발 가운데 가로 위치(m) */
  x: number;
  /** 발 높이(m) — 점프 중이면 0 보다 크다 */
  y: number;
  /** 달리는 속도(m/s) — 땅에 남은 것이 그만큼 뒤로 흘러간다 */
  speed: number;
  /** 땅을 딛고 있는지 (점프 중·붙잡힌 뒤엔 false) */
  grounded: boolean;
  /** 걸음 위상 — null 이면 발걸음 효과 없음 (슬라이드 중 등) */
  phase: number | null;
  boost: boolean;
  /** 출발 속도 0 ~ 최고 속도 1 */
  intensity: number;
}

type Shape = 'puff' | 'leaf' | 'spark' | 'glint';

interface Particle {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  max: number;
  /** 크기(m) */
  size: number;
  /** "r, g, b" */
  color: string;
  seed: number;
}

/** 불꽃 발자국 — 딛은 자리에 남아 서서히 식는다 */
interface Print {
  x: number;
  z: number;
  life: number;
  max: number;
}

/** 번개 — 아주 짧게 번쩍인다 */
interface Bolt {
  x: number;
  z: number;
  life: number;
  max: number;
  big: boolean;
}

const MAX_PARTICLES = 90;
/**
 * 튄 입자가 뒤로 흘러가는 빠르기 (달리는 속도에 대한 비율).
 * 땅에 그대로 남으면(1) 한 걸음 만에 화면 밖으로 사라져 발과 떨어져 보이므로, 달리는 사람을 따라
 * 끌려오듯 천천히 뒤처지게 한다. 발자국·리본처럼 땅에 붙은 것은 제 속도(1)로 흘러간다.
 */
const PARTICLE_DRIFT = 0.3;
const BOLT_DRIFT = 0.15;
/** 발자국·리본이 이만큼(m) 뒤로 가면 치운다 (카메라 뒤) */
const BEHIND = -12;
/** 리본 점 사이 간격(m) */
const RIBBON_STEP = 0.5;
const RIBBON_MAX = 26;
/** 리본 폭(m) — 무지개 다섯 줄 */
const RIBBON_W = 0.4;
const RAINBOW: readonly RGB[] = ['#ff5a5a', '#ffb13b', '#ffe45a', '#5ad66b', '#4f8dff'].map(hex);
const RAINBOW_CSS = ['255, 90, 90', '255, 177, 59', '255, 228, 90', '90, 214, 107', '79, 141, 255'];

const DUST = '205, 185, 145';
const LEAVES = ['94, 138, 58', '122, 168, 69', '74, 110, 44', '154, 184, 78'];
const EMBER = '255, 150, 50';
const GOLD = '255, 215, 90';
const VOLT = '80, 165, 255';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class TrailFx {
  private parts: Particle[] = [];
  private prints: Print[] = [];
  private bolts: Bolt[] = [];
  private ribbon: Vec3[] = [];
  private lastStep: number | null = null;
  private wasGrounded = true;
  /** 이어서 나오는 입자의 소수점 몫 */
  private acc = 0;
  private foot = 1;

  clear(): void {
    this.parts = [];
    this.prints = [];
    this.bolts = [];
    this.ribbon = [];
    this.acc = 0;
  }

  update(dt: number, kind: TrailId, inp: TrailInput): void {
    if (dt <= 0) return;
    // 빨리 달릴수록 · 부스트 중엔 더 많이
    const amount = (1 + inp.intensity * 0.8) * (inp.boost ? 2 : 1);

    // 발걸음
    if (inp.phase !== null && inp.grounded) {
      const stepNo = Math.floor((inp.phase - 0.6) / Math.PI);
      if (this.lastStep !== null && stepNo !== this.lastStep) {
        this.foot = -this.foot;
        this.footstep(kind, inp.x + this.foot * 0.12, amount);
      }
      this.lastStep = stepNo;
    } else {
      this.lastStep = null;
    }

    // 착지
    if (inp.grounded && !this.wasGrounded) this.landing(kind, inp.x, amount);
    this.wasGrounded = inp.grounded;

    // 계속 나오는 것
    if (inp.grounded) this.continuous(kind, inp.x, dt * amount);
    if (kind === 'rainbow' && inp.phase !== null) this.growRibbon(inp);

    // 움직이기
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y = Math.max(0.02, p.y + p.vy * dt);
      p.z += (p.vz - inp.speed * PARTICLE_DRIFT) * dt;
      p.vy -= p.gravity * dt;
      // 땅에 닿은 것은 옆으로 미끄러지다 멈춘다
      if (p.y <= 0.02) {
        p.vx *= 0.9;
        p.vz *= 0.9;
      }
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const pr of this.prints) {
      pr.z -= inp.speed * dt;
      pr.life -= dt;
    }
    this.prints = this.prints.filter((pr) => pr.life > 0 && pr.z > BEHIND);
    for (const b of this.bolts) {
      b.z -= inp.speed * BOLT_DRIFT * dt;
      b.life -= dt;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const r of this.ribbon) r.z -= inp.speed * dt;
    this.ribbon = this.ribbon.filter((r) => r.z > BEHIND);
    if (kind !== 'rainbow' || inp.phase === null) this.ribbon = [];
  }

  // ---------- 만들기 ----------

  private add(p: Omit<Particle, 'seed' | 'max'>): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ ...p, max: p.life, seed: Math.random() });
  }

  /** 발밑에서 위·옆으로 튀는 입자 n 개 */
  private kick(
    n: number,
    x: number,
    shape: Shape,
    color: () => string,
    o: { vy: [number, number]; spread: number; life: number; size: number; gravity: number },
  ): void {
    const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      this.add({
        shape,
        x: x + rand(-0.1, 0.1),
        y: 0.05,
        z: rand(-0.15, 0.05),
        vx: rand(-o.spread, o.spread),
        vy: rand(o.vy[0], o.vy[1]),
        vz: rand(0.3, 2),
        gravity: o.gravity,
        life: o.life * rand(0.8, 1.2),
        size: o.size * rand(0.8, 1.2),
        color: color(),
      });
    }
  }

  /** 착지 — 발 둘레로 둥글게 퍼지는 입자 n 개 */
  private ring(
    n: number,
    x: number,
    shape: Shape,
    color: (i: number) => string,
    o: { speed: number; vy: [number, number]; life: number; size: number; gravity: number },
  ): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      this.add({
        shape,
        x,
        y: 0.06,
        z: 0,
        vx: Math.cos(a) * o.speed,
        vy: rand(o.vy[0], o.vy[1]),
        vz: Math.sin(a) * o.speed,
        gravity: o.gravity,
        life: o.life * rand(0.8, 1.2),
        size: o.size,
        color: color(i),
      });
    }
  }

  private footstep(kind: TrailId, x: number, amount: number): void {
    const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)] as T;
    switch (kind) {
      case 'dust':
        this.kick(4 * amount, x, 'puff', () => DUST, {
          vy: [0.4, 1.0],
          spread: 0.8,
          life: 0.6,
          size: 0.17,
          gravity: 1.5,
        });
        return;
      case 'leaf':
        this.kick(3 * amount, x, 'leaf', () => pick(LEAVES), {
          vy: [1.4, 2.4],
          spread: 1.5,
          life: 1.0,
          size: 0.2,
          gravity: 3,
        });
        return;
      case 'ember':
        this.prints.push({ x, z: 0, life: 1.1, max: 1.1 });
        this.kick(3 * amount, x, 'spark', () => EMBER, {
          vy: [1.5, 2.6],
          spread: 0.6,
          life: 0.5,
          size: 0.07,
          gravity: -0.8,
        });
        return;
      case 'gold':
        this.kick(4 * amount, x, 'glint', () => GOLD, {
          vy: [0.9, 1.8],
          spread: 0.9,
          life: 0.75,
          size: 0.15,
          gravity: 0.8,
        });
        return;
      case 'lightning':
        this.bolts.push({ x, z: 0, life: 0.14, max: 0.14, big: false });
        this.kick(3 * amount, x, 'spark', () => VOLT, {
          vy: [0.8, 1.8],
          spread: 1.4,
          life: 0.3,
          size: 0.06,
          gravity: 4,
        });
        return;
      case 'rainbow':
        return;
    }
  }

  private landing(kind: TrailId, x: number, amount: number): void {
    const n = Math.round(12 * Math.min(1.6, amount));
    switch (kind) {
      case 'dust':
        this.ring(n, x, 'puff', () => DUST, {
          speed: 2.4,
          vy: [0.3, 0.8],
          life: 0.7,
          size: 0.22,
          gravity: 1.5,
        });
        return;
      case 'leaf':
        this.ring(n, x, 'leaf', (i) => LEAVES[i % LEAVES.length] ?? DUST, {
          speed: 2.2,
          vy: [1.5, 2.8],
          life: 1.1,
          size: 0.2,
          gravity: 3,
        });
        return;
      case 'ember':
        this.prints.push({ x: x - 0.12, z: 0, life: 1.3, max: 1.3 });
        this.prints.push({ x: x + 0.12, z: 0, life: 1.3, max: 1.3 });
        this.ring(n, x, 'spark', () => EMBER, {
          speed: 2.8,
          vy: [1.2, 2.4],
          life: 0.55,
          size: 0.08,
          gravity: 0.5,
        });
        return;
      case 'gold':
        this.ring(n + 4, x, 'glint', () => GOLD, {
          speed: 2.2,
          vy: [1.0, 2.2],
          life: 0.85,
          size: 0.17,
          gravity: 1,
        });
        return;
      case 'lightning':
        this.bolts.push({ x, z: 0, life: 0.2, max: 0.2, big: true });
        this.ring(n, x, 'spark', () => VOLT, {
          speed: 3.2,
          vy: [0.6, 1.6],
          life: 0.35,
          size: 0.07,
          gravity: 4,
        });
        return;
      case 'rainbow':
        this.ring(n, x, 'glint', (i) => RAINBOW_CSS[i % RAINBOW_CSS.length] ?? GOLD, {
          speed: 2.4,
          vy: [1.0, 2.0],
          life: 0.7,
          size: 0.15,
          gravity: 1,
        });
        return;
    }
  }

  /** 걸음과 상관없이 계속 조금씩 나오는 것 — dt 는 양(amount)이 곱해진 시간 */
  private continuous(kind: TrailId, x: number, dt: number): void {
    const rate = kind === 'gold' ? 10 : kind === 'ember' ? 6 : 0;
    if (rate === 0) return;
    this.acc += dt * rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (kind === 'gold') {
        this.kick(1, x, 'glint', () => GOLD, {
          vy: [0.4, 1.0],
          spread: 0.5,
          life: 0.6,
          size: 0.1,
          gravity: 0.4,
        });
      } else {
        this.kick(1, x, 'spark', () => EMBER, {
          vy: [1.0, 2.0],
          spread: 0.4,
          life: 0.45,
          size: 0.05,
          gravity: -0.8,
        });
      }
    }
  }

  /** 무지개 리본 — 발 뒤로 이어지는 점. 점프하면 리본도 함께 떠오른다 */
  private growRibbon(inp: TrailInput): void {
    const head = v3(inp.x, inp.y + 0.03, 0);
    const last = this.ribbon[this.ribbon.length - 1];
    if (!last || -last.z >= RIBBON_STEP) {
      this.ribbon.push(head);
      if (this.ribbon.length > RIBBON_MAX) this.ribbon.shift();
    }
  }

  // ---------- 그리기 ----------

  draw(scene: Scene, kind: TrailId, t: number, footX: number, footY: number): void {
    if (kind === 'rainbow') this.drawRibbon(scene, v3(footX, footY + 0.03, 0));
    for (const pr of this.prints) this.drawPrint(scene, pr);
    for (const b of this.bolts) this.drawBolt(scene, b);
    for (const p of this.parts) this.drawParticle(scene, p, t);
  }

  private drawRibbon(scene: Scene, head: Vec3): void {
    // 가장 최근 점과 지금 발 위치를 이어서 리본이 발에서 끊기지 않게
    const pts = [...this.ribbon, head];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i] as Vec3;
      const b = pts[i + 1] as Vec3;
      // 뒤(오래된 쪽)로 갈수록 흐려지고 가늘어진다
      const k = (i + 1) / n;
      const wa = RIBBON_W * (0.4 + 0.6 * (i / n));
      const wb = RIBBON_W * (0.4 + 0.6 * k);
      for (let s = 0; s < RAINBOW.length; s++) {
        const f0 = s / RAINBOW.length - 0.5;
        const f1 = (s + 1) / RAINBOW.length - 0.5;
        scene.face(
          [
            v3(a.x + f0 * wa, a.y, a.z),
            v3(a.x + f1 * wa, a.y, a.z),
            v3(b.x + f1 * wb, b.y, b.z),
            v3(b.x + f0 * wb, b.y, b.z),
          ],
          RAINBOW[s] as RGB,
          { emissive: true, alpha: 0.75 * k },
        );
      }
    }
  }

  private drawPrint(scene: Scene, pr: Print): void {
    const k = pr.life / pr.max;
    scene.sprite(v3(pr.x, 0.02, pr.z), (ctx, sx, sy, s) => {
      ctx.save();
      // 뜨거울 땐 노랗게, 식을수록 붉고 어둡게
      const hot = Math.min(1, k * 1.4);
      const r = 255;
      const g = Math.round(90 + 150 * hot * hot);
      const b = Math.round(40 + 60 * hot * hot * hot);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 0.25);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.5 * k})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.9 * k})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, s * 0.07, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  private drawBolt(scene: Scene, b: Bolt): void {
    const k = b.life / b.max;
    scene.sprite(v3(b.x, 0.05, b.z), (ctx, sx, sy, s) => {
      const reach = s * (b.big ? 1.5 : 0.8);
      const arms = b.big ? 7 : 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      // 매 프레임 새로 꺾여서 지지직거린다
      const paths: [number, number][][] = [];
      for (let i = 0; i < arms; i++) {
        const a = (i / arms) * Math.PI * 2 + Math.random() * 0.6;
        const path: [number, number][] = [[sx, sy]];
        for (let j = 1; j <= 4; j++) {
          const d = (reach * j) / 4;
          const off = (Math.random() - 0.5) * reach * 0.35;
          path.push([
            sx + Math.cos(a) * d - Math.sin(a) * off,
            // 땅에 누운 모양이라 세로는 납작하게
            sy + (Math.sin(a) * d + Math.cos(a) * off) * 0.45,
          ]);
        }
        paths.push(path);
      }
      // 발밑이 파랗게 번쩍 → 넓고 옅은 파란 선 → 가늘고 흰 심
      const flash = ctx.createRadialGradient(sx, sy, 0, sx, sy, reach * 0.7);
      flash.addColorStop(0, `rgba(${VOLT}, ${0.45 * k})`);
      flash.addColorStop(1, `rgba(${VOLT}, 0)`);
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.ellipse(sx, sy, reach * 0.7, reach * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [width, color] of [
        [s * 0.11, `rgba(${VOLT}, ${0.45 * k})`],
        [s * 0.035, `rgba(240, 250, 255, ${k})`],
      ] as const) {
        ctx.lineWidth = Math.max(1, width);
        ctx.strokeStyle = color;
        for (const path of paths) {
          ctx.beginPath();
          path.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  private drawParticle(scene: Scene, p: Particle, t: number): void {
    const k = p.life / p.max;
    scene.sprite(v3(p.x, p.y, p.z), (ctx, sx, sy, s) => {
      ctx.save();
      if (p.shape === 'puff') {
        ctx.fillStyle = `rgba(${p.color}, ${0.4 * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s * p.size * (0.6 + (1 - k) * 0.9), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'leaf') {
        ctx.fillStyle = `rgba(${p.color}, ${Math.min(1, k * 1.6)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, s * p.size, s * p.size * 0.42, p.seed * 6 + t * 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        const r = s * p.size * (0.5 + 0.5 * k);
        ctx.fillStyle = `rgba(${p.color}, ${0.3 * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${p.color}, ${k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 반짝이는 네 갈래 별
        const r = s * p.size * (0.45 + 0.55 * Math.abs(Math.sin(t * 22 + p.seed * 10)));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${p.color}, ${k})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r * 0.22, sy - r * 0.22);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx + r * 0.22, sy + r * 0.22);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r * 0.22, sy + r * 0.22);
        ctx.lineTo(sx - r, sy);
        ctx.lineTo(sx - r * 0.22, sy - r * 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }
}
