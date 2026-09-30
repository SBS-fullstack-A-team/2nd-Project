import { CharacterAnimator, drawCharacter3d, type Pose3d } from './character3d';
import {
  ACCELERATION,
  ITEMS,
  JUMP_SEC,
  MAX_SPEED,
  SPAWN_DISTANCE,
  START_SPEED,
  type Theme,
} from './config';
import { isSliding, jumpHeight, type Obstacle, type RunState } from './engine';
import {
  add,
  box,
  cone,
  hex,
  prism,
  rgbCss,
  rotY,
  Scene,
  sphere,
  v3,
  type Camera,
  type Lighting,
  type RGB,
  type Vec3,
} from './r3d';
import {
  drawBoostGlow,
  drawDanger,
  drawFlame,
  drawItemSprite,
  drawShieldBubble,
  drawSpeedLines,
  drawVignette,
} from './sprites';

/**
 * 유적 탈출 3D 화면 — r3d(자체 소프트웨어 렌더러)로 로우폴리 유적을 그린다.
 *
 * 게임 로직(engine)은 "달린 거리" 기준 1차원 좌표(z)만 안다. 화면에서는 길을 구간으로 나눠
 * 모퉁이마다 90° 씩 돌려 놓는다 — 지나온 구간 / 지금 구간 / 모퉁이 너머 구간.
 * 물체는 자기 z 가 속한 구간의 변환을 그대로 따른다.
 */

/** 레인 1칸의 폭(m) */
const LANE_W = 2;
/** 길 가장자리 (중심에서 m) — 모퉁이 사각형의 반지름이기도 하다 */
const R = 3.2;
/** 이 거리까지 그린다 */
const FAR = SPAWN_DISTANCE + 25;
/** 좁은 길의 반폭(m) — 외통나무 다리 / 외길 능선 */
const LOG_HALF = 0.7;
const LEDGE_HALF = 1.1;
/** 구멍(끊어진 판자) 길이의 절반(m) */
const GAP_HALF = 1.2;
/**
 * 길 옆 지형(풀밭·물)을 까는 폭(m). 너무 넓으면 꺾인 옆 구간의 풀밭이
 * 절벽 구간의 낭떠러지를 덮어 버린다. 화면 가장자리까지 덮기엔 이 정도면 충분하다.
 */
const SIDE_W = 22;
/**
 * 신전 길은 높은 성벽 위를 달린다 — 발밑 정글까지의 깊이(m).
 * 길 옆과 모퉁이 너머가 모두 이만큼 떨어지는 낭떠러지라 아찔하다.
 */
const TEMPLE_DROP = 36;
/** 가장자리가 무너진 구멍 길이의 절반(m) — 화면용 */
const EDGE_HOLE_HALF = 1.6;
/** 모퉁이를 돌 때 화면이 돌아가는 시간(초) */
const TURN_ANIM_SEC = 0.25;

const COL = {
  skyTop: '#1d2b3a',
  skyMid: '#7a4b5a',
  skyLow: '#f0a95c',
  sun: '#ffd98a',
  ruin: '#3a2c3a',
  fog: hex('#c98a5e'),
  fogDeep: hex('#5a4a3a'),
  abyss: hex('#0b1510'),
  // 신전
  grassA: hex('#29492f'),
  grassB: hex('#24422a'),
  stoneA: hex('#948266'),
  stoneB: hex('#86755b'),
  stoneC: hex('#7c6c54'),
  groove: hex('#4a3f31'),
  curb: hex('#6f6450'),
  log: hex('#7a4a26'),
  logRing: hex('#c79a63'),
  pillar: hex('#a0957a'),
  pillarCap: hex('#b3a88c'),
  carve: hex('#4e4637'),
  moss: hex('#4f7a3a'),
  vine: hex('#3f6b2f'),
  torchPost: hex('#5b5241'),
  trunk: hex('#4a3322'),
  leafA: hex('#2f5a33'),
  leafB: hex('#3a6b37'),
  leafC: hex('#274d2c'),
  wall: hex('#8a7e66'),
  wallA: hex('#8a7e66'),
  wallB: hex('#7c7059'),
  wallC: hex('#6f644f'),
  wallMoss: hex('#4d6b39'),
  jungleA: hex('#1f3a26'),
  jungleB: hex('#1b3322'),
  // 물가
  waterA: hex('#2f6f73'),
  waterB: hex('#2a6468'),
  plankA: hex('#8a6a45'),
  plankB: hex('#7d5f3c'),
  plankC: hex('#94744c'),
  plankSeam: hex('#4a3520'),
  post: hex('#5a4028'),
  barkA: hex('#6b4a2c'),
  barkB: hex('#5e4127'),
  barkSide: hex('#4a331f'),
  logRing2: hex('#b88b58'),
  leafBranch: hex('#3f7a36'),
  lily: hex('#4f8a3c'),
  // 절벽
  rockA: hex('#8f918a'),
  rockB: hex('#7f827b'),
  rockC: hex('#989a92'),
  rockMoss: hex('#5f7d45'),
  cliffFace: hex('#5d5f58'),
  spire: hex('#4c4e48'),
  // 공통
  coin: hex('#f5c02e'),
  coinFace: hex('#ffd95a'),
  boulder: hex('#6d655a'),
  boulderStripe: hex('#5a5349'),
  debrisStone: hex('#9b9076'),
  debrisWood: hex('#7a4a26'),
};

const LIGHT: Lighting = {
  // 뒤쪽 왼편 위에서 비추는 빛 — 카메라를 향한 면(캐릭터 등, 장애물 앞면)이 밝게 보인다
  dir: norm3(-0.45, 0.75, -0.5),
  ambient: 0.5,
  diffuse: 0.62,
  tint: [1.08, 0.98, 0.86],
  fog: COL.fog,
  fogStart: 22,
  fogEnd: FAR,
  // 성벽 아래 깊은 정글은 어둡게 가라앉는다
  abyss: COL.abyss,
  abyssDepth: 36,
};

function norm3(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z);
  return v3(x / l, y / l, z / l);
}

/** 음수에도 0 ~ n-1 을 돌려주는 나머지 (띠 번호는 출발 직후 음수일 수 있다) */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** 정수 → 0~1 고정 난수 (같은 나무는 항상 같은 모양) */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface View {
  w: number;
  h: number;
}

export function makeView(w: number, h: number): View {
  return { w, h };
}

export interface FrameInfo {
  /** 애니메이션용 누적 시간(초) — 일시정지 중에는 멈춘다 */
  t: number;
  /** 붙잡힌 뒤 지난 시간(초), 아직이면 null */
  caughtT: number | null;
}

// ---------- 판마다 남는 화면 상태 ----------

interface ViewState {
  anim: CharacterAnimator;
  /** 마지막으로 본 모퉁이 수 — 늘어나면 화면 회전을 시작한다 */
  turnCount: number;
  /** 화면 회전 남은 각도(라디안) — 0 으로 줄어든다 */
  yaw: number;
  yawFrom: number;
  yawT: number;
  lastT: number | null;
}

/** 한 판(RunState)마다 하나 — 판이 끝나면 함께 사라진다 */
const views = new WeakMap<RunState, ViewState>();

function viewFor(run: RunState): ViewState {
  let s = views.get(run);
  if (!s) {
    s = {
      anim: new CharacterAnimator(),
      turnCount: run.turnCount,
      yaw: 0,
      yawFrom: 0,
      yawT: 1,
      lastT: null,
    };
    views.set(run, s);
  }
  return s;
}

