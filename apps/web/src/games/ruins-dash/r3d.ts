/**
 * 아주 작은 소프트웨어 3D 렌더러 — 외부 라이브러리 없이 Canvas 2D 위에 로우폴리 3D 를 그린다.
 *
 * - 좌표계: x = 오른쪽, y = 위, z = 앞(달리는 방향). 단위는 m.
 * - 면(Face) 단위로 모아서 카메라에서 먼 것부터 칠한다 (화가 알고리즘).
 * - 볼록한 도형은 중심점을 알려 주면 법선 방향을 스스로 맞추고, 카메라 반대쪽 면은 건너뛴다.
 * - 조명은 방향광 1개 + 환경광, 멀수록 안개색으로 섞인다.
 */

// ---------- 벡터 ----------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function norm(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
}

/** x축 기준 회전 (앞뒤로 기울이기) — 양수면 위쪽이 +z(앞) 으로 넘어간다 */
export function rotX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

/** y축 기준 회전 (좌우로 돌리기) */
export function rotY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

/** z축 기준 회전 (옆으로 기울이기) — 양수면 위쪽이 +x(오른쪽) 으로 넘어간다 */
export function rotZ(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v3(p.x * c + p.y * s, -p.x * s + p.y * c, p.z);
}

// ---------- 색 ----------

export type RGB = readonly [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(c: RGB, alpha = 1): string {
  const r = Math.max(0, Math.min(255, Math.round(c[0])));
  const g = Math.max(0, Math.min(255, Math.round(c[1])));
  const b = Math.max(0, Math.min(255, Math.round(c[2])));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

// ---------- 카메라 ----------

export interface Camera {
  pos: Vec3;
  /** 아래로 내려다보는 각도(라디안) */
  pitch: number;
  /** 화면 기울기(라디안) — 흔들림 연출용 */
  roll: number;
  /** 좌우로 돌아보는 각도(라디안, 선택) — 양수면 오른쪽(+x)을 본다 */
  yaw?: number;
  /** 초점 거리(px) — 클수록 망원 */
  f: number;
  /** 화면 중심 */
  cx: number;
  cy: number;
}

/** 카메라보다 이만큼(m) 가까운 것은 잘라낸다 */
const NEAR = 0.3;

/** 월드 좌표 → 카메라 좌표 (z = 카메라 앞쪽 거리) */
export function toCamera(cam: Camera, p: Vec3): Vec3 {
  const d = cam.yaw ? rotY(sub(p, cam.pos), -cam.yaw) : sub(p, cam.pos);
  const c = Math.cos(cam.pitch);
  const s = Math.sin(cam.pitch);
  // 카메라가 아래로 pitch 만큼 숙였으므로, 월드를 반대로 돌린다
  const y = d.y * c + d.z * s;
  const z = -d.y * s + d.z * c;
  if (cam.roll === 0) return v3(d.x, y, z);
  const rc = Math.cos(cam.roll);
  const rs = Math.sin(cam.roll);
  return v3(d.x * rc - y * rs, d.x * rs + y * rc, z);
}

export interface Pt2 {
  x: number;
  y: number;
}

/** 카메라 좌표 → 화면 좌표 */
export function projectCam(cam: Camera, c: Vec3): Pt2 {
  return { x: cam.cx + (c.x / c.z) * cam.f, y: cam.cy - (c.y / c.z) * cam.f };
}

/** 월드 좌표 한 점을 화면으로 (카메라 뒤면 null). scale = 1m 가 몇 px 로 보이는지 */
export function projectPoint(
  cam: Camera,
  p: Vec3,
): (Pt2 & { scale: number; depth: number }) | null {
  const c = toCamera(cam, p);
  if (c.z < NEAR) return null;
  const s = projectCam(cam, c);
  return { ...s, scale: cam.f / c.z, depth: c.z };
}

/** 가까운 평면(NEAR) 기준으로 다각형을 자른다 (Sutherland–Hodgman, 평면 1개) */
function clipNear(pts: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    const aIn = a.z >= NEAR;
    const bIn = b.z >= NEAR;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (NEAR - a.z) / (b.z - a.z);
      out.push(v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, NEAR));
    }
  }
  return out;
}

/**
 * 다각형 법선 (Newell 방식) — 꼭짓점이 겹치는 면(구의 극점 등)에서도 안정적으로 나온다
 */
function newellNormal(pts: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return norm(v3(x, y, z));
}

// ---------- 장면 ----------

