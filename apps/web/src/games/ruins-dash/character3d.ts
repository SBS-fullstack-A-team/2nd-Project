import type { HatId, Look, PackId, SuitId } from './looks';
import {
  add,
  box,
  cross,
  dot,
  norm,
  hex,
  limb,
  mul,
  prism,
  rotX,
  rotY,
  rotZ,
  sub,
  v3,
  type Scene,
  type Vec3,
} from './r3d';

/**
 * 3D 탐험가 — 상자를 관절로 이어 붙인 로우폴리 캐릭터.
 * 로컬 좌표는 두 발 사이 바닥이 원점 (x 오른쪽, y 위, z 앞). 단위 m, 키 약 1.75m.
 */

/** 기본 색 (탐험가 옷) */
const BASE = {
  skin: hex('#e2ae84'),
  hair: hex('#3a2718'),
  shirt: hex('#cdb88c'),
  sleeve: hex('#b8a174'),
  pants: hex('#5e4c37'),
  /** 정강이 — 반바지면 맨살 */
  shin: hex('#5e4c37'),
  boot: hex('#3d2a1b'),
  sole: hex('#1c130c'),
  belt: hex('#2e2015'),
  pack: hex('#7d5b39'),
  packFlap: hex('#946c45'),
  pocket: hex('#5a3f27'),
  roll: hex('#8e3a2a'),
  hat: hex('#8a6036'),
  hatBand: hex('#2e2015'),
};

type Palette = typeof BASE;

/** 옷마다 바뀌는 색 */
const SUIT_PALETTE: Record<SuitId, Palette> = {
  explorer: BASE,
  ranger: {
    ...BASE,
    shirt: hex('#8a9a5b'),
    sleeve: hex('#7a8a4e'),
    pants: hex('#b49a6a'),
    shin: hex('#e2ae84'),
    boot: hex('#4a3a24'),
    belt: hex('#3b3020'),
  },
  nomad: {
    ...BASE,
    shirt: hex('#e4d8bc'),
    sleeve: hex('#d6c8a8'),
    pants: hex('#c9b48c'),
    shin: hex('#c9b48c'),
    boot: hex('#8a6a44'),
    belt: hex('#a8392f'),
  },
  golden: {
    ...BASE,
    shirt: hex('#d9a93a'),
    sleeve: hex('#b88a2a'),
    pants: hex('#6b4a22'),
    shin: hex('#6b4a22'),
    boot: hex('#8a6a22'),
    belt: hex('#f0c64a'),
  },
};

/** 소품 색 (옷과 상관없이 같은 것) */
const K = {
  vest: hex('#4f5a32'),
  vestPocket: hex('#434d2a'),
  scarf: hex('#b8453a'),
  scarfDark: hex('#9a362d'),
  gold: hex('#f0c64a'),
  goldDark: hex('#c29528'),
  gemRed: hex('#e0443a'),
  gemBlue: hex('#3a8ee0'),
  safari: hex('#e8dcb5'),
  safariBand: hex('#8a6a3e'),
  bandana: hex('#c23b32'),
  minerHat: hex('#e8b62c'),
  minerRim: hex('#b8871c'),
  lamp: hex('#3a3a40'),
  lampGlass: hex('#fff3b0'),
  propCap: hex('#3a7bd5'),
  propStripe: hex('#e0443a'),
  propBlade: hex('#ffd23f'),
  iron: hex('#8e8e96'),
  bronze: hex('#b0793a'),
  horn: hex('#efe6d0'),
  hornTip: hex('#c9bb96'),
  tube: hex('#6b4428'),
  tubeCap: hex('#c29528'),
  paper: hex('#efe3c4'),
  sack: hex('#a8864f'),
  sackDark: hex('#8a6c3c'),
  rope: hex('#5a4228'),
  coin: hex('#ffd23f'),
  shieldWood: hex('#8a5a32'),
  shieldRim: hex('#9a9aa2'),
  shieldBoss: hex('#c9c9d0'),
};

/** 지금 그리는 캐릭터의 색 — drawCharacter3d 가 옷에 맞게 바꾼다 */
let C: Palette = BASE;

const THIGH = 0.44;
const SHIN = 0.44;
const UPPER_ARM = 0.3;
const FOREARM = 0.27;

export type Pose3d = 'run' | 'jump' | 'slide' | 'fallen';

export interface Character3dState {
  pose: Pose3d;
  /** 달리기 주기 위상 (라디안) */
  phase: number;
  /** 점프 진행도 (0 = 도약, 1 = 착지) */
  jumpP: number;
  /** 달리기 세기 (0 = 출발 속도, 1 = 최고 속도·부스트) — 빨라질수록 더 숙이고 크게 뛴다 */
  intensity: number;
  /** 잡힌 뒤 지난 시간(초) */
  fallenT: number;
}

