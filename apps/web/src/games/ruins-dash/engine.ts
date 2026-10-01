import {
  ACCELERATION,
  BOOST_AFTER_INVULN_SEC,
  BOOST_SPEED_MUL,
  CLEAR_HEIGHT,
  COLLAPSE_FIRST_M,
  COLLAPSE_GAP_MAX_M,
  COLLAPSE_GAP_MIN_M,
  COLLAPSE_HOLE_CHANCE,
  COLLAPSE_RECOVER_MUL,
  COLLAPSE_SEC,
  COLLAPSE_TURN_MARGIN_M,
  CLOSE_ACTION_SEC,
  CLOSE_DODGE_SEC,
  CLOSE_POINTS,
  CLOSE_TURN_SEC,
  COIN_POINTS,
  COIN_SPACING,
  COIN_TRAIL,
  GOLDEN_DOUBLE_CHANCE,
  GOLDEN_FIRST_M,
  GOLDEN_GAP_MAX_M,
  GOLDEN_GAP_MIN_M,
  GOLDEN_ROW_M,
  GOLDEN_SEC,
  GOLDEN_TURN_MARGIN_M,
  GRACE_SEC,
  HIT_DEPTH,
  ITEM_INTERVAL_MAX_SEC,
  ITEM_INTERVAL_MIN_SEC,
  ITEM_KINDS,
  ITEMS,
  JUMP_HEIGHT,
  JUMP_SEC,
  LANE_SWITCH_SEC,
  LANES,
  MAGNET_RANGE,
  MAX_SCORE,
  EDGE_COLLAPSE_CHANCE,
  FORK_CHANCE,
  MAX_SPEED,
  MULT_MAX,
  MULT_STEP_M,
  NARROW_CHANCE,
  NEXT_THEMES,
  PURSUIT_BONUS,
  CART_BEAM_CHANCE,
  CART_HOLE_CHANCE,
  RIDE_BONUS,
  RIDE_GAP_MAX_M,
  RIDE_GAP_MIN_M,
  RIDE_KINDS,
  RIDE_FIRST_M,
  RIDE_ROW_MUL,
  RIDE_SEC,
  RIDE_SPEED_MUL,
  RIDE_TURN_MARGIN_M,
  ZIP_COIN_CHANCE,
  ZIP_LIFT,
  ZIP_RAMP_M,
  type RideKind,
  STAIRS_FIRST_M,
  STAIRS_GAP_MAX_M,
  STAIRS_GAP_MIN_M,
  STAIRS_RAMP_RATIO,
  STAIRS_RISE,
  STAIRS_SEC,
  STAIRS_STEPS,
  STAIRS_TREAD_RATIO,
  PURSUIT_FIRST_SEC,
  PURSUIT_GAP_MAX_SEC,
  PURSUIT_GAP_MIN_SEC,
  PURSUIT_SEC,
  PURSUIT_SPEED_MUL,
  PURSUIT_WARN_SEC,
  RAIN_LAND_Z,
  RAIN_SLOPE,
  ROW_GAP_MIN_SEC,
  ROW_GAP_SHRINK_PER_SEC,
  ROW_GAP_START_SEC,
  SIDESWIPE_OFFSET,
  SLIDE_SEC,
  SPAWN_DISTANCE,
  START_SPEED,
  STUMBLE_INVULN_SEC,
  STUMBLE_SLOW,
  STUMBLE_WINDOW_SEC,
  TURN_CLEAR_AFTER_M,
  TURN_CLEAR_AFTER_SEC,
  TURN_CLEAR_BEFORE_M,
  TURN_CLEAR_BEFORE_SEC,
  TURN_FIRST_M,
  TURN_GAP_MAX_M,
  TURN_GAP_MIN_END_M,
  TURN_GAP_MIN_START_M,
  TURN_LATE_M,
  TURN_SPAWN_Z,
  TURN_WINDOW_MIN_M,
  TURN_WINDOW_SEC,
  type ItemKind,
  type Lane,
  type Theme,
} from './config';

/**
 * 유적 탈출 게임 로직 — 화면(캔버스)과 분리된 순수 상태 계산만 한다.
 * 월드 좌표: z = 플레이어 앞쪽 거리(m). 장애물은 멀리서 생겨 z 가 줄어들며 다가온다.
 */

/**
 * low = 점프로 넘는 통나무, high = 슬라이드로 피하는 들보, pillar = 레인을 바꿔야 하는 기둥,
 * gap = 길이 끊어진 구멍 (점프로 건너지 못하면 떨어진다)
 */
export type ObstacleKind = 'low' | 'high' | 'pillar' | 'gap';

export interface Obstacle {
  kind: ObstacleKind;
  lane: Lane;
  z: number;
  /** 이미 플레이어를 지나쳐 판정이 끝났는지 */
  passed: boolean;
  /** 방패·부스트로 부서졌는지 (화면에서 사라진다) */
  smashed: boolean;
  /** 옆으로 피한 아슬아슬 판정을 이미 했는지 */
  nearChecked?: boolean;
  /** 가장자리만 무너진 구멍인지 (gap 중 바깥 레인 하나만 뚫린 것) */
  edge?: boolean;
  /** 무너지는 다리의 구멍 — 닿기 직전까지는 금만 가 있다가 갑자기 뚫린다 */
  sudden?: boolean;
}

export interface Coin {
  /** 화면상 가로 위치 (레인 단위) — 자석에 끌려오면 레인 사이 값이 된다 */
  x: number;
  z: number;
  /** 공중에 떠 있는 높이 (통나무 위 동전은 점프해야 먹는다) */
  y: number;
  taken: boolean;
  /** 자석에 끌려오는 중인지 */
  pulled: boolean;
  /** 황금 신전에서 쏟아지는 동전인지 — 멀리선 공중에서 떨어지는 중이다 */
  rain?: boolean;
}

export interface Item {
  kind: ItemKind;
  lane: Lane;
  z: number;
  taken: boolean;
}

/** 90° 로 꺾이는 모퉁이. z 는 모퉁이 중심까지 거리 */
export interface Turn {
  z: number;
  /** -1 = 왼쪽, 1 = 오른쪽 */
  dir: -1 | 1;
  /** 회전 입력을 받아 두었는지 — 모퉁이에 닿는 순간 방향을 튼다 */
  committed: boolean;
  /** 모퉁이를 돈 뒤의 지형 */
  theme: Theme;
  /** 모퉁이를 돈 뒤가 좁은 길(외통나무·외길)인지 */
  narrow: boolean;
  /** T자 갈림길이면 반대쪽 길의 지형 — dir 쪽은 theme·narrow, 반대쪽은 이 값 */
  alt?: { theme: Theme; narrow: boolean };
  /** 고른 방향 (회전을 예약하면 정해진다) */
  chosen?: -1 | 1;
}

/** 부서진 장애물 파편 (연출용) */
export interface Debris {
  x: number;
  z: number;
  /** 월드 단위 높이·속도 */
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: 'stone' | 'wood';
}

export type RunEvent =
  | 'coin'
  | 'jump'
  | 'slide'
  | 'lane'
  | 'crash'
  | 'item'
  | 'stumble'
  | 'shield'
  | 'smash'
  | 'turn'
  | 'fall'
  | 'close'
  | 'multUp'
  | 'golden'
  | 'goldenEnd'
  | 'stairs'
  | 'ride'
  | 'rideEnd'
  | 'collapse'
  | 'collapseEnd'
  | 'pursuit'
  | 'pursuitEnd';

/** 황금 신전 구간 — 누적 거리(m) 기준. 장애물이 없고 동전이 쏟아진다 */
export interface Golden {
  start: number;
  end: number;
  /** 동전 줄을 여기까지 만들었다 (누적 거리) */
  cursor: number;
  /** 동전 줄이 따라가는 레인 */
  lane: Lane;
  /** 플레이어가 들어왔는지 / 빠져나갔는지 */
  entered: boolean;
  exited: boolean;
}

/** 무너지는 다리 구간 — 누적 거리(m) 기준 */
export interface Collapse {
  start: number;
  end: number;
  entered: boolean;
  exited: boolean;
}

/** 계단 구간 — 누적 거리(m) 기준. sign 1 = 올라갔다 내려오는 계단, -1 = 내려갔다 올라오는 계단 */
export interface Stairs {
  start: number;
  end: number;
  sign: 1 | -1;
  entered: boolean;
  exited: boolean;
}