export interface Lighting {
  /** 빛이 오는 쪽 방향 (정규화) */
  dir: Vec3;
  ambient: number;
  diffuse: number;
  /** 빛의 색조 (1 = 그대로) */
  tint: readonly [number, number, number];
  fog: RGB;
  fogStart: number;
  fogEnd: number;
  /**
   * 발밑(높이 0 아래) 깊은 곳의 안개색 (선택). 주면 아래로 내려갈수록 안개가 이 색으로 바뀌어
   * 깊은 낭떠러지가 밝은 안개 대신 어둡게 가라앉아 보인다.
   */
  abyss?: RGB;
  /** 이 깊이(m)에서 abyss 색이 된다 */
  abyssDepth?: number;
}

interface Drawable {
  /** 카메라까지 거리 — 먼 것부터 그린다 */
  depth: number;
  /** 면: 화면 좌표 다각형과 칠할 색 */
  screen?: Pt2[];
  fill?: string;
  stroke?: string;
  /** 스프라이트: 화면 위치에 직접 그리는 함수 */
  sprite?: (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => void;
  x?: number;
  y?: number;
  scale?: number;
}

export interface FaceOptions {
  /** 볼록한 도형의 중심 — 주면 법선을 바깥쪽으로 맞추고 뒷면을 건너뛴다 */
  center?: Vec3;
  /** 조명 영향 없이 제 색 그대로 (불꽃, 빛나는 것) */
  emissive?: boolean;
  alpha?: number;
  /** 외곽선 색 (없으면 안 그림) */
  stroke?: string;
}

/**
 * 한 프레임 동안 그릴 것을 모으는 곳. 바닥(ground)은 먼저 순서대로 칠하고,
 * 그 위에 서 있는 물체(objects)는 깊이순으로 정렬해서 칠한다.
 */
export class Scene {
  private ground: Drawable[] = [];
  private objects: Drawable[] = [];
  /** 발밑 층 — 길보다 아래에 있는 것들. 길(바닥 층)보다 먼저 칠해서 길에 가려지게 한다 */
  private underFlat: Drawable[] = [];
  private under: Drawable[] = [];
  /**
   * true 인 동안 추가하는 것은 발밑 층으로 간다.
   * ground 면(정글 바닥·벽)은 넣은 순서대로, 나머지(나무·바위 기둥)는 깊이순으로 칠한다.
   */
  below = false;
  /**
   * 이후 추가하는 면·스프라이트의 모든 점에 적용할 변환 (회전+이동만).
   * 꺾인 길의 각 구간을 제자리에 돌려 놓는 데 쓴다. null 이면 그대로.
   */
  xform: ((p: Vec3) => Vec3) | null = null;

  constructor(
    readonly cam: Camera,
    readonly light: Lighting,
  ) {}

  /** 면 하나 추가. ground = true 면 바닥 층(정렬 없이 넣은 순서대로, 멀리 있는 것부터 넣을 것) */
  face(pts: Vec3[], color: RGB, opts: FaceOptions = {}, ground = false): void {
    if (pts.length < 3) return;
    if (this.xform) {
      pts = pts.map(this.xform);
      if (opts.center) opts = { ...opts, center: this.xform(opts.center) };
    }
    let n = newellNormal(pts);
    const centroid = mul(
      pts.reduce((acc, p) => add(acc, p), v3(0, 0, 0)),
      1 / pts.length,
    );
    if (opts.center) {
      if (dot(n, sub(centroid, opts.center)) < 0) n = mul(n, -1);
      // 카메라에서 안 보이는 뒷면은 건너뛴다
      if (dot(n, sub(this.cam.pos, centroid)) <= 0) return;
    } else if (dot(n, sub(this.cam.pos, centroid)) < 0) {
      // 양면 도형은 보이는 쪽 법선으로 뒤집는다
      n = mul(n, -1);
    }

    const camPts = clipNear(pts.map((p) => toCamera(this.cam, p)));
    if (camPts.length < 3) return;
    const screen = camPts.map((c) => projectCam(this.cam, c));
    const depth = len(sub(centroid, this.cam.pos));
    const fill = this.shade(color, n, depth, opts.emissive ?? false, centroid.y);
    const fillCss = css(fill, opts.alpha ?? 1);
    // 함수 대신 데이터로 저장한다 — 면이 프레임마다 수천 개라 클로저를 만들면 GC 로 끊긴다
    const item: Drawable = { depth, screen, fill: fillCss, stroke: opts.stroke };
    if (this.below) (ground ? this.underFlat : this.under).push(item);
    else (ground ? this.ground : this.objects).push(item);
  }

