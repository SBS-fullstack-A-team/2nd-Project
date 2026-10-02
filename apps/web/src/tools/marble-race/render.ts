import { MARBLE_R, STEPS_PER_SEC, TRACK } from './config';
import type { Marble, Race, RaceEvent } from './race';
import type { Feature, TrackPoint } from './track';

/** 트랙 테마 — 매 판 시드로 하나를 고른다 */
interface Palette {
  name: string;
  ground: [string, string];
  track: string;
  racingLine: string;
  kerb: [string, string];
  barrier: string;
  barrierLight: string;
  /** 어두운 테마는 글자·효과를 밝게 */
  dark: boolean;
}

const PALETTES: Palette[] = [
  {
    name: '🏁 그린 서킷',
    ground: ['#4f9d43', '#58a84b'],
    track: '#565c67',
    racingLine: 'rgba(0,0,0,0.10)',
    kerb: ['#e53935', '#ffffff'],
    barrier: '#2b2f3a',
    barrierLight: '#9aa3b5',
    dark: false,
  },
  {
    name: '🏜️ 사막 랠리',
    ground: ['#e2bb75', '#d9b067'],
    track: '#6a5f55',
    racingLine: 'rgba(0,0,0,0.12)',
    kerb: ['#ff8a00', '#ffffff'],
    barrier: '#5a3d22',
    barrierLight: '#c99a62',
    dark: false,
  },
  {
    name: '🌃 네온 나이트',
    ground: ['#0e1233', '#121741'],
    track: '#262b48',
    racingLine: 'rgba(120,140,255,0.10)',
    kerb: ['#ff3cac', '#2de2e6'],
    barrier: '#05060f',
    barrierLight: '#7b5cff',
    dark: true,
  },
  {
    name: '❄️ 스노우 컵',
    ground: ['#e9f1f8', '#dde8f2'],
    track: '#7b8594',
    racingLine: 'rgba(255,255,255,0.12)',
    kerb: ['#1e6fe8', '#ffffff'],
    barrier: '#3a4658',
    barrierLight: '#c3d1e3',
    dark: false,
  },
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Ticker {
  text: string;
  kind: RaceEvent['kind'];
  shownAt: number;
}

export type Follow = 'lead' | 'tail';

const TICKER_MS = 2600;
const TRAIL_LENGTH = 12;
/** 이름표를 모두 붙이는 최대 구슬 수 (더 많으면 앞쪽 몇 개만) */
const LABEL_ALL_LIMIT = 24;
const LABEL_TOP = 6;

/**
 * 구슬 레이스 화면 그리기 — 카메라·잔상·불꽃·자막처럼 화면에만 필요한 상태를 가진다.
 * 레이스 계산(Race)은 건드리지 않는다.
 */
export class RaceRenderer {
  private readonly palette: Palette;
  private camera = { x: 0, y: 0, zoom: 0.5, ready: false };
  private readonly trails = new Map<number, { x: number; y: number }[]>();
  private particles: Particle[] = [];
  private confetti: Particle[] = [];
  private ticker: Ticker | null = null;
  private eventCursor = 0;
  private impactStep = 0;
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private time = 0;
  private doneAt: number | null = null;
  /** 이번 프레임에 보이는 트랙 면 — 바닥에 깔리는 장치(가속 패드·진흙·구멍)가 트랙 밖으로 삐져나가지 않게 자른다 */
  private trackClip: Path2D | null = null;

  constructor(private readonly race: Race) {
    this.palette = PALETTES[race.seed % PALETTES.length] ?? PALETTES[0]!;
  }

  get trackName(): string {
    return this.palette.name;
  }

  /** 한 프레임 — dtMs 는 실제 흐른 시간(연출용), 레이스 진행과는 별개 */
  frame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dtMs: number,
    follow: Follow,
  ) {
    this.time += dtMs;
    this.consumeEvents();
    this.updateCamera(width, height, follow);
    this.updateEffects(dtMs);

    const { x, y, zoom } = this.camera;
    const view = {
      left: x - width / 2 / zoom,
      right: x + width / 2 / zoom,
      top: y - height / 2 / zoom,
      bottom: y + height / 2 / zoom,
    };

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
    this.drawGround(ctx, view);
    this.drawTrack(ctx, view);
    this.drawFeatures(ctx, view);
    this.drawMarbles(ctx, view, follow);
    this.drawParticles(ctx);
    ctx.restore();

    this.drawHud(ctx, width, height);
  }

  // ───────────── 카메라 ─────────────

  /** 따라갈 무리(선두 또는 꼴찌 근처)가 다 들어오도록 위치와 확대를 정한다 */
  private updateCamera(width: number, height: number, follow: Follow) {
    const race = this.race;
    const running = race.running;
    let targets: { x: number; y: number }[];
    if (race.phase === 'countdown' || running.length === 0) {
      targets = race.phase === 'countdown' ? race.marbles.map((m) => m.body.position) : [];
    } else {
      const head = follow === 'lead' ? running[0]! : running[running.length - 1]!;
      const group = (follow === 'lead' ? running : [...running].reverse())
        .filter((m) => Math.abs(m.progress - head.progress) < 650)
        .slice(0, 10);
      // 선두를 따라갈 땐 앞쪽 트랙도 조금 보이게
      const ahead = this.pointAtS(head.progress + 320);
      targets = [...group.map((m) => m.body.position), ahead];
    }
    if (targets.length === 0) return;

    const xs = targets.map((p) => p.x);
    const ys = targets.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 220;
    const fit = Math.min(width / (maxX - minX + pad * 2), height / (maxY - minY + pad * 2));
    const zoom = Math.min(Math.max(fit, width / 2600), 1.35);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    if (!this.camera.ready) {
      this.camera = { x: cx, y: cy, zoom, ready: true };
      return;
    }
    this.camera.x += (cx - this.camera.x) * 0.08;
    this.camera.y += (cy - this.camera.y) * 0.08;
    this.camera.zoom += (zoom - this.camera.zoom) * 0.04;
  }

  private pointAtS(s: number) {
    const points = this.race.track.points;
    const p = points[Math.min(Math.max(Math.round(s / TRACK.sample), 0), points.length - 1)]!;
    return { x: p.x, y: p.y };
  }

  // ───────────── 바닥·트랙 ─────────────

  private drawGround(ctx: CanvasRenderingContext2D, view: Viewport) {
    const [a, b] = this.palette.ground;
    ctx.fillStyle = a;
    ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    // 잔디 깎은 줄무늬
    ctx.fillStyle = b;
    const band = 180;
    for (let x = Math.floor(view.left / band / 2) * band * 2; x < view.right; x += band * 2) {
      ctx.fillRect(x, view.top, band, view.bottom - view.top);
    }
  }

  /** 화면에 보이는 가운데선 점 범위 */
  private visiblePoints(view: Viewport): TrackPoint[] {
    const margin = TRACK.wideHalfWidth + TRACK.wallThickness + 40;
    return this.race.track.points.filter(
      (p) =>
        p.x > view.left - margin &&
        p.x < view.right + margin &&
        p.y > view.top - margin * 2 &&
        p.y < view.bottom + margin * 2,
    );
  }

  /**
   * 가운데선에서 offset 만큼 떨어진 선을 경로에 더한다.
   * connect 가 true 면 앞 경로에 이어 그린다 (트랙 면처럼 한 바퀴 도는 다각형을 만들 때).
   */
  private edge(
    points: TrackPoint[],
    offset: (p: TrackPoint) => number,
    path: CanvasPath,
    connect = false,
  ) {
    points.forEach((p, i) => {
      const o = offset(p);
      const x = p.x + p.nx * o;
      const y = p.y + p.ny * o;
      if (i === 0 && !connect) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
  }

  /** 트랙 면(아스팔트) 다각형 — 왼쪽 가장자리를 따라갔다가 오른쪽 가장자리로 돌아온다 */
  private surface(points: TrackPoint[], extra: number): Path2D {
    const path = new Path2D();
    this.edge(points, (p) => p.w + extra, path);
    this.edge([...points].reverse(), (p) => -(p.w + extra), path, true);
    path.closePath();
    return path;
  }

  private drawTrack(ctx: CanvasRenderingContext2D, view: Viewport) {
    const points = this.visiblePoints(view);
    if (points.length < 2) return;
    const pal = this.palette;
    const startS = points[0]!.s;
    const wall = TRACK.wallThickness;

    // 트랙 밖 그림자(살짝 파인 느낌) → 아스팔트
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill(this.surface(points, wall * 0.9));
    this.trackClip = this.surface(points, 0);
    ctx.fillStyle = pal.track;
    ctx.fill(this.trackClip);

    // 레이싱 라인 (가운데 살짝 어두운 띠)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.edge(points, () => 0, ctx);
    ctx.strokeStyle = pal.racingLine;
    ctx.lineWidth = TRACK.halfWidth * 0.7;
    ctx.stroke();

    // 연석 (빨강·흰색 줄무늬) — 줄무늬 위치가 카메라를 따라 흔들리지 않게 거리 기준으로 맞춘다
    for (const side of [1, -1]) {
      ctx.beginPath();
      this.edge(points, (p) => side * (p.w - 7), ctx);
      ctx.lineWidth = 14;
      ctx.setLineDash([]);
      ctx.strokeStyle = pal.kerb[1];
      ctx.stroke();
      ctx.setLineDash([26, 26]);
      ctx.lineDashOffset = -startS;
      ctx.strokeStyle = pal.kerb[0];
      ctx.stroke();
      ctx.setLineDash([]);

      // 가드레일
      ctx.beginPath();
      this.edge(points, (p) => side * (p.w + wall * 0.35), ctx);
      ctx.lineWidth = wall * 0.5;
      ctx.strokeStyle = pal.barrier;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = pal.barrierLight;
      ctx.stroke();
    }

    this.drawStartLine(ctx);
    this.drawFinishLine(ctx);
  }

  /** 트랙을 가로지르는 선을 그리기 위한 좌표계 — 원점이 (s) 지점, x 가 진행 방향, y 가 왼쪽 */
  private withFrameAt(ctx: CanvasRenderingContext2D, s: number, draw: (w: number) => void) {
    const points = this.race.track.points;
    const p = points[Math.min(Math.max(Math.round(s / TRACK.sample), 0), points.length - 1)]!;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.ty, p.tx));
    draw(p.w);
    ctx.restore();
  }

  private drawStartLine(ctx: CanvasRenderingContext2D) {
    const race = this.race;
    this.withFrameAt(ctx, race.track.startS, (w) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-4, -w, 8, w * 2);
      if (race.phase === 'countdown') {
        // 출발 문 (빨간 막대)
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(10, -w, 8, w * 2);
      }
    });
  }

  private drawFinishLine(ctx: CanvasRenderingContext2D) {
    this.withFrameAt(ctx, this.race.track.finishS, (w) => {
      const size = 16;
      for (let row = 0; row < 3; row++) {
        for (let y = -w, i = 0; y < w; y += size, i++) {
          ctx.fillStyle = (i + row) % 2 ? '#fff' : '#111';
          ctx.fillRect(row * size - size * 1.5, y, size, Math.min(size, w - y));
        }
      }
      // 결승 아치 (트랙 위에 걸린 현수막)
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(40, -w - 30, 26, w * 2 + 60);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(30, -w - 30, 26, w * 2 + 60);
      ctx.save();
      ctx.translate(43, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F I N I S H', 0, 0);
      ctx.restore();
    });
  }

  // ───────────── 장치 ─────────────

  private drawFeatures(ctx: CanvasRenderingContext2D, view: Viewport) {
    for (const f of this.race.track.features) {
      if (f.x < view.left - 300 || f.x > view.right + 300) continue;
      if (f.y < view.top - 300 || f.y > view.bottom + 300) continue;
      const onFloor = f.kind === 'boost' || f.kind === 'mud' || f.kind === 'hole';
      if (onFloor && this.trackClip) {
        ctx.save();
        ctx.clip(this.trackClip);
      }
      switch (f.kind) {
        case 'boost':
          this.drawBoost(ctx, f);
          break;
        case 'mud':
          this.drawMud(ctx, f);
          break;
        case 'hole':
          this.drawHole(ctx, f);
          break;
        case 'bumper':
          this.drawBumper(ctx, f);
          break;
        case 'spinner':
          this.drawSpinner(ctx, f);
          break;
      }
      if (onFloor && this.trackClip) ctx.restore();
    }
  }

  private drawBoost(ctx: CanvasRenderingContext2D, f: Feature) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    const l = f.length / 2;
    const w = f.width / 2;
    ctx.fillStyle = 'rgba(0, 255, 170, 0.22)';
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.9)';
    ctx.lineWidth = 3;
    roundRect(ctx, -l, -w, l * 2, w * 2, 12);
    ctx.fill();
    ctx.stroke();
    // 앞으로 흐르는 화살표
    const shift = ((this.time / 8) % 50) - 25;
    ctx.strokeStyle = 'rgba(210, 255, 240, 0.95)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.beginPath();
    ctx.rect(-l, -w, l * 2, w * 2);
    ctx.clip();
    for (let x = -l - 25; x < l + 25; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x + shift - 12, -w * 0.5);
      ctx.lineTo(x + shift + 8, 0);
      ctx.lineTo(x + shift - 12, w * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  private drawMud(ctx: CanvasRenderingContext2D, f: Feature) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.fillStyle = '#6b4a2b';
    ctx.beginPath();
    ctx.ellipse(0, 0, f.length / 2, f.width / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#563a20';
    // 웅덩이 무늬 (위치는 장치마다 고정)
    for (let i = 0; i < 7; i++) {
      const a = (i * 2.4 + f.s) % (Math.PI * 2);
      const r = ((i * 37 + f.s) % 60) / 100 + 0.2;
      ctx.beginPath();
      ctx.ellipse(
        Math.cos(a) * (f.length / 2) * r,
        Math.sin(a) * (f.width / 2) * r,
        18 + (i % 3) * 6,
        10 + (i % 2) * 5,
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(
      -f.length * 0.12,
      -f.width * 0.15,
      f.length * 0.18,
      f.width * 0.08,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  private drawHole(ctx: CanvasRenderingContext2D, f: Feature) {
    const gradient = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(0.75, '#0b0b10');
    gradient.addColorStop(1, '#2a2a33');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    // 노랑·검정 경고 테두리
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.setLineDash([12, 12]);
    ctx.lineDashOffset = this.time / 40;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawBumper(ctx: CanvasRenderingContext2D, f: Feature) {
    // 최근에 부딪혔으면 살짝 커지며 번쩍인다
    const hit = this.race.impacts.some(
      (i) => this.race.step - i.step < 8 && Math.hypot(i.x - f.x, i.y - f.y) < f.r + MARBLE_R + 4,
    );
    const r = f.r * (hit ? 1.12 : 1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(f.x + 4, f.y + 6, r, 0, Math.PI * 2);
    ctx.fill();
    const rings = ['#d32f2f', '#ffffff', '#d32f2f'];
    rings.forEach((color, i) => {
      ctx.fillStyle = hit && i === 1 ? '#fff59d' : color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * (1 - i * 0.3), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(f.x - r * 0.35, f.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSpinner(ctx: CanvasRenderingContext2D, f: Feature) {
    if (!f.body) return;
    const angle = f.body.angle;
    const { x, y } = f.body.position;
    for (const [dx, dy, color] of [
      [5, 8, 'rgba(0,0,0,0.28)'],
      [0, 0, '#cfd6e2'],
    ] as const) {
      ctx.save();
      ctx.translate(x + dx, y + dy);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      roundRect(ctx, -f.length / 2, -f.width / 2, f.length, f.width, f.width / 2);
      ctx.fill();
      if (dx === 0) {
        // 위험 표시 줄무늬
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#ffb300';
        for (let s = -f.length / 2; s < f.length / 2; s += 28) {
          ctx.beginPath();
          ctx.moveTo(s, f.width / 2);
          ctx.lineTo(s + 12, -f.width / 2);
          ctx.lineTo(s + 24, -f.width / 2);
          ctx.lineTo(s + 12, f.width / 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = '#3a4150';
        ctx.lineWidth = 2;
        roundRect(ctx, -f.length / 2, -f.width / 2, f.length, f.width, f.width / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#3a4150';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa3b5';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ───────────── 구슬 ─────────────

  /** 광택 있는 구슬 그림 — 색마다 한 번만 그려 두고 재사용한다 */
  private sprite(color: string): HTMLCanvasElement {
    const cached = this.sprites.get(color);
    if (cached) return cached;
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d')!;
    const r = size / 2;
    const body = c.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.18, color);
    body.addColorStop(0.85, color);
    body.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = body;
    c.beginPath();
    c.arc(r, r, r - 1, 0, Math.PI * 2);
    c.fill();
    // 아래쪽 반사광
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.ellipse(r * 1.1, r * 1.55, r * 0.45, r * 0.18, -0.3, 0, Math.PI * 2);
    c.fill();
    // 위쪽 하이라이트
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.ellipse(r * 0.68, r * 0.55, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(r, r, r - 1.5, 0, Math.PI * 2);
    c.stroke();
    this.sprites.set(color, canvas);
    return canvas;
  }

  private drawMarbles(ctx: CanvasRenderingContext2D, view: Viewport, follow: Follow) {
    const race = this.race;
    const running = race.running;
    const visible = (m: Marble) => {
      const { x, y } = m.body.position;
      return x > view.left - 40 && x < view.right + 40 && y > view.top - 40 && y < view.bottom + 40;
    };

    // 잔상 — 앞쪽 몇 개만
    const trailed = new Set((follow === 'lead' ? running : [...running].reverse()).slice(0, 10));
    for (const marble of race.marbles) {
      const trail = this.trails.get(marble.id) ?? [];
      if (marble.rank !== undefined || !trailed.has(marble)) {
        this.trails.delete(marble.id);
        continue;
      }
      trail.push({ x: marble.body.position.x, y: marble.body.position.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
      this.trails.set(marble.id, trail);
      if (trail.length < 2 || !visible(marble)) continue;
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]!;
        const b = trail[i]!;
        ctx.strokeStyle = marble.color;
        ctx.globalAlpha = (i / trail.length) * 0.45;
        ctx.lineWidth = MARBLE_R * 1.4 * (i / trail.length);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 그림자 → 구슬
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (const m of running) {
      if (!visible(m)) continue;
      ctx.beginPath();
      ctx.ellipse(
        m.body.position.x + 3,
        m.body.position.y + 5,
        MARBLE_R,
        MARBLE_R * 0.8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    for (const m of running) {
      if (!visible(m)) continue;
      // 구멍에서 막 나온 구슬은 1초 동안 깜빡인다
      const sinceRespawn = race.step - m.respawnStep;
      ctx.globalAlpha = sinceRespawn < STEPS_PER_SEC && Math.floor(sinceRespawn / 6) % 2 ? 0.35 : 1;
      const { x, y } = m.body.position;
      ctx.drawImage(this.sprite(m.color), x - MARBLE_R, y - MARBLE_R, MARBLE_R * 2, MARBLE_R * 2);
      if (m.zone === 'boost') {
        ctx.strokeStyle = 'rgba(0,255,170,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, MARBLE_R + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 이름표 — 순위 배지 + 이름 (글자 크기는 화면 기준으로 고정)
    const ordered = follow === 'lead' ? running : [...running].reverse();
    const labeled = running.length <= LABEL_ALL_LIMIT ? ordered : ordered.slice(0, LABEL_TOP);
    const scale = 1 / this.camera.zoom;
    ctx.font = `700 ${13 * scale}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    // 앞선 구슬부터 자리를 잡고, 겹치면 위로 한두 칸 올려 본다. 그래도 겹치면 생략 (맨 앞 구슬은 항상 표시)
    const placed: TagLayout[] = [];
    labeled.forEach((m, priority) => {
      if (!visible(m)) return;
      const place = race.arrivals.length + running.indexOf(m) + 1;
      const base = this.tagLayout(ctx, m, place, scale);
      for (let lift = 0; lift < 3; lift++) {
        const tag = { ...base, top: base.top - lift * (base.h + 4 * scale), lifted: lift > 0 };
        if (priority === 0 || !placed.some((p) => overlaps(p, tag))) {
          placed.push(tag);
          return;
        }
      }
    });
    // 뒤쪽부터 그려서 선두 이름표가 맨 위에 오게
    for (const tag of [...placed].reverse()) {
      this.drawNameTag(ctx, tag, scale, tag.place === 1 && race.mode === 'first');
    }
  }

  private tagLayout(
    ctx: CanvasRenderingContext2D,
    m: Marble,
    place: number,
    scale: number,
  ): TagLayout {
    const { x, y } = m.body.position;
    const pad = 6 * scale;
    const badgeW = ctx.measureText(String(place)).width + pad * 1.4;
    const w = badgeW + ctx.measureText(m.name).width + pad * 2;
    const h = 20 * scale;
    return {
      marble: m,
      place,
      x,
      y,
      badgeW,
      w,
      h,
      left: x - w / 2,
      top: y - MARBLE_R - h - 8 * scale,
      lifted: false,
    };
  }

  private drawNameTag(
    ctx: CanvasRenderingContext2D,
    tag: TagLayout,
    scale: number,
    crown: boolean,
  ) {
    const { marble: m, place, x, y, badgeW, w, h, left, top } = tag;
    const badge = String(place);
    const text = m.name;
    const pad = 6 * scale;
    // 위로 올린 이름표는 구슬과 선으로 잇는다
    if (tag.lifted) {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y - MARBLE_R);
      ctx.lineTo(x, top + h);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(12, 14, 30, 0.82)';
    roundRect(ctx, left, top, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    ctx.fillStyle = place === 1 ? '#ffd23f' : place <= 3 ? '#c9d1ff' : '#8a93b0';
    roundRect(ctx, left + 2 * scale, top + 2 * scale, badgeW, h - 4 * scale, (h - 4 * scale) / 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.fillText(badge, left + 2 * scale + badgeW / 2, top + h / 2 + scale);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(text, left + badgeW + pad, top + h / 2 + scale);
    if (crown) {
      ctx.textAlign = 'center';
      ctx.font = `${18 * scale}px system-ui, sans-serif`;
      ctx.fillText('👑', x, top - 10 * scale);
      ctx.font = `700 ${13 * scale}px system-ui, sans-serif`;
    }
  }

  // ───────────── 효과 ─────────────

  private consumeEvents() {
    const race = this.race;
    while (this.eventCursor < race.events.length) {
      const event = race.events[this.eventCursor++]!;
      this.ticker = { text: event.text, kind: event.kind, shownAt: this.time };
    }
    for (const impact of race.impacts) {
      if (impact.step <= this.impactStep) continue;
      const count = Math.min(10, Math.round(impact.strength));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 1 + Math.random() * impact.strength * 0.6;
        this.particles.push({
          x: impact.x,
          y: impact.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0,
          maxLife: 250 + Math.random() * 250,
          color: Math.random() < 0.5 ? '#fff59d' : '#ffffff',
          size: 2 + Math.random() * 2,
        });
      }
    }
    this.impactStep = race.step;
    if (race.phase === 'done' && this.doneAt === null) {
      this.doneAt = this.time;
      this.spawnConfetti();
    }
  }

  private spawnConfetti() {
    const colors = ['#ffd23f', '#ff5c8a', '#4fd1c5', '#7f93ff', '#ffffff', '#a3e635'];
    for (let i = 0; i < 160; i++) {
      this.confetti.push({
        x: Math.random(),
        y: -Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.0004,
        vy: 0.0002 + Math.random() * 0.0004,
        life: 0,
        maxLife: 3500 + Math.random() * 1500,
        color: colors[i % colors.length]!,
        size: 6 + Math.random() * 6,
      });
    }
  }

  private updateEffects(dtMs: number) {
    for (const p of this.particles) {
      p.life += dtMs;
      p.x += p.vx * (dtMs / 16);
      p.y += p.vy * (dtMs / 16);
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife).slice(-400);
    for (const c of this.confetti) {
      c.life += dtMs;
      c.x += c.vx * dtMs;
      c.y += c.vy * dtMs;
    }
    this.confetti = this.confetti.filter((c) => c.life < c.maxLife);
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ───────────── 화면 위 정보 (HUD) ─────────────

  private drawHud(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const race = this.race;
    if (race.dramatic) this.drawSlowMotion(ctx, width, height);
    this.drawMinimap(ctx, width, height);
    this.drawTopInfo(ctx, width);
    if (race.phase === 'countdown') this.drawLights(ctx, width, height);
    this.drawTicker(ctx, width);
    this.drawConfetti(ctx, width, height);
  }

  /** F1 출발 신호등 — 1초마다 빨간불이 하나씩 켜지고, 출발하면 전부 초록불 */
  private drawLights(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const race = this.race;
    const lit = Math.min(3, Math.floor(race.step / STEPS_PER_SEC) + 1);
    const size = Math.min(width, height) * 0.075;
    const gap = size * 0.35;
    const panelW = size * 3 + gap * 4;
    const panelH = size + gap * 2;
    const left = width / 2 - panelW / 2;
    const top = 16;
    ctx.fillStyle = 'rgba(10,10,14,0.92)';
    roundRect(ctx, left, top, panelW, panelH, gap);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const cx = left + gap + size / 2 + i * (size + gap);
      const cy = top + panelH / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = i < lit ? '#ff2d2d' : '#2a1414';
      if (i < lit) {
        ctx.shadowColor = '#ff2d2d';
        ctx.shadowBlur = size * 0.5;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 트랙 이름 띠
    const label = `${this.palette.name} · 구슬 ${race.marbles.length}개`;
    const fontSize = Math.max(14, size * 0.36);
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const labelW = ctx.measureText(label).width + fontSize * 1.6;
    const labelH = fontSize * 1.8;
    const labelTop = top + panelH + 8;
    ctx.fillStyle = 'rgba(10,12,28,0.85)';
    roundRect(ctx, width / 2 - labelW / 2, labelTop, labelW, labelH, labelH / 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, width / 2, labelTop + labelH / 2 + 1);
  }

  private drawTicker(ctx: CanvasRenderingContext2D, width: number) {
    const ticker = this.ticker;
    if (!ticker) return;
    const age = this.time - ticker.shownAt;
    // 결승·사진 판정 자막은 끝까지 남긴다
    const sticky = ticker.kind === 'finish' || ticker.kind === 'photo';
    if (!sticky && age > TICKER_MS) return;
    const slide = Math.min(1, age / 180);
    const fade = sticky ? 1 : Math.min(1, (TICKER_MS - age) / 300);
    const size = Math.max(18, Math.min(30, width * 0.028));
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    const textW = ctx.measureText(ticker.text).width;
    const w = textW + size * 1.6;
    const h = size * 1.8;
    const x = width / 2 - w / 2;
    // 좁은 화면(휴대폰)에서는 왼쪽 위 시간 상자와 겹치지 않게 그 아래에 띄운다
    const y = (width < 560 ? 76 : 14) + (1 - slide) * -40;
    const accent =
      ticker.kind === 'hole'
        ? '#ff5c5c'
        : ticker.kind === 'finish' || ticker.kind === 'photo'
          ? '#ffd23f'
          : '#ff9f1c';
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(10,12,28,0.88)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ticker.text, width / 2, y + h / 2 + 1);
    ctx.globalAlpha = 1;
  }

  /** 왼쪽 위 — 시간·남은 거리 */
  private drawTopInfo(ctx: CanvasRenderingContext2D, width: number) {
    const race = this.race;
    if (race.phase === 'countdown') return;
    const leader = race.running[0];
    const remaining = leader ? Math.max(0, race.track.finishS - leader.progress) : 0;
    const size = Math.max(12, Math.min(16, width * 0.014));
    const lines = [
      `⏱ ${race.elapsedSec.toFixed(1)}초`,
      `🏁 남은 거리 ${Math.round(remaining / 10)}m`,
    ];
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.4;
    const h = size * 1.6 * lines.length + size * 0.6;
    ctx.fillStyle = 'rgba(10,12,28,0.75)';
    roundRect(ctx, 12, 12, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) =>
      ctx.fillText(line, 12 + size * 0.7, 12 + size * 0.5 + i * size * 1.6),
    );
  }

  /** 아래쪽 미니맵 — 트랙 전체와 구슬 위치, 지금 보고 있는 범위 */
  private drawMinimap(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const race = this.race;
    const { bounds, points } = race.track;
    const mapW = Math.min(width - 24, 720);
    const mapH = Math.max(46, Math.min(70, height * 0.1));
    const left = (width - mapW) / 2;
    const top = height - mapH - 12;
    const sx = (mapW - 24) / (bounds.maxX - bounds.minX);
    const sy = (mapH - 18) / (bounds.maxY - bounds.minY);
    const toMap = (x: number, y: number) => ({
      x: left + 12 + (x - bounds.minX) * sx,
      y: top + 9 + (y - bounds.minY) * sy,
    });

    ctx.fillStyle = 'rgba(10,12,28,0.72)';
    roundRect(ctx, left, top, mapW, mapH, 10);
    ctx.fill();
    ctx.beginPath();
    points.forEach((p, i) => {
      const m = toMap(p.x, p.y);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 카메라가 보고 있는 범위
    const viewW = width / this.camera.zoom;
    const viewH = height / this.camera.zoom;
    const a = toMap(this.camera.x - viewW / 2, this.camera.y - viewH / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a.x, Math.max(top + 2, a.y), viewW * sx, Math.min(mapH - 4, viewH * sy));

    // 결승 깃발
    const finish = this.pointAtS(race.track.finishS);
    const f = toMap(finish.x, finish.y);
    ctx.font = `${mapH * 0.38}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('🏁', f.x, f.y + 4);

    // 구슬 점 — 선두는 크게
    const running = race.running;
    for (let i = running.length - 1; i >= 0; i--) {
      const m = running[i]!;
      const p = toMap(m.body.position.x, m.body.position.y);
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  /** 접전 슬로모션 — 위아래 검은 띠 + 문구 */
  private drawSlowMotion(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const bar = height * 0.08;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, width, bar);
    ctx.fillRect(0, height - bar, width, bar);
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.3,
      width / 2,
      height / 2,
      height,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.font = `900 ${Math.max(14, bar * 0.45)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time / 120);
    ctx.fillText('● SLOW MOTION — 접전!', width - 20, height - bar / 2);
    ctx.globalAlpha = 1;
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, width: number, height: number) {
    for (const c of this.confetti) {
      const x = c.x * width;
      const y = c.y * height;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.life / 200 + c.size);
      ctx.globalAlpha = Math.min(1, (c.maxLife - c.life) / 600);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

interface TagLayout {
  marble: Marble;
  place: number;
  x: number;
  y: number;
  badgeW: number;
  w: number;
  h: number;
  left: number;
  top: number;
  lifted: boolean;
}

function overlaps(a: TagLayout, b: TagLayout): boolean {
  return (
    a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h
  );
}

interface Viewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}