/** 모퉁이를 돌면 세상이 (플레이어를 중심으로) 90° 에서 0° 로 부드럽게 돌아온다 */
function updateTurnView(vs: ViewState, run: RunState, t: number): void {
  const dt = vs.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - vs.lastT));
  vs.lastT = t;
  if (run.turnCount !== vs.turnCount) {
    vs.turnCount = run.turnCount;
    // 방금 돈 방향만큼 돌려 놓고 시작하면, 돌기 직전 화면과 이어진다
    vs.yawFrom = (run.prevCorner?.dir ?? 1) * (Math.PI / 2);
    vs.yawT = 0;
  }
  vs.yawT = Math.min(1, vs.yawT + dt / TURN_ANIM_SEC);
  const e = 1 - (1 - vs.yawT) * (1 - vs.yawT) * (1 - vs.yawT);
  vs.yaw = vs.yawFrom * (1 - e);
}

// ---------- 카메라 ----------

/**
 * 추격 카메라 설정 — 템플런처럼 캐릭터 뒤쪽 높은 곳에서 내려다본다.
 * height·back 이 클수록 캐릭터가 작게 보이고 앞길이 넓게 보인다.
 * 지금 값은 템플런 화면 구도에 맞췄다 — 하늘은 위쪽에 조금만 보이고, 캐릭터는 작게
 * 화면 아래 약 3/4 지점에 오며, 뒤쫓는 바위가 화면 맨 아래에 보인다.
 */
export const CAMERA = {
  /** 카메라 높이(m) */
  height: 6.2,
  /** 캐릭터 뒤로 떨어진 거리(m) */
  back: 7.6,
  /** 내려다보는 각도(라디안, 약 34°) */
  pitch: 0.6,
  /** 화면 중심 세로 위치 (화면 높이 비율) — 클수록 캐릭터가 화면 아래쪽에 온다 */
  cy: 0.7,
  /** 초점 거리 배율 — 작을수록 넓게(광각) 보인다 */
  zoom: 1.0,
};

/** 지금 기본 속도가 출발 속도(0) ~ 최고 속도(1) 사이 어디쯤인지 (부스트·감속 제외) */
function speedRatio(run: RunState): number {
  const base = Math.min(MAX_SPEED, START_SPEED + ACCELERATION * run.time);
  return (base - START_SPEED) / (MAX_SPEED - START_SPEED);
}

/** px = 화면에 보이는 플레이어 가로 위치(m) */
function makeCamera(v: View, run: RunState, f: FrameInfo, px: number): Camera {
  // 부스트가 켜지고 꺼질 때 시야가 부드럽게 넓어졌다 좁아진다
  const boost = run.effects.boost;
  const boostK = boost > 0 ? Math.min(1, (ITEMS.boost.duration - boost) / 0.3, boost / 0.3) : 0;
  const base = Math.min(v.w * 1.3, v.h) * CAMERA.zoom;
  // 빨라질수록 시야가 조금씩 넓어져(최대 8%) 주변이 더 빠르게 흘러가 보인다
  const speedK = speedRatio(run);
  // 비틀거린 직후 화면이 흔들린다
  const shake = f.caughtT === null ? (run.slowT / 0.8) * 0.035 : 0;
  return {
    // 가장자리 쪽으로 더 따라가서(0.85) 바깥 레인에 서면 발밑 낭떠러지가 크게 보인다
    pos: v3(px * 0.85, CAMERA.height + jumpHeight(run) * 0.25, -CAMERA.back),
    pitch: CAMERA.pitch,
    // 바깥 레인에 서면 화면이 낭떠러지 쪽으로 살짝 기운다
    roll: Math.sin(f.t * 45) * shake + (px / LANE_W) * 0.035,
    f: base * (1 - speedK * 0.08) * (1 - boostK * 0.14),
    cx: v.w / 2,
    cy: v.h * CAMERA.cy,
  };
}

// ---------- 구간 ----------

/**
 * 길 한 구간. 트랙 좌표 (x = 가로, y = 높이, z = 달린 거리 기준 앞쪽 거리)를
 * anchor 지점에서 yaw 만큼 돌려 화면 좌표로 옮긴다.
 */
interface Seg {
  theme: Theme;
  /** 길을 그리는 z 범위 */
  roadFrom: number;
  roadTo: number;
  anchor: number;
  yaw: number;
  /** 길이 열려 있는 모퉁이 — 이쪽 옆은 연석·나무를 비운다 */
  openings: { z: number; side: -1 | 1 }[];
  /** 막다른 끝 (모퉁이 너머 직진 방향) */
  deadEnd: number | null;
  /** 이 구간의 구멍 위치들 */
  gaps: number[];
  /** 가장자리만 무너진 구멍 (바깥 레인 하나) */
  edgeHoles: { z: number; lane: number }[];
  /** 절벽 구간과 맞닿은 모퉁이 — 그 근처에는 풀밭·물을 깔지 않아 낭떠러지가 드러나게 한다 */
  cliffCorners: number[];
  /** 좁은 길(외통나무·외길)인지 */
  narrow: boolean;
  /** 이 구간이 그리는 모퉁이 발판 위치 (좁은 길은 모퉁이에만 사각형 발판이 있다) */
  platforms: number[];
}

/** 좁은 길의 반폭 */
function narrowHalf(seg: Seg): number {
  return seg.theme === 'river' ? LOG_HALF : LEDGE_HALF;
}

/** z 가 모퉁이 발판 위인지 */
function onPlatform(seg: Seg, z: number): boolean {
  return seg.platforms.some((c) => Math.abs(z - c) <= R);
}

function segTransform(seg: Seg, viewYaw: number): (p: Vec3) => Vec3 {
  if (seg.yaw === 0 && seg.anchor === 0) {
    return viewYaw === 0 ? (p) => p : (p) => rotY(p, viewYaw);
  }
  return (p) =>
    rotY(add(v3(0, 0, seg.anchor), rotY(v3(p.x, p.y, p.z - seg.anchor), seg.yaw)), viewYaw);
}

function buildSegments(run: RunState): { prev: Seg | null; cur: Seg; next: Seg | null } {
  const pc = run.prevCorner;
  const turn = run.turns[0] ?? null;
  const cur: Seg = {
    theme: run.theme,
    roadFrom: pc ? pc.z - R : -14,
    roadTo: turn ? turn.z + R : FAR,
    anchor: 0,
    yaw: 0,
    openings: [],
    deadEnd: turn ? turn.z + R : null,
    gaps: [],
    edgeHoles: [],
    cliffCorners: [],
    narrow: run.narrow,
    platforms: [],
  };
  if (pc) cur.platforms.push(pc.z);
  if (turn) cur.platforms.push(turn.z);
  if (pc) cur.openings.push({ z: pc.z, side: pc.dir });
  if (turn) cur.openings.push({ z: turn.z, side: turn.dir });
  if (pc?.theme === 'cliff') cur.cliffCorners.push(pc.z);
  if (turn?.theme === 'cliff') cur.cliffCorners.push(turn.z);
  const curCliff = run.theme === 'cliff';

  const prev: Seg | null = pc
    ? {
        theme: pc.theme,
        // 회전이 끝나면 카메라 뒤로 가서 거의 안 보이므로 짧게만 그린다
        roadFrom: pc.z - 25,
        roadTo: pc.z - R,
        anchor: pc.z,
        yaw: -pc.dir * (Math.PI / 2),
        openings: [{ z: pc.z, side: pc.dir }],
        deadEnd: pc.z + R,
        gaps: [],
        edgeHoles: [],
        cliffCorners: curCliff ? [pc.z] : [],
        narrow: pc.narrow,
        platforms: [],
      }
    : null;
  const next: Seg | null = turn
    ? {
        theme: turn.theme,
        roadFrom: turn.z + R,
        // 모퉁이 너머는 옆으로 뻗으므로 플레이어에서 실제로 FAR 안쪽까지만
        roadTo: turn.z + Math.max(25, FAR - turn.z),
        anchor: turn.z,
        yaw: turn.dir * (Math.PI / 2),
        openings: [{ z: turn.z, side: turn.dir }],
        deadEnd: null,
        gaps: [],
        edgeHoles: [],
        cliffCorners: curCliff ? [turn.z] : [],
        narrow: turn.narrow,
        platforms: [],
      }
    : null;
  return { prev, cur, next };
}

