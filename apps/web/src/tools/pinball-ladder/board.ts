import { Bodies, Body, Composite, Engine, Events } from 'matter-js';
import {
  BALL_R_MAX,
  BALL_R_MIN,
  BOARD_WIDTH,
  LABEL_HEIGHT,
  MAX_BALL_SEC,
  MAX_ROWS,
  MIN_ROWS,
  PEG_RATIO,
  PEG_SPACING_RATIO,
  PEG_ZONE_HEIGHT,
  STEP_MS,
  STEPS_PER_SEC,
  STUCK_SEC,
} from './config';
import { createRng, shuffle, type Rng } from './random';

export interface Ball {
  id: number;
  name: string;
  color: string;
  /** 떨어뜨릴 x 위치 (미리 정해 두고 위에서 기다리는 공을 그 자리에 보여 준다) */
  dropX: number;
  /** 떨어뜨린 뒤에만 생긴다 */
  body: Body | null;
  /** 들어간 결과 칸 번호 */
  slot?: number;
  dropStep?: number;
}

export interface Slot {
  index: number;
  result: string;
  x0: number;
  x1: number;
  /** 이 칸에 들어간 공 — 들어가면 뚜껑이 닫혀 다른 공은 못 들어온다 */
  ballId?: number;
  landStep?: number;
}

export interface Peg {
  x: number;
  y: number;
  /** 마지막으로 공에 맞은 스텝 (반짝임 표시용) */
  hitStep: number;
}

export type BoardEventKind = 'drop' | 'peg' | 'land';

/** 효과음·연출용 사건 */
export interface BoardEvent {
  step: number;
  kind: BoardEventKind;
  /** 맞은 세기 (peg) — 소리 크기에 쓴다 */
  strength?: number;
}

export interface Layout {
  width: number;
  height: number;
  ballR: number;
  pegR: number;
  slotW: number;
  dropY: number;
  /** 결과 칸 윗면 (칸막이 꼭대기 = 닫힌 뚜껑 윗면) */
  slotTop: number;
  floorY: number;
}