  /** 3D 위치에 붙는 2D 그림 (불꽃, 아이템 아이콘, 효과) — 물체들과 함께 깊이 정렬된다 */
  sprite(
    p: Vec3,
    draw: (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => void,
  ) {
    if (this.xform) p = this.xform(p);
    const s = projectPoint(this.cam, p);
    if (!s) return;
    (this.below ? this.under : this.objects).push({
      depth: len(sub(p, this.cam.pos)),
      sprite: draw,
      x: s.x,
      y: s.y,
      scale: s.scale,
    });
  }

  /** 거리에 따른 안개 비율 (0 = 선명, 1 = 안개색) */
  fogAt(depth: number): number {
    const { fogStart, fogEnd } = this.light;
    return Math.max(0, Math.min(1, (depth - fogStart) / (fogEnd - fogStart)));
  }

  private shade(color: RGB, n: Vec3, depth: number, emissive: boolean, y: number): RGB {
    const L = this.light;
    let c: RGB = color;
    if (!emissive) {
      const k = L.ambient + L.diffuse * Math.max(0, dot(n, L.dir));
      c = [color[0] * k * L.tint[0], color[1] * k * L.tint[1], color[2] * k * L.tint[2]];
    }
    if (L.abyss && y < 0) {
      // 깊이 내려갈수록 어두워지고, 안개도 어두운 색으로 — 거리 안개와 깊이 중 더 진한 쪽
      const deep = Math.min(1, -y / (L.abyssDepth ?? 20));
      const fogCol = mixRGB(L.fog, L.abyss, deep);
      return mixRGB(c, fogCol, Math.max(this.fogAt(depth), deep * 0.9));
    }
    return mixRGB(c, L.fog, this.fogAt(depth));
  }

  /** 이번 프레임에 모인 면·스프라이트 수 (성능 확인용) */
  get size(): number {
    return this.underFlat.length + this.under.length + this.ground.length + this.objects.length;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const d of this.underFlat) drawItem(ctx, d);
    this.under.sort((a, b) => b.depth - a.depth);
    for (const d of this.under) drawItem(ctx, d);
    for (const d of this.ground) drawItem(ctx, d);
    this.objects.sort((a, b) => b.depth - a.depth);
    for (const d of this.objects) drawItem(ctx, d);
  }
}

function drawItem(ctx: CanvasRenderingContext2D, d: Drawable): void {
  if (d.sprite) {
    d.sprite(ctx, d.x ?? 0, d.y ?? 0, d.scale ?? 0);
    return;
  }
  const screen = d.screen;
  if (!screen || !d.fill) return;
  ctx.beginPath();
  const s0 = screen[0] as Pt2;
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < screen.length; i++) {
    const s = screen[i] as Pt2;
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = d.fill;
  ctx.fill();
  // 면 사이 틈(안티에일리어싱 이음새)이 보이지 않게 같은 색으로 얇게 덧칠
  ctx.strokeStyle = d.stroke ?? d.fill;
  ctx.lineWidth = d.stroke ? 1.2 : 0.8;
  ctx.stroke();
}

// ---------- 도형 ----------

/** 8개 꼭짓점으로 된 육면체 (순서: 아래 4개, 위 4개 — 각각 둘레 순서) */
function hexahedron(scene: Scene, c: Vec3[], color: RGB, opts: FaceOptions, center: Vec3) {
  const [a, b, cc, d, e, f, g, h] = c as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
  const o = { ...opts, center };
  scene.face([a, b, cc, d], color, o);
  scene.face([e, f, g, h], color, o);
  scene.face([a, b, f, e], color, o);
  scene.face([b, cc, g, f], color, o);
  scene.face([cc, d, h, g], color, o);
  scene.face([d, a, e, h], color, o);
}

/**
 * 축에 정렬된 상자 — 중심, 크기(가로 x · 높이 y · 깊이 z).
 * xform 을 주면 꼭짓점마다 적용한다 (캐릭터 몸 전체 기울이기 등).
 */
export function box(
  scene: Scene,
  center: Vec3,
  size: Vec3,
  color: RGB,
  opts: FaceOptions = {},
  xform?: (p: Vec3) => Vec3,
) {
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const t = xform ?? ((p: Vec3) => p);
  const pts = [
    v3(-hx, -hy, -hz),
    v3(hx, -hy, -hz),
    v3(hx, -hy, hz),
    v3(-hx, -hy, hz),
    v3(-hx, hy, -hz),
    v3(hx, hy, -hz),
    v3(hx, hy, hz),
    v3(-hx, hy, hz),
  ].map((p) => t(add(center, p)));
  hexahedron(scene, pts, color, opts, t(center));
}

/**
 * 두 점 a → b 를 잇는 각기둥 모양 팔다리 (단면 w × d).
 * side 는 단면의 가로 방향 기준 (보통 x축).
 */
export function limb(
  scene: Scene,
  a: Vec3,
  b: Vec3,
  w: number,
  d: number,
  color: RGB,
  opts: FaceOptions = {},
) {
  const axis = norm(sub(b, a));
  let side = cross(axis, v3(0, 0, 1));
  if (len(side) < 0.2) side = cross(axis, v3(0, 1, 0));
  side = norm(side);
  const up = norm(cross(side, axis));
  const sx = mul(side, w / 2);
  const sz = mul(up, d / 2);
  const corner = (p: Vec3, i: number, j: number) => add(add(p, mul(sx, i)), mul(sz, j));
  const pts = [
    corner(a, -1, -1),
    corner(a, 1, -1),
    corner(a, 1, 1),
    corner(a, -1, 1),
    corner(b, -1, -1),
    corner(b, 1, -1),
    corner(b, 1, 1),
    corner(b, -1, 1),
  ];
  hexahedron(scene, pts, color, opts, mul(add(a, b), 0.5));
}

/**
 * n각기둥 — 중심축이 axis 방향, 반지름 r, 길이 length.
 * 통나무(axis = x), 동전(axis 를 돌려서) 등에 쓴다.
 */
export function prism(
  scene: Scene,
  center: Vec3,
  axis: Vec3,
  r: number,
  length: number,
  sides: number,
  color: RGB,
  capColor: RGB = color,
  opts: FaceOptions = {},
) {
  const ax = norm(axis);
  let u = cross(ax, v3(0, 1, 0));
  if (len(u) < 0.2) u = cross(ax, v3(1, 0, 0));
  u = norm(u);
  const w = norm(cross(ax, u));
  const h = mul(ax, length / 2);
  const ring = (sign: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return add(add(center, mul(h, sign)), add(mul(u, Math.cos(a) * r), mul(w, Math.sin(a) * r)));
    });
  const top = ring(1);
  const bottom = ring(-1);
  const o = { ...opts, center };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    scene.face([bottom[i] as Vec3, bottom[j] as Vec3, top[j] as Vec3, top[i] as Vec3], color, o);
  }
  scene.face(top, capColor, o);
  scene.face(bottom, capColor, o);
}

