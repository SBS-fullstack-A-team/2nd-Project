import {
  add,
  box,
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

const C = {
  skin: hex('#e2ae84'),
  hair: hex('#3a2718'),
  shirt: hex('#cdb88c'),
  sleeve: hex('#b8a174'),
  pants: hex('#5e4c37'),
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
): void {
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
    limb(scene, world(l.knee), world(l.foot), 0.14, 0.15, C.pants);
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

  // 배낭 — 등(-z)쪽에 붙어 있어서 뒤에서 따라가는 카메라에 잘 보인다
  box(scene, v3(0, 0.36, -0.22), v3(0.36, 0.44, 0.2), C.pack, {}, T);
  box(scene, v3(0, 0.52, -0.23), v3(0.37, 0.14, 0.21), C.packFlap, {}, T);
  box(scene, v3(0, 0.26, -0.33), v3(0.22, 0.16, 0.04), C.pocket, {}, T);
  // 어깨끈
  for (const side of sides)
    box(scene, v3(side * 0.12, 0.62, -0.03), v3(0.05, 0.05, 0.3), C.belt, {}, T);
  // 배낭 위 담요 롤
  prism(
    scene,
    T(v3(0, 0.64, -0.24)),
    sub(T(v3(1, 0.64, -0.24)), T(v3(0, 0.64, -0.24))),
    0.08,
    0.46,
    7,
    C.roll,
  );

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

  if (s.pose !== 'fallen') {
    drawHat(scene, H(v3(0, 0.99, 0)), sub(H(v3(0, 1.99, 0)), H(v3(0, 0.99, 0))));
  } else {
    // 날아간 모자 — 옆으로 포물선을 그리며 떨어진다
    const p = Math.min(1, s.fallenT / 0.7);
    const pos = add(
      feet,
      v3(0.4 + p * 0.9, 1.3 + Math.sin(p * Math.PI) * 0.7 - p * 1.25, 0.8 + p * 0.3),
    );
    const up = rotZ(rotX(v3(0, 1, 0), p * 1.2), -p * 2.2);
    drawHat(scene, pos, up);
  }
}

/** 챙 넓은 모자 — base = 챙 중심, up = 모자 위쪽 방향 */
function drawHat(scene: Scene, base: Vec3, up: Vec3) {
  const u = mul(up, 1 / (Math.hypot(up.x, up.y, up.z) || 1));
  prism(scene, base, u, 0.26, 0.035, 10, C.hat);
  prism(scene, add(base, mul(u, 0.05)), u, 0.15, 0.06, 8, C.hatBand);
  prism(scene, add(base, mul(u, 0.12)), u, 0.14, 0.1, 8, C.hat);
}