/** 탈것 구간 — 누적 거리(m) 기준 */
export interface Ride {
  start: number;
  end: number;
  kind: RideKind;
  entered: boolean;
  exited: boolean;
}

/** 추격자 이벤트 단계 — warn = "도망쳐!" 경고, run = 빨라진 채 도망치는 중 */
export type Pursuit = 'none' | 'warn' | 'run';

export interface RunState {
  status: 'running' | 'caught';
  /** 경과 시간(초) */
  time: number;
  speed: number;
  /** 달린 거리(m) */
  distance: number;
  coins: number;
  /** 동전으로 얻은 점수 (동전 2배 효과가 반영된다) */
  coinScore: number;
  /** 목표 레인 */
  lane: Lane;
  /** 화면에 그릴 실제 가로 위치 (레인 사이를 부드럽게 이동) */
  x: number;
  /** 점프 진행 시간 (0 이면 땅에 있음) */
  jumpT: number;
  /** 슬라이드 진행 시간 (0 이면 서 있음) */
  slideT: number;
  obstacles: Obstacle[];
  coinList: Coin[];
  items: Item[];
  debris: Debris[];
  /** 아이템별 남은 시간(초). 0 이면 꺼져 있음 */
  effects: Record<ItemKind, number>;
  /** 비틀거림 남은 시간 — 0 보다 크면 한 번 더 부딪히면 잡힌다 */
  stumbleT: number;
  /** 무적 남은 시간 */
  invulnT: number;
  /** 비틀거린 직후 감속 남은 시간 */
  slowT: number;
  /** 바위가 얼마나 가까이 왔는지 (0 = 안 보임, 1 = 바로 뒤) — 화면 연출용 */
  chase: number;
  /** 다음 장애물 줄까지 남은 시간 */
  nextRowIn: number;
  /** 다음 아이템까지 남은 시간 */
  nextItemIn: number;
  /** 부딪힌 장애물 (연출용) */
  crashedInto: Obstacle | null;
  /** 모퉁이를 못 돌았거나 구멍에 빠져 떨어졌는지 */
  fell: boolean;
  /** 지금 달리는 구간의 지형 */
  theme: Theme;
  /** 지금 구간이 좁은 길인지 — 레인을 바꿀 수 없다 */
  narrow: boolean;
  /** 앞에 있는 모퉁이 (한 번에 하나만) */
  turns: Turn[];
  /** 방금 지나온 모퉁이 — 뒤쪽 길을 그리는 데 쓴다 */
  prevCorner: { z: number; dir: -1 | 1; theme: Theme; narrow: boolean } | null;
  /** 지금까지 돈 모퉁이 수 (화면 회전 연출이 이 값 변화를 보고 시작한다) */
  turnCount: number;
  /** 다음 모퉁이가 놓일 누적 거리(m) */
  nextTurnAt: number;
  /** 마지막으로 "반드시 점프해야 하는 줄"을 놓은 누적 거리(m) */
  lastForcedJumpAt: number;
  /** 점수 배율 (multBase ~ multMax) — 비틀거리면 multBase 로 */
  mult: number;
  /** 판을 시작할 때의 배율 (미션 레벨만큼 높다) */
  multBase: number;
  /** 이번 판에 오를 수 있는 최고 배율 = multBase + (MULT_MAX - 1) */
  multMax: number;
  /** 아이템별 지속 시간(초) — 상점 강화가 반영된다 */
  durations: Record<ItemKind, number>;
  /** 다음 배율까지 달린 거리(m) */
  multProgress: number;
  /** 이번 판 최고 배율 */
  bestMult: number;
  /** 배율이 곱해진 거리 점수 */
  distanceScore: number;
  /** 아슬아슬 보너스 점수 */
  bonusScore: number;
  /** 아슬아슬 횟수 */
  closeCount: number;
  /** 아슬아슬 판정용 — 마지막 레인 이동 시각과 직전 레인, 점프·슬라이드를 시작한 시각 */
  lastLaneChangeAt: number;
  prevLane: Lane;
  lastJumpAt: number;
  lastSlideAt: number;
  /** 지금 진행 중이거나 곧 나올 황금 신전 (없으면 null) */
  golden: Golden | null;
  /** 다음 줄 간격에 곱할 배율 — 점프 뒤 회복 시간이 필요할 때 늘어난다 (한 번 쓰면 1 로 돌아온다) */
  rowGapMul: number;
  /** 지금 진행 중이거나 곧 나올 탈것 구간(광차·짚라인) (없으면 null) */
  ride: Ride | null;
  nextRideAt: number;
  rideCount: number;
  /** 탈것 구간 속도 배율 (서서히 오르내린다) */
  rideMul: number;
  /** 지금 진행 중이거나 곧 나올 계단 구간 (없으면 null) */
  stairs: Stairs | null;
  nextStairsAt: number;
  stairsCount: number;
  /** 지금 진행 중이거나 곧 나올 무너지는 다리 (없으면 null) */
  collapse: Collapse | null;
  nextCollapseAt: number;
  collapseCount: number;
  /** 다음 황금 신전이 시작될 누적 거리(m) */
  nextGoldenAt: number;
  /** 지금까지 지나온 황금 신전 수 */
  goldenCount: number;
  pursuit: Pursuit;
  /** 현재 단계가 시작된 뒤 지난 시간(초) */
  pursuitT: number;
  /** 다음 추격이 시작될 시각(초) */
  nextPursuitAt: number;
  /** 추격 중 속도 배율 (서서히 오르내린다) */
  pursuitMul: number;
  /** 끝까지 버틴 추격 수 */
  pursuitCount: number;
}

function randomItemInterval(): number {
  return ITEM_INTERVAL_MIN_SEC + Math.random() * (ITEM_INTERVAL_MAX_SEC - ITEM_INTERVAL_MIN_SEC);
}

/** 판을 시작할 때 정하는 값 — 미션 레벨·상점 강화 */
export interface RunOptions {
  /** 기본 배율 (1 이상) */
  multBase?: number;
  durations?: Partial<Record<ItemKind, number>>;
}

export function createRun(opts: RunOptions = {}): RunState {
  const multBase = Math.max(1, Math.floor(opts.multBase ?? 1));
  const durations = {} as Record<ItemKind, number>;
  for (const kind of ITEM_KINDS) durations[kind] = opts.durations?.[kind] ?? ITEMS[kind].duration;
  return {
    status: 'running',
    time: 0,
    speed: START_SPEED,
    distance: 0,
    coins: 0,
    coinScore: 0,
    lane: 0,
    x: 0,
    jumpT: 0,
    slideT: 0,
    obstacles: [],
    coinList: [],
    items: [],
    debris: [],
    effects: { magnet: 0, shield: 0, boost: 0, double: 0 },
    stumbleT: 0,
    invulnT: 0,
    slowT: 0,
    // 시작할 때 바위가 바로 뒤에 보였다가 물러난다
    chase: 0.6,
    nextRowIn: GRACE_SEC,
    // 첫 아이템은 조금 일찍 보여 줘서 아이템이 있다는 걸 알게 한다
    nextItemIn: 5,
    crashedInto: null,
    fell: false,
    theme: 'temple',
    narrow: false,
    turns: [],
    prevCorner: null,
    turnCount: 0,
    nextTurnAt: TURN_FIRST_M,
    lastForcedJumpAt: -Infinity,
    mult: multBase,
    multBase,
    multMax: multBase + MULT_MAX - 1,
    durations,
    multProgress: 0,
    bestMult: multBase,
    distanceScore: 0,
    bonusScore: 0,
    closeCount: 0,
    lastLaneChangeAt: -Infinity,
    prevLane: 0,
    lastJumpAt: -Infinity,
    lastSlideAt: -Infinity,
    rowGapMul: 1,
    ride: null,
    nextRideAt: RIDE_FIRST_M,
    rideCount: 0,
    rideMul: 1,
    stairs: null,
    nextStairsAt: STAIRS_FIRST_M,
    stairsCount: 0,
    collapse: null,
    nextCollapseAt: COLLAPSE_FIRST_M,
    collapseCount: 0,
    golden: null,
    nextGoldenAt: GOLDEN_FIRST_M,
    goldenCount: 0,
    pursuit: 'none',
    pursuitT: 0,
    nextPursuitAt: PURSUIT_FIRST_SEC,
    pursuitMul: 1,
    pursuitCount: 0,
  };
}