/** 각뿔 (나무 윗부분) — 바닥 중심, 반지름, 높이 */
export function cone(
  scene: Scene,
  base: Vec3,
  r: number,
  height: number,
  sides: number,
  color: RGB,
  twist = 0,
) {
  const apex = add(base, v3(0, height, 0));
  const ring = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2 + twist;
    return add(base, v3(Math.cos(a) * r, 0, Math.sin(a) * r));
  });
  const center = add(base, v3(0, height / 3, 0));
  for (let i = 0; i < sides; i++) {
    scene.face([ring[i] as Vec3, ring[(i + 1) % sides] as Vec3, apex], color, { center });
  }
}

/** 로우폴리 구 (위도·경도 분할) — spin 으로 x축 회전 (굴러가는 바위) */
export function sphere(
  scene: Scene,
  center: Vec3,
  r: number,
  color: RGB,
  spin: number,
  lat = 6,
  lon = 9,
  stripe?: RGB,
) {
  const pt = (i: number, j: number) => {
    const th = (i / lat) * Math.PI;
    const ph = (j / lon) * Math.PI * 2;
    const p = v3(
      Math.sin(th) * Math.cos(ph) * r,
      Math.cos(th) * r,
      Math.sin(th) * Math.sin(ph) * r,
    );
    // 약간 울퉁불퉁하게 (같은 점은 항상 같은 값이 되도록 인덱스로 결정)
    const bump = 1 + (((i * 7 + j * 13) % 5) - 2) * 0.035;
    return add(center, rotX(mul(p, bump), spin));
  };
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const quad = [pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j)];
      const c = stripe && (i + j) % 3 === 0 ? stripe : color;
      // 극점에서는 삼각형이 된다 — 겹친 점은 빼도 되지만 그대로 둬도 칠하는 데 문제 없다
      scene.face(quad, c, { center });
    }
  }
}

export { css as rgbCss };