/** 이름마다 잘 구분되는 색 (황금각으로 색상환을 돈다) */
function ballColor(index: number): string {
  return `hsl(${Math.round((index * 137.508) % 360)} 80% 58%)`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * 핀볼 사다리 한 판 — 화면과 분리된 순수 계산.
 * 참가자 공을 한 개씩 떨어뜨리고, 공이 들어간 칸은 뚜껑이 닫혀서 사다리처럼 1:1 로 짝이 지어진다.
 * 결과는 매 판 칸에 무작위로 섞어 배치하므로 공이 어느 칸으로 잘 가든 누구에게나 공평하다.
 * 항상 고정 스텝(update 1번 = 1/60초)으로 진행하므로 배속·프레임과 상관없이 같은 시드면 같은 결과가 나온다.
 */
export class Board {
  readonly engine: Engine;
  readonly layout: Layout;
  readonly balls: Ball[];
  readonly slots: Slot[];
  readonly pegs: Peg[] = [];
  readonly seed: number;
  /** 지금까지 진행한 스텝 수 */
  step = 0;
  /** 지금 떨어지는 공 */
  current: Ball | null = null;
  /** 다음에 떨어뜨릴 공 번호 */
  nextIndex = 0;
  /** 마지막 공이 칸에 들어간 스텝 (자동 진행 간격용) */
  lastLandStep = 0;
  readonly events: BoardEvent[] = [];
  private readonly rng: Rng;
  private readonly pegByBody = new Map<number, Peg>();
  private lastPegEventStep = -99;
  /** 끼임 판정 — 마지막으로 제대로 움직인 스텝 */
  private movedStep = 0;

  constructor(names: string[], results: string[], seed: number) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.engine = Engine.create();
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;

    const n = names.length;
    const width = BOARD_WIDTH;
    const slotW = width / n;
    const ballR = clamp(slotW * 0.3, BALL_R_MIN, BALL_R_MAX);
    const pegR = ballR * PEG_RATIO;
    const spacing = ballR * PEG_SPACING_RATIO;
    const rows = clamp(Math.round(PEG_ZONE_HEIGHT / (spacing * 0.87)), MIN_ROWS, MAX_ROWS);
    // 참가자가 많아 핀이 촘촘해도 줄 간격을 벌려서 판 높이는 비슷하게 유지한다
    const rowGap = Math.max(spacing * 0.87, PEG_ZONE_HEIGHT / rows);
    const dropY = ballR + 24;
    const pegTop = dropY + ballR + 60;
    const lastRowY = pegTop + (rows - 1) * rowGap;
    // 닫힌 뚜껑 위를 굴러가는 공이 마지막 줄 핀 아래로 지나갈 수 있게 띄운다
    const slotTop = lastRowY + pegR + ballR * 2.6;
    const floorY = slotTop + Math.max(ballR * 3.4, 50);
    const height = floorY + LABEL_HEIGHT;
    this.layout = { width, height, ballR, pegR, slotW, dropY, slotTop, floorY };

    // 결과는 칸에 무작위로 섞어 놓는다 (같은 명단이라도 매 판 배치가 다르다)
    this.slots = shuffle(results, this.rng).map((result, i) => ({
      index: i,
      result,
      x0: i * slotW,
      x1: (i + 1) * slotW,
    }));
    this.balls = names.map((name, i) => ({
      id: i,
      name,
      color: ballColor(i),
      dropX: this.randomDropX(),
      body: null,
    }));

    const world = this.engine.world;
    // 마찰을 모두 0 으로 — 닫힌 뚜껑 위를 굴러 빈 칸까지 잘 미끄러지게
    const wall = {
      isStatic: true,
      restitution: 0.4,
      friction: 0,
      frictionStatic: 0,
      label: 'wall',
    };
    // 양옆 벽·천장·바닥
    Composite.add(world, [
      Bodies.rectangle(-30, height / 2, 60, height * 2, wall),
      Bodies.rectangle(width + 30, height / 2, 60, height * 2, wall),
      Bodies.rectangle(width / 2, -30, width + 120, 60, wall),
      Bodies.rectangle(width / 2, floorY + 30, width + 120, 60, { ...wall, restitution: 0.1 }),
    ]);
    // 칸막이 (꼭대기가 slotTop)
    for (let i = 1; i < n; i++) {
      const h = floorY - slotTop;
      Composite.add(
        world,
        Bodies.rectangle(i * slotW, slotTop + h / 2, 4, h, { ...wall, restitution: 0.2 }),
      );
    }
    // 핀 — 엇갈린 줄. 벽과의 틈이 공보다 좁아 끼일 자리에는 핀을 두지 않는다
    for (let row = 0; row < rows; row++) {
      const y = pegTop + row * rowGap;
      const cols = Math.floor(width / spacing);
      const start = (width - (cols - 1) * spacing) / 2 + (row % 2 ? spacing / 2 : 0);
      for (let c = 0; c < cols; c++) {
        const x = start + c * spacing;
        const gap = Math.min(x, width - x) - pegR;
        if (gap < ballR * 2.4) continue;
        const peg: Peg = { x, y, hitStep: -999 };
        const body = Bodies.circle(x, y, pegR, {
          isStatic: true,
          restitution: 0.55,
          friction: 0,
          frictionStatic: 0,
          label: 'peg',
        });
        this.pegs.push(peg);
        this.pegByBody.set(body.id, peg);
        Composite.add(world, body);
      }
    }

    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const peg = this.pegByBody.get(pair.bodyA.id) ?? this.pegByBody.get(pair.bodyB.id);
        if (!peg) continue;
        peg.hitStep = this.step;
        // 소리는 너무 잦지 않게 몇 스텝에 한 번만
        if (this.step - this.lastPegEventStep >= 4) {
          this.lastPegEventStep = this.step;
          const speed = this.current?.body?.speed ?? 0;
          this.events.push({ step: this.step, kind: 'peg', strength: clamp(speed / 8, 0.2, 1) });
        }
      }
    });
  }

  get done(): boolean {
    return this.balls.every((b) => b.slot !== undefined);
  }

  get canDrop(): boolean {
    return this.current === null && this.nextIndex < this.balls.length;
  }

  get nextBall(): Ball | undefined {
    return this.balls[this.nextIndex];
  }

  /** 기다리던 다음 공을 떨어뜨린다 */
  drop(): void {
    const ball = this.nextBall;
    if (!this.canDrop || !ball) return;
    const { dropY, ballR } = this.layout;
    const body = Bodies.circle(ball.dropX, dropY, ballR, {
      restitution: 0.5,
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.008,
      density: 0.0015,
      label: 'ball',
    });
    Body.setVelocity(body, { x: (this.rng() - 0.5) * 2, y: 0 });
    Composite.add(this.engine.world, body);
    ball.body = body;
    ball.dropStep = this.step;
    this.current = ball;
    this.nextIndex++;
    this.movedStep = this.step;
    this.events.push({ step: this.step, kind: 'drop' });
  }

  /** 1 스텝 (1/60초) 진행 */
  update(): void {
    this.step++;
    const ball = this.current;
    if (ball?.body) this.steer(ball.body);
    Engine.update(this.engine, STEP_MS);
    if (ball?.body) this.checkBall(ball, ball.body);
  }

  /** 지금 열린 칸 중 x 에서 가장 가까운 칸 */
  nearestOpenSlot(x: number): Slot | undefined {
    let best: Slot | undefined;
    let bestDist = Infinity;
    for (const slot of this.slots) {
      if (slot.ballId !== undefined) continue;
      const dist = Math.abs((slot.x0 + slot.x1) / 2 - x);
      if (dist < bestDist) {
        best = slot;
        bestDist = dist;
      }
    }
    return best;
  }

  private randomDropX(): number {
    const margin = this.layout.ballR + 24;
    return margin + this.rng() * (this.layout.width - margin * 2);
  }

  /**
   * 닫힌 뚜껑 위로 떨어진 공은 가장 가까운 빈 칸 쪽으로 살살 굴려 준다
   * (뚜껑·칸막이 윗면이 평평하게 이어져 있어서 굴러가다 빈 칸에 쏙 들어간다).
   */
  private steer(body: Body): void {
    const { slotTop, ballR, slotW } = this.layout;
    const { x, y } = body.position;
    if (y < slotTop - ballR * 2.2 || y > slotTop + ballR) return;
    const target = this.nearestOpenSlot(x);
    if (!target) return;
    const dx = (target.x0 + target.x1) / 2 - x;
    // 빈 칸 바로 위면 그냥 떨어지게 둔다
    if (Math.abs(dx) < slotW / 2 - ballR * 0.6) return;
    if (Math.sign(body.velocity.x) === Math.sign(dx) && Math.abs(body.velocity.x) > 4) return;
    Body.applyForce(body, body.position, { x: Math.sign(dx) * body.mass * 0.00012, y: 0 });
  }

  private checkBall(ball: Ball, body: Body): void {
    const { ballR, slotW } = this.layout;
    const { x, y } = body.position;

    // 칸 바닥까지 들어오면 그 칸이 이 공의 결과 — 뚜껑을 닫는다
    if (y > this.layout.floorY - ballR - 3) {
      const slot = this.slots[clamp(Math.floor(x / slotW), 0, this.slots.length - 1)];
      if (slot && slot.ballId === undefined) {
        this.land(ball, slot);
        return;
      }
    }

    // 끼임 방지 — 한참 거의 안 움직이면 살짝 튕긴다
    if (body.speed > 0.25) this.movedStep = this.step;
    else if (this.step - this.movedStep > STUCK_SEC * STEPS_PER_SEC) {
      Body.setVelocity(body, { x: (this.rng() - 0.5) * 5, y: -3 });
      this.movedStep = this.step;
    }

    // 그래도 너무 오래 걸리면 가장 가까운 빈 칸에 넣는다
    if (this.step - (ball.dropStep ?? 0) > MAX_BALL_SEC * STEPS_PER_SEC) {
      const slot = this.nearestOpenSlot(x);
      if (!slot) return;
      Body.setPosition(body, { x: (slot.x0 + slot.x1) / 2, y: this.layout.floorY - ballR - 1 });
      Body.setVelocity(body, { x: 0, y: 0 });
      this.land(ball, slot);
    }
  }

  private land(ball: Ball, slot: Slot): void {
    const { slotTop, slotW, floorY, ballR } = this.layout;
    slot.ballId = ball.id;
    slot.landStep = this.step;
    ball.slot = slot.index;
    this.current = null;
    this.lastLandStep = this.step;
    // 뚜껑 — 윗면이 칸막이 꼭대기와 같은 높이라 다음 공은 그 위를 굴러 지나간다.
    // 빠른 공이 뚫고 들어가지 않게 두껍게, 아래로는 들어간 공 바로 위까지 채운다
    const lidH = floorY - slotTop - ballR * 2 - 4;
    Composite.add(
      this.engine.world,
      Bodies.rectangle((slot.x0 + slot.x1) / 2, slotTop + lidH / 2, slotW + 4, lidH, {
        isStatic: true,
        restitution: 0.3,
        friction: 0,
        frictionStatic: 0,
        label: 'lid',
      }),
    );
    this.events.push({ step: this.step, kind: 'land' });
  }
}