/** 점수 = 배율이 곱해진 거리 점수 + 동전 점수 + 아슬아슬 보너스 */
export function scoreOf(run: RunState): number {
  return Math.min(MAX_SCORE, Math.floor(run.distanceScore) + run.coinScore + run.bonusScore);
}

/** 아슬아슬하게 피했다 — 보너스(배율 적용)를 주고 알린다 */
function close(run: RunState, emit: (e: RunEvent) => void): void {
  run.closeCount += 1;
  run.bonusScore += CLOSE_POINTS * run.mult;
  emit('close');
}

/** 비틀거리면 배율이 처음으로 돌아간다 */
function resetMult(run: RunState): void {
  run.mult = run.multBase;
  run.multProgress = 0;
}

/** 현재 점프 높이 (포물선) */
export function jumpHeight(run: RunState): number {
  if (run.jumpT <= 0) return 0;
  const p = run.jumpT / JUMP_SEC;
  return 4 * JUMP_HEIGHT * p * (1 - p);
}

export function isSliding(run: RunState): boolean {
  return run.slideT > 0;
}

// ---------- 조작 ----------

/** 지금 회전 입력을 받을 수 있는 모퉁이 (없으면 null) */
export function turnInWindow(run: RunState): Turn | null {
  const t = run.turns[0];
  if (!t || t.committed) return null;
  const early = Math.max(TURN_WINDOW_MIN_M, run.speed * TURN_WINDOW_SEC);
  return t.z <= early && t.z > -TURN_LATE_M ? t : null;
}

export function moveLane(run: RunState, dir: -1 | 1, emit: (e: RunEvent) => void): void {
  if (run.status !== 'running') return;
  // 모퉁이 앞에서 꺾이는 쪽으로 밀면 회전 예약 — 그 밖에는 레인 이동
  const t = turnInWindow(run);
  // T자 갈림길은 어느 쪽으로든 돌 수 있다
  if (t && (t.dir === dir || t.alt)) {
    t.committed = true;
    t.chosen = dir;
    // 모퉁이 바로 앞에서 돌았으면 아슬아슬
    if (t.z < run.speed * CLOSE_TURN_SEC) close(run, emit);
    return;
  }
  // 좁은 길에서는 옆으로 갈 곳이 없다
  if (run.narrow) return;
  const next = run.lane + dir;
  if (next < -1 || next > 1) return;
  run.prevLane = run.lane;
  run.lastLaneChangeAt = run.time;
  run.lane = next as Lane;
  emit('lane');
}

export function jump(run: RunState, emit: (e: RunEvent) => void): void {
  if (run.status !== 'running' || run.jumpT > 0) return;
  run.slideT = 0; // 슬라이드 중에도 바로 점프로 전환
  run.jumpT = 1e-6;
  run.lastJumpAt = run.time;
  emit('jump');
}

export function slide(run: RunState, emit: (e: RunEvent) => void): void {
  if (run.status !== 'running') return;
  // 슬라이드 중에 다시 누르면 처음부터 다시 미끄러진다 — 들보가 연달아 와도 계속 숙이고 지나갈 수 있게
  const already = run.slideT > 0;
  // 공중에서 누르면 빠르게 내려오면서 슬라이드 (템플런류의 "급강하")
  run.jumpT = 0;
  run.slideT = 1e-6;
  // 이미 미끄러지는 중에 다시 누른 건 "시작"이 아니다 (연타로 아슬아슬 보너스를 받지 못하게)
  if (!already) {
    run.lastSlideAt = run.time;
    emit('slide');
  }
}

// ---------- 진행 ----------

export function step(run: RunState, dt: number, emit: (e: RunEvent) => void): void {
  if (run.status !== 'running') return;

  run.time += dt;
  tickTimers(run, dt);

  const base = Math.min(MAX_SPEED, START_SPEED + ACCELERATION * run.time);
  tickPursuit(run, dt, emit);
  // 부스트와 추격 가속은 겹치지 않고 더 큰 쪽만 적용한다
  const boostMul = run.effects.boost > 0 ? BOOST_SPEED_MUL : 1;
  const mul = Math.max(boostMul, run.pursuitMul, run.rideMul) * (run.slowT > 0 ? STUMBLE_SLOW : 1);
  run.speed = base * mul;
  const dz = run.speed * dt;
  run.distance += dz;
  run.distanceScore += dz * run.mult;
  // 비틀거리지 않는 동안 배율이 오른다
  if (run.stumbleT <= 0 && run.mult < run.multMax) {
    run.multProgress += dz;
    if (run.multProgress >= MULT_STEP_M) {
      run.multProgress -= MULT_STEP_M;
      run.mult += 1;
      run.bestMult = Math.max(run.bestMult, run.mult);
      emit('multUp');
    }
  }

  // 레인 이동 애니메이션 — 목표 레인 쪽으로 일정 속도로 미끄러진다
  const laneStep = dt / LANE_SWITCH_SEC;
  if (Math.abs(run.lane - run.x) <= laneStep) run.x = run.lane;
  else run.x += Math.sign(run.lane - run.x) * laneStep;

  if (run.jumpT > 0) {
    run.jumpT += dt;
    if (run.jumpT >= JUMP_SEC) run.jumpT = 0;
  }
  if (run.slideT > 0) {
    run.slideT += dt;
    if (run.slideT >= SLIDE_SEC) run.slideT = 0;
  }

  for (const o of run.obstacles) o.z -= dz;
  for (const c of run.coinList) {
    c.z -= dz;
    // 황금 신전 동전은 하늘에서 떨어져 가까워질수록 땅에 내려앉는다
    if (c.rain && !c.pulled) c.y = Math.max(0, (c.z - RAIN_LAND_Z) * RAIN_SLOPE);
  }
  for (const it of run.items) it.z -= dz;
  for (const t of run.turns) t.z -= dz;
  if (run.prevCorner) {
    run.prevCorner.z -= dz;
    if (run.prevCorner.z < -60) run.prevCorner = null;
  }
  updateDebris(run, dt, dz);
  if (!updateTurns(run, emit)) return;

  // 바위 거리 — 비틀거리는 동안은 바짝 붙고, 아니면 서서히 물러난다
  // 추격 중엔 바위가 계속 바짝 붙어 있다
  const pursuitChase = run.pursuit === 'run' ? 0.75 : run.pursuit === 'warn' ? 0.4 : 0;
  // 다리가 무너지는 동안에도 바위가 가까이 따라온다
  const collapsing = run.collapse?.entered && !run.collapse.exited ? 0.5 : 0;
  const chaseTarget = Math.max(run.stumbleT > 0 ? 1 : 0, pursuitChase, collapsing);
  run.chase += (chaseTarget - run.chase) * Math.min(1, dt * (chaseTarget > run.chase ? 6 : 1.5));

  collectCoins(run, dt, emit);
  collectItems(run, emit);
  if (!checkObstacles(run, emit)) return;

  // 지나간 것 정리 (카메라 뒤로 충분히 넘어간 것)
  for (const o of run.obstacles) if (o.z < -HIT_DEPTH) o.passed = true;
  run.obstacles = run.obstacles.filter((o) => o.z > -6 && !o.smashed);
  run.coinList = run.coinList.filter((c) => c.z > -6 && !c.taken);
  run.items = run.items.filter((it) => it.z > -6 && !it.taken);

  spawnTurnIfDue(run);
  updateGolden(run, emit);
  updateCollapse(run, emit);
  updateStairs(run, emit);
  updateRide(run, emit);

  run.nextRowIn -= dt;
  if (run.nextRowIn <= 0) {
    spawnRow(run);
    const gap = Math.max(ROW_GAP_MIN_SEC, ROW_GAP_START_SEC - run.time * ROW_GAP_SHRINK_PER_SEC);
    // 간격에 약간의 흔들림을 줘서 리듬이 단조롭지 않게
    run.nextRowIn =
      gap *
      (0.85 + Math.random() * 0.4) *
      run.rowGapMul *
      zoneRowMul(run, run.distance + SPAWN_DISTANCE);
    run.rowGapMul = 1;
  }

  run.nextItemIn -= dt;
  if (run.nextItemIn <= 0 && spawnItem(run)) run.nextItemIn = randomItemInterval();
}

