import { Bodies, Body, Composite, Engine, Events } from 'matter-js';
import {
  AIR_FRICTION,
  BOOST_MULTIPLIER,
  COUNTDOWN_SEC,
  DRIVE_FORCE,
  HOLE_SETBACK,
  MARBLE_R,
  MAX_RACE_SEC,
  MUD_AIR_FRICTION,
  SLOWMO_DISTANCE,
  SLOWMO_GAP,
  STEP_MS,
  STEPS_PER_SEC,
  STUCK_SEC,
} from './config';
import { createRng, type Rng } from './random';
import { buildTrack, pointAt, project, type Feature, type Track } from './track';

/** first: 먼저 도착한 N명이 당첨 / last: 마지막까지 남은 N명이 당첨(꼴등 뽑기) */
export type RaceMode = 'first' | 'last';
export type RacePhase = 'countdown' | 'running' | 'done';

export interface Marble {
  id: number;
  name: string;
  color: string;
  body: Body;
  /** 트랙을 따라 간 거리 */
  progress: number;
  /** 가운데선 기준 옆 위치 */
  lat: number;
  /** 가장 가까운 가운데선 점 번호 (위치 찾기 힌트) */
  index: number;
  /** 도착 순위 (1부터). 아직 달리는 중이면 undefined */
  rank?: number;
  /** 지금 밟고 있는 구역 */
  zone: 'boost' | 'mud' | null;
  /** 끼임 판정용 — 지금까지 가장 멀리 간 거리와 그때의 스텝 */
  bestProgress: number;
  bestStep: number;
  /** 구멍에서 다시 나타난 스텝 (깜빡임 표시용) */
  respawnStep: number;
}

export type RaceEventKind = 'lead' | 'hole' | 'finish' | 'start' | 'photo';

/** 중계 자막으로 보여 줄 사건 */
export interface RaceEvent {
  step: number;
  kind: RaceEventKind;
  text: string;
}

/** 부딪힘 효과(불꽃)를 그릴 위치 */
export interface Impact {
  step: number;
  x: number;
  y: number;
  strength: number;
}

/** 이름마다 잘 구분되는 색 (황금각으로 색상환을 돈다) */
function marbleColor(index: number): string {
  return `hsl(${Math.round((index * 137.508) % 360)} 78% 56%)`;
}

/**
 * 회전 바 돌리기 — Body.setAngle 의 세 번째 인자(updateVelocity)를 true 로 준다.
 * 그러면 돌린 만큼 각속도가 생겨서 정지 물체인 회전 바가 부딪힌 구슬을 제대로 밀어낸다.
 * (matter-js 0.20 은 이 인자를 받지만 @types/matter-js 타입 정의에는 빠져 있어서 타입을 넓혀 부른다)
 */
function rotateWithVelocity(body: Body, angle: number): void {
  (Body.setAngle as (body: Body, angle: number, updateVelocity: boolean) => void)(
    body,
    angle,
    true,
  );
}

/**
 * 구슬 레이스 한 판 — 화면과 분리된 순수 계산.
 * 위에서 내려다본 트랙이라 중력 대신 '트랙 방향으로 미는 힘'으로 달린다 (모든 구슬에 똑같은 힘).
 * 항상 고정 스텝(update 1번 = 1/60초)으로 진행하므로 배속·프레임과 상관없이 같은 시드면 같은 결과가 나온다.
 */
export class Race {
  readonly engine: Engine;
  readonly track: Track;
  readonly marbles: Marble[];
  readonly mode: RaceMode;
  readonly winnerCount: number;
  readonly seed: number;
  phase: RacePhase = 'countdown';
  /** 지금까지 진행한 스텝 수 (카운트다운 포함) */
  step = 0;
  /** 도착한 순서 */
  readonly arrivals: Marble[] = [];
  readonly events: RaceEvent[] = [];
  readonly impacts: Impact[] = [];
  private readonly rng: Rng;
  private readonly bodyToMarble = new Map<number, Marble>();
  private leaderId: number | null = null;
  private lastLeadEventStep = 0;
  /** 아직 달리는 구슬 — 진행 거리 순 (스텝마다 갱신) */
  private order: Marble[] = [];