/** 이 z 가 어느 구간에 속하는지 */
function segAt(z: number, segs: { prev: Seg | null; cur: Seg; next: Seg | null }): Seg {
  if (segs.next && z > segs.next.anchor) return segs.next;
  if (segs.prev && z < segs.prev.anchor) return segs.prev;
  return segs.cur;
}

/** 모퉁이 근처에서 열린 쪽이면 true (그 옆은 새 길이 지나가므로 비운다) */
function blockedByOpening(seg: Seg, side: number, z: number, margin: number): boolean {
  return seg.openings.some((o) => o.side === side && Math.abs(z - o.z) < R + margin);
}

// ---------- 그리기 ----------

export function drawFrame(ctx: CanvasRenderingContext2D, v: View, run: RunState, f: FrameInfo) {
  const vs = viewFor(run);
  updateTurnView(vs, run, f.t);
  // 레인 이동은 화면에서 가속·감속하며 부드럽게 따라간다 (판정은 engine 의 run.x 기준)
  const anim = vs.anim;
  anim.follow(run.x, f.t);
  const px = anim.x * LANE_W;
  const cam = makeCamera(v, run, f, px);
  const scene = new Scene(cam, LIGHT);

  const segs = buildSegments(run);
  for (const o of run.obstacles) {
    if (o.kind === 'gap' && o.edge) segAt(o.z, segs).edgeHoles.push({ z: o.z, lane: o.lane });
    else if (o.kind === 'gap' && o.lane === 0) segAt(o.z, segs).gaps.push(o.z);
  }
  const list = [segs.prev, segs.cur, segs.next].filter((s): s is Seg => s !== null);
  const xf = new Map(list.map((s) => [s, segTransform(s, vs.yaw)]));
  const inSeg = (seg: Seg) => {
    scene.xform = xf.get(seg) ?? null;
  };

  drawSky(ctx, v, cam);

  // 바닥 층 — 옆 지형(물·풀) → 길 → 길 위 무늬 → 그림자 순서로 칠한다
  // 옆 지형(정글 바닥·성벽·절벽 단면·물)은 발밑 층 — 길에 가려진다
  scene.below = true;
  for (const seg of list) {
    inSeg(seg);
    buildSideGround(scene, seg, run.distance);
  }
  scene.below = false;
  for (const seg of list) {
    inSeg(seg);
    buildRoad(scene, seg, run.distance);
  }
  scene.xform = xf.get(segs.cur) ?? null;
  buildShadow(scene, run, px);

  // 길가 장식
  for (const seg of list) {
    inSeg(seg);
    buildRoadside(scene, seg, run.distance, f.t);
  }

  // 발밑 깊은 곳에서 선회하는 새 떼·흘러가는 구름 — 얼마나 높은 곳을 달리는지 느껴지게
  if (run.theme !== 'river') {
    inSeg(segs.cur);
    const depth = run.theme === 'temple' ? TEMPLE_DROP : 14;
    buildAbyssBirds(scene, f.t, depth);
    buildAbyssClouds(scene, run.distance, f.t, depth);
    if (!run.narrow) buildCrumblingEdge(scene, run.distance);
  }
  for (const seg of list) {
    if (seg.edgeHoles.length === 0) continue;
    inSeg(seg);
    for (const h of seg.edgeHoles) buildEdgeHoleRim(scene, h.z, h.lane, seg.theme);
  }

  // 물체
  for (const o of run.obstacles) {
    const seg = segAt(o.z, segs);
    inSeg(seg);
    buildObstacle(scene, o, seg.theme, seg.narrow);
  }
  for (const c of run.coinList) {
    inSeg(segAt(c.z, segs));
    const spin = f.t * 4 + c.z * 0.3;
    const pos = v3(c.x * LANE_W, 0.7 + c.y + Math.sin(f.t * 5 + c.z) * 0.05, c.z);
    prism(
      scene,
      pos,
      v3(Math.cos(spin), 0, Math.sin(spin)),
      0.28,
      0.07,
      10,
      COL.coin,
      COL.coinFace,
    );
  }
  for (const it of run.items) {
    inSeg(segAt(it.z, segs));
    const pos = v3(it.lane * LANE_W, 0.95 + Math.sin(f.t * 4 + it.z) * 0.08, it.z);
    scene.sprite(pos, (c, x, y, s) =>
      drawItemSprite(c, it.kind, x, y, s, f.t, Math.min(1, s / 18)),
    );
  }
  for (const d of run.debris) {
    inSeg(segAt(d.z, segs));
    const size = 0.2 * Math.min(1, d.life * 2);
    box(
      scene,
      v3(d.x * LANE_W, d.y + size / 2, d.z),
      v3(size, size, size),
      d.color === 'wood' ? COL.debrisWood : COL.debrisStone,
    );
  }

  scene.xform = xf.get(segs.cur) ?? null;
  buildPlayer(scene, run, f, anim);
  if (!run.fell) buildBoulder(scene, run, f, px);
  scene.xform = null;

  scene.render(ctx);

  const horizon = cam.cy - Math.tan(cam.pitch) * cam.f;
  // 속도선 — 부스트 중엔 진하게, 최고 속도에 가까워지면 옅게
  const lines = run.effects.boost > 0 ? 1 : Math.max(0, (speedRatio(run) - 0.7) / 0.3) * 0.45;
  if (f.caughtT === null) drawSpeedLines(ctx, v.h, v.w / 2, horizon, f.t, lines);
  drawVignette(ctx, v.w, v.h);
  if (run.stumbleT > 0 && f.caughtT === null) drawDanger(ctx, v.w, v.h, run.stumbleT, f.t);
}

// ---------- 하늘 ----------

function drawSky(ctx: CanvasRenderingContext2D, v: View, cam: Camera) {
  const horizon = cam.cy - Math.tan(cam.pitch) * cam.f;
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, COL.skyTop);
  g.addColorStop(0.6, COL.skyMid);
  g.addColorStop(1, COL.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, horizon + 1);
  // 지평선 아래 — 멀리는 안개색, 화면 아래(발밑 쪽)로 올수록 어두운 심연.
  // 길 옆 낭떠러지가 끝없이 깊어 보이게 한다
  const below = ctx.createLinearGradient(0, horizon, 0, v.h);
  below.addColorStop(0, rgbCss(COL.fog));
  below.addColorStop(0.35, rgbCss(COL.fogDeep));
  below.addColorStop(1, rgbCss(COL.abyss));
  ctx.fillStyle = below;
  ctx.fillRect(0, horizon, v.w, v.h - horizon);

  // 카메라가 좌우로 움직이면 먼 배경은 아주 조금만 따라 움직인다
  const cx = v.w / 2 - cam.pos.x * 4;
  ctx.fillStyle = COL.sun;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, horizon - v.h * 0.03, v.h * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 멀리 보이는 계단식 신전 실루엣
  ctx.fillStyle = COL.ruin;
  const baseW = v.w * 0.36;
  const stepH = v.h * 0.026;
  for (let i = 0; i < 5; i++) {
    const w = baseW * (1 - i * 0.17);
    ctx.fillRect(cx - w / 2, horizon - stepH * (i + 1), w, stepH + 1);
  }
  ctx.fillRect(cx - baseW * 0.07, horizon - stepH * 6.6, baseW * 0.14, stepH * 1.6);

  // 먼 정글 윤곽
  ctx.fillStyle = '#1f3b2c';
  ctx.beginPath();
  ctx.moveTo(0, horizon + 1);
  const bumps = 12;
  for (let i = 0; i <= bumps; i++) {
    const x = (i / bumps) * v.w;
    const center = Math.abs(x - cx) < v.w * 0.22;
    const hgt = center ? v.h * 0.004 : v.h * (0.03 + hash(i) * 0.035);
    ctx.quadraticCurveTo(x - v.w / bumps / 2, horizon - hgt * 1.8, x, horizon - hgt * 0.5);
  }
  ctx.lineTo(v.w, horizon + 1);
  ctx.closePath();
  ctx.fill();
}