function fall(run: RunState, emit: (e: RunEvent) => void): void {
  run.status = 'caught';
  run.fell = true;
  run.chase = 1;
  emit('fall');
}

/**
 * 모퉁이 처리. 떨어졌으면 false.
 * 회전을 예약해 뒀으면 모퉁이에 닿는 순간 방향을 틀고, 못 했으면 모퉁이를 지나쳐 떨어진다.
 * 부스트 중에는 알아서 돈다 (템플런과 같다).
 */
function updateTurns(run: RunState, emit: (e: RunEvent) => void): boolean {
  const t = run.turns[0];
  if (!t) return true;
  if (run.effects.boost > 0 && turnInWindow(run)) t.committed = true;
  if (t.z > 0) return true;
  if (t.committed) {
    run.turns.shift();
    // 갈림길은 고른 방향의 지형으로, 부스트로 알아서 돌 땐 원래 방향으로
    const dir = t.chosen ?? t.dir;
    const road = t.alt && dir !== t.dir ? t.alt : t;
    run.prevCorner = { z: t.z, dir, theme: run.theme, narrow: run.narrow };
    run.theme = road.theme;
    run.narrow = road.narrow;
    run.turnCount += 1;
    // 새 길 가운데로 다시 선다
    run.lane = 0;
    emit('turn');
    return true;
  }
  if (t.z < -TURN_LATE_M) {
    // 모퉁이 너머는 어느 지형이든 끊긴 낭떠러지다
    fall(run, emit);
    return false;
  }
  return true;
}

/** 다음 모퉁이를 미리 만들어 둔다 (화면 먼 곳부터 꺾인 길이 보이게) */
function spawnTurnIfDue(run: RunState): void {
  if (run.turns.length > 0) return;
  const z = run.nextTurnAt - run.distance;
  if (z > TURN_SPAWN_Z) return;
  // 좁은 길은 물가·절벽에만 — 신전과 동굴은 언제나 넓은 길이다
  const narrowOf = (th: Theme) =>
    (th === 'river' || th === 'cliff') && Math.random() < NARROW_CHANCE;
  const theme = pick(NEXT_THEMES[run.theme]);
  const turn: Turn = {
    z,
    dir: Math.random() < 0.5 ? -1 : 1,
    committed: false,
    theme,
    narrow: narrowOf(theme),
  };
  // 신전에서는 가끔 T자 갈림길 — 반대쪽은 다른 지형
  if (run.theme === 'temple' && Math.random() < FORK_CHANCE) {
    const others = [...new Set(NEXT_THEMES[run.theme])].filter((th) => th !== theme);
    if (others.length > 0) {
      const altTheme = pick(others);
      turn.alt = { theme: altTheme, narrow: narrowOf(altTheme) };
    }
  }
  run.turns.push(turn);
  // 모퉁이 근처에 이미 놓인 것들은 치운다 (보통은 안개 속이라 보이지 않는다).
  // 갈림길은 어느 길로 갈지 정해지기 전이라 모퉁이 너머를 전부 비운다
  const [before, after] = turnClearance(run);
  const near = (zz: number) => zz > z - before && (turn.alt !== undefined || zz < z + after);
  run.obstacles = run.obstacles.filter((o) => !near(o.z));
  run.coinList = run.coinList.filter((c) => !near(c.z));
  run.items = run.items.filter((it) => !near(it.z));
  // 그다음 모퉁이 — 시간이 지날수록 더 자주 꺾인다
  const minGap =
    TURN_GAP_MIN_START_M -
    (TURN_GAP_MIN_START_M - TURN_GAP_MIN_END_M) * Math.min(1, run.time / 120);
  run.nextTurnAt += minGap + Math.random() * (TURN_GAP_MAX_M - minGap);
}

/**
 * 모퉁이 앞·뒤로 비워 둘 거리(m). 지금 놓는 것이 모퉁이에 닿을 즈음의 속도로 계산한다
 * (보통 2~3초 뒤라 그만큼 가속된 속도, 부스트·감속은 빼고 기본 속도로).
 */
function turnClearance(run: RunState): [number, number] {
  const speed = Math.min(MAX_SPEED, START_SPEED + ACCELERATION * (run.time + 3));
  return [
    Math.max(TURN_CLEAR_BEFORE_M, speed * TURN_CLEAR_BEFORE_SEC),
    Math.max(TURN_CLEAR_AFTER_M, speed * TURN_CLEAR_AFTER_SEC),
  ];
}

/** 이 위치(z)가 모퉁이 근처라 장애물을 두면 안 되는지 */
function nearTurn(run: RunState, z: number): boolean {
  const [before, after] = turnClearance(run);
  // 갈림길은 모퉁이 너머가 어느 길이 될지 모르니 전부 비운다
  return run.turns.some((t) => z > t.z - before && (t.alt !== undefined || z < t.z + after));
}

/** 이 위치(z)의 지형 — 앞 모퉁이를 지난 곳이면 모퉁이 뒤 지형 */
export function themeAt(run: RunState, z: number): Theme {
  const t = run.turns[0];
  return t && z > t.z ? t.theme : run.theme;
}

/** 이 위치(z)가 좁은 길인지 */
export function narrowAt(run: RunState, z: number): boolean {
  const t = run.turns[0];
  return t && z > t.z ? t.narrow : run.narrow;
}

function tickTimers(run: RunState, dt: number): void {
  const boosting = run.effects.boost > 0;
  for (const kind of ITEM_KINDS) run.effects[kind] = Math.max(0, run.effects[kind] - dt);
  // 부스트가 막 끝났으면 잠깐 더 무적
  if (boosting && run.effects.boost === 0) {
    run.invulnT = Math.max(run.invulnT, BOOST_AFTER_INVULN_SEC);
  }
  run.stumbleT = Math.max(0, run.stumbleT - dt);
  run.invulnT = Math.max(0, run.invulnT - dt);
  run.slowT = Math.max(0, run.slowT - dt);
}

function collectCoins(run: RunState, dt: number, emit: (e: RunEvent) => void): void {
  const height = jumpHeight(run);
  const magnet = run.effects.magnet > 0;
  const points = COIN_POINTS * (run.effects.double > 0 ? 2 : 1) * run.mult;

  for (const c of run.coinList) {
    if (c.taken) continue;
    if (magnet && c.z < MAGNET_RANGE && c.z > -1) c.pulled = true;
    if (c.pulled) {
      // 플레이어 쪽으로 빨려 들어온다
      const k = Math.min(1, dt * 9);
      c.x += (run.x - c.x) * k;
      c.y += (height + 0.3 - c.y) * k;
    }
    if (Math.abs(c.z) > HIT_DEPTH || Math.abs(c.x - run.x) > 0.55) continue;
    // 땅 동전은 슬라이드·점프 중에도 먹을 수 있고, 떠 있는 동전은 점프해야 닿는다
    if (!c.pulled && c.y > 0.5 && height < c.y - 0.7) continue;
    c.taken = true;
    run.coins += 1;
    run.coinScore += points;
    emit('coin');
  }
}

function collectItems(run: RunState, emit: (e: RunEvent) => void): void {
  const lane = Math.round(run.x);
  for (const it of run.items) {
    if (it.taken || it.lane !== lane || Math.abs(it.z) > HIT_DEPTH) continue;
    it.taken = true;
    run.effects[it.kind] = run.durations[it.kind];
    emit('item');
  }
}

/** 장애물 부수기 — 파편을 흩뿌리고 판정에서 뺀다 */
function smash(run: RunState, o: Obstacle): void {
  o.passed = true;
  o.smashed = true;
  const n = o.kind === 'pillar' ? 10 : 7;
  for (let i = 0; i < n; i++) {
    run.debris.push({
      x: o.lane + (Math.random() - 0.5) * 0.7,
      z: o.z + Math.random() * 0.6,
      y: 0.2 + Math.random() * (o.kind === 'pillar' ? 2.2 : o.kind === 'high' ? 1.4 : 0.4),
      vx: (Math.random() - 0.5) * 5,
      vy: 2 + Math.random() * 4,
      life: 0.7 + Math.random() * 0.4,
      color: o.kind === 'low' || o.kind === 'gap' ? 'wood' : 'stone',
    });
  }
}

