import type { Ball, Board, Slot } from './board';

/** 공이 칸에 들어갈 때 튀는 불꽃 */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** 다 끝났을 때 뿌리는 꽃가루 */
interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  color: string;
}

const TRAIL_LENGTH = 14;
/** 결과 카드가 뒤집히는 시간 (스텝) */
const FLIP_STEPS = 24;
const CONFETTI_COLORS = ['#ffd23f', '#ff5c8a', '#4fd1c5', '#7f93ff', '#ffffff'];

/**
 * 핀볼 사다리 그리기 — Board 상태를 캔버스에 그린다 (물리 계산은 하지 않는다).
 * 추첨판 좌표를 캔버스 크기에 맞게 통째로 줄이고 늘려서 그린다.
 */
export class BoardRenderer {
  private readonly board: Board;
  private readonly hideResults: boolean;
  private trail: { x: number; y: number }[] = [];
  private trailBallId = -1;
  private sparks: Spark[] = [];
  private confetti: Confetti[] = [];
  private landedSeen = 0;
  private confettiDone = false;
  private time = 0;

  constructor(board: Board, hideResults: boolean) {
    this.board = board;
    this.hideResults = hideResults;
  }

  frame(ctx: CanvasRenderingContext2D, width: number, height: number, dtMs: number): void {
    const { layout } = this.board;
    this.time += dtMs / 1000;
    this.collectEffects();

    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#1b1f45');
    bg.addColorStop(1, '#0a0c1f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 추첨판 좌표 → 화면 (가운데 맞춤, 비율 유지)
    const pad = 12;
    const scale = Math.min((width - pad * 2) / layout.width, (height - pad * 2) / layout.height);
    const ox = (width - layout.width * scale) / 2;
    const oy = (height - layout.height * scale) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    this.drawFrame(ctx);
    this.drawPegs(ctx);
    this.drawSlots(ctx);
    this.drawLabels(ctx);
    this.drawWaiting(ctx);
    this.drawFalling(ctx);
    this.drawSparks(ctx, dtMs);
    ctx.restore();

    this.drawConfetti(ctx, width, height, dtMs);
  }

  /** 새로 들어간 공이 있으면 불꽃, 다 끝나면 꽃가루 */
  private collectEffects(): void {
    const landed = this.board.slots
      .filter((s) => s.ballId !== undefined)
      .sort((a, b) => (a.landStep ?? 0) - (b.landStep ?? 0));
    for (const slot of landed.slice(this.landedSeen)) {
      const ball = this.board.balls[slot.ballId!];
      if (!ball) continue;
      const cx = (slot.x0 + slot.x1) / 2;
      for (let i = 0; i < 26; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
        const speed = 120 + Math.random() * 260;
        this.sparks.push({
          x: cx,
          y: this.board.layout.slotTop,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.6 + Math.random() * 0.5,
          color: i % 3 === 0 ? '#ffffff' : ball.color,
        });
      }
    }
    this.landedSeen = landed.length;

    if (this.board.done && !this.confettiDone) {
      this.confettiDone = true;
      for (let i = 0; i < 160; i++) {
        this.confetti.push({
          x: Math.random(),
          y: -Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 0.08,
          vy: 0.12 + Math.random() * 0.2,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 10,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        });
      }
    }
  }

  private drawFrame(ctx: CanvasRenderingContext2D): void {
    const { width, floorY, height } = this.board.layout;
    // 판 바탕 — 은은한 세로 무늬
    const panel = ctx.createLinearGradient(0, 0, 0, floorY);
    panel.addColorStop(0, '#252a5c');
    panel.addColorStop(1, '#171a3d');
    ctx.fillStyle = panel;
    roundRect(ctx, 0, 0, width, height, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,147,255,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  private drawPegs(ctx: CanvasRenderingContext2D): void {
    const { pegR } = this.board.layout;
    const step = this.board.step;
    const hitColor = this.board.current?.color ?? '#ffd23f';
    for (const peg of this.board.pegs) {
      const age = step - peg.hitStep;
      if (age < 20) {
        // 맞은 핀은 공 색으로 잠깐 빛난다
        const t = 1 - age / 20;
        ctx.fillStyle = withAlpha(hitColor, 0.45 * t);
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, pegR * (2 + t * 1.6), 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(
        peg.x - pegR * 0.35,
        peg.y - pegR * 0.35,
        pegR * 0.1,
        peg.x,
        peg.y,
        pegR,
      );
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, age < 20 ? hitColor : '#9aa6e8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, pegR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSlots(ctx: CanvasRenderingContext2D): void {
    const { slotTop, floorY, ballR } = this.board.layout;
    const step = this.board.step;
    for (const slot of this.board.slots) {
      const ball = slot.ballId !== undefined ? this.board.balls[slot.ballId] : undefined;
      const w = slot.x1 - slot.x0;
      // 칸 안쪽
      ctx.fillStyle = slot.index % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect(slot.x0, slotTop, w, floorY - slotTop);
      if (ball) {
        // 들어간 공 (칸 바닥) + 닫힌 뚜껑
        const flash = Math.max(0, 1 - (step - (slot.landStep ?? 0)) / 40);
        ctx.fillStyle = withAlpha(ball.color, 0.25 + flash * 0.5);
        ctx.fillRect(slot.x0, slotTop, w, floorY - slotTop);
        drawBall(ctx, (slot.x0 + slot.x1) / 2, floorY - ballR, ballR, ball.color);
        const lidH = floorY - slotTop - ballR * 2 - 4;
        ctx.fillStyle = withAlpha(ball.color, 0.85);
        ctx.fillRect(slot.x0 + 2, slotTop, w - 4, Math.max(4, lidH));
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(slot.x0 + 2, slotTop, w - 4, 3);
      }
    }
    // 칸막이
    ctx.fillStyle = '#c9d1ff';
    for (const slot of this.board.slots.slice(1)) {
      ctx.fillRect(slot.x0 - 2, slotTop, 4, floorY - slotTop);
    }
    ctx.fillRect(0, floorY - 2, this.board.layout.width, 4);
  }

  /** 칸 아래 결과 이름 — 가리기 모드면 공이 들어갈 때 카드가 뒤집히며 공개된다 */
  private drawLabels(ctx: CanvasRenderingContext2D): void {
    const { floorY, height, slotW } = this.board.layout;
    const top = floorY + 8;
    const h = height - top - 10;
    const vertical = slotW < 84;
    for (const slot of this.board.slots) {
      const ball = slot.ballId !== undefined ? this.board.balls[slot.ballId] : undefined;
      const revealed = !this.hideResults || ball !== undefined || this.board.done;
      // 뒤집기 — 가로 폭을 1 → 0 → 1 로 바꾼다
      let flip = 1;
      if (this.hideResults && ball && slot.landStep !== undefined) {
        const t = Math.min(1, (this.board.step - slot.landStep) / FLIP_STEPS);
        flip = Math.abs(Math.cos(t * Math.PI));
        if (t < 0.5) flip = Math.max(flip, 0.02);
      }
      const showFront = revealed && !(this.hideResults && ball && this.flipping(slot));
      const cx = (slot.x0 + slot.x1) / 2;
      const w = slotW - 6;
      ctx.save();
      ctx.translate(cx, top + h / 2);
      ctx.scale(flip, 1);
      ctx.fillStyle = showFront ? (ball ? ball.color : '#2d336e') : '#3d2f7a';
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(10, w / 4));
      ctx.fill();
      ctx.strokeStyle = showFront && ball ? '#ffffff' : 'rgba(201,209,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const text = showFront ? slot.result : '?';
      ctx.fillStyle = showFront && ball ? '#14163a' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 좁은 칸은 세로로 눕혀 쓴다 (한두 글자처럼 가로로 들어가면 그대로)
      ctx.font = `900 ${Math.min(w * 0.7, 26)}px system-ui, sans-serif`;
      if (vertical && text !== '?' && ctx.measureText(text).width > w - 6) {
        ctx.rotate(-Math.PI / 2);
        fitText(ctx, text, h - 12, Math.min(w * 0.7, 26), 900);
      } else {
        fitText(
          ctx,
          text,
          w - 8,
          text === '?' ? Math.min(w * 0.6, 40) : 26,
          900,
          ball && !vertical ? -10 : 0,
        );
        if (ball && !vertical) {
          ctx.fillStyle = 'rgba(20,22,58,0.8)';
          fitText(ctx, ball.name, w - 8, 18, 700, 18);
        }
      }
      ctx.restore();
    }
  }

  /** 가리기 모드에서 카드가 아직 앞면으로 넘어가기 전인지 */
  private flipping(slot: Slot): boolean {
    if (slot.landStep === undefined) return false;
    return this.board.step - slot.landStep < FLIP_STEPS / 2;
  }

  /** 위에서 기다리는 다음 공 — 둥실둥실 */
  private drawWaiting(ctx: CanvasRenderingContext2D): void {
    if (this.board.current) return;
    const ball = this.board.nextBall;
    if (!ball) return;
    const { dropY, ballR } = this.board.layout;
    const bob = Math.sin(this.time * 4) * 4;
    ctx.strokeStyle = withAlpha(ball.color, 0.5);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ball.dropX, dropY + ballR + 6);
    ctx.lineTo(ball.dropX, dropY + ballR + 54);
    ctx.stroke();
    ctx.setLineDash([]);
    drawBall(ctx, ball.dropX, dropY + bob, ballR, ball.color);
    this.drawNameTag(ctx, ball, ball.dropX, dropY + bob);
  }

  private drawFalling(ctx: CanvasRenderingContext2D): void {
    const ball = this.board.current;
    if (!ball?.body) {
      this.trail = [];
      return;
    }
    const { x, y } = ball.body.position;
    if (this.trailBallId !== ball.id) {
      this.trail = [];
      this.trailBallId = ball.id;
    }
    this.trail.push({ x, y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    const { ballR } = this.board.layout;
    this.trail.forEach((p, i) => {
      const t = (i + 1) / this.trail.length;
      ctx.fillStyle = withAlpha(ball.color, 0.25 * t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ballR * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
    });
    drawBall(ctx, x, y, ballR, ball.color);
    this.drawNameTag(ctx, ball, x, y);
  }

  /** 공 위에 이름표 — 판 밖으로 나가지 않게 좌우를 맞춘다 */
  private drawNameTag(ctx: CanvasRenderingContext2D, ball: Ball, x: number, y: number): void {
    const { ballR, width } = this.board.layout;
    ctx.font = '800 22px system-ui, sans-serif';
    const textW = ctx.measureText(ball.name).width;
    const w = textW + 18;
    const h = 30;
    const tx = Math.min(Math.max(x, w / 2 + 6), width - w / 2 - 6);
    // 맨 위에서는 공 아래에, 그 밖에는 공 위에 붙인다
    const ty = y - ballR - h / 2 - 6 < 4 ? y + ballR + h / 2 + 6 : y - ballR - h / 2 - 6;
    ctx.fillStyle = 'rgba(10,12,31,0.85)';
    roundRect(ctx, tx - w / 2, ty - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = ball.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ball.name, tx, ty + 1);
  }

  private drawSparks(ctx: CanvasRenderingContext2D, dtMs: number): void {
    const dt = dtMs / 1000;
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 600 * dt;
      ctx.fillStyle = withAlpha(s.color, Math.min(1, s.life * 2));
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 꽃가루는 화면 좌표(0~1 비율)로 화면 전체에 뿌린다 */
  private drawConfetti(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dtMs: number,
  ): void {
    const dt = dtMs / 1000;
    this.confetti = this.confetti.filter((c) => c.y < 1.1);
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
      ctx.save();
      ctx.translate(c.x * width, c.y * height);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, shade(color));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 글자가 maxWidth 를 넘으면 줄여서 쓴다 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
  dy = 0,
): void {
  let s = size;
  ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  while (s > 9 && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  }
  ctx.fillText(text, 0, dy, maxWidth);
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

/** hsl(...) 색에 투명도를 붙인다 */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('hsl(')) return color.replace(')', ` / ${alpha.toFixed(3)})`);
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
  }
  return color;
}

/** 공 그림자 쪽 어두운 색 */
function shade(color: string): string {
  const m = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(color);
  if (!m) return color;
  return `hsl(${m[1]} ${m[2]}% ${Math.round(Number(m[3]) * 0.45)}%)`;
}