// ---------- 바닥 ----------

/** z0 > z1 로 먼 것부터 band 간격 띠를 돌며 cb(띠 앞, 띠 뒤, 띠 번호) 호출 */
function bands(
  from: number,
  to: number,
  band: number,
  distance: number,
  cb: (z0: number, z1: number, idx: number) => void,
) {
  const off = (((distance + to) % band) + band) % band;
  for (let z = to; z > from;) {
    const z1 = Math.max(from, z - (off > 0 && z === to ? off : band));
    cb(z, z1, Math.floor((z1 + distance) / band + 1e-6));
    z = z1;
  }
}

/** 길 옆 지형 — 신전은 풀밭, 물가는 물(길 아래까지 깔아서 구멍으로 보이게), 절벽은 비워 둔다 */
function buildSideGround(scene: Scene, seg: Seg, distance: number) {
  if (seg.theme === 'cliff') {
    // 낭떠러지 단면 — 길 가장자리에서 아래로 떨어지는 바위 벽
    for (const side of [-1, 1] as const) {
      bands(seg.roadFrom, seg.roadTo, 2, distance, (z0, z1) => {
        const zm = (z0 + z1) / 2;
        if (blockedByOpening(seg, side, zm, 0)) return;
        // 좁은 능선은 발판 밖에서만 폭이 좁다
        const x = side * (seg.narrow && !onPlatform(seg, zm) ? narrowHalf(seg) : R);
        scene.face(
          [v3(x, 0, z0), v3(x, 0, z1), v3(x, -9, z1), v3(x, -9, z0)],
          COL.cliffFace,
          {},
          true,
        );
      });
    }
    return;
  }
  if (seg.theme === 'temple') {
    buildTempleWalls(scene, seg, distance);
    return;
  }
  const water = seg.theme === 'river';
  const from = seg.roadFrom - (seg.openings.length > 0 ? R : 0);
  const to = seg.roadTo + (seg.deadEnd !== null ? 30 : 0);
  bands(from, to, 6, distance, (z0, z1, idx) => {
    // 절벽과 맞닿은 모퉁이 근처는 비워서 낭떠러지가 보이게 한다
    if (seg.cliffCorners.some((c) => z0 > c - SIDE_W && z1 < c + SIDE_W)) return;
    const col = water
      ? idx % 2 === 0
        ? COL.waterA
        : COL.waterB
      : idx % 2 === 0
        ? COL.grassA
        : COL.grassB;
    if (water) {
      scene.face(
        [v3(-SIDE_W, 0, z0), v3(SIDE_W, 0, z0), v3(SIDE_W, 0, z1), v3(-SIDE_W, 0, z1)],
        col,
        {},
        true,
      );
    } else {
      for (const side of [-1, 1]) {
        scene.face(
          [
            v3(side * R, 0, z0),
            v3(side * SIDE_W, 0, z0),
            v3(side * SIDE_W, 0, z1),
            v3(side * R, 0, z1),
          ],
          col,
          {},
          true,
        );
      }
      // 막다른 끝 너머도 풀밭
      if (seg.deadEnd !== null && z1 >= seg.deadEnd) {
        scene.face([v3(-R, 0, z0), v3(R, 0, z0), v3(R, 0, z1), v3(-R, 0, z1)], col, {}, true);
      }
    }
  });
}

/** 성벽 한 칸 — 위에서부터 층층이 색을 바꿔 쌓은 돌처럼 보이게 한다 */
function wallFace(scene: Scene, a: Vec3, b: Vec3, idx: number) {
  // a, b = 벽 윗선의 두 끝 (y = 0). 아래로 TEMPLE_DROP 까지 내려간다
  const tiers = [0, -0.35, -3, -8, -TEMPLE_DROP];
  for (let i = 0; i < tiers.length - 1; i++) {
    const y0 = tiers[i] as number;
    const y1 = tiers[i + 1] as number;
    // 맨 윗줄은 이끼, 그 아래는 돌 색을 번갈아
    const col =
      i === 0 ? COL.wallMoss : ([COL.wallA, COL.wallB, COL.wallC][mod(idx + i, 3)] as RGB);
    scene.face(
      [v3(a.x, y0, a.z), v3(b.x, y0, b.z), v3(b.x, y1, b.z), v3(a.x, y1, a.z)],
      col,
      {},
      true,
    );
  }
}

/**
 * 신전 — 길은 높은 성벽 위에 있고, 양옆과 모퉁이 너머는 저 아래 정글까지 뚝 떨어진다.
 * 정글 바닥을 먼저 깔고 그 위에 성벽 옆면을 세운다 (길은 그다음에 덮는다).
 */
function buildTempleWalls(scene: Scene, seg: Seg, distance: number) {
  const y = -TEMPLE_DROP;
  const from = seg.roadFrom - 20;
  const to = seg.roadTo + (seg.deadEnd !== null ? 40 : 0);
  bands(from, to, 6, distance, (z0, z1, idx) => {
    if (seg.cliffCorners.some((c) => z0 > c - SIDE_W && z1 < c + SIDE_W)) return;
    const col = idx % 2 === 0 ? COL.jungleA : COL.jungleB;
    scene.face(
      [
        v3(-SIDE_W * 1.5, y, z0),
        v3(SIDE_W * 1.5, y, z0),
        v3(SIDE_W * 1.5, y, z1),
        v3(-SIDE_W * 1.5, y, z1),
      ],
      col,
      {},
      true,
    );
  });

  // 길 양옆 성벽
  for (const side of [-1, 1] as const) {
    bands(seg.roadFrom, seg.roadTo, 3, distance, (z0, z1, idx) => {
      if (blockedByOpening(seg, side, (z0 + z1) / 2, 0)) return;
      wallFace(scene, v3(side * R, 0, z0), v3(side * R, 0, z1), idx);
    });
  }
  // 길이 끝나는 곳 — 모퉁이 너머 끊긴 끝, 방금 돈 모퉁이 뒤쪽
  if (seg.deadEnd !== null) wallFace(scene, v3(-R, 0, seg.deadEnd), v3(R, 0, seg.deadEnd), 1);
  if (seg.platforms.length > 0 && seg.roadFrom > -14) {
    wallFace(scene, v3(-R, 0, seg.roadFrom), v3(R, 0, seg.roadFrom), 2);
  }
}