function updateDebris(run: RunState, dt: number, dz: number): void {
  for (const d of run.debris) {
    d.life -= dt;
    // 파편은 튕겨 나가면서도 길과 함께 뒤로 흘러간다 (부스트 중이면 훨씬 빠르게)
    d.z -= dz * 0.6;
    d.x += d.vx * dt * 0.25;
    d.vy -= 14 * dt;
    d.y = Math.max(0, d.y + d.vy * dt);
  }
  run.debris = run.debris.filter((d) => d.life > 0);
}

/**
 * 장애물 판정. 잡혔으면 false.
 * 우선순위: 올바른 동작으로 넘음 → 부스트로 부숨 → 무적 → 방패로 막음 → 비틀거림 → 잡힘
 */
function checkObstacles(run: RunState, emit: (e: RunEvent) => void): boolean {
  // 판정은 레인 이동 중이어도 "더 가까운 레인" 기준
  const lane = Math.round(run.x);
  const height = jumpHeight(run);

  checkDodges(run, lane, emit);

  for (const o of run.obstacles) {
    if (o.passed || o.lane !== lane || Math.abs(o.z) > HIT_DEPTH * 0.6) continue;

    const jumped = (o.kind === 'low' || o.kind === 'gap') && height >= CLEAR_HEIGHT;
    const slid = o.kind === 'high' && isSliding(run);
    if (jumped || slid) {
      o.passed = true;
      // 닿기 직전에야 뛰었거나 숙였으면 아슬아슬
      const startedAt = jumped ? run.lastJumpAt : run.lastSlideAt;
      if (run.time - startedAt < CLOSE_ACTION_SEC) close(run, emit);
      continue;
    }
    // 구멍은 부스트로만 그냥 건너간다 (방패·무적으로는 못 막는다)
    if (o.kind === 'gap') {
      if (run.effects.boost > 0) {
        o.passed = true;
        continue;
      }
      run.crashedInto = o;
      fall(run, emit);
      return false;
    }
    if (run.effects.boost > 0) {
      smash(run, o);
      emit('smash');
      continue;
    }
    if (run.invulnT > 0) {
      o.passed = true;
      continue;
    }
    if (run.effects.shield > 0) {
      run.effects.shield = 0;
      run.invulnT = 0.6;
      smash(run, o);
      emit('shield');
      continue;
    }

    // 가벼운 충돌 — 늦게 피하다 옆으로 스쳤거나, 통나무에 발이 걸렸다
    const offset = run.x - o.lane;
    const sideswipe = Math.abs(offset) > SIDESWIPE_OFFSET;
    // 추격 중엔 봐주지 않는다 — 바위가 바로 뒤라 한 번만 부딪혀도 잡힌다
    if ((sideswipe || o.kind === 'low') && run.stumbleT <= 0 && run.pursuit !== 'run') {
      o.passed = true;
      o.nearChecked = true;
      resetMult(run);
      run.stumbleT = STUMBLE_WINDOW_SEC;
      run.invulnT = STUMBLE_INVULN_SEC;
      run.slowT = STUMBLE_INVULN_SEC;
      // 옆에서 스쳤으면 원래 있던 레인으로 튕겨 나간다
      if (sideswipe) run.lane = (o.lane + Math.sign(offset)) as Lane;
      emit('stumble');
      continue;
    }

    run.status = 'caught';
    run.crashedInto = o;
    run.chase = 1;
    emit('crash');
    return false;
  }
  return true;
}

/**
 * 옆으로 피한 아슬아슬 — 레인을 막는 장애물이 발밑을 지나가는 순간,
 * 방금(CLOSE_DODGE_SEC 안에) 그 레인에서 옆으로 빠져나왔으면 보너스.
 */
function checkDodges(run: RunState, lane: number, emit: (e: RunEvent) => void): void {
  for (const o of run.obstacles) {
    if (o.nearChecked || o.z > 0) continue;
    o.nearChecked = true;
    // 줄 전체가 뚫린 구멍은 옆으로 피할 수 없으니 제외, 가장자리 구멍은 피한 것으로 친다
    if (o.smashed || (o.kind === 'gap' && !o.edge) || o.lane === lane) continue;
    if (run.stumbleT > 0 && run.invulnT > 0) continue;
    if (run.prevLane === o.lane && run.time - run.lastLaneChangeAt < CLOSE_DODGE_SEC) {
      close(run, emit);
    }
  }
}

// ---------- 배치 ----------

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function shuffled<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

function pushCoin(run: RunState, lane: Lane, z: number, y = 0): void {
  run.coinList.push({ x: lane, z, y, taken: false, pulled: false });
}

/**
 * 장애물 한 줄을 만든다. 어떤 경우에도 "피할 방법"이 하나는 있게 한다:
 * 기둥은 최대 2개까지만 세워서 빈 레인이 반드시 남는다.
 */
function spawnRow(run: RunState): void {
  const z = SPAWN_DISTANCE;
  // 황금 신전 구간엔 장애물을 두지 않는다
  if (inGoldenZone(run, run.distance + z)) return;
  // 무너지는 다리 구간 — 점프할 수 있는 간격이면 구멍 줄, 아니면 평소처럼 장애물 줄
  if (inCollapseZone(run, run.distance + z) && spawnCollapseHole(run, z)) return;
  // 탈것 구간 — 광차·짚라인 전용 줄
  if (inRideZone(run, run.distance + z)) {
    spawnRideRow(run, z);
    return;
  }
  if (nearTurn(run, z)) {
    // 모퉁이 뒤 비워 둔 곳엔 동전 줄 — 허전하지 않게. 매번 가운데면 단조로우니 모양을 섞는다
    const t = run.turns[0];
    if (t && !t.alt && z > t.z + 5) spawnCornerCoins(run, z);
    return;
  }
  // 시간이 지날수록 한 줄에 놓이는 장애물 수가 늘어난다
  const difficulty = Math.min(1, run.time / 75);
  const lanes = shuffled(LANES);
  const r = Math.random();
  const theme = themeAt(run, z);

  if (narrowAt(run, z)) {
    spawnNarrowRow(run, z, theme);
    return;
  }
  if (theme === 'river') {
    spawnRiverRow(run, z, lanes, difficulty);
    return;
  }
  if ((theme === 'temple' || theme === 'cliff') && Math.random() < EDGE_COLLAPSE_CHANCE) {
    spawnEdgeCollapse(run, z, difficulty);
    return;
  }
  if (theme === 'cliff') {
    spawnCliffRow(run, z, lanes, difficulty);
    return;
  }
  if (theme === 'cave') {
    spawnCaveRow(run, z, lanes, difficulty);
    return;
  }

  if (r < 0.28) {
    // 가로막는 통나무/들보 — 세 레인 전부 같은 동작으로 넘어야 한다
    // (직전에 점프 필수 줄이 있었으면 통나무 대신 들보로 — 착지하자마자 또 뛸 수는 없으니까)
    const kind: ObstacleKind = Math.random() < 0.5 && canForceJump(run, z) ? 'low' : 'high';
    if (kind === 'low') markForcedJump(run, z);
    for (const lane of LANES) {
      run.obstacles.push({ kind, lane, z, passed: false, smashed: false });
    }
    // 통나무 위에는 가끔 공중 동전
    if (kind === 'low' && Math.random() < 0.5) pushCoin(run, pick(LANES), z, JUMP_HEIGHT);
    return;
  }

  const count = Math.random() < 0.35 + difficulty * 0.45 ? 2 : 1;
  const blocked = lanes.slice(0, count);
  for (const lane of blocked) {
    const kind: ObstacleKind =
      Math.random() < 0.5 ? 'pillar' : Math.random() < 0.5 ? 'low' : 'high';
    run.obstacles.push({ kind, lane, z, passed: false, smashed: false });
  }

  // 빈 레인 중 하나에 동전 줄 — 장애물 바로 앞부터 뒤로 이어져 "이쪽이 길"이라는 힌트가 된다
  const free = lanes.filter((l) => !blocked.includes(l));
  if (free.length > 0 && Math.random() < 0.7) {
    const lane = pick(free);
    for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, lane, z - 4 + i * COIN_SPACING);
  }
}

/**
 * 세 레인을 다 막아 "반드시 점프해야 하는 줄"을 놓아도 되는지.
 * 앞의 점프 필수 줄과 너무 가까우면 착지하는 순간 다음 줄이 발밑에 와서 피할 수 없다
 * (공중에서는 다시 뛸 수 없으므로). 점프 시간 + 0.35초 이상 떨어져 있어야 한다.
 */