/** 각도 a 로 뻗은 방향 — 0 이면 아래, 양수면 앞(+z) 으로 들린다 */
function dirAt(a: number): Vec3 {
  return v3(0, -Math.cos(a), Math.sin(a));
}

/** 관절 각도 묶음 — 자세끼리 섞을 수 있게 숫자로만 이루어져 있다 */
interface Rig {
  /** 엉덩이 중심 높이 */
  hipY: number;
  /** 몸통 기울기 — 양수면 앞으로 숙임 */
  lean: number;
  /** 몸통 비틀기 (y축, 팔 흔들기와 함께) */
  twist: number;
  /** 몸통 좌우 흔들림 (z축) */
  sway: number;
  /** 다리별 [허벅지 각도, 무릎 굽힘] */
  legs: [number, number][];
  /** 팔별 [윗팔 각도, 팔꿈치 굽힘, 바깥으로 벌림(m)] */
  arms: [number, number, number][];
}

/** 0~1 을 부드럽게 (양 끝에서 천천히) */
function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function rigFor(s: Character3dState): Rig {
  const legs: [number, number][] = [];
  const arms: [number, number, number][] = [];
  switch (s.pose) {
    case 'run': {
      // 템플런식 질주 — 몸은 발목부터 앞으로 기울인 운동선수 자세, 대신 팔다리를 크게 쓴다
      const k = Math.max(0, Math.min(1, s.intensity));
      for (const i of [0, 1]) {
        const ph = s.phase + i * Math.PI;
        const swing = Math.sin(ph);
        // 발뒤꿈치 차올리기 — 허벅지가 몸 아래를 지나 앞으로 나올 때 무릎이 가장 많이 접혀
        // 발이 엉덩이 가까이 올라온다(뒤에서 따라가는 카메라에 밑창이 보인다).
        // 제곱한 코사인이라 꺾이는 곳 없이 이어진다
        const fold = (1 + Math.cos(ph + 0.2)) / 2;
        // 무릎 들기 — 앞으로 약 60°, 뒤로 약 40°
        legs.push([0.2 + swing * (0.85 + k * 0.08), 0.45 + fold * fold * (1.85 + k * 0.1)]);
        // 팔 펌핑 — 팔꿈치 약 90°, 손이 가슴 높이까지 올라온다.
        // 템플런처럼 팔이 몸 바깥으로 벌어진 채 흔들리고, 뒤로 갈 때 팔꿈치가 더 벌어진다
        const a = -swing * (1.05 + k * 0.15);
        arms.push([
          a,
          1.55 + Math.max(0, a) * 0.25,
          0.07 + Math.max(0, swing) * 0.06 - Math.max(0, -swing) * 0.03,
        ]);
      }
      return {
        hipY: 0.93,
        // 약 17° → 최고 속도 20°
        lean: 0.3 + k * 0.06,
        twist: Math.sin(s.phase) * 0.2,
        sway: Math.cos(s.phase * 2) * 0.035,
        legs,
        arms,
      };
    }
    case 'jump': {
      // 올라가면서 웅크렸다가 내려올 때 다리를 편다
      const tuck = Math.sin(Math.PI * Math.min(1, s.jumpP * 1.15));
      legs.push([0.35 + tuck * 0.6, 0.45 + tuck * 1.05], [0.05 + tuck * 0.35, 0.3 + tuck * 0.95]);
      const armUp = 1.2 + tuck * 1.1;
      arms.push([armUp, 0.45, 0.06 + tuck * 0.1], [armUp, 0.45, 0.06 + tuck * 0.1]);
      return { hipY: 0.9 - tuck * 0.1, lean: 0.14, twist: 0, sway: 0, legs, arms };
    }
    case 'slide':
      // 발을 앞으로 뻗고 상체를 뒤로 눕혀 두 팔로 바닥을 짚는다
      legs.push([1.35, 0.1], [1.3, 0.2]);
      arms.push([-0.5, 0.15, 0.3], [-0.5, 0.15, 0.3]);
      return { hipY: 0.3, lean: -1.15, twist: 0, sway: 0, legs, arms };
    case 'fallen':
      // 앞으로 엎어져 대자로 뻗었다
      legs.push([-1.4, 0], [-1.4, 0]);
      arms.push([2.8, 0.2, 0.22], [2.8, 0.2, 0.22]);
      return { hipY: 0.2, lean: 1.4, twist: 0, sway: 0, legs, arms };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRig(a: Rig, b: Rig, t: number): Rig {
  return {
    hipY: lerp(a.hipY, b.hipY, t),
    lean: lerp(a.lean, b.lean, t),
    twist: lerp(a.twist, b.twist, t),
    sway: lerp(a.sway, b.sway, t),
    legs: b.legs.map((l, i) => {
      const f = a.legs[i] ?? l;
      return [lerp(f[0], l[0], t), lerp(f[1], l[1], t)];
    }),
    arms: b.arms.map((m, i) => {
      const f = a.arms[i] ?? m;
      return [lerp(f[0], m[0], t), lerp(f[1], m[1], t), lerp(f[2], m[2], t)];
    }),
  };
}

/** 자세가 바뀔 때 섞는 시간(초) */
const POSE_BLEND_SEC = 0.15;
/** 레인 이동을 화면에서 따라가는 시간 상수(초) — 작을수록 빠르게 붙는다 */
const LANE_FOLLOW_SEC = 0.05;

/**
 * 프레임 사이 움직임을 부드럽게 이어 주는 애니메이터 (한 판마다 하나).
 * - 자세가 바뀌면 직전에 보이던 모습에서 새 자세로 0.15초 동안 섞는다
 * - 레인 이동은 화면에서만 가속·감속하며 따라가고, 몸 기울기는 실제 옆 속도로 정한다
 */
export class CharacterAnimator {
  private lastT: number | null = null;
  private pose: Pose3d | null = null;
  private from: Rig | null = null;
  private shown: Rig | null = null;
  private blendT = 1;
  private phaseAcc = 0;
  x = 0;
  private vx = 0;
  tilt = 0;

  /** 화면에 보일 가로 위치(레인 단위)와 기울기를 갱신한다. t 는 일시정지 중 멈추는 애니메이션 시간 */
  follow(targetX: number, t: number): void {
    const first = this.lastT === null;
    const dt = this.step(t);
    if (first) {
      this.x = targetX;
      return;
    }
    if (dt === 0) return;
    const prev = this.x;
    this.x += (targetX - this.x) * (1 - Math.exp(-dt / LANE_FOLLOW_SEC));
    this.vx = (this.x - prev) / dt;
    // 옆으로 움직이는 속도만큼 그쪽으로 기울고, 멈추면 천천히 선다
    const targetTilt = Math.max(-0.26, Math.min(0.26, this.vx * 0.04));
    this.tilt += (targetTilt - this.tilt) * (1 - Math.exp(-dt / 0.06));
  }

  private dt = 0;
  private step(t: number): number {
    // 같은 프레임에 여러 번 불려도 시간은 한 번만 흐른다
    if (this.lastT === t) return this.dt;
    this.dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    return this.dt;
  }

  /**
   * 달리기 걸음 위상 — 시간에 따라 쌓는다. 속도가 빨라지면 걸음도 빨라지지만
   * 거리에 그대로 비례시키면 처음엔 느리고 나중엔 너무 빨라서, 기본 박자에 속도분만 더한다.
   * (초당 약 4.4보 → 최고 속도 약 5.9보)
   */
  runPhase(speed: number, t: number): number {
    const dt = this.step(t);
    this.phaseAcc += dt * (10.5 + speed * 0.22);
    return this.phaseAcc;
  }

  /** 지금까지 쌓인 걸음 위상 (읽기만 — 발걸음 효과가 박자를 맞춘다). π 마다 한 걸음 */
  get phase(): number {
    return this.phaseAcc;
  }

  /** 이번 프레임에 보일 관절 각도 */
  rig(s: Character3dState, t: number): Rig {
    const dt = this.step(t);
    const target = rigFor(s);
    if (this.pose !== s.pose) {
      // 자세가 바뀌는 순간 지금 보이는 모습을 출발점으로 잡는다
      this.from = this.shown;
      this.pose = s.pose;
      this.blendT = this.from ? 0 : 1;
    }
    this.blendT = Math.min(1, this.blendT + dt / POSE_BLEND_SEC);
    const rig =
      this.from && this.blendT < 1 ? lerpRig(this.from, target, smooth(this.blendT)) : target;
    this.shown = rig;
    return rig;
  }
}

/** 두 값 중 작은 쪽을 부드럽게 (딛는 발이 바뀔 때 몸 높이가 튀지 않게) */
function softMin(a: number, b: number, k = 0.04): number {
  return -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));
}

