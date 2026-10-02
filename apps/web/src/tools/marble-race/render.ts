import type { Body } from 'matter-js';
import { MARBLE_R, MIN_VIEW_HEIGHT, WALL_THICKNESS, WORLD_W } from './config';
import type { ObstacleKind } from './course';
import type { Race } from './race';

/** 화면에 보이는 세계 영역 — top 은 세계 y 좌표, scale 은 세계 1 → 화면 px */
export interface Camera {
  top: number;
  scale: number;
  offsetX: number;
  viewHeight: number;
}

/** 방송 화면에서 잘 보이도록 테마와 상관없이 어두운 판을 쓴다 */
const COLORS: Record<ObstacleKind, string> = {
  wall: '#3a4170',
  pin: '#c9d1ff',
  bumper: '#ff6fa3',
  ramp: '#7f93ff',
  spinner: '#ffd23f',
  gate: '#ff4d4d',
};
const BOARD = '#161a33';
/** 이름표를 전부 그릴 최대 구슬 수 — 더 많으면 앞쪽 구슬만 이름을 보여 준다 */
const LABEL_ALL_LIMIT = 40;
const LABEL_TOP = 8;

/** 캔버스 크기에 맞춰 배율을 정하고, 카메라를 목표 높이 쪽으로 부드럽게 옮긴다 */
export function updateCamera(
  camera: Camera,
  width: number,
  height: number,
  focusY: number | null,
  courseHeight: number,
): void {
  const fullWidth = WORLD_W + WALL_THICKNESS;
  camera.scale = Math.min(width / fullWidth, height / MIN_VIEW_HEIGHT);
  camera.offsetX = (width - WORLD_W * camera.scale) / 2;
  camera.viewHeight = height / camera.scale;
  const target =
    focusY === null
      ? 0
      : Math.min(Math.max(focusY - camera.viewHeight * 0.45, 0), courseHeight - camera.viewHeight);
  camera.top += (target - camera.top) * 0.08;
}

function tracePolygon(ctx: CanvasRenderingContext2D, body: Body): void {
  // 여러 조각으로 된 몸체(풍차)는 parts[0] 이 전체, 1번부터가 실제 조각이다
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  for (const part of parts) {
    const [first, ...rest] = part.vertices;
    if (!first) continue;
    ctx.moveTo(first.x, first.y);
    for (const v of rest) ctx.lineTo(v.x, v.y);
    ctx.closePath();
  }
}

/** 한 프레임 그리기 — ctx 는 devicePixelRatio 가 이미 적용된 상태 */
export function drawRace(
  ctx: CanvasRenderingContext2D,
  race: Race,
  camera: Camera,
  width: number,
  height: number,
): void {
  ctx.fillStyle = BOARD;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(camera.offsetX, 0);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(0, -camera.top);
  const visibleTop = camera.top - 60;
  const visibleBottom = camera.top + camera.viewHeight + 60;

  drawFinishLine(ctx, race.course.finishY);

  for (const { body, kind } of race.course.obstacles) {
    if (kind === 'gate' && race.phase !== 'countdown') continue;
    if (body.bounds.max.y < visibleTop || body.bounds.min.y > visibleBottom) continue;
    ctx.fillStyle = COLORS[kind];
    ctx.beginPath();
    if (body.circleRadius) {
      ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
    } else {
      tracePolygon(ctx, body);
    }
    ctx.fill();
    if (kind === 'bumper') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // 이름표 — 적을 땐 전부, 많을 땐 선두 몇 개만 (겹쳐서 안 읽히므로)
  const standings = race.standings().filter((m) => m.rank === undefined);
  const labeled = new Set(
    standings.length <= LABEL_ALL_LIMIT ? standings : standings.slice(0, LABEL_TOP),
  );
  const leader = standings[0];

  for (const marble of standings) {
    const { x, y } = marble.body.position;
    if (y < visibleTop || y > visibleBottom) continue;
    ctx.beginPath();
    ctx.arc(x, y, MARBLE_R, 0, Math.PI * 2);
    ctx.fillStyle = marble.color;
    ctx.fill();
    ctx.lineWidth = marble === leader ? 3 : 1.5;
    ctx.strokeStyle = marble === leader ? '#ffd23f' : 'rgba(255,255,255,0.8)';
    ctx.stroke();
  }

  // 이름표는 구슬 위에 따로 그려서 다른 구슬에 가리지 않게 한다 (글자 크기는 화면 기준으로 고정)
  const fontPx = 13 / camera.scale;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  for (const marble of labeled) {
    const { x, y } = marble.body.position;
    if (y < visibleTop || y > visibleBottom) continue;
    const text = marble === leader ? `👑 ${marble.name}` : marble.name;
    const ty = y - MARBLE_R - 3 / camera.scale;
    ctx.lineWidth = 4 / camera.scale;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, ty);
  }
  ctx.restore();

  if (race.phase === 'countdown') drawCountdown(ctx, race.countdownLeft, width, height);
}

function drawFinishLine(ctx: CanvasRenderingContext2D, y: number): void {
  const size = 16;
  for (let x = 0, i = 0; x < WORLD_W; x += size, i++) {
    for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (i + row) % 2 ? '#fff' : '#111';
      ctx.fillRect(x, y + row * size, size, size);
    }
  }
}

function drawCountdown(
  ctx: CanvasRenderingContext2D,
  secondsLeft: number,
  width: number,
  height: number,
): void {
  const n = Math.ceil(secondsLeft);
  if (n <= 0) return;
  const t = n - secondsLeft; // 0 → 1 로 커지며 흐려진다
  ctx.save();
  ctx.globalAlpha = 1 - t * 0.6;
  ctx.font = `900 ${Math.round(Math.min(width, height) * (0.3 + t * 0.1))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(String(n), width / 2, height / 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(String(n), width / 2, height / 2);
  ctx.restore();
}