/** 길 — 구멍이 있으면 그 부분만 비운다 */
function buildRoad(scene: Scene, seg: Seg, distance: number) {
  if (seg.narrow) {
    buildNarrowRoad(scene, seg, distance);
    return;
  }
  const holes = seg.gaps.map((g) => [g - GAP_HALF, g + GAP_HALF] as const);
  const inHole = (z0: number, z1: number) => holes.some(([a, b]) => z1 < b && z0 > a);
  const theme = seg.theme;
  const tile = theme === 'river' ? 1.1 : 3;
  const palette =
    theme === 'river'
      ? [COL.plankA, COL.plankB, COL.plankC]
      : theme === 'cliff'
        ? [COL.rockA, COL.rockB, COL.rockC]
        : [COL.stoneA, COL.stoneB, COL.stoneC];

  // 구멍 경계로 띠를 잘라 구멍 안쪽은 건너뛴다 (가장자리 구멍 경계도 자른다)
  const edgeEnds = seg.edgeHoles.flatMap((h) => [h.z - EDGE_HOLE_HALF, h.z + EDGE_HOLE_HALF]);
  const edgeHoleAt = (lane: number, z0: number, z1: number) =>
    seg.edgeHoles.some(
      (h) =>
        h.lane === lane && z1 < h.z + EDGE_HOLE_HALF - 0.01 && z0 > h.z - EDGE_HOLE_HALF + 0.01,
    );
  const cuts = [seg.roadFrom, seg.roadTo, ...holes.flat(), ...edgeEnds]
    .filter((z) => z >= seg.roadFrom && z <= seg.roadTo)
    .sort((a, b) => b - a);
  for (let i = 0; i < cuts.length - 1; i++) {
    const hi = cuts[i] as number;
    const lo = cuts[i + 1] as number;
    if (hi - lo < 0.01 || inHole(hi, lo)) continue;
    bands(lo, hi, tile, distance, (z0, z1, idx) => {
      if (theme === 'river') {
        // 판자는 길 전체 폭 한 장씩
        const col = palette[Math.floor(hash(idx) * 3)] as RGB;
        scene.face([v3(-R, 0, z0), v3(R, 0, z0), v3(R, 0, z1), v3(-R, 0, z1)], col, {}, true);
        return;
      }
      for (let lane = -1; lane <= 1; lane++) {
        if (edgeHoleAt(lane, z0, z1)) continue;
        const x0 = lane === -1 ? -R : (lane - 0.5) * LANE_W;
        const x1 = lane === 1 ? R : (lane + 0.5) * LANE_W;
        const col = palette[Math.floor(hash(idx * 3 + lane) * 3)] as RGB;
        scene.face([v3(x0, 0, z0), v3(x1, 0, z0), v3(x1, 0, z1), v3(x0, 0, z1)], col, {}, true);
      }
    });
  }

  // 무늬 — 신전은 레인 홈, 물가는 판자 이음새, 절벽은 이끼
  if (theme === 'river') {
    bands(seg.roadFrom, seg.roadTo, 1.1, distance, (z0, z1) => {
      if (holes.some(([a, b]) => z0 > a && z0 < b)) return;
      if (z0 - z1 < 0.5) return;
      scene.face(
        [v3(-R, 0.005, z0), v3(R, 0.005, z0), v3(R, 0.005, z0 - 0.06), v3(-R, 0.005, z0 - 0.06)],
        COL.plankSeam,
        {},
        true,
      );
    });
  } else if (theme === 'temple') {
    for (const x of [-LANE_W / 2, LANE_W / 2]) {
      scene.face(
        [
          v3(x - 0.05, 0.005, seg.roadTo),
          v3(x + 0.05, 0.005, seg.roadTo),
          v3(x + 0.05, 0.005, seg.roadFrom),
          v3(x - 0.05, 0.005, seg.roadFrom),
        ],
        COL.groove,
        {},
        true,
      );
    }
  } else {
    bands(seg.roadFrom, seg.roadTo, 5, distance, (z0, z1, idx) => {
      if (hash(idx + 71) > 0.55) return;
      const x = (hash(idx + 13) - 0.5) * 4;
      const zm = (z0 + z1) / 2;
      scene.face(
        [
          v3(x - 0.5, 0.005, zm + 0.6),
          v3(x + 0.6, 0.005, zm + 0.3),
          v3(x + 0.3, 0.005, zm - 0.6),
          v3(x - 0.6, 0.005, zm - 0.3),
        ],
        COL.rockMoss,
        {},
        true,
      );
    });
  }
}

/**
 * 좁은 길 — 물가는 외통나무 다리(윗면 + 둥근 옆면), 절벽은 좁은 바위 능선.
 * 모퉁이에는 돌아설 수 있게 사각형 발판을 둔다. 전부 바닥 층이라 캐릭터를 가리지 않는다.
 */
function buildNarrowRoad(scene: Scene, seg: Seg, distance: number) {
  const log = seg.theme === 'river';
  const half = narrowHalf(seg);
  bands(seg.roadFrom, seg.roadTo, log ? 2 : 3, distance, (z0, z1, idx) => {
    const zm = (z0 + z1) / 2;
    if (onPlatform(seg, zm)) {
      // 모퉁이 발판
      const col = log ? ([COL.plankA, COL.plankB, COL.plankC][mod(idx, 3)] as RGB) : COL.rockB;
      scene.face([v3(-R, 0, z0), v3(R, 0, z0), v3(R, 0, z1), v3(-R, 0, z1)], col, {}, true);
      return;
    }
    if (log) {
      // 통나무 — 옆면은 아래로 둥글게 말려 들어간다
      const top = idx % 2 === 0 ? COL.barkA : COL.barkB;
      for (const side of [-1, 1]) {
        scene.face(
          [
            v3(side * half * 0.55, 0, z0),
            v3(side * half, -0.35, z0),
            v3(side * half, -0.35, z1),
            v3(side * half * 0.55, 0, z1),
          ],
          COL.barkSide,
          {},
          true,
        );
        scene.face(
          [
            v3(side * half, -0.35, z0),
            v3(side * half * 0.7, -0.85, z0),
            v3(side * half * 0.7, -0.85, z1),
            v3(side * half, -0.35, z1),
          ],
          COL.barkB,
          {},
          true,
        );
      }
      scene.face(
        [
          v3(-half * 0.55, 0, z0),
          v3(half * 0.55, 0, z0),
          v3(half * 0.55, 0, z1),
          v3(-half * 0.55, 0, z1),
        ],
        top,
        {},
        true,
      );
      // 껍질 결
      if (hash(idx + 5) < 0.5) {
        const x = (hash(idx + 9) - 0.5) * half * 0.8;
        scene.face(
          [
            v3(x - 0.03, 0.004, z0),
            v3(x + 0.03, 0.004, z0),
            v3(x + 0.03, 0.004, z1),
            v3(x - 0.03, 0.004, z1),
          ],
          COL.barkSide,
          {},
          true,
        );
      }
      return;
    }
    const col = [COL.rockA, COL.rockB, COL.rockC][Math.floor(hash(idx) * 3)] as RGB;
    scene.face(
      [v3(-half, 0, z0), v3(half, 0, z0), v3(half, 0, z1), v3(-half, 0, z1)],
      col,
      {},
      true,
    );
  });

  // 통나무 끝 — 발판과 만나는 곳에 나이테 단면
  if (log) {
    for (const c of seg.platforms) {
      for (const end of [c - R, c + R]) {
        if (end < seg.roadFrom || end > seg.roadTo) continue;
        scene.face(
          [
            v3(-half * 0.55, 0.002, end),
            v3(half * 0.55, 0.002, end),
            v3(half, -0.35, end),
            v3(half * 0.7, -0.85, end),
            v3(-half * 0.7, -0.85, end),
            v3(-half, -0.35, end),
          ],
          COL.logRing2,
          {},
          true,
        );
      }
    }
  }
}

