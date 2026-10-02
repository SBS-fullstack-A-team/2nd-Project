import { Bodies, Body, Composite, Engine } from 'matter-js';
import { COUNTDOWN_SEC, MARBLE_R, MAX_RACE_SEC, STEP_MS, STEPS_PER_SEC, STUCK_SEC } from './config';
import { buildCourse, type Course } from './course';
import { createRng, type Rng } from './random';

/** first: 먼저 도착한 N명이 당첨 / last: 마지막까지 남은 N명이 당첨(꼴등 뽑기) */
export type RaceMode = 'first' | 'last';
export type RacePhase = 'countdown' | 'running' | 'done';

export interface Marble {
  id: number;
  name: string;
  color: string;
  body: Body;
  /** 도착 순위 (1부터). 아직 달리는 중이면 undefined */
  rank?: number;
  /** 지금까지 가장 많이 내려간 높이와 그때의 스텝 — 끼임 판정용 */
  bestY: number;
  bestStep: number;
}

/**
 * 풍차 돌리기 — Body.setAngle 의 세 번째 인자(updateVelocity)를 true 로 준다.
 * 그러면 돌린 만큼 각속도가 생겨서 정지 물체인 풍차가 부딪힌 구슬을 제대로 밀어낸다.
 * (matter-js 0.20 은 이 인자를 받지만 @types/matter-js 타입 정의에는 빠져 있어서 타입을 넓혀 부른다)
 */
function rotateWithVelocity(body: Body, angle: number): void {
  (Body.setAngle as (body: Body, angle: number, updateVelocity: boolean) => void)(
    body,
    angle,
    true,
  );
}

/** 이름마다 잘 구분되는 색 (황금각으로 색상환을 돈다) */
function marbleColor(index: number): string {
  return `hsl(${(index * 137.508) % 360} 75% 55%)`;
}

/**
 * 구슬 레이스 한 판 — 화면과 분리된 순수 계산.
 * 항상 고정 스텝(update 1번 = 1/60초)으로 진행하므로 배속·프레임과 상관없이 같은 시드면 같은 결과가 나온다.
 */
export class Race {
  readonly engine: Engine;
  readonly course: Course;
  readonly marbles: Marble[];
  readonly mode: RaceMode;
  readonly winnerCount: number;
  readonly seed: number;
  phase: RacePhase = 'countdown';
  /** 지금까지 진행한 스텝 수 (카운트다운 포함) */
  step = 0;
  /** 도착한 순서 */
  readonly arrivals: Marble[] = [];
  private readonly rng: Rng;

  constructor(names: string[], mode: RaceMode, winnerCount: number, seed: number) {
    this.mode = mode;
    this.seed = seed;
    this.winnerCount = Math.min(Math.max(1, winnerCount), Math.max(1, names.length - 1));
    this.rng = createRng(seed);
    this.engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    // 구슬끼리 많이 부딪혀도 겹치지 않도록 반복 횟수를 조금 늘린다
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.course = buildCourse(names.length, this.rng);

    this.marbles = names.map((name, i) => {
      // 출발 칸은 구슬 수만큼 만들어지므로 항상 있다
      const slot = this.course.slots[i] ?? { x: 0, y: 0 };
      const body = Bodies.circle(slot.x, slot.y, MARBLE_R, {
        restitution: 0.4,
        friction: 0.002,
        frictionStatic: 0,
        frictionAir: 0.004,
        density: 0.002,
      });
      return { id: i, name, color: marbleColor(i), body, bestY: slot.y, bestStep: 0 };
    });

    Composite.add(this.engine.world, [
      ...this.course.obstacles.map((o) => o.body),
      ...this.marbles.map((m) => m.body),
    ]);
  }

  /** 출발까지 남은 초 (카운트다운 중일 때만 의미 있음) */
  get countdownLeft(): number {
    return Math.max(0, COUNTDOWN_SEC - this.step / STEPS_PER_SEC);
  }

  /** 출발 후 지난 초 */
  get elapsedSec(): number {
    return Math.max(0, this.step / STEPS_PER_SEC - COUNTDOWN_SEC);
  }

  get running(): Marble[] {
    return this.marbles.filter((m) => m.rank === undefined);
  }

  /** 한 스텝 진행 */
  update(): void {
    if (this.phase === 'done') return;
    this.step++;

    if (this.phase === 'countdown') {
      // 카운트다운 동안에도 물리는 돌려서 구슬이 출발 칸에 자리 잡게 한다
      if (this.step >= COUNTDOWN_SEC * STEPS_PER_SEC) {
        Composite.remove(this.engine.world, this.course.gate);
        this.phase = 'running';
      }
    }

    for (const spinner of this.course.spinners) {
      rotateWithVelocity(spinner.body, spinner.body.angle + spinner.angleSpeed);
    }
    Engine.update(this.engine, STEP_MS);

    if (this.phase !== 'running') return;
    this.checkArrivals();
    this.unstick();
    this.checkDone();
  }

  private checkArrivals(): void {
    for (const marble of this.marbles) {
      if (marble.rank !== undefined || marble.body.position.y < this.course.finishY) continue;
      this.arrivals.push(marble);
      marble.rank = this.arrivals.length;
      Composite.remove(this.engine.world, marble.body);
    }
  }

  /** 한동안 거의 못 내려간 구슬은 무작위로 살짝 튕겨 준다 (난수도 시드를 따른다) */
  private unstick(): void {
    for (const marble of this.running) {
      const y = marble.body.position.y;
      if (y > marble.bestY + MARBLE_R) {
        marble.bestY = y;
        marble.bestStep = this.step;
      } else if (this.step - marble.bestStep > STUCK_SEC * STEPS_PER_SEC) {
        Body.setVelocity(marble.body, { x: (this.rng() - 0.5) * 8, y: -3 - this.rng() * 3 });
        marble.bestStep = this.step;
      }
    }
  }

  private checkDone(): void {
    const timeUp = this.elapsedSec >= MAX_RACE_SEC;
    const done =
      this.mode === 'first'
        ? this.arrivals.length >= this.winnerCount
        : this.running.length <= this.winnerCount;
    if (!done && !timeUp) return;
    this.phase = 'done';
    // 시간이 다 돼서 끝나면 아직 달리는 구슬은 지금 위치 순서로 순위를 매긴다
    for (const marble of this.standings()) {
      if (marble.rank !== undefined) continue;
      this.arrivals.push(marble);
      marble.rank = this.arrivals.length;
    }
  }

  /** 현재 순위 — 도착한 구슬은 도착 순서, 달리는 구슬은 많이 내려간 순서 */
  standings(): Marble[] {
    const running = this.running.sort((a, b) => b.body.position.y - a.body.position.y);
    return [...this.arrivals, ...running];
  }

  /** 당첨 — first: 앞에서 N명 / last: 뒤에서 N명 (꼴등이 맨 앞) */
  winners(): Marble[] {
    const all = this.standings();
    return this.mode === 'first'
      ? all.slice(0, this.winnerCount)
      : all.slice(-this.winnerCount).reverse();
  }

  /** 카메라가 따라갈 높이 — lead: 아직 달리는 선두 / tail: 맨 뒤 */
  focusY(follow: 'lead' | 'tail'): number {
    const running = this.running;
    if (running.length === 0) return this.course.finishY;
    const ys = running.map((m) => m.body.position.y);
    return follow === 'lead' ? Math.max(...ys) : Math.min(...ys);
  }
}