function canForceJump(run: RunState, z: number): boolean {
  const at = run.distance + z;
  // 그 줄에 닿을 때쯤 조금 더 빨라져 있을 수 있어 여유를 둔다
  const minGap = Math.min(MAX_SPEED * BOOST_SPEED_MUL, run.speed * 1.1) * (JUMP_SEC + 0.35);
  return at - run.lastForcedJumpAt >= minGap;
}

function markForcedJump(run: RunState, z: number): void {
  run.lastForcedJumpAt = run.distance + z;
}

function pushObstacle(run: RunState, kind: ObstacleKind, lane: Lane, z: number): void {
  run.obstacles.push({ kind, lane, z, passed: false, smashed: false });
}

/**
 * 가장자리가 무너진 줄 — 바깥 레인 한쪽(뒤로 갈수록 가끔 양쪽)만 뚫린다. 가운데는 항상 남는다.
 * 무너진 쪽 레인에 있으면 옆으로 비키거나 점프해야 한다. 가운데엔 동전 줄로 "이쪽이 안전"을 알린다.
 */
function spawnEdgeCollapse(run: RunState, z: number, difficulty: number): void {
  const side: Lane = Math.random() < 0.5 ? -1 : 1;
  const both = Math.random() < 0.15 + difficulty * 0.25;
  for (const lane of both ? ([-1, 1] as const) : [side]) {
    run.obstacles.push({ kind: 'gap', lane, z, passed: false, smashed: false, edge: true });
  }
  if (Math.random() < 0.6) {
    for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, 0, z - 4 + i * COIN_SPACING);
  }
}

/** 빈 레인 하나에 동전 줄 */
function pushCoinTrail(run: RunState, free: Lane[], z: number): void {
  if (free.length === 0 || Math.random() > 0.7) return;
  const lane = pick(free);
  for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, lane, z - 4 + i * COIN_SPACING);
}

/** 물가 — 점프로 넘는 것만: 판자가 끊어진 구멍(세 레인 전부) 또는 떠내려온 통나무 */
function spawnRiverRow(run: RunState, z: number, lanes: Lane[], difficulty: number): void {
  // 점프 필수 줄끼리 너무 붙으면 피할 수 없으므로, 그럴 땐 한 레인만 막는 통나무로 대신한다
  const forced = canForceJump(run, z);
  if (forced && Math.random() < 0.35) {
    markForcedJump(run, z);
    for (const lane of LANES) pushObstacle(run, 'gap', lane, z);
    // 구멍 위에는 뛰어서 먹는 공중 동전
    if (Math.random() < 0.6) pushCoin(run, pick(LANES), z, JUMP_HEIGHT);
    return;
  }
  if (forced && Math.random() < 0.3) {
    markForcedJump(run, z);
    for (const lane of LANES) pushObstacle(run, 'low', lane, z);
    return;
  }
  const count = Math.random() < 0.3 + difficulty * 0.4 ? 2 : 1;
  const blocked = lanes.slice(0, count);
  for (const lane of blocked) pushObstacle(run, 'low', lane, z);
  pushCoinTrail(
    run,
    lanes.filter((l) => !blocked.includes(l)),
    z,
  );
}

/** 절벽 — 슬라이드로 지나는 아치(세 레인 전부 또는 일부)와 레인을 막는 바위 */
function spawnCliffRow(run: RunState, z: number, lanes: Lane[], difficulty: number): void {
  if (Math.random() < 0.3) {
    for (const lane of LANES) pushObstacle(run, 'high', lane, z);
    return;
  }
  const count = Math.random() < 0.35 + difficulty * 0.45 ? 2 : 1;
  const blocked = lanes.slice(0, count);
  for (const lane of blocked) pushObstacle(run, Math.random() < 0.55 ? 'pillar' : 'high', lane, z);
  pushCoinTrail(
    run,
    lanes.filter((l) => !blocked.includes(l)),
    z,
  );
}

/**
 * 동굴 — 슬라이드로 지나는 낮은 천장(세 레인 전부 또는 일부)과 레인을 막는 석순 위주.
 * 점프가 필요한 줄은 두지 않아 어두운 터널에서 "숙이고 비키는" 리듬이 된다.
 */
function spawnCaveRow(run: RunState, z: number, lanes: Lane[], difficulty: number): void {
  if (Math.random() < 0.35) {
    for (const lane of LANES) pushObstacle(run, 'high', lane, z);
    return;
  }
  const count = Math.random() < 0.35 + difficulty * 0.45 ? 2 : 1;
  const blocked = lanes.slice(0, count);
  for (const lane of blocked) pushObstacle(run, Math.random() < 0.5 ? 'pillar' : 'high', lane, z);
  pushCoinTrail(
    run,
    lanes.filter((l) => !blocked.includes(l)),
    z,
  );
}

/**
 * 모퉁이 뒤 동전 줄. 좁은 길은 가운데뿐이고, 넓은 길은
 * - 무작위 레인에 곧은 한 줄 (40%)
 * - 한 레인에서 시작해 옆 레인으로 갈아타는 줄 (40%) — 돈 뒤 레인 이동을 유도한다
 * - 없음 (20%)
 */
function spawnCornerCoins(run: RunState, z: number): void {
  if (narrowAt(run, z)) {
    for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, 0, z - 4 + i * COIN_SPACING);
    return;
  }
  const r = Math.random();
  if (r < 0.2) return;
  const from = pick(LANES);
  let to = from;
  if (r >= 0.6) {
    const others = LANES.filter((l) => Math.abs(l - from) === 1);
    to = pick(others);
  }
  for (let i = 0; i < COIN_TRAIL; i++) {
    // 갈아타는 줄은 앞 두 개가 출발 레인, 나머지가 옮겨 간 레인
    pushCoin(run, i < 2 ? from : to, z - 4 + i * COIN_SPACING);
  }
}

/**
 * 좁은 길 — 옆으로 피할 수 없으니 레인을 막는 장애물은 없고, 점프·슬라이드로 넘는 것만 둔다.
 * 외통나무 다리는 옹이·가지(점프), 외길 능선은 튀어나온 바위(슬라이드)와 떨어진 돌(점프).
 * 판정은 레인과 상관없게 세 레인 모두에 놓는다.
 */
function spawnNarrowRow(run: RunState, z: number, theme: Theme): void {
  const wantJump = theme === 'river' || Math.random() < 0.35;
  let kind: ObstacleKind | null;
  if (wantJump) {
    kind = canForceJump(run, z) ? 'low' : theme === 'cliff' ? 'high' : null;
  } else {
    kind = 'high';
  }
  if (kind === 'low') markForcedJump(run, z);
  if (kind) {
    for (const lane of LANES) pushObstacle(run, kind, lane, z);
    // 통나무 가지 위에는 뛰어서 먹는 공중 동전
    if (kind === 'low' && Math.random() < 0.5) pushCoin(run, 0, z, JUMP_HEIGHT);
    return;
  }
  // 장애물을 못 두는 줄은 가운데 동전 줄로
  for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, 0, z - 4 + i * COIN_SPACING);
}

/**
 * 아이템 하나를 장애물이 없는 자리에 놓는다. 놓을 자리가 없으면 false (다음 프레임에 다시 시도).
 * 방금 쓰고 있는 효과는 되도록 피해서 다양하게 나오게 한다.
 */
function spawnItem(run: RunState): boolean {
  const z = SPAWN_DISTANCE;
  // 좁은 길에서는 가운데에만
  const lane: Lane = narrowAt(run, z) ? 0 : pick(LANES);
  const nearby = run.obstacles.some((o) => o.lane === lane && Math.abs(o.z - z) < 7);
  if (nearby || nearTurn(run, z)) return false;
  const fresh = ITEM_KINDS.filter((k) => run.effects[k] === 0);
  const kind = pick(fresh.length > 0 ? fresh : ITEM_KINDS);
  run.items.push({ kind, lane, z, taken: false });
  // 같은 자리에 겹친 동전은 치운다 (아이템이 가려지지 않게)
  run.coinList = run.coinList.filter((c) => !(c.x === lane && Math.abs(c.z - z) < 1.5));
  return true;
}

// ---------- 황금 신전 ----------