/** 게임 상태에 따라 움직이는 모자(횃불·프로펠러)가 보는 값 */
export interface HatFx {
  /** 배율 진행 0~1 (기본 배율 → 이번 판 최고 배율). 비틀거리면 0 으로 */
  heat: number;
  /** 최고 배율에 닿았는지 — 횃불이 파랗게 탄다 */
  top: boolean;
  /** 달리는 속도(m/s) — 프로펠러가 그만큼 빨리 돈다 */
  speed: number;
  /** 공중에 떠 있는지 — 프로펠러가 더 세게 돈다 */
  airborne: boolean;
}

const IDLE_FX: HatFx = { heat: 0, top: false, speed: 0, airborne: false };

/**
 * 캐릭터 그리기. feet = 발 위치(월드), tilt = 옆 기울기, anim 이 관절 섞기를 맡는다.
 */
export function drawCharacter3d(
  scene: Scene,
  feet: Vec3,
  s: Character3dState,
  tilt: number,
  anim: CharacterAnimator,
  t: number,
  look?: Look,
  fx: HatFx = IDLE_FX,
): void {
  C = SUIT_PALETTE[look?.suit ?? 'explorer'];
  const rig = anim.rig(s, t);
  const sides = [-1, 1] as const;

  const hipOf = (side: number) => v3(side * 0.11, rig.hipY, 0);
  const legPts = sides.map((side, i) => {
    const [theta, bend] = rig.legs[i] as [number, number];
    const hip = hipOf(side);
    const knee = add(hip, mul(dirAt(theta), THIGH));
    const shinDir = dirAt(theta - bend);
    const foot = add(knee, mul(shinDir, SHIN));
    return { hip, knee, foot, shinDir };
  });

  // 달리기는 낮은 쪽 발이 땅(부츠 두께만큼 위)에 닿도록 몸 전체를 올리거나 내린다
  let lift = 0;
  if (s.pose === 'run') {
    const [l0, l1] = legPts as [(typeof legPts)[0], (typeof legPts)[0]];
    lift = 0.08 - softMin(l0.foot.y, l1.foot.y);
  }

  // 로컬 → 월드: 옆으로 기울인 뒤 발 위치로 옮긴다
  const world = (p: Vec3) => add(feet, rotZ(v3(p.x, p.y + lift, p.z), tilt));
  const pivot = v3(0, rig.hipY, 0);
  // 몸통 좌표(엉덩이 기준) → 로컬: 비틀기 → 좌우 흔들림 → 앞뒤 기울기
  const torso = (p: Vec3) => add(pivot, rotX(rotZ(rotY(p, rig.twist), rig.sway), rig.lean));
  const T = (p: Vec3) => world(torso(p));
  // 머리: 목을 기준으로 몸통 기울기의 70% 만큼 되세워서 숙여 뛰어도 시선은 앞을 향한다
  const neck = v3(0, 0.66, 0);
  const H = (p: Vec3) => T(add(neck, rotX(sub(p, neck), -rig.lean * 0.7)));

  // ---------- 다리 ----------
  for (const l of legPts) {
    limb(scene, world(l.hip), world(l.knee), 0.16, 0.17, C.pants);
    limb(scene, world(l.knee), world(l.foot), 0.14, 0.15, C.shin);
    // 부츠 — 정강이와 직각으로 앞코가 나온다 (발을 차올리면 밑창이 보인다)
    const toeDir = v3(0, l.shinDir.z, -l.shinDir.y);
    const heel = add(l.foot, mul(toeDir, -0.05));
    const toe = add(l.foot, mul(toeDir, 0.19));
    limb(scene, world(heel), world(toe), 0.15, 0.13, C.boot);
    const soleA = add(heel, mul(l.shinDir, 0.065));
    const soleB = add(toe, mul(l.shinDir, 0.065));
    limb(scene, world(soleA), world(soleB), 0.155, 0.03, C.sole);
  }

  // ---------- 몸통 ----------
  box(scene, v3(0, 0.02, 0), v3(0.38, 0.2, 0.24), C.pants, {}, T);
  box(scene, v3(0, 0.1, 0), v3(0.39, 0.06, 0.25), C.belt, {}, T);
  box(scene, v3(0, 0.38, 0), v3(0.42, 0.52, 0.25), C.shirt, {}, T);
  // 어깨 (조금 넓게)
  box(scene, v3(0, 0.58, 0), v3(0.5, 0.12, 0.25), C.shirt, {}, T);
  drawSuitExtras(scene, look?.suit ?? 'explorer', T, t);

  drawPack(scene, look?.pack ?? 'backpack', T);

  // ---------- 팔 ----------
  sides.forEach((side, i) => {
    const [a, bend, spread] = rig.arms[i] as [number, number, number];
    const shoulder = v3(side * 0.28, 0.58, 0);
    const elbow = add(add(shoulder, mul(dirAt(a), UPPER_ARM)), v3(side * spread, 0, 0));
    const hand = add(add(elbow, mul(dirAt(a + bend), FOREARM)), v3(side * spread * 0.5, 0, 0));
    limb(scene, T(shoulder), T(elbow), 0.12, 0.12, C.sleeve);
    limb(scene, T(elbow), T(hand), 0.095, 0.095, C.skin);
    box(scene, hand, v3(0.1, 0.1, 0.1), C.skin, {}, T);
  });

  // ---------- 머리 ----------
  box(scene, v3(0, 0.7, 0), v3(0.11, 0.1, 0.11), C.skin, {}, H);
  box(scene, v3(0, 0.86, 0.01), v3(0.24, 0.26, 0.25), C.hair, {}, H);
  for (const side of sides)
    box(scene, v3(side * 0.13, 0.85, 0), v3(0.04, 0.08, 0.06), C.skin, {}, H);

  const hat = look?.hat ?? 'explorer';
  if (s.pose !== 'fallen') {
    const base = H(v3(0, 0.99, 0));
    drawHat(scene, hat, base, sub(H(v3(0, 1.99, 0)), base), sub(H(v3(0, 0.99, 1)), base), t, fx);
  } else {
    // 날아간 모자 — 옆으로 포물선을 그리며 떨어진다
    const p = Math.min(1, s.fallenT / 0.7);
    const pos = add(
      feet,
      v3(0.4 + p * 0.9, 1.3 + Math.sin(p * Math.PI) * 0.7 - p * 1.25, 0.8 + p * 0.3),
    );
    const up = rotZ(rotX(v3(0, 1, 0), p * 1.2), -p * 2.2);
    const fwd = rotZ(rotX(v3(0, 0, 1), p * 1.2), -p * 2.2);
    // 날아간 뒤엔 게임 상태와 상관없이 (횃불은 작게, 프로펠러는 천천히)
    drawHat(scene, hat, pos, up, fwd, t, IDLE_FX);
  }
}

