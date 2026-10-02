/**
 * 캣 블레이드 — 수학·충돌 도우미 (다른 모듈이 서로 import 하지 않도록 여기에 모아 둔다)
 */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 배열에서 하나를 무작위로 고른다 (빈 배열은 넘기지 않는다) */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/** v 를 target 쪽으로 최대 delta 만큼 옮긴다 */
export function approach(v: number, target: number, delta: number) {
  if (v < target) return Math.min(target, v + delta);
  return Math.max(target, v - delta);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRect(cx: number, cy: number, r: number, b: Rect) {
  const nx = clamp(cx, b.x, b.x + b.w);
  const ny = clamp(cy, b.y, b.y + b.h);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= r * r;
}

export function shapeHitsRect(s: Shape, r: Rect) {
  return s.kind === 'rect' ? rectsOverlap(s, r) : circleRect(s.x, s.y, s.r, r);
}

/** 점 (px,py) 와 선분 (ax,ay)-(bx,by) 사이 거리 */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

/** 선분(굵기 width)이 사각형에 닿는지 — 사각형을 중심 + 반경으로 근사한다 */
export function segHitsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  r: Rect,
) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  // 사각형 위·가운데·아래 세 점으로 검사해 키 큰 몸통도 정확히 잡는다
  const reach = width / 2 + r.w * 0.45;
  return (
    segDist(cx, cy, ax, ay, bx, by) <= reach ||
    segDist(cx, r.y + r.h * 0.2, ax, ay, bx, by) <= reach ||
    segDist(cx, r.y + r.h * 0.85, ax, ay, bx, by) <= reach
  );
}

/** '#rrggbb' 두 색을 섞는다 (피격 시 하얗게 번쩍이는 연출 등) */
export function mixHex(a: string, b: string, t: number) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r},${g},${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [255, 255, 255];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