  constructor(names: string[], mode: RaceMode, winnerCount: number, seed: number) {
    this.mode = mode;
    this.seed = seed;
    this.winnerCount = Math.min(Math.max(1, winnerCount), Math.max(1, names.length - 1));
    this.rng = createRng(seed);
    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.track = buildTrack(names.length, this.rng);

    this.marbles = names.map((name, i) => {
      const slot = this.track.slots[i] ?? { x: 0, y: 0 };
      const body = Bodies.circle(slot.x, slot.y, MARBLE_R, {
        restitution: 0.55,
        friction: 0.001,
        frictionStatic: 0,
        frictionAir: AIR_FRICTION,
        density: 0.002,
      });
      const at = project(this.track.points, slot.x, slot.y, 0);
      const marble: Marble = {
        id: i,
        name,
        color: marbleColor(i),
        body,
        progress: at.s,
        lat: at.lat,
        index: at.index,
        zone: null,
        bestProgress: at.s,
        bestStep: 0,
        respawnStep: -999,
      };
      this.bodyToMarble.set(body.id, marble);
      return marble;
    });
    this.order = [...this.marbles];
    this.sortOrder();

    Composite.add(this.engine.world, [
      ...this.track.walls,
      this.track.gate,
      ...this.track.features.flatMap((f) => (f.body ? [f.body] : [])),
      ...this.marbles.map((m) => m.body),
    ]);

    // 세게 부딪힌 곳에 불꽃을 그린다
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const a = this.bodyToMarble.get(pair.bodyA.id);
        const b = this.bodyToMarble.get(pair.bodyB.id);
        const marble = a ?? b;
        if (!marble) continue;
        const other = a ? pair.bodyB : pair.bodyA;
        const speed = Math.hypot(
          marble.body.velocity.x - other.velocity.x,
          marble.body.velocity.y - other.velocity.y,
        );
        if (speed < 3.5) continue;
        const contact = pair.collision.supports[0] ?? marble.body.position;
        this.impacts.push({ step: this.step, x: contact.x, y: contact.y, strength: speed });
      }
    });
  }

  /** 출발까지 남은 초 (카운트다운 중일 때만 의미 있음) */
  get countdownLeft(): number {
    return Math.max(0, COUNTDOWN_SEC - this.step / STEPS_PER_SEC);
  }

  /** 출발 후 지난 초 */
  get elapsedSec(): number {
    return Math.max(0, this.step / STEPS_PER_SEC - COUNTDOWN_SEC);
  }

  /** 아직 달리는 구슬 — 앞선 순서 */
  get running(): readonly Marble[] {
    return this.order;
  }

  /** 결승 직전 접전이면 true — 화면이 슬로모션으로 보여 준다 */
  get dramatic(): boolean {
    if (this.phase !== 'running' || this.mode !== 'first') return false;
    const [first, second] = this.order;
    if (!first || !second) return false;
    return (
      this.track.finishS - first.progress < SLOWMO_DISTANCE &&
      first.progress - second.progress < SLOWMO_GAP
    );
  }

  /** 한 스텝 진행 */
  update(): void {
    if (this.phase === 'done') return;
    this.step++;
    if (this.impacts.length > 200) this.impacts.splice(0, this.impacts.length - 200);

    if (this.phase === 'countdown' && this.step >= COUNTDOWN_SEC * STEPS_PER_SEC) {
      Composite.remove(this.engine.world, this.track.gate);
      this.phase = 'running';
      this.emit('start', '🟢 출발!');
    }

    for (const f of this.track.features) {
      if (f.kind === 'spinner' && f.body && f.spin) {
        rotateWithVelocity(f.body, f.body.angle + f.spin);
      }
    }
    if (this.phase === 'running') this.drive();
    Engine.update(this.engine, STEP_MS);

    for (const marble of this.order) {
      const { x, y } = marble.body.position;
      const at = project(this.track.points, x, y, marble.index);
      marble.index = at.index;
      marble.progress = at.s;
      marble.lat = at.lat;
    }
    this.sortOrder();
    if (this.phase !== 'running') return;

    this.checkZones();
    this.checkArrivals();
    this.unstick();
    this.checkLeader();
    this.checkDone();
  }

  /** 모든 구슬을 지금 있는 곳의 트랙 방향으로 똑같은 힘으로 민다 (가속 패드 위에서는 더 세게) */
  private drive(): void {
    for (const marble of this.order) {
      const p = this.track.points[marble.index];
      if (!p) continue;
      const boost = marble.zone === 'boost' ? BOOST_MULTIPLIER : 1;
      const force = DRIVE_FORCE * marble.body.mass * boost;
      Body.applyForce(marble.body, marble.body.position, { x: p.tx * force, y: p.ty * force });
    }
  }

  private featureContains(f: Feature, marble: Marble): boolean {
    const ds = marble.progress - f.s;
    const dl = marble.lat - f.lat;
    if (f.kind === 'boost') return Math.abs(ds) < f.length / 2 && Math.abs(dl) < f.width / 2;
    if (f.kind === 'mud') return (ds / (f.length / 2)) ** 2 + (dl / (f.width / 2)) ** 2 < 1;
    if (f.kind === 'hole') {
      const { x, y } = marble.body.position;
      return Math.hypot(x - f.x, y - f.y) < f.r - MARBLE_R * 0.4;
    }
    return false;
  }

  /** 가속 패드·진흙·구멍 */
  private checkZones(): void {
    for (const marble of [...this.order]) {
      let zone: Marble['zone'] = null;
      for (const f of this.track.features) {
        if (Math.abs(marble.progress - f.s) > 200 || !this.featureContains(f, marble)) continue;
        if (f.kind === 'hole') {
          this.fallIntoHole(marble, f);
          zone = null;
          break;
        }
        if (f.kind === 'boost' || f.kind === 'mud') zone = f.kind;
      }
      marble.zone = zone;
      marble.body.frictionAir = zone === 'mud' ? MUD_AIR_FRICTION : AIR_FRICTION;
    }
  }

  /** 구멍에 빠지면 조금 뒤에서 다시 나온다 */
  private fallIntoHole(marble: Marble, hole: Feature): void {
    const place = this.order.indexOf(marble) + 1;
    const back = Math.max(this.track.startS + 50, hole.s - HOLE_SETBACK);
    const at = pointAt(this.track.points, back, (this.rng() - 0.5) * 120);
    Body.setPosition(marble.body, { x: at.x, y: at.y });
    Body.setVelocity(marble.body, { x: 0, y: 0 });
    marble.index = at.index;
    marble.progress = back;
    marble.respawnStep = this.step;
    marble.bestProgress = back;
    marble.bestStep = this.step;
    // 앞쪽 구슬이 빠졌을 때만 자막 (수백 개가 다 나오면 시끄럽다)
    if (place <= 5 || this.marbles.length <= 20) {
      this.emit('hole', `🕳️ ${marble.name} 구멍에 빠졌다! (${place}위)`);
    }
  }

  private checkArrivals(): void {
    this.sortOrder();
    while (this.order[0] && this.order[0].progress >= this.track.finishS) {
      const marble = this.order.shift()!;
      this.arrivals.push(marble);
      marble.rank = this.arrivals.length;
      Composite.remove(this.engine.world, marble.body);
      if (this.mode === 'first' && marble.rank <= this.winnerCount) {
        this.emit('finish', `🏁 ${marble.rank}등 ${marble.name}!`);
      }
    }
  }

  /** 한동안 거의 못 나간 구슬은 앞쪽으로 살짝 밀어 준다 (난수도 시드를 따른다) */
  private unstick(): void {
    for (const marble of this.order) {
      const p = this.track.points[marble.index];
      if (!p) continue;
      // 벽을 뚫고 나간 구슬(아주 드묾)은 트랙 가운데로 돌려놓는다
      if (Math.abs(marble.lat) > p.w + MARBLE_R * 2) {
        const at = pointAt(this.track.points, marble.progress, 0);
        Body.setPosition(marble.body, { x: at.x, y: at.y });
        Body.setVelocity(marble.body, { x: 0, y: 0 });
      }
      if (marble.progress > marble.bestProgress + MARBLE_R) {
        marble.bestProgress = marble.progress;
        marble.bestStep = this.step;
        continue;
      }
      if (this.step - marble.bestStep < STUCK_SEC * STEPS_PER_SEC) continue;
      const side = (this.rng() - 0.5) * 6;
      Body.setVelocity(marble.body, { x: p.tx * 4 + p.nx * side, y: p.ty * 4 + p.ny * side });
      marble.bestStep = this.step;
    }
  }

  private checkLeader(): void {
    const leader = this.mode === 'first' ? this.order[0] : this.order[this.order.length - 1];
    if (!leader || leader.id === this.leaderId) return;
    const first = this.leaderId === null;
    this.leaderId = leader.id;
    // 출발 직후와 너무 잦은 변화는 자막을 생략한다
    if (first || this.elapsedSec < 2 || this.step - this.lastLeadEventStep < STEPS_PER_SEC * 1.2) {
      return;
    }
    this.lastLeadEventStep = this.step;
    this.emit(
      'lead',
      this.mode === 'first' ? `🔥 ${leader.name} 선두 탈환!` : `🐢 ${leader.name} 꼴찌로 밀려남!`,
    );
  }

  private checkDone(): void {
    const timeUp = this.elapsedSec >= MAX_RACE_SEC;
    const done =
      this.mode === 'first'
        ? this.arrivals.length >= this.winnerCount
        : this.order.length <= this.winnerCount;
    if (!done && !timeUp) return;
    this.phase = 'done';
    // 시간이 다 돼서 끝나거나 꼴등 뽑기가 끝나면, 남은 구슬은 지금 위치 순서로 순위를 매긴다
    const photo =
      this.mode === 'first' &&
      (this.order[0]?.progress ?? 0) > this.track.finishS - 40 &&
      this.arrivals.length === this.winnerCount;
    for (const marble of this.order) {
      this.arrivals.push(marble);
      marble.rank = this.arrivals.length;
    }
    this.order = [];
    if (photo) this.emit('photo', '📸 간발의 차! 사진 판정');
  }

  private emit(kind: RaceEventKind, text: string): void {
    this.events.push({ step: this.step, kind, text });
  }

  private sortOrder(): void {
    this.order.sort((a, b) => b.progress - a.progress);
  }

  /** 현재 순위 — 도착한 구슬은 도착 순서, 달리는 구슬은 앞선 순서 */
  standings(): Marble[] {
    return [...this.arrivals, ...this.order];
  }

  /** 당첨 — first: 앞에서 N명 / last: 뒤에서 N명 (꼴등이 맨 앞) */
  winners(): Marble[] {
    const all = this.standings();
    return this.mode === 'first'
      ? all.slice(0, this.winnerCount)
      : all.slice(-this.winnerCount).reverse();
  }
}