// ---------- 옷 · 등 소품 · 모자 ----------

type Xform = (p: Vec3) => Vec3;

/** 옷마다 몸통에 덧붙는 것 (T = 몸통 좌표 → 월드) */
function drawSuitExtras(scene: Scene, suit: SuitId, T: Xform, t: number) {
  if (suit === 'ranger') {
    // 앞이 트인 조끼 — 앞 두 쪽과 등판, 가슴 주머니
    box(scene, v3(0, 0.4, -0.125), v3(0.44, 0.46, 0.03), K.vest, {}, T);
    for (const side of [-1, 1]) {
      box(scene, v3(side * 0.14, 0.4, 0.125), v3(0.15, 0.46, 0.03), K.vest, {}, T);
      box(scene, v3(side * 0.14, 0.44, 0.145), v3(0.09, 0.08, 0.02), K.vestPocket, {}, T);
    }
    return;
  }
  if (suit === 'nomad') {
    // 목에 두른 스카프 — 뒤로 긴 자락이 펄럭인다
    box(scene, v3(0, 0.66, 0), v3(0.3, 0.08, 0.29), K.scarf, {}, T);
    const p0 = v3(0.05, 0.64, -0.15);
    const p1 = v3(0.09 + Math.sin(t * 14) * 0.04, 0.6 + Math.sin(t * 11) * 0.04, -0.46);
    const p2 = v3(
      0.12 + Math.sin(t * 14 + 1.2) * 0.08,
      0.58 + Math.sin(t * 11 + 1.2) * 0.08,
      -0.78,
    );
    limb(scene, T(p0), T(p1), 0.12, 0.025, K.scarf);
    limb(scene, T(p1), T(p2), 0.1, 0.025, K.scarfDark);
    return;
  }
  if (suit === 'golden') {
    // 두 겹 어깨 갑옷과 가슴 보석
    for (const side of [-1, 1]) {
      box(scene, v3(side * 0.3, 0.63, 0), v3(0.2, 0.09, 0.3), K.gold, {}, T);
      box(scene, v3(side * 0.33, 0.56, 0), v3(0.16, 0.06, 0.27), K.goldDark, {}, T);
    }
    box(scene, v3(0, 0.46, 0.13), v3(0.16, 0.16, 0.02), K.goldDark, {}, T);
    box(scene, v3(0, 0.46, 0.145), v3(0.08, 0.08, 0.02), K.gemRed, { emissive: true }, T);
  }
}

