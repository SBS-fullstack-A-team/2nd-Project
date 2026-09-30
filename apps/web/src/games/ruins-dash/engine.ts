import {
  ACCELERATION,
  BOOST_AFTER_INVULN_SEC,
  BOOST_SPEED_MUL,
  CLEAR_HEIGHT,
  CLOSE_ACTION_SEC,
  CLOSE_DODGE_SEC,
  CLOSE_POINTS,
  CLOSE_TURN_SEC,
  COIN_POINTS,
  COIN_SPACING,
  COIN_TRAIL,
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
  MAX_SPEED,
  MULT_MAX,
  MULT_STEP_M,
  NARROW_CHANCE,
  NEXT_THEMES,
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
  | 'multUp';

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
  if (t && t.dir === dir) {
    t.committed = true;
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
  const mul = (run.effects.boost > 0 ? BOOST_SPEED_MUL : 1) * (run.slowT > 0 ? STUMBLE_SLOW : 1);
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
  for (const c of run.coinList) c.z -= dz;
  for (const it of run.items) it.z -= dz;
  for (const t of run.turns) t.z -= dz;
  if (run.prevCorner) {
    run.prevCorner.z -= dz;
    if (run.prevCorner.z < -60) run.prevCorner = null;
  }
  updateDebris(run, dt, dz);
  if (!updateTurns(run, emit)) return;

  // 바위 거리 — 비틀거리는 동안은 바짝 붙고, 아니면 서서히 물러난다
  const chaseTarget = run.stumbleT > 0 ? 1 : 0;
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

  run.nextRowIn -= dt;
  if (run.nextRowIn <= 0) {
    spawnRow(run);
    const gap = Math.max(ROW_GAP_MIN_SEC, ROW_GAP_START_SEC - run.time * ROW_GAP_SHRINK_PER_SEC);
    // 간격에 약간의 흔들림을 줘서 리듬이 단조롭지 않게
    run.nextRowIn = gap * (0.85 + Math.random() * 0.4);
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
    run.prevCorner = { z: t.z, dir: t.dir, theme: run.theme, narrow: run.narrow };
    run.theme = t.theme;
    run.narrow = t.narrow;
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
  const theme = pick(NEXT_THEMES[run.theme]);
  const turn: Turn = {
    z,
    dir: Math.random() < 0.5 ? -1 : 1,
    committed: false,
    theme,
    narrow: theme !== 'temple' && Math.random() < NARROW_CHANCE,
  };
  run.turns.push(turn);
  // 모퉁이 근처에 이미 놓인 것들은 치운다 (보통은 안개 속이라 보이지 않는다)
  const [before, after] = turnClearance(run);
  const near = (zz: number) => zz > z - before && zz < z + after;
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
  return run.turns.some((t) => z > t.z - before && z < t.z + after);
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
    if ((sideswipe || o.kind === 'low') && run.stumbleT <= 0) {
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
  if (nearTurn(run, z)) {
    // 모퉁이 뒤 비워 둔 곳엔 동전 줄 — 허전하지 않게. 매번 가운데면 단조로우니 모양을 섞는다
    const t = run.turns[0];
    if (t && z > t.z + 5) spawnCornerCoins(run, z);
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