/** 누적 거리(at)가 황금 신전 구간 안인지 */
function inGoldenZone(run: RunState, at: number): boolean {
  const g = run.golden;
  return g !== null && at >= g.start - 1 && at <= g.end + 1;
}

/**
 * 황금 신전을 시작하고, 진행 중이면 동전 비를 이어서 만든다.
 * 시작 조건: 앞에 모퉁이가 없는 평범한 신전 길일 때 (다른 지형·좁은 길·모퉁이 앞에선 미룬다).
 * 구간 안에 모퉁이가 끼지 않도록 다음 모퉁이는 구간이 끝난 뒤로 밀어 둔다.
 */
function updateGolden(run: RunState, emit: (e: RunEvent) => void): void {
  let g = run.golden;
  if (!g) {
    if (run.distance + SPAWN_DISTANCE < run.nextGoldenAt) return;
    if (
      run.turns.length > 0 ||
      run.theme !== 'temple' ||
      run.narrow ||
      run.pursuit !== 'none' ||
      run.collapse !== null ||
      run.stairs !== null ||
      run.ride !== null
    ) {
      return;
    }
    const start = run.distance + SPAWN_DISTANCE;
    // 구간을 달리는 동안 오를 평균 속도로 10초 분량의 길이를 정한다
    const avgSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + ACCELERATION * (run.time + GOLDEN_SEC / 2 + 2),
    );
    const end = start + avgSpeed * GOLDEN_SEC;
    g = { start, end, cursor: start, lane: pick(LANES), entered: false, exited: false };
    run.golden = g;
    run.nextTurnAt = Math.max(run.nextTurnAt, end + GOLDEN_TURN_MARGIN_M);
  }

  // 동전 비 — 보이는 거리(SPAWN_DISTANCE) 끝까지, 구간 끝을 넘지 않게
  const limit = Math.min(run.distance + SPAWN_DISTANCE, g.end);
  while (g.cursor <= limit) {
    spawnGoldenRow(run, g, g.cursor - run.distance);
    g.cursor += GOLDEN_ROW_M;
  }

  if (!g.entered && run.distance >= g.start) {
    g.entered = true;
    emit('golden');
  }
  if (g.entered && !g.exited && run.distance >= g.end) {
    g.exited = true;
    run.goldenCount += 1;
    run.nextGoldenAt =
      g.end + GOLDEN_GAP_MIN_M + Math.random() * (GOLDEN_GAP_MAX_M - GOLDEN_GAP_MIN_M);
    emit('goldenEnd');
  }
  // 구간을 완전히 벗어나면 정리 (끝나는 빛이 사라질 여유로 조금 더 둔다)
  if (g.exited && run.distance > g.end + 25) run.golden = null;
}

/** 동전 한 줄 — 레인을 따라 구불구불 이어지고, 가끔 옆 레인에 하나 더 */
function spawnGoldenRow(run: RunState, g: Golden, z: number): void {
  if (Math.random() < 0.55) {
    const next = g.lane + (Math.random() < 0.5 ? -1 : 1);
    if (next >= -1 && next <= 1) g.lane = next as Lane;
  }
  const lanes: Lane[] = [g.lane];
  if (Math.random() < GOLDEN_DOUBLE_CHANCE) lanes.push(pick(LANES.filter((l) => l !== g.lane)));
  for (const lane of lanes) {
    run.coinList.push({ x: lane, z, y: 0, taken: false, pulled: false, rain: true });
  }
}

// ---------- 추격자 ----------

/** 추격 단계 진행 — 경고 → 빨라진 채 도망 → 끝까지 버티면 보너스 */
function tickPursuit(run: RunState, dt: number, emit: (e: RunEvent) => void): void {
  if (run.pursuit === 'none') {
    // 황금 신전이 다가오거나 진행 중이면 겹치지 않게 기다린다
    const golden = run.golden !== null || run.collapse !== null || run.ride !== null;
    if (run.time >= run.nextPursuitAt && !golden && run.stumbleT <= 0) {
      run.pursuit = 'warn';
      run.pursuitT = 0;
      emit('pursuit');
    }
  } else {
    run.pursuitT += dt;
    if (run.pursuit === 'warn' && run.pursuitT >= PURSUIT_WARN_SEC) {
      run.pursuit = 'run';
      run.pursuitT = 0;
    } else if (run.pursuit === 'run' && run.pursuitT >= PURSUIT_SEC) {
      run.pursuit = 'none';
      run.pursuitT = 0;
      run.pursuitCount += 1;
      run.bonusScore += PURSUIT_BONUS * run.mult;
      run.nextPursuitAt =
        run.time +
        PURSUIT_GAP_MIN_SEC +
        Math.random() * (PURSUIT_GAP_MAX_SEC - PURSUIT_GAP_MIN_SEC);
      emit('pursuitEnd');
    }
  }
  // 속도 배율은 서서히 오르고 내린다
  const target = run.pursuit === 'run' ? PURSUIT_SPEED_MUL : 1;
  run.pursuitMul += (target - run.pursuitMul) * Math.min(1, dt * 3);
  const ride = run.ride;
  const riding = ride !== null && ride.entered && !ride.exited;
  const rideTarget = riding ? RIDE_SPEED_MUL[ride.kind] : 1;
  run.rideMul += (rideTarget - run.rideMul) * Math.min(1, dt * 3);
}

// ---------- 무너지는 다리 ----------

/** 누적 거리(at)가 무너지는 다리 구간 안인지 */
function inCollapseZone(run: RunState, at: number): boolean {
  const c = run.collapse;
  return c !== null && at >= c.start - 1 && at <= c.end + 1;
}

/**
 * 무너지는 다리 구간을 시작하고 끝낸다. 시작 조건과 모퉁이 처리는 황금 신전과 같다
 * (모퉁이 없는 평범한 신전 길, 구간 안에 모퉁이가 끼지 않게 다음 모퉁이를 뒤로 민다).
 * 황금 신전·추격과 겹치지 않는다.
 */
function updateCollapse(run: RunState, emit: (e: RunEvent) => void): void {
  let c = run.collapse;
  if (!c) {
    if (run.distance + SPAWN_DISTANCE < run.nextCollapseAt) return;
    if (
      run.turns.length > 0 ||
      run.theme !== 'temple' ||
      run.narrow ||
      run.pursuit !== 'none' ||
      run.golden !== null ||
      run.stairs !== null ||
      run.ride !== null
    ) {
      return;
    }
    const start = run.distance + SPAWN_DISTANCE;
    const avgSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + ACCELERATION * (run.time + COLLAPSE_SEC / 2 + 2),
    );
    const end = start + avgSpeed * COLLAPSE_SEC;
    c = { start, end, entered: false, exited: false };
    run.collapse = c;
    run.nextTurnAt = Math.max(run.nextTurnAt, end + COLLAPSE_TURN_MARGIN_M);
  }
  if (!c.entered && run.distance >= c.start) {
    c.entered = true;
    emit('collapse');
  }
  if (c.entered && !c.exited && run.distance >= c.end) {
    c.exited = true;
    run.collapseCount += 1;
    run.nextCollapseAt =
      c.end + COLLAPSE_GAP_MIN_M + Math.random() * (COLLAPSE_GAP_MAX_M - COLLAPSE_GAP_MIN_M);
    emit('collapseEnd');
  }
  if (c.exited && run.distance > c.end + 25) run.collapse = null;
}

/**
 * 무너지는 다리의 구멍 줄 — 점프를 해도 되는 간격(앞의 점프 필수 줄과 충분히 떨어져 있을 때)이면
 * 세 레인이 다 뚫린 구멍을 낸다 (닿기 직전에 갑자기 열린다). 구멍 위에는 뛰어서 먹는 공중 동전이 걸려 있다.
 * 놓았으면 true — 못 놓은 줄은 평소처럼 장애물 줄이 된다.
 */
function spawnCollapseHole(run: RunState, z: number): boolean {
  if (!canForceJump(run, z) || Math.random() >= COLLAPSE_HOLE_CHANCE) return false;
  markForcedJump(run, z);
  run.rowGapMul = COLLAPSE_RECOVER_MUL;
  for (const lane of LANES) {
    run.obstacles.push({ kind: 'gap', lane, z, passed: false, smashed: false, sudden: true });
  }
  if (Math.random() < 0.7) pushCoin(run, pick(LANES), z, JUMP_HEIGHT);
  return true;
}