/** 멜빵 두 줄 (배낭·자루) */
function shoulderStraps(scene: Scene, T: Xform) {
  for (const side of [-1, 1])
    box(scene, v3(side * 0.12, 0.62, -0.03), v3(0.05, 0.05, 0.3), C.belt, {}, T);
}

/** 가슴을 비스듬히 가로지르는 끈 (통·방패) */
function crossStrap(scene: Scene, T: Xform) {
  limb(scene, T(v3(-0.17, 0.62, 0.135)), T(v3(0.18, 0.14, 0.135)), 0.06, 0.02, C.belt);
  limb(scene, T(v3(-0.17, 0.62, -0.135)), T(v3(0.18, 0.14, -0.135)), 0.06, 0.02, C.belt);
}

/** 등 소품 — 등(-z)쪽이라 뒤에서 따라가는 카메라에 잘 보인다 */
function drawPack(scene: Scene, pack: PackId, T: Xform) {
  if (pack === 'scroll') {
    crossStrap(scene, T);
    // 비스듬히 멘 지도 통 — 위쪽 뚜껑 밖으로 종이가 삐져나온다
    const c = T(v3(0, 0.4, -0.2));
    const axis = sub(T(v3(0.6, 1.2, -0.2)), c);
    const a = norm(axis);
    prism(scene, c, axis, 0.075, 0.78, 8, K.tube);
    prism(scene, add(c, mul(a, 0.39)), axis, 0.085, 0.07, 8, K.tubeCap);
    prism(scene, add(c, mul(a, -0.39)), axis, 0.085, 0.07, 8, K.tubeCap);
    prism(scene, add(c, mul(a, 0.47)), axis, 0.05, 0.1, 6, K.paper);
    return;
  }
  if (pack === 'treasure') {
    shoulderStraps(scene, T);
    // 불룩한 자루 — 묶은 주둥이 위로 동전이 보인다
    box(scene, v3(0, 0.34, -0.25), v3(0.42, 0.44, 0.28), K.sack, {}, T);
    box(scene, v3(0, 0.13, -0.25), v3(0.34, 0.07, 0.22), K.sackDark, {}, T);
    box(scene, v3(0, 0.6, -0.25), v3(0.2, 0.1, 0.15), K.sackDark, {}, T);
    box(scene, v3(0, 0.58, -0.25), v3(0.22, 0.03, 0.17), K.rope, {}, T);
    const coins = [v3(-0.04, 0.67, -0.24), v3(0.05, 0.69, -0.27), v3(0.0, 0.72, -0.22)];
    coins.forEach((p, i) => {
      const tiltAxis = sub(T(add(p, v3(0.3 * (i - 1), 1, 0.4))), T(p));
      prism(scene, T(p), tiltAxis, 0.055, 0.018, 8, K.coin, K.coin, { emissive: true });
    });
    return;
  }
  if (pack === 'shield') {
    crossStrap(scene, T);
    // 둥근 방패 — 쇠 테두리 안쪽 나무판이 뒤로 조금 나오고, 가운데 쇠 돌기
    const back = sub(T(v3(0, 0.38, -1)), T(v3(0, 0.38, 0)));
    prism(scene, T(v3(0, 0.38, -0.17)), back, 0.32, 0.04, 12, K.shieldRim);
    prism(scene, T(v3(0, 0.38, -0.2)), back, 0.28, 0.05, 12, K.shieldWood);
    prism(scene, T(v3(0, 0.38, -0.24)), back, 0.08, 0.06, 8, K.shieldBoss);
    return;
  }
  // 기본 배낭 — 담요 롤을 얹었다
  shoulderStraps(scene, T);
  box(scene, v3(0, 0.36, -0.22), v3(0.36, 0.44, 0.2), C.pack, {}, T);
  box(scene, v3(0, 0.52, -0.23), v3(0.37, 0.14, 0.21), C.packFlap, {}, T);
  box(scene, v3(0, 0.26, -0.33), v3(0.22, 0.16, 0.04), C.pocket, {}, T);
  prism(
    scene,
    T(v3(0, 0.64, -0.24)),
    sub(T(v3(1, 0.64, -0.24)), T(v3(0, 0.64, -0.24))),
    0.08,
    0.46,
    7,
    C.roll,
  );
}