function buildShadow(scene: Scene, run: RunState, px: number) {
  const h = jumpHeight(run);
  const k = 1 - h / 2.6;
  const x = px;
  const pts: Vec3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(v3(x + Math.cos(a) * 0.45 * k, 0.01, Math.sin(a) * 0.35 * k));
  }
  if (!run.fell) scene.face(pts, hex('#000000'), { emissive: true, alpha: 0.3 * k }, true);

  // 자석 — 바닥에서 퍼져 나가는 붉은 고리
  if (run.effects.magnet > 0 && run.status === 'running') {
    const t = run.time;
    for (let i = 0; i < 2; i++) {
      const p = (t * 1.2 + i * 0.5) % 1;
      const r = 0.5 + p * 1.6;
      scene.sprite(v3(x, 0.02, 0), (ctx, sx, sy, s) => {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 90, 90, ${0.55 * (1 - p)})`;
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.ellipse(sx, sy, r * s, r * s * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }
  }
}

// ---------- 길가 ----------

function buildRoadside(scene: Scene, seg: Seg, distance: number, t: number) {
  if (seg.theme === 'temple') buildTempleSide(scene, seg, distance, t);
  else if (seg.theme === 'river') buildRiverSide(scene, seg, distance);
  else buildCliffSide(scene, seg, distance);

  // 막다른 끝
  if (seg.deadEnd !== null) {
    const z = seg.deadEnd + 0.5;
    if (seg.theme === 'temple') {
      // 길이 뚝 끊긴 가장자리 — 부서진 돌 조각이 걸쳐 있다
      const edge = seg.deadEnd;
      const rubble: [number, number, number, number][] = [
        [-2.4, 0.5, 0.35, 0.8],
        [-0.9, 0.35, 0.25, 0.6],
        [0.7, 0.6, 0.4, 0.9],
        [2.2, 0.4, 0.3, 0.7],
      ];
      for (const [x, w, h, d] of rubble) {
        box(scene, v3(x, h / 2, edge - d / 2 + 0.2), v3(w * 2, h, d), COL.wallB);
      }
      // 모서리에 매달린 덩굴 (길보다 아래라 발밑 층)
      scene.below = true;
      // 끊긴 가장자리에서 계속 부서져 떨어지는 돌 부스러기
      for (let i = 0; i < 5; i++) {
        const p = (t * 0.45 + i * 0.37) % 1;
        const x = -2.6 + i * 1.3 + Math.sin(i * 7.1) * 0.3;
        const size = 0.12 + (i % 3) * 0.05;
        box(
          scene,
          v3(x, -p * p * TEMPLE_DROP, edge + 0.3 + p * 1.2),
          v3(size, size, size),
          COL.wallB,
        );
      }
      for (const x of [-1.8, 0.2, 1.6])
        box(scene, v3(x, -1.4, edge + 0.05), v3(0.08, 2.6, 0.06), COL.vine);
      scene.below = false;
    } else if (seg.theme === 'river') {
      for (const side of [-1, 1])
        box(scene, v3(side * (R - 0.2), 0.5, z - 0.4), v3(0.25, 1.2, 0.25), COL.post);
    }
  }
}

function buildTempleSide(scene: Scene, seg: Seg, distance: number, t: number) {
  // 가장자리 — 이어진 연석 대신 드문드문 남은 부서진 돌. 가장자리가 훤히 뚫려 보여야 무섭다
  bands(seg.roadFrom, seg.roadTo, 4, distance, (z0, z1, idx) => {
    if (z0 - z1 < 0.5) return;
    const zm = (z0 + z1) / 2;
    for (const side of [-1, 1] as const) {
      if (blockedByOpening(seg, side, zm, 0)) continue;
      if (hash(idx * 2 + side) > 0.35) continue;
      if (seg.edgeHoles.some((h) => h.lane === side && Math.abs(zm - h.z) < EDGE_HOLE_HALF + 2)) {
        continue;
      }
      const len = 0.6 + hash(idx + side * 5) * 0.9;
      const h = 0.18 + hash(idx * 3 + side) * 0.3;
      box(scene, v3(side * (R - 0.2), h / 2, zm), v3(0.4, h, len), COL.curb);
    }
  });

  // 횃불 기둥 — 14m 간격
  bands(seg.roadFrom, seg.roadTo, 14, distance, (z0, _z1, idx) => {
    for (const side of [-1, 1] as const) {
      if (blockedByOpening(seg, side, z0, 1)) continue;
      if (seg.edgeHoles.some((h) => h.lane === side && Math.abs(z0 - h.z) < EDGE_HOLE_HALF + 1)) {
        continue;
      }
      const x = side * (R - 0.25);
      box(scene, v3(x, 1.1, z0), v3(0.32, 2.2, 0.32), COL.torchPost);
      box(scene, v3(x, 2.25, z0), v3(0.46, 0.14, 0.46), COL.pillarCap);
      scene.sprite(v3(x, 2.55, z0), (ctx, sx, sy, s) =>
        drawFlame(ctx, sx, sy, s, t, idx * 3 + side, Math.min(1, s / 12)),
      );
    }
  });

  // 나무는 성벽에서 멀찍이 — 길 바로 옆은 텅 빈 심연이어야 아찔하다
  buildTrees(scene, seg, distance, [COL.leafA, COL.leafB, COL.leafC], 8, -TEMPLE_DROP);
}

/** 나무 — 양옆 두 줄. 거리 기준 고정 위치라 같은 나무가 계속 같은 모습으로 지나간다 */
function buildTrees(
  scene: Scene,
  seg: Seg,
  distance: number,
  leaves: RGB[],
  inner: number,
  /** 나무가 서 있는 높이 — 신전은 성벽 아래 정글 바닥에서 자란다 */
  baseY = 0,
) {
  const gap = 7;
  const to = seg.roadTo + (seg.deadEnd !== null ? 12 : 0);
  const first = Math.floor((seg.roadFrom + distance) / gap);
  const last = Math.floor((to + distance) / gap);
  for (let k = first; k <= last; k++) {
    const z = k * gap - distance;
    for (const side of [-1, 1] as const) {
      for (const row of [0, 1]) {
        const id = k * 4 + (side + 1) + row;
        const zz = z + hash(id + 7) * 3;
        if (zz < seg.roadFrom || zz > to) continue;
        // 모퉁이 쪽은 새 길이 지나가므로 비운다
        if (blockedByOpening(seg, side, zz, 3 + row * 4)) continue;
        // 뒷줄 나무는 멀거나 옆 구간이면 거의 안 보이므로 그리지 않는다 (면 수 절약)
        if (row === 1 && (zz > 50 || seg.anchor !== 0)) continue;
        const x = side * (R + inner + row * 4 + hash(id) * 2.2);
        // 깊은 정글의 나무 — 꼭대기가 길보다 한참(약 20m) 아래라 까마득히 내려다보인다
        const tall = baseY < 0;
        const h = tall
          ? -baseY * (0.36 + hash(id + 3) * 0.14) - row * 2
          : 3.2 + hash(id + 3) * 2.2 + row * 1.2;
        const girth = tall ? 2.4 : 1;
        // 길보다 아래에서 자라는 나무는 발밑 층 — 길 위로 삐져나와 보이지 않게
        scene.below = tall;
        const leaf = leaves[Math.floor(hash(id + 9) * leaves.length)] as RGB;
        box(scene, v3(x, baseY + h * 0.2, zz), v3(0.35 * girth, h * 0.4, 0.35 * girth), COL.trunk);
        cone(
          scene,
          v3(x, baseY + h * 0.3, zz),
          (1.3 + row * 0.4) * girth,
          h * 0.55,
          5,
          leaf,
          hash(id) * 3,
        );
        cone(
          scene,
          v3(x, baseY + h * 0.62, zz),
          (0.95 + row * 0.3) * girth,
          h * 0.42,
          5,
          leaf,
          hash(id) * 5,
        );
      }
    }
  }
  scene.below = false;
}

/** 물가 — 판자 다리 양옆 나무 말뚝, 물 위 연잎, 먼 물가의 나무 */
function buildRiverSide(scene: Scene, seg: Seg, distance: number) {
  bands(seg.roadFrom, seg.roadTo, 6, distance, (z0, _z1, idx) => {
    for (const side of [-1, 1] as const) {
      if (blockedByOpening(seg, side, z0, 0.5)) continue;
      if (!seg.narrow) box(scene, v3(side * (R + 0.1), 0.15, z0), v3(0.28, 1.1, 0.28), COL.post);
      // 연잎
      if (hash(idx * 2 + side) < 0.5) {
        const x = side * (R + 1.5 + hash(idx + side) * 5);
        prism(scene, v3(x, 0.02, z0 - 2), v3(0, 1, 0), 0.5, 0.03, 7, COL.lily);
      }
    }
  });
  buildTrees(scene, seg, distance, [COL.leafB, COL.leafC], 9);
}

/** 절벽 — 가장자리 바위, 안개 속 아래쪽으로 솟은 바위 기둥 */
function buildCliffSide(scene: Scene, seg: Seg, distance: number) {
  bands(seg.roadFrom, seg.roadTo, 5, distance, (z0, _z1, idx) => {
    for (const side of [-1, 1] as const) {
      if (blockedByOpening(seg, side, z0, 0.5)) continue;
      if (!seg.narrow && hash(idx * 5 + side) < 0.55) {
        const s = 0.4 + hash(idx + side * 3) * 0.5;
        box(
          scene,
          v3(side * (R - 0.1), s / 2 - 0.05, z0 - 1.5),
          v3(s * 1.2, s, s * 1.4),
          COL.rockB,
        );
      }
      // 낭떠러지 아래 바위 기둥
      if (hash(idx * 7 + side) < 0.35) {
        const x = side * (R + 6 + hash(idx * 3 + side) * 14);
        const top = -3 - hash(idx + 5) * 5;
        scene.below = true;
        box(scene, v3(x, (top - 30) / 2, z0), v3(2.2, 30 + top, 2.2), COL.spire);
        box(scene, v3(x, top + 0.1, z0), v3(2.4, 0.2, 2.4), COL.rockMoss);
        scene.below = false;
      }
    }
  });
}

/**
 * 길 아래 심연에서 원을 그리며 나는 새들. 발밑 층이라 길에 가려지고, 깊을수록 어둡다.
 * 날갯짓은 V 자 두 선의 각도로 표현한다.
 */
function buildAbyssBirds(scene: Scene, t: number, depth: number) {
  scene.below = true;
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const a = t * (0.35 + i * 0.07) + i * 1.9;
    const cx = side * (9 + (i % 3) * 4);
    const pos = v3(
      cx + Math.cos(a) * 4,
      -depth * (0.35 + (i % 3) * 0.15),
      12 + i * 7 + Math.sin(a) * 5,
    );
    const flap = Math.sin(t * 9 + i * 2);
    scene.sprite(pos, (ctx, x, y, s) => {
      const w = s * 0.9;
      if (w < 1.5) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(10, 16, 12, 0.75)';
      ctx.lineWidth = Math.max(1, w * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - w, y - flap * w * 0.35);
      ctx.lineTo(x, y + w * 0.15);
      ctx.lineTo(x + w, y - flap * w * 0.35);
      ctx.stroke();
      ctx.restore();
    });
  }
  scene.below = false;
}

/**
 * 발밑 아래로 흘러가는 구름 — 멀리 있는 만큼 느리게 흘러(시차) 깊이가 느껴진다.
 * 발밑 층이라 길에 가려지고, 길 옆 낭떠러지 사이로만 보인다.
 */
function buildAbyssClouds(scene: Scene, distance: number, t: number, depth: number) {
  scene.below = true;
  const gap = 16;
  // 아래 있는 것은 덜 움직여 보인다 — 거리의 절반만 흘러간다
  const d = distance * 0.5;
  const first = Math.floor((d - 10) / gap);
  for (let k = first; k < first + 7; k++) {
    const z = k * gap - d;
    for (const side of [-1, 1]) {
      const id = k * 2 + side;
      if (hash(id + 31) < 0.3) continue;
      const x = side * (R + 5 + hash(id) * 16) + Math.sin(t * 0.3 + id) * 1.5;
      const y = -depth * (0.45 + hash(id + 3) * 0.25);
      const w = 5 + hash(id + 7) * 6;
      scene.sprite(v3(x, y, z), (ctx, sx, sy, s) => {
        const rx = w * s;
        if (rx < 4) return;
        ctx.save();
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
        g.addColorStop(0, 'rgba(235, 225, 210, 0.32)');
        g.addColorStop(1, 'rgba(235, 225, 210, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx, sy, rx, rx * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  }
  scene.below = false;
}

/**
 * 부서져 떨어지는 가장자리 돌 — 길 가장자리의 돌 조각이, 다가가는 동안 떨어져 나가
 * 낭떠러지로 떨어진다. 위치는 거리 기준 고정이라 매번 같은 곳에서 부서진다.
 */
function buildCrumblingEdge(scene: Scene, distance: number) {
  const gap = 7;
  const first = Math.floor(distance / gap);
  for (let k = first; k < first + 5; k++) {
    const z = k * gap - distance + 3;
    const side = hash(k + 101) < 0.5 ? -1 : 1;
    // 25m 앞부터 떨어지기 시작해 발밑을 지날 즈음엔 한참 아래
    const p = Math.max(0, Math.min(1, (25 - z) / 25));
    if (p <= 0) continue;
    const y = -p * p * 16;
    const x = side * (R + 0.15 + p * 1.2);
    const size = 0.22 + hash(k + 5) * 0.2;
    scene.below = y < -0.2;
    box(scene, v3(x, y + size / 2, z), v3(size, size, size), COL.wallB);
  }
  scene.below = false;
}

/** 무너진 가장자리 테두리 — 구멍 안쪽 선을 따라 금 간 돌 조각이 걸쳐 있다 */
function buildEdgeHoleRim(scene: Scene, z: number, lane: number, theme: Theme) {
  const col = theme === 'cliff' ? COL.rockB : COL.wallB;
  const inner = lane * (LANE_W / 2);
  const pieces: [number, number, number][] = [
    [-1.2, 0.35, 0.18],
    [-0.2, 0.25, 0.12],
    [0.9, 0.4, 0.2],
  ];
  for (const [dz, w, h] of pieces) {
    box(scene, v3(inner + lane * 0.15, h / 2, z + dz), v3(w, h, w * 1.3), col);
  }
  // 앞뒤 끊긴 단면
  for (const end of [-EDGE_HOLE_HALF, EDGE_HOLE_HALF]) {
    box(
      scene,
      v3(lane * (LANE_W / 2 + (R - LANE_W / 2) / 2), -0.05, z + end),
      v3(R - LANE_W / 2, 0.1, 0.15),
      col,
    );
  }
}

// ---------- 장애물 ----------

function buildObstacle(scene: Scene, o: Obstacle, theme: Theme, narrow: boolean) {
  if (o.smashed || o.kind === 'gap') return;
  if (narrow) {
    // 좁은 길은 판정용으로 세 레인에 놓였지만 가운데 하나만 좁은 폭에 맞춰 그린다
    if (o.lane === 0) buildNarrowObstacle(scene, o, theme);
    return;
  }
  const x = o.lane * LANE_W;
  const z = o.z;
  const cliff = theme === 'cliff';
  if (o.kind === 'low') {
    // 쓰러진(물가에선 떠내려온) 통나무
    prism(scene, v3(x, 0.3, z), v3(1, 0, 0), 0.3, LANE_W * 0.92, 8, COL.log, COL.logRing);
    box(scene, v3(x - 0.3, 0.6, z), v3(0.5, 0.08, 0.12), COL.moss);
  } else if (o.kind === 'high') {
    // 무너진 문 — 양쪽 기둥 + 들보. 아래로 미끄러져 지나간다 (절벽에선 바위 아치)
    const half = LANE_W * 0.46;
    const post = cliff ? COL.rockB : COL.pillar;
    const beam = cliff ? COL.rockC : COL.pillarCap;
    for (const side of [-1, 1])
      box(scene, v3(x + side * (half - 0.12), 0.95, z), v3(0.24, 1.9, 0.34), post);
    box(scene, v3(x, 1.6, z), v3(LANE_W * 0.96, 0.5, 0.42), beam);
    box(scene, v3(x, 1.88, z), v3(LANE_W * 0.96, 0.08, 0.44), cliff ? COL.rockMoss : COL.moss);
    for (const k of [-0.5, 0.1, 0.55])
      box(scene, v3(x + k, 1.2, z - 0.22), v3(0.06, 0.35, 0.04), COL.vine);
  } else if (cliff) {
    // 굴러떨어진 바위
    box(scene, v3(x, 0.8, z), v3(1.4, 1.6, 1.1), COL.rockB);
    box(scene, v3(x + 0.1, 1.75, z + 0.05), v3(1.0, 0.5, 0.8), COL.rockA);
    box(scene, v3(x - 0.2, 2.05, z), v3(0.6, 0.25, 0.5), COL.rockMoss);
  } else {
    // 돌기둥 — 레인을 통째로 막는다. 카메라 쪽 면에 얼굴 문양
    box(scene, v3(x, 1.4, z), v3(1.3, 2.8, 0.9), COL.pillar);
    box(scene, v3(x, 2.88, z), v3(1.45, 0.18, 1.0), COL.pillarCap);
    box(scene, v3(x, 2.99, z), v3(1.3, 0.06, 0.9), COL.moss);
    const front = z - 0.46;
    box(scene, v3(x - 0.28, 1.95, front), v3(0.26, 0.18, 0.04), COL.carve);
    box(scene, v3(x + 0.28, 1.95, front), v3(0.26, 0.18, 0.04), COL.carve);
    box(scene, v3(x, 1.55, front), v3(0.14, 0.3, 0.04), COL.carve);
    box(scene, v3(x, 1.12, front), v3(0.6, 0.12, 0.04), COL.carve);
  }
}

/** 좁은 길 장애물 — 통나무 위 가지(점프), 능선 위로 튀어나온 바위 아치(슬라이드), 떨어진 돌(점프) */
function buildNarrowObstacle(scene: Scene, o: Obstacle, theme: Theme) {
  const z = o.z;
  if (theme === 'river') {
    // 통나무에서 가로로 뻗은 굵은 가지 + 잎
    prism(scene, v3(0, 0.28, z), v3(1, 0, 0.15), 0.26, 2.2, 7, COL.log, COL.logRing);
    box(scene, v3(0.95, 0.55, z + 0.1), v3(0.7, 0.35, 0.6), COL.leafBranch);
    box(scene, v3(-0.8, 0.5, z - 0.05), v3(0.5, 0.3, 0.5), COL.leafBranch);
    return;
  }
  if (o.kind === 'high') {
    // 한쪽 벽에서 튀어나온 바위 아치 — 아래로 미끄러져 지나간다
    for (const side of [-1, 1])
      box(scene, v3(side * (LEDGE_HALF + 0.05), 0.95, z), v3(0.3, 1.9, 0.5), COL.rockB);
    box(scene, v3(0, 1.62, z), v3(LEDGE_HALF * 2 + 0.7, 0.55, 0.55), COL.rockC);
    box(scene, v3(0, 1.92, z), v3(LEDGE_HALF * 2 + 0.7, 0.08, 0.58), COL.rockMoss);
    return;
  }
  // 굴러떨어진 돌 — 낮아서 점프로 넘는다
  box(scene, v3(0, 0.28, z), v3(1.3, 0.56, 0.7), COL.rockB);
  box(scene, v3(0.15, 0.6, z), v3(0.7, 0.18, 0.5), COL.rockA);
}

// ---------- 플레이어 ----------

function buildPlayer(scene: Scene, run: RunState, f: FrameInfo, anim: CharacterAnimator) {
  const caught = f.caughtT !== null;
  const lift = jumpHeight(run);
  const x = anim.x * LANE_W;
  let y = lift;
  let z = 0;
  let pose: Pose3d = caught ? 'fallen' : isSliding(run) ? 'slide' : lift > 0 ? 'jump' : 'run';
  // 물에 빠지면 수면 아래는 그리지 않는다 (바닥은 가려 그리지 않으므로 직접 숨긴다)
  let hideBelow = -12;
  if (caught && run.fell) {
    // 떨어짐 — 모퉁이를 못 돌았으면 길 끝까지 달려 나가 떨어지고, 구멍이면 제자리에서 빠진다
    const ft = f.caughtT ?? 0;
    pose = 'jump';
    z = run.crashedInto ? 0 : Math.min(ft * 6, R + 1.2);
    const dropT = run.crashedInto ? ft : Math.max(0, ft - (R + 1.2) / 6);
    y = -4.9 * dropT * dropT;
    if (run.theme === 'river') {
      hideBelow = -0.9;
      if (y < -0.5) {
        const k = Math.min(1, (-y - 0.5) / 3);
        scene.sprite(v3(x, 0.03, z), (ctx, sx, sy, s) => {
          ctx.save();
          ctx.strokeStyle = `rgba(230, 245, 255, ${0.8 * (1 - k)})`;
          ctx.lineWidth = Math.max(1.5, s * 0.06);
          for (const r of [0.5 + k * 1.6, 0.3 + k * 1.0]) {
            ctx.beginPath();
            ctx.ellipse(sx, sy, r * s, r * s * 0.35, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        });
      }
    }
  }
  const wobble = !caught && run.slowT > 0 ? Math.sin(f.t * 32) * 0.2 * (run.slowT / 0.8) : 0;
  // 무적(부스트 끝·방패 깨진 직후)일 때는 깜빡인다 — 깜빡이는 순간엔 그리지 않는다
  const blink = !caught && run.invulnT > 0 && run.effects.boost === 0 && Math.sin(f.t * 40) > 0.4;

  if (!caught && run.effects.boost > 0) {
    scene.sprite(v3(x, 0.9, 0.5), (ctx, sx, sy, s) => drawBoostGlow(ctx, sx, sy, s, f.t));
  }
  // 길 아래로 떨어지는 중이면 발밑 층에 그려서 길 가장자리 너머로 사라지게 한다
  scene.below = y < -0.3;
  if (!blink && y > hideBelow) {
    drawCharacter3d(
      scene,
      v3(x, y, z),
      {
        pose,
        // 빨라질수록 걸음도 빨라진다 (일시정지 중엔 멈춘다)
        phase: anim.runPhase(run.speed, f.t),
        jumpP: run.fell ? 0.5 : run.jumpT / JUMP_SEC,
        // 출발 속도 0 → 최고 속도 1 (부스트 중엔 1 을 넘지만 캐릭터 쪽에서 1 로 자른다)
        intensity: (run.speed - START_SPEED) / (MAX_SPEED - START_SPEED),
        fallenT: f.caughtT ?? 0,
      },
      // 옆으로 움직이는 속도만큼 기울고, 비틀거리면 휘청거린다
      anim.tilt + wobble,
      anim,
      f.t,
    );
  }
  scene.below = false;
  if (!caught && run.effects.shield > 0) {
    // 끝나기 2초 전부터 깜빡여서 곧 사라진다는 걸 알린다
    const ending = run.effects.shield < 2 && Math.sin(f.t * 20) < 0;
    if (!ending)
      scene.sprite(v3(x, 0.95 + lift, -0.7), (ctx, sx, sy, s) =>
        drawShieldBubble(ctx, sx, sy, s, f.t),
      );
  }
}

/**
 * 뒤에서 굴러오는 바위 — 평소엔 땅 밑으로 숨어 있다가 비틀거리면 화면 아래로 솟아오르고,
 * 잡히면 앞으로 굴러와 플레이어를 덮친다.
 */
function buildBoulder(scene: Scene, run: RunState, f: FrameInfo, px: number) {
  const r = 1.6;
  let y: number;
  let z: number;
  if (f.caughtT !== null) {
    const p = Math.min(1, f.caughtT / 1.1);
    y = -0.3 + p * 1.9;
    z = -3.4 + p * 2.6;
  } else {
    // 바짝 붙어도 꼭대기가 카메라→캐릭터 시선보다 낮아서 캐릭터를 가리지 않는다
    y = -2.2 + run.chase * 2.2;
    z = -3.4;
  }
  if (y + r < 0.05) return;
  const x = px * 0.7;
  const spin = run.distance / r;
  sphere(scene, v3(x, y, z), r, COL.boulder, spin, 6, 10, COL.boulderStripe);
}