// ---------- 오르막·내리막 계단 ----------

/** 0~1 사이 부드러운 보간 (3t² − 2t³) */
function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** 계단 모양 — s 단(소수 가능)까지 올랐을 때의 단 수. 디딤판은 평평하고 단 사이만 비스듬히 오른다 */
function stepsAt(s: number): number {
  const whole = Math.floor(s);
  const f = s - whole;
  return whole + smooth01((f - STAIRS_TREAD_RATIO) / (1 - STAIRS_TREAD_RATIO));
}

/**
 * 누적 거리(w)에서의 길 높이(m). 계단 구간 밖은 0.
 * 구간 앞쪽 RAMP 비율은 오르고(또는 내리고), 가운데는 평지, 뒤쪽 RAMP 비율은 같은 모양으로 되돌아온다.
 */
export function stairHeight(run: RunState, w: number): number {
  const st = run.stairs;
  if (!st || w <= st.start || w >= st.end) return 0;
  const u = (w - st.start) / (st.end - st.start);
  const ramp = STAIRS_RAMP_RATIO;
  let steps: number;
  if (u < ramp) steps = stepsAt((u / ramp) * STAIRS_STEPS);
  else if (u > 1 - ramp) steps = stepsAt(((1 - u) / ramp) * STAIRS_STEPS);
  else steps = STAIRS_STEPS;
  return st.sign * steps * STAIRS_RISE;
}

/**
 * 계단 구간을 시작하고 끝낸다. 높이는 경로 거리로만 정해져서 모퉁이가 끼어도 되므로 모퉁이를 건드리지 않는다.
 * 황금 신전·무너지는 다리·탈것과는 겹치지 않는다 (추격과는 함께 나올 수 있다).
 */
function updateStairs(run: RunState, emit: (e: RunEvent) => void): void {
  let st = run.stairs;
  if (!st) {
    if (run.distance + SPAWN_DISTANCE < run.nextStairsAt) return;
    if (run.golden !== null || run.collapse !== null || run.ride !== null) return;
    const start = run.distance + SPAWN_DISTANCE;
    const avgSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + ACCELERATION * (run.time + STAIRS_SEC / 2 + 2),
    );
    const end = start + avgSpeed * STAIRS_SEC;
    st = { start, end, sign: Math.random() < 0.5 ? 1 : -1, entered: false, exited: false };
    run.stairs = st;
  }
  if (!st.entered && run.distance >= st.start) {
    st.entered = true;
    emit('stairs');
  }
  if (st.entered && !st.exited && run.distance >= st.end) {
    st.exited = true;
    run.stairsCount += 1;
    run.nextStairsAt =
      st.end + STAIRS_GAP_MIN_M + Math.random() * (STAIRS_GAP_MAX_M - STAIRS_GAP_MIN_M);
  }
  // 구간 끝이 화면 밖으로 완전히 나가면 정리
  if (st.exited && run.distance > st.end + 90) run.stairs = null;
}

// ---------- 광차 · 짚라인 ----------

/** 누적 거리(at)가 탈것 구간 안인지 */
function inRideZone(run: RunState, at: number): boolean {
  const r = run.ride;
  return r !== null && at >= r.start - 1 && at <= r.end + 1;
}

/**
 * 짚라인에 매달린 높이(m). 구간 앞뒤 ZIP_RAMP_M 에서 서서히 오르내린다.
 * 광차이거나 구간 밖이면 0.
 */
export function rideLift(run: RunState, w: number): number {
  const r = run.ride;
  if (!r || r.kind !== 'zip' || w <= r.start || w >= r.end) return 0;
  const up = Math.min(1, (w - r.start) / ZIP_RAMP_M);
  const down = Math.min(1, (r.end - w) / ZIP_RAMP_M);
  return ZIP_LIFT * smooth01(Math.min(up, down));
}

/**
 * 탈것 구간을 시작하고 끝낸다. 시작 조건과 모퉁이 처리는 황금 신전과 같고,
 * 다른 이벤트(황금 신전·무너지는 다리·계단·추격)와 겹치지 않는다.
 */
function updateRide(run: RunState, emit: (e: RunEvent) => void): void {
  let r = run.ride;
  if (!r) {
    if (run.distance + SPAWN_DISTANCE < run.nextRideAt) return;
    if (
      run.turns.length > 0 ||
      run.theme !== 'temple' ||
      run.narrow ||
      run.pursuit !== 'none' ||
      run.golden !== null ||
      run.collapse !== null ||
      run.stairs !== null
    ) {
      return;
    }
    const kind = pick(RIDE_KINDS);
    const start = run.distance + SPAWN_DISTANCE;
    const avgSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + ACCELERATION * (run.time + RIDE_SEC[kind] / 2 + 2),
    );
    const end = start + avgSpeed * RIDE_SEC[kind] * RIDE_SPEED_MUL[kind];
    r = { start, end, kind, entered: false, exited: false };
    run.ride = r;
    run.nextTurnAt = Math.max(run.nextTurnAt, end + RIDE_TURN_MARGIN_M);
  }
  if (!r.entered && run.distance >= r.start) {
    r.entered = true;
    emit('ride');
  }
  if (r.entered && !r.exited && run.distance >= r.end) {
    r.exited = true;
    run.rideCount += 1;
    run.bonusScore += RIDE_BONUS * run.mult;
    run.nextRideAt = r.end + RIDE_GAP_MIN_M + Math.random() * (RIDE_GAP_MAX_M - RIDE_GAP_MIN_M);
    emit('rideEnd');
  }
  if (r.exited && run.distance > r.end + 25) run.ride = null;
}

/** 탈것 구간의 한 줄 */
function spawnRideRow(run: RunState, z: number): void {
  const r = run.ride;
  if (!r) return;
  const lanes = shuffled(LANES);
  const difficulty = Math.min(1, run.time / 75);

  if (r.kind === 'cart') {
    const roll = Math.random();
    // 끊어진 레일 — 점프. 앞의 점프 필수 줄과 충분히 떨어져 있을 때만
    if (roll < CART_HOLE_CHANCE && canForceJump(run, z)) {
      markForcedJump(run, z);
      run.rowGapMul = COLLAPSE_RECOVER_MUL;
      for (const lane of LANES) pushObstacle(run, 'gap', lane, z);
      if (Math.random() < 0.6) pushCoin(run, pick(LANES), z, JUMP_HEIGHT);
      return;
    }
    // 낮은 들보 — 세 레인 전부 숙여서 지난다
    if (roll < CART_HOLE_CHANCE + CART_BEAM_CHANCE) {
      for (const lane of LANES) pushObstacle(run, 'high', lane, z);
      return;
    }
    // 레일 위 바위 — 레인을 바꿔 피한다
    const count = Math.random() < 0.35 + difficulty * 0.45 ? 2 : 1;
    const blocked = lanes.slice(0, count);
    for (const lane of blocked) pushObstacle(run, 'pillar', lane, z);
    pushCoinTrail(
      run,
      lanes.filter((l) => !blocked.includes(l)),
      z,
    );
    return;
  }

  // 짚라인 — 공중 바위(기둥 판정)만. 점프·슬라이드는 필요 없고 레인 이동으로 피한다
  const count = Math.random() < 0.1 + difficulty * 0.15 ? 2 : 1;
  const blocked = lanes.slice(0, count);
  for (const lane of blocked) pushObstacle(run, 'pillar', lane, z);
  const free = lanes.filter((l) => !blocked.includes(l));
  if (free.length > 0 && Math.random() < ZIP_COIN_CHANCE) {
    const lane = pick(free);
    for (let i = 0; i < COIN_TRAIL; i++) pushCoin(run, lane, z - 4 + i * COIN_SPACING);
  }
}

/**
 * 탈것 구간 안에서 만든 줄 다음의 간격 배율. 이런 구간은 모퉁이를 뒤로 밀어 장애물 없는 쉼터가 없으므로
 * 줄 간격을 넓혀서 평소와 비슷한 부담이 되게 한다. 구간 밖이면 1.
 */
function zoneRowMul(run: RunState, at: number): number {
  const r = run.ride;
  if (r && at >= r.start - 1 && at <= r.end + 1) return RIDE_ROW_MUL[r.kind];
  return 1;
}