/** 횃불 투구의 불꽃 — heat(배율 진행)만큼 커지고, 최고 배율이면 파란 불꽃 */
function drawTorchFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  fx: HatFx,
) {
  const k = (0.55 + fx.heat * 0.8) * (fx.top ? 1.15 : 1);
  const flicker = 1 + Math.sin(t * 19) * 0.12 + Math.sin(t * 33) * 0.07;
  const w = s * 0.11 * k * flicker;
  const h = s * 0.24 * k * flicker;
  const [glow, outer, inner] = fx.top
    ? ['90, 170, 255', '#4aa8ff', '#e2f4ff']
    : ['255, 170, 70', '#ff7a22', '#ffe07a'];
  ctx.save();
  const g = ctx.createRadialGradient(x, y - h * 0.6, 0, x, y - h * 0.6, s * 0.55 * k);
  g.addColorStop(0, `rgba(${glow}, 0.55)`);
  g.addColorStop(1, `rgba(${glow}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - h * 0.6, s * 0.55 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.8, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.6, w * 0.5, h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 모자. base = 정수리 가운데, up = 머리 위쪽, fwd = 얼굴 앞쪽 (날아가는 모자도 같은 틀).
 * 모자 좌표는 x 오른쪽 · y 위 · z 앞, 원점이 정수리.
 */
function drawHat(scene: Scene, hat: HatId, base: Vec3, up: Vec3, fwd: Vec3, t: number, fx: HatFx) {
  const u = norm(up);
  const f = norm(sub(fwd, mul(u, dot(fwd, u))));
  const r = cross(u, f);
  const L: Xform = (p) => add(base, add(mul(r, p.x), add(mul(u, p.y), mul(f, p.z))));
  const at = (x: number, y: number, z: number) => L(v3(x, y, z));

  switch (hat) {
    case 'safari': {
      // 둥근 챙 → 띠 → 층층이 줄어드는 둥근 몸통
      prism(scene, at(0, -0.05, 0), u, 0.23, 0.03, 12, K.safari);
      prism(scene, at(0, 0.0, 0), u, 0.155, 0.07, 10, K.safariBand);
      prism(scene, at(0, 0.07, 0), u, 0.15, 0.08, 10, K.safari);
      prism(scene, at(0, 0.13, 0), u, 0.115, 0.05, 10, K.safari);
      prism(scene, at(0, 0.17, 0), u, 0.06, 0.03, 8, K.safari);
      return;
    }
    case 'bandana': {
      // 머리를 감싼 천 — 뒤통수 매듭에서 끈 두 가닥이 휘날린다
      box(scene, v3(0, -0.04, 0), v3(0.27, 0.1, 0.28), K.bandana, {}, L);
      box(scene, v3(0, 0.02, 0), v3(0.24, 0.03, 0.25), K.bandana, {}, L);
      box(scene, v3(0, -0.05, -0.155), v3(0.08, 0.07, 0.05), K.scarfDark, {}, L);
      // 두 마디로 길게 — 끝으로 갈수록 크게 펄럭인다
      for (const side of [-1, 1]) {
        const w1 = Math.sin(t * 16 + side) * 0.04;
        const w2 = Math.sin(t * 16 + side + 1.1) * 0.09;
        const p0 = at(side * 0.03, -0.05, -0.17);
        const p1 = at(side * 0.08 + w1, -0.1 + w1, -0.4);
        const p2 = at(side * 0.14 + w2, -0.12 + w2, -0.66);
        limb(scene, p0, p1, 0.06, 0.015, K.bandana);
        limb(scene, p1, p2, 0.05, 0.015, K.scarfDark);
      }
      return;
    }
    case 'miner': {
      // 노란 안전모와 이마의 전등 — 불빛이 둥글게 번진다
      prism(scene, at(0, -0.05, 0), u, 0.17, 0.02, 10, K.minerRim);
      prism(scene, at(0, 0.0, 0), u, 0.155, 0.09, 10, K.minerHat);
      prism(scene, at(0, 0.07, 0), u, 0.12, 0.06, 10, K.minerHat);
      box(scene, v3(0, 0.0, 0.16), v3(0.08, 0.07, 0.05), K.lamp, {}, L);
      box(scene, v3(0, 0.0, 0.19), v3(0.06, 0.05, 0.01), K.lampGlass, { emissive: true }, L);
      scene.sprite(at(0, 0.0, 0.24), (ctx, sx, sy, s) => {
        const rad = s * 0.35;
        ctx.save();
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        g.addColorStop(0, 'rgba(255, 244, 190, 0.85)');
        g.addColorStop(1, 'rgba(255, 230, 140, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      return;
    }
    case 'propeller': {
      // 줄무늬 비니 위 프로펠러 — 빨리 달릴수록, 공중에서는 더 세게 돈다
      prism(scene, at(0, -0.02, 0), u, 0.15, 0.09, 10, K.propCap);
      prism(scene, at(0, -0.02, 0), u, 0.153, 0.025, 10, K.propStripe);
      prism(scene, at(0, 0.05, 0), u, 0.11, 0.05, 10, K.propCap);
      limb(scene, at(0, 0.07, 0), at(0, 0.13, 0), 0.025, 0.025, K.iron);
      prism(scene, at(0, 0.135, 0), u, 0.03, 0.03, 6, K.propStripe);
      const spin = t * (10 + fx.speed * 0.5) * (fx.airborne ? 1.8 : 1);
      const bx = Math.cos(spin) * 0.24;
      const bz = Math.sin(spin) * 0.24;
      limb(scene, at(-bx, 0.14, -bz), at(bx, 0.14, bz), 0.07, 0.012, K.propBlade);
      // 빨리 돌면 날개 자국이 흐릿한 원판으로 보인다
      if (fx.speed > 0)
        prism(scene, at(0, 0.14, 0), u, 0.24, 0.004, 14, K.propBlade, K.propBlade, { alpha: 0.18 });
      return;
    }
    case 'viking': {
      // 쇠 투구와 양옆으로 휘어 솟은 큰 뿔 — 머리 밖으로 가장 넓게 튀어나온다
      prism(scene, at(0, -0.07, 0), u, 0.165, 0.03, 10, K.bronze);
      prism(scene, at(0, -0.02, 0), u, 0.155, 0.08, 10, K.iron);
      prism(scene, at(0, 0.05, 0), u, 0.12, 0.06, 10, K.iron);
      box(scene, v3(0, 0.03, 0), v3(0.03, 0.11, 0.31), K.bronze, {}, L);
      for (const side of [-1, 1]) {
        const p0 = at(side * 0.14, -0.01, 0);
        const p1 = at(side * 0.27, 0.05, -0.01);
        const p2 = at(side * 0.35, 0.16, -0.03);
        const p3 = at(side * 0.36, 0.28, -0.05);
        limb(scene, p0, p1, 0.075, 0.075, K.horn);
        limb(scene, p1, p2, 0.058, 0.058, K.horn);
        limb(scene, p2, p3, 0.04, 0.04, K.hornTip);
      }
      return;
    }
    case 'torch': {
      // 청동 투구 꼭대기 화로에서 불꽃이 탄다 — 배율이 오를수록 커지고, 최고 배율이면 파랗다
      prism(scene, at(0, -0.07, 0), u, 0.165, 0.03, 10, K.iron);
      prism(scene, at(0, -0.02, 0), u, 0.155, 0.08, 10, K.bronze);
      prism(scene, at(0, 0.05, 0), u, 0.11, 0.06, 10, K.bronze);
      prism(scene, at(0, 0.1, 0), u, 0.05, 0.05, 8, K.iron);
      prism(scene, at(0, 0.13, 0), u, 0.08, 0.025, 8, K.iron);
      scene.sprite(at(0, 0.15, 0), (ctx, sx, sy, s) => drawTorchFlame(ctx, sx, sy, s, t, fx));
      return;
    }
    case 'crown': {
      // 크고 높은 황금 테 — 뿔 다섯, 둘레의 보석이 번갈아 반짝인다
      prism(scene, at(0, -0.02, 0), u, 0.165, 0.1, 10, K.gold);
      prism(scene, at(0, -0.075, 0), u, 0.172, 0.02, 10, K.goldDark);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.sin(a) * 0.15;
        const z = Math.cos(a) * 0.15;
        limb(scene, at(x, 0.02, z), at(x * 0.9, 0.2, z * 0.9), 0.065, 0.035, K.gold);
        box(scene, v3(x * 0.9, 0.21, z * 0.9), v3(0.04, 0.04, 0.04), K.goldDark, {}, L);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const gem = v3(Math.sin(a) * 0.17, -0.02, Math.cos(a) * 0.17);
        box(scene, gem, v3(0.05, 0.05, 0.05), i % 2 ? K.gemBlue : K.gemRed, { emissive: true }, L);
        const glint = Math.max(0, Math.sin(t * 3 + i * 1.6));
        if (glint > 0.6) {
          scene.sprite(L(gem), (ctx, sx, sy, s) => {
            const r = s * 0.12 * glint;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 245, 210, ${(glint - 0.6) * 2})`;
            ctx.beginPath();
            ctx.moveTo(sx, sy - r);
            ctx.lineTo(sx + r * 0.25, sy);
            ctx.lineTo(sx, sy + r);
            ctx.lineTo(sx - r * 0.25, sy);
            ctx.closePath();
            ctx.moveTo(sx - r, sy);
            ctx.lineTo(sx, sy + r * 0.25);
            ctx.lineTo(sx + r, sy);
            ctx.lineTo(sx, sy - r * 0.25);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          });
        }
      }
      return;
    }
    default: {
      // 탐험가 모자 — 챙 넓은 가죽 모자
      prism(scene, base, u, 0.26, 0.035, 10, C.hat);
      prism(scene, add(base, mul(u, 0.05)), u, 0.15, 0.06, 8, C.hatBand);
      prism(scene, add(base, mul(u, 0.12)), u, 0.14, 0.1, 8, C.hat);
    }
  }
}
