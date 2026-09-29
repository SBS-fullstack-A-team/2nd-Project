import {
  BUILDS,
  CHECKPOINTS,
  COLS,
  comboMultiplier,
  ENTRY,
  EXIT,
  PALETTE,
  ROWS,
  START_LIVES,
  towerRange,
} from './config';
import type { Beam, Build, Engine, Enemy, Particle, Scorch, Shot } from './engine';
import { ENEMIES } from './config';
import type { BuildKind, EnemyKind } from './config';
import { colOf, isBuildable, rowOf } from './maze';

export interface View {
  tile: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
  dpr: number;
}

export function layout(width: number, height: number, dpr = 1): View {
  const tile = Math.min(width / COLS, height / ROWS);
  return {
    tile,
    ox: (width - tile * COLS) / 2,
    oy: (height - tile * ROWS) / 2,
    width,
    height,
    dpr,
  };
}

export function cellFromPoint(view: View, px: number, py: number): { col: number; row: number } {
  return {
    col: Math.floor((px - view.ox) / view.tile),
    row: Math.floor((py - view.oy) / view.tile),
  };
}

/** 칸이 아니라 판 위의 실수 좌표(타일 단위) — 계속 움직이는 적을 짚을 때 쓴다. */
export function pointFromEvent(view: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - view.ox) / view.tile, y: (py - view.oy) / view.tile };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Extra tones for material shading. The board palette names the brand colours;
 *  these are the light and shadow steps that make a built piece read as a solid
 *  object on the ground rather than a symbol painted onto the tile. */
const SHADE = {
  cast: 'rgba(6,10,8,0.5)',
  castSoft: 'rgba(6,10,8,0.32)',
  earth: '#332c1d',
  earthRim: '#453b28',
  woodLit: '#7d6040',
  woodMid: '#5a4430',
  woodDark: '#38291b',
  sack: '#6d6144',
  sackLit: '#87795a',
  bronzeLit: '#eecb84',
  bronzeMid: '#b9893a',
  bronzeDark: '#6d4f22',
  ironLit: '#c8d5da',
  ironMid: '#8fa3ab',
  ironDark: '#4c5c63',
  rope: '#a8946a',
  bore: 'rgba(8,12,10,0.9)',
  flash: '#ffd894',
  ember: '#e08a3c',
  smoke: 'rgba(152,152,138,0.2)',
  iron: '#2b302c',
  ironEdge: '#59666a',
  foeRim: 'rgba(10,14,11,0.78)',
  lacquer: '#2e2a24',
  hatLit: 'rgba(236,227,207,0.28)',
  brassLit: '#f6dc9e',
  brassMid: '#cda14c',
  brassDark: '#7c5a27',
  gildLit: '#fff4c6',
  gildMid: '#e9c05e',
  gildDark: '#8f6b23',
  steelLit: '#e8f1f5',
} as const;

/** Stable pseudo-random in [0,1) for one piece, so stake heights and scattered
 *  spikes stay put between frames instead of shimmering. */
function jitter(id: number, n: number): number {
  const v = Math.sin(id * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** The finish a piece has earned. Joseon crews decorated the guns they trusted,
 *  so rank reads as material: plain bronze, then brass, then gilt. */
function metal(level: number): { lit: string; mid: string; dark: string } {
  if (level >= 3) return { lit: SHADE.gildLit, mid: SHADE.gildMid, dark: SHADE.gildDark };
  if (level === 2) return { lit: SHADE.brassLit, mid: SHADE.brassMid, dark: SHADE.brassDark };
  return { lit: SHADE.bronzeLit, mid: SHADE.bronzeMid, dark: SHADE.bronzeDark };
}

/** Halo and embers around a reinforced piece. Purely a read: it tells the
 *  player which corner of the maze is strong without opening a panel. */
function drawRank(
  ctx: CanvasRenderingContext2D,
  build: Build,
  color: string,
  time: number,
  sparks: boolean,
): void {
  if (build.level < 2) return;

  const beat = 0.5 + 0.5 * Math.sin(time * 2.1 + build.id);
  const top = build.level >= 3;
  const radius = 0.52 + beat * (top ? 0.06 : 0.025);
  const halo = ctx.createRadialGradient(0, 0.05, 0.1, 0, 0.05, radius);
  halo.addColorStop(0, color + (top ? '52' : '24'));
  halo.addColorStop(0.58, color + (top ? '1f' : '10'));
  halo.addColorStop(1, color + '00');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(0, 0.05, radius, radius * 0.84, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!top || !sparks) return;

  // 불티: sparks lifting off a piece that has been firing hot all battle.
  for (let i = 0; i < 5; i += 1) {
    const phase = (time * 0.5 + jitter(build.id, 60 + i)) % 1;
    const ex = -0.25 + jitter(build.id, 70 + i) * 0.5 + Math.sin(phase * 5.5 + i) * 0.035;
    const ey = 0.25 - phase * 0.6;
    ctx.globalAlpha = (1 - phase) * 0.7;
    ctx.fillStyle = phase < 0.45 ? SHADE.flash : SHADE.ember;
    ctx.beginPath();
    ctx.arc(ex, ey, 0.024 * (1 - phase * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 들판. 칸마다 좌표로 고정된 흙 얼룩과 풀포기를 흩어, 격자판이 아니라 전장
 *  위에 칸이 나뉜 것처럼 보이게 한다. 좌표로만 정해지므로 프레임마다 흔들리지 않고,
 *  색별로 경로를 하나로 모아 칠해 매 프레임 그려도 가볍다. */
function drawTerrain(ctx: CanvasRenderingContext2D): void {
  const blotches = (lit: boolean) => {
    ctx.beginPath();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const seed = row * COLS + col + 1;
        if (jitter(seed, 1) > 0.5 !== lit) continue;
        const cx = col + 0.2 + jitter(seed, 2) * 0.6;
        const cy = row + 0.2 + jitter(seed, 3) * 0.6;
        ctx.moveTo(cx + 0.34, cy);
        ctx.ellipse(cx, cy, 0.34, 0.2, 0, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  };

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = PALETTE.groundAlt;
  blotches(false);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = PALETTE.groundLit;
  blotches(true);

  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = PALETTE.grass;
  ctx.lineWidth = 0.022;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const seed = row * COLS + col + 1;
      const tufts = Math.floor(jitter(seed, 4) * 3);
      for (let t = 0; t < tufts; t += 1) {
        const tx = col + 0.15 + jitter(seed, 5 + t) * 0.7;
        const ty = row + 0.25 + jitter(seed, 9 + t) * 0.6;
        for (const b of [-1, 0, 1]) {
          ctx.moveTo(tx + b * 0.03, ty);
          ctx.lineTo(tx + b * 0.07, ty - (b === 0 ? 0.12 : 0.09));
        }
      }
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 판 맨 위: 왜군이 건너온 바다와 모래사장. */
function drawCoast(ctx: CanvasRenderingContext2D, time: number): void {
  const sand = ctx.createLinearGradient(0, 0, 0, 1.2);
  sand.addColorStop(0, 'rgba(190,164,112,0.5)');
  sand.addColorStop(1, 'rgba(190,164,112,0)');
  ctx.fillStyle = sand;
  ctx.fillRect(0, 0, COLS, 1.2);

  const surf = (x: number) => 0.2 + Math.sin(x * 2.6 + time * 1.3) * 0.03;
  ctx.fillStyle = PALETTE.sea;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(COLS, 0);
  for (let x = COLS; x >= 0; x -= 0.25) ctx.lineTo(x, surf(x));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(226,232,214,0.55)';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x += 0.25) {
    if (x === 0) ctx.moveTo(x, surf(x) + 0.02);
    else ctx.lineTo(x, surf(x) + 0.02);
  }
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  for (let c = 0; c <= COLS; c += 1) {
    ctx.moveTo(c, 0);
    ctx.lineTo(c, ROWS);
  }
  for (let r = 0; r <= ROWS; r += 1) {
    ctx.moveTo(0, r);
    ctx.lineTo(COLS, r);
  }
  ctx.stroke();
}

function drawPads(ctx: CanvasRenderingContext2D, engine: Engine): void {
  ctx.fillStyle = PALETTE.pad;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!isBuildable(col, row)) continue;
      if (engine.buildAt(col, row)) continue;
      ctx.beginPath();
      ctx.arc(col + 0.5, row + 0.5, 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function strokeRoute(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  dash: number,
): void {
  if (points.length < 2) return;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 밟아 다진 흙길: 넓은 노반 위에 한가운데가 더 닳아 밝은 바퀴자국
  trace();
  ctx.strokeStyle = PALETTE.route;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.62;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.routeLit;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.28;
  ctx.stroke();

  // 행군 발자국: 진행 방향으로 흘러가며 적이 갈 길을 알려준다
  ctx.strokeStyle = PALETTE.footprint;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.1, 0.23]);
  ctx.lineDashOffset = -dash;
  ctx.stroke();
  ctx.restore();
}

/** 왜군 상륙 지점: 파도에 걸친 왜선 뱃머리와 양옆의 노보리(왜군 깃발). */
function drawLanding(ctx: CanvasRenderingContext2D, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  ctx.save();
  ctx.translate(ENTRY.col + 0.5, ENTRY.row + 0.5);

  ctx.fillStyle = 'rgba(207,74,44,' + (0.1 + pulse * 0.08).toFixed(3) + ')';
  ctx.fillRect(-0.5, -0.5, 1, 1);

  const bob = Math.sin(time * 1.6) * 0.015;
  ctx.save();
  ctx.translate(0, bob);
  ctx.strokeStyle = SHADE.woodDark;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0, -0.46);
  ctx.lineTo(0, -0.02);
  ctx.stroke();
  // 멍석 돛
  ctx.fillStyle = 'rgba(206,190,146,0.92)';
  ctx.fillRect(-0.2, -0.42, 0.4, 0.3);
  ctx.strokeStyle = 'rgba(110,90,58,0.8)';
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  for (let k = 1; k <= 3; k += 1) {
    ctx.moveTo(-0.2, -0.42 + k * 0.075);
    ctx.lineTo(0.2, -0.42 + k * 0.075);
  }
  ctx.stroke();
  // 선체
  ctx.fillStyle = SHADE.woodDark;
  ctx.beginPath();
  ctx.moveTo(-0.44, -0.06);
  ctx.lineTo(0.44, -0.06);
  ctx.lineTo(0.3, 0.16);
  ctx.quadraticCurveTo(0, 0.24, -0.3, 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = SHADE.woodLit;
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.04);
  ctx.lineTo(0.4, -0.04);
  ctx.stroke();
  ctx.restore();

  for (const side of [-1, 1]) {
    const px = side * 0.4;
    const flutter = Math.sin(time * 3 + side) * 0.02;
    const bx = (side > 0 ? px - 0.1 : px) + flutter;
    ctx.strokeStyle = SHADE.woodDark;
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(px, 0.44);
    ctx.lineTo(px, -0.46);
    ctx.stroke();
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(bx, -0.4, 0.1, 0.42);
    ctx.fillStyle = PALETTE.cinnabar;
    ctx.fillRect(bx, -0.4, 0.1, 0.08);
  }

  ctx.strokeStyle = 'rgba(207,74,44,' + (0.35 + pulse * 0.4).toFixed(3) + ')';
  ctx.lineWidth = 0.04;
  ctx.strokeRect(-0.47, -0.47, 0.94, 0.94);
  ctx.restore();
}

/** 경유지: 돌무더기에 꽂은 조선군 군기. 불꽃 모양 테두리(화염각)가 바람에 날린다.
 *  깃발 위 숫자(一二三四)는 drawGame 이 화면 좌표에서 따로 쓴다. */
const CHECKPOINT_NUMERALS = ['一', '二', '三', '四'];

function checkpointWave(time: number, i: number): number {
  return Math.sin(time * 2.4 + i * 1.3) * 0.04;
}

function drawCheckpoints(ctx: CanvasRenderingContext2D, time: number): void {
  CHECKPOINTS.forEach((cell, i) => {
    const x = cell.col + 0.5;
    const y = cell.row + 0.5;
    const wave = checkpointWave(time, i);

    ctx.fillStyle = 'rgba(217,164,65,0.1)';
    ctx.fillRect(cell.col, cell.row, 1, 1);

    ctx.fillStyle = PALETTE.stone;
    ctx.beginPath();
    ctx.ellipse(x - 0.18, y + 0.34, 0.2, 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.stoneLit;
    ctx.beginPath();
    ctx.ellipse(x - 0.22, y + 0.3, 0.1, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = SHADE.woodMid;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(x - 0.22, y + 0.34);
    ctx.lineTo(x - 0.22, y - 0.44);
    ctx.stroke();

    ctx.fillStyle = PALETTE.ochre;
    ctx.beginPath();
    ctx.moveTo(x - 0.2, y - 0.4);
    ctx.lineTo(x + 0.28, y - 0.4 + wave);
    for (let k = 0; k < 3; k += 1) {
      const top = y - 0.4 + wave + k * 0.14;
      ctx.lineTo(x + 0.38, top + 0.07);
      ctx.lineTo(x + 0.28, top + 0.14);
    }
    ctx.lineTo(x - 0.2, y + 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.cinnabar;
    ctx.lineWidth = 0.025;
    ctx.stroke();

    ctx.fillStyle = PALETTE.cinnabar;
    ctx.beginPath();
    ctx.arc(x - 0.22, y - 0.46, 0.04, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** 성문: 판 아래를 가로지르는 석축 성벽과 여장, 그 한가운데 홍예문 위 기와지붕 문루.
 *  지붕 위 게이지가 남은 성문 내구도이고, 무너질 즈음엔 문루에 불이 붙는다. */
function drawFortress(ctx: CanvasRenderingContext2D, engine: Engine, time: number): void {
  const ratio = Math.max(0, engine.lives) / START_LIVES;
  const flash = engine.coreFlash;
  const fallen = engine.lives <= 0;

  ctx.fillStyle = PALETTE.stone;
  ctx.fillRect(0, ROWS - 0.14, COLS, 0.14);
  for (let c = 0.05; c < COLS; c += 0.42) ctx.fillRect(c, ROWS - 0.22, 0.28, 0.09);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(0, ROWS - 0.07);
  ctx.lineTo(COLS, ROWS - 0.07);
  for (let c = 0.2; c < COLS; c += 0.35) {
    ctx.moveTo(c, ROWS - 0.14);
    ctx.lineTo(c, ROWS - 0.07);
    ctx.moveTo(c + 0.17, ROWS - 0.07);
    ctx.lineTo(c + 0.17, ROWS);
  }
  ctx.stroke();

  ctx.save();
  ctx.translate(EXIT.col + 0.5, EXIT.row + 0.5);

  const glow = ctx.createRadialGradient(0, 0.1, 0.05, 0, 0.1, 1.3);
  glow.addColorStop(0, flash > 0 ? 'rgba(232,69,47,0.45)' : 'rgba(224,160,80,0.2)');
  glow.addColorStop(1, 'rgba(224,160,80,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0.1, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // 육축: 다듬은 돌을 엇갈려 쌓은 기단
  ctx.fillStyle = PALETTE.stoneLit;
  ctx.fillRect(-0.46, -0.06, 0.92, 0.56);
  ctx.strokeStyle = 'rgba(20,18,12,0.45)';
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  for (let r = 0; r < 4; r += 1) {
    const yy = -0.06 + r * 0.14;
    ctx.moveTo(-0.46, yy);
    ctx.lineTo(0.46, yy);
    for (let xx = -0.26 + (r % 2) * 0.1; xx < 0.46; xx += 0.2) {
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + 0.14);
    }
  }
  ctx.stroke();

  // 홍예문과 문짝 (피격 순간 붉게 달아오른다)
  const arch = (r: number) => {
    ctx.beginPath();
    ctx.moveTo(-r, 0.5);
    ctx.lineTo(-r, 0.16);
    ctx.arc(0, 0.16, r, Math.PI, 0);
    ctx.lineTo(r, 0.5);
    ctx.closePath();
  };
  ctx.fillStyle = '#140e09';
  arch(0.21);
  ctx.fill();
  if (fallen) {
    // 함락: 문짝은 부서져 나뒹굴고 홍예문은 뻥 뚫렸다
    ctx.fillStyle = '#5a2415';
    for (const [px, py, rot] of [
      [-0.2, 0.42, -0.5],
      [0.18, 0.45, 0.35],
      [0.02, 0.36, 1.2],
    ] as const) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.fillRect(-0.1, -0.025, 0.2, 0.05);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = flash > 0 ? '#a33a22' : '#6e2a1a';
    arch(0.17);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(0, -0.01);
    ctx.lineTo(0, 0.5);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ochre;
    for (const sx of [-0.09, 0.09]) {
      for (const sy of [0.14, 0.26, 0.38]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 문루: 붉은 기둥, 단청 띠, 처마가 들린 기와지붕
  ctx.fillStyle = '#8a3322';
  ctx.fillRect(-0.34, -0.3, 0.05, 0.24);
  ctx.fillRect(0.29, -0.3, 0.05, 0.24);
  ctx.fillStyle = SHADE.woodDark;
  ctx.fillRect(-0.38, -0.1, 0.76, 0.04);
  ctx.fillStyle = PALETTE.celadon;
  ctx.fillRect(-0.4, -0.33, 0.8, 0.04);

  ctx.beginPath();
  ctx.moveTo(-0.6, -0.28);
  ctx.quadraticCurveTo(0, -0.38, 0.6, -0.28);
  ctx.lineTo(0.38, -0.5);
  ctx.quadraticCurveTo(0, -0.54, -0.38, -0.5);
  ctx.closePath();
  ctx.fillStyle = PALETTE.roof;
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,227,207,0.45)';
  ctx.lineWidth = 0.025;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let tx = -0.56; tx <= 0.56; tx += 0.07) {
    ctx.moveTo(tx, -0.26);
    ctx.lineTo(tx * 0.7, -0.54);
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#1d1c1b';
  ctx.fillRect(-0.3, -0.55, 0.6, 0.04);

  if (fallen || ratio < 0.35) {
    // 성문이 약해지면 문루에 불이 붙고, 함락되면 지붕 전체가 불길에 휩싸인다
    const tongues = fallen ? 6 : 3;
    const spread = fallen ? 0.5 : 0.2;
    for (let k = 0; k < tongues; k += 1) {
      const flick = 0.5 + 0.5 * Math.sin(time * 9 + k * 2.1);
      const fx = -spread + (k / (tongues - 1)) * spread * 2;
      const tall = fallen ? 0.18 + flick * 0.1 : 0.1 + flick * 0.05;
      ctx.globalAlpha = 0.55 + flick * 0.35;
      ctx.fillStyle = k % 2 === 1 ? SHADE.flash : SHADE.ember;
      ctx.beginPath();
      ctx.ellipse(
        fx,
        -0.5 - flick * 0.05 - (fallen ? 0.06 : 0),
        fallen ? 0.08 : 0.06,
        tall,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const barW = 0.84;
  ctx.fillStyle = 'rgba(12,10,6,0.8)';
  roundRect(ctx, -barW / 2, -0.68, barW, 0.08, 0.04);
  ctx.fill();
  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.5 ? PALETTE.celadon : ratio > 0.25 ? PALETTE.ochre : PALETTE.boss;
    roundRect(ctx, -barW / 2, -0.68, Math.max(0.08, barW * ratio), 0.08, 0.04);
    ctx.fill();
  }
  ctx.restore();
}

function drawBuild(ctx: CanvasRenderingContext2D, build: Build, time: number): void {
  const def = BUILDS[build.kind];
  const x = build.col + 0.5;
  const y = build.row + 0.5;

  ctx.save();
  ctx.translate(x, y);

  // Ground contact: a cast shadow and a patch of trodden earth, so the piece
  // sits on the tile instead of being stamped onto it.
  ctx.fillStyle = SHADE.cast;
  ctx.beginPath();
  ctx.ellipse(0.04, 0.3, 0.41, 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = SHADE.earth;
  roundRect(ctx, -0.45, -0.4, 0.9, 0.82, 0.1);
  ctx.fill();
  ctx.strokeStyle = def.color;
  ctx.globalAlpha = 0.2 + build.pulse * 0.6;
  ctx.lineWidth = 0.028;
  roundRect(ctx, -0.45, -0.4, 0.9, 0.82, 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 마름쇠와 목책은 화약을 쓰지 않으니 후광만 두르고 불티는 없다.
  drawRank(ctx, build, def.color, time, build.kind !== 'caltrop' && build.kind !== 'wall');

  if (build.kind === 'wall') {
    if (build.level >= 2) {
      // 녹채: 사슴뿔처럼 끝을 벌린 가지를 사방으로 꽂아, 옆을 스치는 적을 찌른다.
      // 3단계는 가지 끝에 쇠촉을 박았다.
      ctx.lineCap = 'round';
      const spikes = build.level >= 3 ? 8 : 6;
      for (let i = 0; i < spikes; i += 1) {
        const a = (i / spikes) * Math.PI * 2 + jitter(build.id, 30 + i) * 0.35;
        const len = 0.54 + jitter(build.id, 40 + i) * 0.06;
        const x0 = Math.cos(a) * 0.18;
        const y0 = Math.sin(a) * 0.16 + 0.04;
        const x1 = Math.cos(a) * len;
        const y1 = Math.sin(a) * len * 0.88 + 0.04;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const fork = a + 0.6;
        ctx.strokeStyle = SHADE.woodLit;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(fork) * 0.14, my + Math.sin(fork) * 0.12);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(239,228,204,0.55)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 0.01);
        ctx.lineTo(x1, y1 - 0.01);
        ctx.stroke();
        if (build.level >= 3) {
          ctx.fillStyle = SHADE.steelLit;
          ctx.beginPath();
          ctx.arc(x1, y1, 0.026, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 목책: sharpened stakes of uneven height, lashed with two rails.
    for (let i = 0; i < 4; i += 1) {
      const sx = -0.3 + i * 0.2;
      const top = -0.3 - jitter(build.id, i) * 0.08;
      const w = 0.105;
      ctx.fillStyle = SHADE.woodDark;
      ctx.beginPath();
      ctx.moveTo(sx, top);
      ctx.lineTo(sx + w / 2, top + 0.1);
      ctx.lineTo(sx + w / 2, 0.32);
      ctx.lineTo(sx - w / 2, 0.32);
      ctx.lineTo(sx - w / 2, top + 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = SHADE.woodMid;
      ctx.beginPath();
      ctx.moveTo(sx, top);
      ctx.lineTo(sx + 0.012, top + 0.1);
      ctx.lineTo(sx + 0.012, 0.32);
      ctx.lineTo(sx - w / 2, 0.32);
      ctx.lineTo(sx - w / 2, top + 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = SHADE.woodLit;
      ctx.fillRect(sx - w / 2, top + 0.1, 0.022, 0.22);
    }
    ctx.strokeStyle = SHADE.rope;
    ctx.lineWidth = 0.042;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.37, -0.08);
    ctx.lineTo(0.37, -0.11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.37, 0.16);
    ctx.lineTo(0.37, 0.14);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (build.kind === 'caltrop') {
    // 마름쇠: spikes scattered loose across the tile, each with its own shadow.
    // A reinforced field simply has more of them strewn about.
    const spikes = 4 + build.level * 2;
    for (let i = 0; i < spikes; i += 1) {
      const px = (jitter(build.id, i) - 0.5) * 0.62;
      const py = (jitter(build.id, i + 20) - 0.5) * 0.58;
      const a = jitter(build.id, i + 40) * Math.PI;
      ctx.fillStyle = SHADE.castSoft;
      ctx.beginPath();
      ctx.ellipse(px + 0.02, py + 0.055, 0.075, 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = build.level >= 3 ? SHADE.ironMid : SHADE.ironDark;
      ctx.lineWidth = 0.032 + build.level * 0.006;
      ctx.lineCap = 'round';
      for (let leg = 0; leg < 3; leg += 1) {
        const la = a + (leg / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(la) * 0.08, py + Math.sin(la) * 0.045);
        ctx.stroke();
      }
      ctx.strokeStyle = build.level >= 2 ? SHADE.steelLit : SHADE.ironMid;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 0.1 - build.level * 0.012);
      ctx.stroke();
      const tipY = py - 0.1 - build.level * 0.012;
      ctx.fillStyle = build.level >= 2 ? SHADE.steelLit : SHADE.ironLit;
      ctx.beginPath();
      ctx.arc(px, tipY, 0.018 + build.level * 0.005, 0, Math.PI * 2);
      ctx.fill();
      if (build.level >= 3) {
        // A cold gleam off a freshly whetted point.
        ctx.strokeStyle = SHADE.steelLit;
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(px - 0.05, tipY);
        ctx.lineTo(px + 0.05, tipY);
        ctx.moveTo(px, tipY - 0.05);
        ctx.lineTo(px, tipY + 0.05);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.rotate(build.angle + Math.PI / 2);

  if (build.kind === 'arrow') {
    // 궁수대: one sandbagged position. Levels do not stack more bows on top
    // of each other (they tangle into a scribble at tile size) -- the bow
    // gains a second lamination and the detachment nocks another 편전.
    const halfWidth = 0.32 + (build.level - 1) * 0.035;
    ctx.fillStyle = SHADE.sack;
    roundRect(ctx, -halfWidth, 0.04, halfWidth * 2, 0.26, 0.09);
    ctx.fill();
    ctx.fillStyle = SHADE.sackLit;
    roundRect(ctx, -halfWidth, 0.04, halfWidth * 2, 0.1, 0.05);
    ctx.fill();
    ctx.strokeStyle = SHADE.woodDark;
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(-0.11, 0.05);
    ctx.lineTo(-0.11, 0.29);
    ctx.moveTo(0.11, 0.05);
    ctx.lineTo(0.11, 0.29);
    ctx.stroke();

    if (build.level >= 2) {
      // A bundle of spare shafts stood against the parapet.
      ctx.strokeStyle = SHADE.woodLit;
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        ctx.moveTo(halfWidth - 0.07 + i * 0.025, 0.3);
        ctx.lineTo(halfWidth - 0.03 + i * 0.025, 0.08);
      }
      ctx.stroke();
    }

    // Dark keyline first so the limb reads against the sandbags.
    ctx.lineCap = 'round';
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.27, Math.PI * 1.13, Math.PI * 1.87);
    ctx.stroke();
    const bow = build.level === 1 ? def.color : metal(build.level).lit;
    ctx.strokeStyle = bow;
    ctx.lineWidth = 0.05 + (build.level - 1) * 0.008;
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.27, Math.PI * 1.13, Math.PI * 1.87);
    ctx.stroke();
    if (build.level >= 2) {
      ctx.lineWidth = 0.026;
      ctx.beginPath();
      ctx.arc(0, 0.02, 0.215, Math.PI * 1.17, Math.PI * 1.83);
      ctx.stroke();
    }
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(-0.243, -0.09);
    ctx.lineTo(0.243, -0.09);
    ctx.stroke();

    // One 편전 per level, nocked side by side -- parallel, so they stay
    // readable however many there are.
    const pull = build.muzzle * 0.07;
    ctx.fillStyle = bow;
    for (let i = 0; i < build.level; i += 1) {
      const ax = (i - (build.level - 1) / 2) * 0.085;
      ctx.beginPath();
      ctx.moveTo(ax, -0.34 + pull);
      ctx.lineTo(ax + 0.042, -0.19 + pull);
      ctx.lineTo(ax - 0.042, -0.19 + pull);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(ax - 0.011, -0.21 + pull, 0.022, 0.13);
    }
  } else if (build.kind === 'cannon') {
    // 천자총통: banded bronze barrel recoiling in a timber cradle.
    ctx.fillStyle = SHADE.woodMid;
    roundRect(ctx, -0.19, 0.0, 0.38, 0.28, 0.04);
    ctx.fill();
    ctx.fillStyle = SHADE.woodDark;
    roundRect(ctx, -0.19, 0.2, 0.38, 0.1, 0.03);
    ctx.fill();
    ctx.fillStyle = SHADE.woodLit;
    ctx.fillRect(-0.19, 0.0, 0.38, 0.03);

    ctx.save();
    ctx.translate(0, build.muzzle * 0.06);
    // A heavier piece each level: wider bore, longer barrel, more bands.
    const bore = 0.088 + (build.level - 1) * 0.016;
    const barrelTop = -0.36 - (build.level - 1) * 0.025;
    const barrelLen = 0.1 - barrelTop;
    const cast = metal(build.level);
    ctx.fillStyle = cast.dark;
    roundRect(ctx, -bore, barrelTop, bore * 2, barrelLen, 0.03);
    ctx.fill();
    ctx.fillStyle = cast.mid;
    roundRect(ctx, -bore, barrelTop, bore * 1.14, barrelLen, 0.03);
    ctx.fill();
    ctx.fillStyle = cast.lit;
    ctx.fillRect(-bore, barrelTop, 0.028, barrelLen);
    ctx.fillStyle = cast.dark;
    const bands = 2 + build.level;
    for (let i = 0; i < bands; i += 1) {
      ctx.fillRect(
        -bore - 0.007,
        barrelTop + 0.07 + (i * (barrelLen - 0.12)) / bands,
        bore * 2 + 0.014,
        0.026,
      );
    }
    ctx.fillStyle = cast.mid;
    roundRect(ctx, -bore - 0.018, barrelTop - 0.05, bore * 2 + 0.036, 0.07, 0.02);
    ctx.fill();
    if (build.level >= 3) {
      // A gilt muzzle ring, the mark of a piece the crew kept for itself.
      ctx.strokeStyle = cast.lit;
      ctx.lineWidth = 0.018;
      roundRect(ctx, -bore - 0.018, barrelTop - 0.05, bore * 2 + 0.036, 0.07, 0.02);
      ctx.stroke();
    }
    ctx.fillStyle = SHADE.bore;
    ctx.beginPath();
    ctx.ellipse(0, barrelTop - 0.02, bore * 0.62, 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
    if (build.muzzle > 0) {
      ctx.globalAlpha = build.muzzle;
      ctx.fillStyle = SHADE.flash;
      ctx.beginPath();
      ctx.ellipse(
        0,
        -0.45,
        0.09 + build.muzzle * 0.05,
        0.13 + build.muzzle * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  } else {
    // 화차: rocket cart, tube mouths facing the target.
    const cart = metal(build.level);
    ctx.strokeStyle = build.level >= 2 ? cart.dark : SHADE.woodDark;
    ctx.lineWidth = 0.042;
    const wheelR = 0.11 + build.level * 0.012;
    for (const wx of [-0.29, 0.29]) {
      ctx.beginPath();
      ctx.arc(wx, 0.19, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx - 0.085, 0.105);
      ctx.lineTo(wx + 0.085, 0.275);
      ctx.moveTo(wx + 0.085, 0.105);
      ctx.lineTo(wx - 0.085, 0.275);
      ctx.stroke();
    }
    ctx.fillStyle = SHADE.woodMid;
    roundRect(ctx, -0.3, 0.04, 0.6, 0.16, 0.03);
    ctx.fill();
    ctx.fillStyle = SHADE.woodDark;
    roundRect(ctx, -0.29, -0.36, 0.58, 0.42, 0.04);
    ctx.fill();
    ctx.fillStyle = SHADE.woodMid;
    roundRect(ctx, -0.29, -0.36, 0.58, 0.05, 0.02);
    ctx.fill();
    // More tubes are bored into the rack at each level: 3x4, 4x4, then 4x5.
    const tubeRows = build.level === 1 ? 3 : 4;
    const tubeCols = build.level === 3 ? 5 : 4;
    const tubeR = build.level === 3 ? 0.03 : 0.035;
    const colGap = 0.52 / tubeCols;
    const rowGap = 0.34 / tubeRows;
    const colX = (col: number) => (col - (tubeCols - 1) / 2) * colGap;
    ctx.fillStyle = SHADE.bore;
    for (let row = 0; row < tubeRows; row += 1) {
      for (let col = 0; col < tubeCols; col += 1) {
        ctx.beginPath();
        ctx.arc(colX(col), -0.31 + rowGap * 0.5 + row * rowGap, tubeR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const heat = build.muzzle;
    if (heat > 0) {
      ctx.globalAlpha = heat;
      ctx.fillStyle = SHADE.flash;
      for (let col = 0; col < tubeCols; col += 1) {
        ctx.beginPath();
        ctx.arc(colX(col), -0.33, tubeR + 0.005 + heat * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (build.level >= 2) {
      // Brass, then gilt, strapping around the rack.
      ctx.strokeStyle = cart.mid;
      ctx.lineWidth = 0.022 + (build.level - 2) * 0.012;
      roundRect(ctx, -0.29, -0.36, 0.58, 0.42, 0.04);
      ctx.stroke();
    }
    ctx.strokeStyle = build.level >= 3 ? cart.lit : def.color;
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(time * 4 + build.id));
    ctx.lineWidth = 0.025;
    roundRect(ctx, -0.29, -0.36, 0.58, 0.42, 0.04);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  ctx.restore();

  if (build.level > 1) {
    ctx.fillStyle = def.color;
    for (let i = 0; i < build.level; i += 1) {
      ctx.beginPath();
      ctx.arc(x - 0.15 + i * 0.15, y + 0.37, 0.038, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  const def = ENEMIES[enemy.kind];
  const flash = enemy.hitFlash > 0;
  const chilled = enemy.slow > 0 && enemy.slowResist < 1;
  const r = enemy.radius;
  const body = flash ? PALETTE.paper : def.color;

  ctx.save();
  ctx.translate(enemy.x + enemy.kickX, enemy.y + enemy.kickY);

  // Contact shadow. The scout goes over what you build, so it carries a longer
  // shadow and rides higher than the rest.
  ctx.fillStyle = enemy.ignoresWalls ? SHADE.cast : SHADE.castSoft;
  ctx.beginPath();
  ctx.ellipse(0.03, enemy.ignoresWalls ? 0.22 : 0.11, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  if (enemy.ignoresWalls) ctx.translate(0, -0.13);

  ctx.rotate(enemy.angle + Math.PI / 2);
  const squash = 1 - (enemy.hitFlash / 0.14) * 0.2;
  ctx.scale(squash, squash);

  const torso = (rx: number, ry: number) => {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0.02 * r, r * rx, r * ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.022;
    ctx.stroke();
  };

  /** Head under a lacquered hat, set forward of the torso so the figure reads
   *  as facing somewhere. Centring it just turns the unit into a ring. */
  const head = (radius: number) => {
    const hy = -r * 0.62;
    ctx.fillStyle = SHADE.lacquer;
    ctx.beginPath();
    ctx.arc(0, hy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.018;
    ctx.stroke();
    ctx.fillStyle = SHADE.hatLit;
    ctx.beginPath();
    ctx.arc(-radius * 0.28, hy - radius * 0.28, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  };

  if (enemy.kind === 'runner') {
    // 왜검병: light infantry with the blade already drawn
    torso(0.68, 1.0);
    ctx.strokeStyle = SHADE.ironLit;
    ctx.lineWidth = 0.026;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.25);
    ctx.quadraticCurveTo(r * 1.2, -r * 0.1, r * 1.45, -r * 0.75);
    ctx.stroke();
    head(r * 0.34);
  } else if (enemy.kind === 'gunner') {
    // 조총병: matchlock carried across the body, match cord lit
    torso(0.78, 1.0);
    ctx.strokeStyle = SHADE.woodDark;
    ctx.lineWidth = 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.5);
    ctx.lineTo(r * 0.95, -r * 0.85);
    ctx.stroke();
    ctx.strokeStyle = SHADE.ironMid;
    ctx.lineWidth = 0.026;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, r * 0.05);
    ctx.lineTo(r * 0.95, -r * 0.85);
    ctx.stroke();
    ctx.fillStyle = SHADE.ember;
    ctx.beginPath();
    ctx.arc(r * 1.0, -r * 0.9, 0.028, 0, Math.PI * 2);
    ctx.fill();
    head(r * 0.33);
  } else if (enemy.kind === 'armored') {
    // 사무라이: shoulder plates and a crest on the helmet
    ctx.fillStyle = SHADE.lacquer;
    for (const sx of [-1, 1]) {
      roundRect(ctx, sx * r * 0.7 - r * 0.28, -r * 0.35, r * 0.56, r * 0.8, 0.04);
      ctx.fill();
    }
    torso(0.82, 1.0);
    ctx.strokeStyle = PALETTE.ochre;
    ctx.lineWidth = 0.038;
    ctx.beginPath();
    ctx.arc(0, -r * 0.62, r * 0.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    head(r * 0.32);
  } else if (enemy.kind === 'scout') {
    // 척후병: conical straw hat seen from above
    ctx.fillStyle = SHADE.lacquer;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.022;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(12,20,16,0.45)';
    ctx.lineWidth = 0.026;
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
      ctx.stroke();
    }
    ctx.fillStyle = SHADE.lacquer;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'boss') {
    // 왜장: commander with a sashimono banner on his back
    ctx.strokeStyle = SHADE.woodDark;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.4);
    ctx.lineTo(0, r * 1.5);
    ctx.stroke();
    ctx.fillStyle = PALETTE.cinnabar;
    roundRect(ctx, -r * 0.05, r * 0.72, r * 0.62, r * 0.7, 0.02);
    ctx.fill();
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.02;
    ctx.stroke();

    ctx.fillStyle = SHADE.lacquer;
    for (const sx of [-1, 1]) {
      roundRect(ctx, sx * r * 0.78 - r * 0.3, -r * 0.4, r * 0.6, r * 0.95, 0.05);
      ctx.fill();
    }
    torso(0.88, 1.02);
    ctx.strokeStyle = PALETTE.ochre;
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, -r * 0.78);
    ctx.quadraticCurveTo(0, -r * 1.35, r * 0.42, -r * 0.78);
    ctx.stroke();
    head(r * 0.3);
    ctx.strokeStyle = PALETTE.boss;
    ctx.globalAlpha = 0.3 + 0.25 * Math.abs(Math.sin(time * 2));
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // 아시가루: spear infantry, the bulk of the invasion
    ctx.strokeStyle = SHADE.woodLit;
    ctx.lineWidth = 0.042;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.55);
    ctx.lineTo(r * 0.16, -r * 1.35);
    ctx.stroke();
    ctx.fillStyle = SHADE.ironLit;
    ctx.beginPath();
    ctx.moveTo(r * 0.12, -r * 1.72);
    ctx.lineTo(r * 0.29, -r * 1.24);
    ctx.lineTo(-r * 0.02, -r * 1.26);
    ctx.closePath();
    ctx.fill();
    torso(0.74, 1.0);
    head(r * 0.35);
  }

  if (chilled) {
    ctx.strokeStyle = 'rgba(116,192,164,0.85)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (enemy.burn > 0 && enemy.burnDelay <= 0) drawBurn(ctx, enemy, time);

  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  if (ratio < 1) {
    const w = enemy.kind === 'boss' ? 1 : 0.58;
    const barX = enemy.x + enemy.kickX;
    const barY = enemy.y + enemy.kickY - r - (enemy.ignoresWalls ? 0.36 : 0.24);
    ctx.fillStyle = 'rgba(12,20,16,0.85)';
    roundRect(ctx, barX - w / 2, barY, w, 0.09, 0.045);
    ctx.fill();
    ctx.fillStyle = enemy.kind === 'boss' ? PALETTE.boss : PALETTE.paper;
    roundRect(ctx, barX - w / 2, barY, w * ratio, 0.09, 0.045);
    ctx.fill();
  }
}

/**
 * 판에 그려지는 것과 같은 그림으로 적 한 종류의 모습만 작은 배지로 그린다.
 * drawBuildPreview 와 같은 방식 — drawEnemy 는 좌표만 있으면 되는 순수 함수라
 * 판을 굴리지 않고도 가짜 Enemy 하나로 같은 그림을 그릴 수 있다.
 */
export function drawEnemyPreview(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  size: number,
  dpr = 1,
): void {
  const def = ENEMIES[kind];
  const px = size * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  ctx.scale(px, px);
  ctx.translate(0.5, 0.56);
  const scale = kind === 'boss' ? 0.56 : 0.86;
  ctx.scale(scale, scale);
  const enemy: Enemy = {
    id: 0,
    kind,
    hp: 1,
    maxHp: 1,
    baseSpeed: def.speed,
    armor: def.armor,
    reward: def.reward,
    leak: def.leak,
    ignoresWalls: def.ignoresWalls,
    slowResist: def.slowResist,
    radius: def.radius,
    x: 0,
    y: 0,
    angle: -Math.PI / 2,
    leg: 0,
    nodes: [],
    node: 0,
    travelled: 0,
    slow: 0,
    hitFlash: 0,
    burn: 0,
    burnDelay: 0,
    kickX: 0,
    kickY: 0,
    dead: false,
  };
  drawEnemy(ctx, enemy, 0);
  ctx.restore();
}

// 배치 전 미리보기용 실루엣. drawBuild 내부가 자기 alpha 를 직접 정하는 부분이
// 많아 바깥에서 globalAlpha 를 씌워도 먹히지 않으므로, 오프스크린 캔버스에 한
// 번 그려 두고 그 결과 이미지를 옅게 겹쳐 찍는다 — 레벨 1 렌더는 시간에 따라
// 변하지 않으므로(강화 이펙트는 레벨 2 이상에서만 붙는다) 종류별로 한 번만
// 그리면 되고, 매 프레임 다시 그릴 필요가 없다.
const ghostCanvasCache = new Map<BuildKind, HTMLCanvasElement>();

function getGhostCanvas(kind: BuildKind): HTMLCanvasElement | null {
  let canvas = ghostCanvasCache.get(kind);
  if (canvas) return canvas;
  if (typeof document === 'undefined') return null;
  canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawBuildPreview(ctx, kind, 1, 128);
  ghostCanvasCache.set(kind, canvas);
  return canvas;
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  previewKind: BuildKind | null,
): void {
  if (engine.selected === null) return;
  const col = colOf(engine.selected);
  const row = rowOf(engine.selected);
  const build = engine.buildAt(col, row);
  const kind = build ? build.kind : (previewKind ?? engine.pending);
  if (!kind) {
    ctx.strokeStyle = PALETTE.celadon;
    ctx.lineWidth = 0.05;
    roundRect(ctx, col + 0.06, row + 0.06, 0.88, 0.88, 0.08);
    ctx.stroke();
    return;
  }

  const range = build ? towerRange(kind, build.level) : towerRange(kind, 1);
  const color = BUILDS[kind].color;

  if (range > 0) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(col + 0.5, row + 0.5, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.04;
    ctx.setLineDash([0.16, 0.14]);
    ctx.beginPath();
    ctx.arc(col + 0.5, row + 0.5, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 아직 세우지 않은 자리라면(호버 중이거나 선택만 된 상태) 그 무기의 그림자를
  // 얹어서 무엇이 어디에 들어갈지 미리 보여준다.
  if (!build) {
    const ghost = getGhostCanvas(kind);
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(ghost, col, row, 1, 1);
      ctx.restore();
    }
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 0.05;
  roundRect(ctx, col + 0.06, row + 0.06, 0.88, 0.88, 0.08);
  ctx.stroke();
}

/** One munition in flight. Split out of the board loop so the codex can
 *  show the very same shot a piece throws at each level. */
function drawShot(ctx: CanvasRenderingContext2D, shot: Shot): void {
  const heading = Math.atan2(shot.vy, shot.vx);
  ctx.save();
  ctx.translate(shot.x, shot.y);

  if (shot.kind === 'cannon') {
    // A bigger bore throws a heavier ball: more powder smoke behind it, and
    // from level 3 the iron leaves the muzzle still glowing.
    const puffs = 2 + shot.level;
    const ball = 0.088 + shot.level * 0.014;
    ctx.fillStyle = SHADE.smoke;
    for (let i = 1; i <= puffs; i += 1) {
      ctx.beginPath();
      ctx.arc(
        -Math.cos(heading) * 0.1 * i,
        -Math.sin(heading) * 0.1 * i,
        0.05 + shot.level * 0.011 - i * 0.009,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (shot.level >= 2) {
      // Burning wadding trailing the shot.
      ctx.fillStyle = shot.level >= 3 ? SHADE.flash : SHADE.ember;
      for (let i = 1; i <= shot.level; i += 1) {
        ctx.globalAlpha = 0.6 / i;
        ctx.beginPath();
        ctx.arc(
          -Math.cos(heading) * 0.13 * i,
          -Math.sin(heading) * 0.13 * i,
          0.03 - i * 0.005,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (shot.level >= 3) {
      const halo = ctx.createRadialGradient(0, 0, ball * 0.4, 0, 0, ball * 2.2);
      halo.addColorStop(0, 'rgba(255,170,74,0.55)');
      halo.addColorStop(1, 'rgba(255,170,74,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, ball * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = SHADE.iron;
    ctx.beginPath();
    ctx.arc(0, 0, ball, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shot.level >= 3 ? SHADE.ember : SHADE.ironEdge;
    ctx.beginPath();
    ctx.arc(-ball * 0.29, -ball * 0.33, ball * 0.37, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // An arrow crosses its range in about a quarter second, so it needs a
    // trail and a heavy head to register at all at board scale.
    ctx.rotate(heading);

    // A reinforced position looses more than one shaft at a time; the
    // companions fly slightly off-axis so the volley reads as a volley.
    if (shot.level >= 2) {
      ctx.strokeStyle = shot.color;
      ctx.lineWidth = 0.026;
      ctx.globalAlpha = 0.55;
      for (let i = 1; i < shot.level; i += 1) {
        const off = (i % 2 === 0 ? 1 : -1) * 0.075 * i;
        ctx.beginPath();
        ctx.moveTo(-0.26 - i * 0.05, off);
        ctx.lineTo(-0.02 - i * 0.05, off);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = shot.color;
    ctx.lineWidth = 0.03 + (shot.level - 1) * 0.008;
    ctx.beginPath();
    ctx.moveTo(-0.34 - (shot.level - 1) * 0.1, 0);
    ctx.lineTo(-0.16, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.058;
    ctx.beginPath();
    ctx.moveTo(-0.19, 0);
    ctx.lineTo(0.12, 0);
    ctx.stroke();

    ctx.strokeStyle = shot.color;
    ctx.lineWidth = 0.034;
    ctx.beginPath();
    ctx.moveTo(-0.19, 0);
    ctx.lineTo(0.12, 0);
    ctx.stroke();

    ctx.lineWidth = 0.026;
    ctx.beginPath();
    ctx.moveTo(-0.19, 0);
    ctx.lineTo(-0.09, 0.075);
    ctx.moveTo(-0.19, 0);
    ctx.lineTo(-0.09, -0.075);
    ctx.stroke();

    // The head is forged to match the bow that threw it.
    const tip = 0.25 + (shot.level - 1) * 0.03;
    const barb = 0.072 + (shot.level - 1) * 0.008;
    ctx.fillStyle = shot.level === 1 ? SHADE.ironLit : metal(shot.level).lit;
    ctx.beginPath();
    ctx.moveTo(tip, 0);
    ctx.lineTo(0.08, barb);
    ctx.lineTo(0.08, -barb);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = SHADE.foeRim;
    ctx.lineWidth = 0.016;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 옮겨붙는 불길: 앞 적에서 다음 적까지 휘어진 불줄기가 앞으로 자라나고, 끝에 불덩이가
 * 달려 간다. 곧은 발사선과 모양을 달리해서 "번진다"는 게 한눈에 보이게 한다.
 */
function drawCatch(ctx: CanvasRenderingContext2D, beam: Beam, fade: number): void {
  const dx = beam.bx - beam.ax;
  const dy = beam.by - beam.ay;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const side = beam.seed < 0.5 ? -1 : 1;
  const bend = len * (0.28 + beam.seed * 0.12) * side;
  const cx = (beam.ax + beam.bx) / 2 - (dy / len) * bend;
  const cy = (beam.ay + beam.by) / 2 + (dx / len) * bend;
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * beam.ax + 2 * u * t * cx + t * t * beam.bx,
      y: u * u * beam.ay + 2 * u * t * cy + t * t * beam.by,
    };
  };
  const grow = Math.min(1, (beam.span - beam.life) / 0.08);
  const heavy = beam.level - 1;

  const trace = () => {
    ctx.beginPath();
    for (let i = 0; i <= 10; i += 1) {
      const p = at((grow * i) / 10);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  };
  ctx.lineCap = 'round';
  trace();
  ctx.globalAlpha = fade * 0.5;
  ctx.strokeStyle = SHADE.ember;
  ctx.lineWidth = 0.12 + heavy * 0.035;
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = SHADE.flash;
  ctx.lineWidth = 0.04 + heavy * 0.01;
  ctx.stroke();

  const head = at(grow);
  ctx.fillStyle = SHADE.flash;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.07 + heavy * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 포탄 자리의 그을음: 가운데가 짙은 검댕이 서서히 옅어진다. */
function drawScorches(ctx: CanvasRenderingContext2D, scorches: readonly Scorch[]): void {
  for (const s of scorches) {
    const k = s.life / s.span;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, 'rgba(12,9,6,' + (0.55 * k).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(24,18,11,' + (0.3 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(24,18,11,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void {
  ctx.lineCap = 'round';
  for (const p of particles) {
    const k = Math.max(0, p.life / p.span);
    if (p.kind === 'flash') {
      const r = p.size * (0.55 + (1 - k) * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(255,248,225,' + (0.95 * k).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(255,200,110,' + (0.6 * k).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (p.kind === 'smoke') {
      ctx.globalAlpha = 0.32 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 1.4), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (p.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
      continue;
    }
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/** 불이 붙은 적: 몸 위로 일렁이는 불꽃 세 가닥. 꺼질 즈음 작아지며 사라진다. */
function drawBurn(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  const k = Math.min(1, enemy.burn / 0.35);
  const r = enemy.radius;
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const flick = 0.5 + 0.5 * Math.sin(time * 18 + enemy.id * 1.7 + i * 2.1);
    const fx = enemy.x + enemy.kickX + (i - 1) * r * 0.55;
    const fy = enemy.y + enemy.kickY - r * 0.15;
    const h = r * (0.9 + flick * 0.6) * (0.5 + k * 0.5);
    const w = r * 0.34;
    for (const [color, scale] of [
      [SHADE.ember, 1],
      [SHADE.flash, 0.55],
    ] as const) {
      ctx.globalAlpha = (0.55 + flick * 0.35) * k;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(fx - w * scale, fy);
      ctx.quadraticCurveTo(fx - w * scale * 0.6, fy - h * scale * 0.6, fx, fy - h * scale);
      ctx.quadraticCurveTo(fx + w * scale * 0.6, fy - h * scale * 0.6, fx + w * scale, fy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** One 신기전 volley, likewise shared with the codex. */
function drawBeam(ctx: CanvasRenderingContext2D, beam: Beam): void {
  if (beam.delay > 0) return;
  // 처음 절반은 또렷하게 머물고 나머지 동안 사그라든다.
  const fade = Math.min(1, (beam.life / beam.span) * 2);
  if (beam.hop > 0) {
    drawCatch(ctx, beam, fade);
    return;
  }
  const along = Math.atan2(beam.by - beam.ay, beam.bx - beam.ax);
  // A wider rack sends more 신기전 down the same line, fanned across it.
  const nx = -Math.sin(along);
  const ny = Math.cos(along);
  const shafts = beam.level;

  ctx.globalAlpha = fade * 0.5;
  ctx.strokeStyle = SHADE.ember;
  ctx.lineWidth = 0.1 + (beam.level - 1) * 0.04;
  ctx.beginPath();
  ctx.moveTo(beam.ax, beam.ay);
  ctx.lineTo(beam.bx, beam.by);
  ctx.stroke();

  ctx.globalAlpha = fade;
  ctx.strokeStyle = SHADE.flash;
  ctx.lineWidth = 0.034;
  for (let i = 0; i < shafts; i += 1) {
    const off = (i - (shafts - 1) / 2) * 0.07;
    ctx.beginPath();
    ctx.moveTo(beam.ax + nx * off, beam.ay + ny * off);
    ctx.lineTo(beam.bx + nx * off * 0.25, beam.by + ny * off * 0.25);
    ctx.stroke();
  }

  ctx.fillStyle = SHADE.flash;
  ctx.beginPath();
  ctx.arc(beam.bx, beam.by, 0.05 + fade * 0.02 + (beam.level - 1) * 0.018, 0, Math.PI * 2);
  ctx.fill();

  const spread = beam.seed * Math.PI * 2;
  ctx.fillStyle = SHADE.ember;
  for (let i = 0; i < beam.level + 1; i += 1) {
    const a = spread + i * 2.3;
    const reach = 0.09 + (beam.level - 1) * 0.02;
    ctx.beginPath();
    ctx.arc(beam.bx + Math.cos(a) * reach, beam.by + Math.sin(a) * reach, 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draws one piece at one upgrade level into its own square canvas, at whatever
 * pixel size the caller asks for. The board renderer and the codex therefore
 * cannot drift apart: both go through drawBuild.
 */
export function drawBuildPreview(
  ctx: CanvasRenderingContext2D,
  kind: BuildKind,
  level: number,
  size: number,
  dpr = 1,
  time = 0,
): void {
  const px = size * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  ctx.scale(px, px);
  drawBuild(
    ctx,
    {
      id: kind.length * 7 + level,
      cell: 0,
      // drawBuild centres on col + 0.5, so cell 0 puts the piece at 0.5 in
      // unit space -- the middle of a canvas scaled by its own size.
      col: 0,
      row: 0,
      kind,
      level,
      invested: 0,
      cooldown: 0,
      skillUnlocked: false,
      skillCooldown: 0,
      // drawBuild turns by angle + PI/2, so this points the piece up the page.
      angle: -Math.PI / 2,
      pulse: 0,
      muzzle: 0,
    },
    time,
  );
  ctx.restore();
}

/**
 * Draws the munition a piece throws at one level, flying left to right across
 * its own strip. Goes through drawShot / drawBeam, so it cannot drift from
 * what the board shows. 마름쇠 and 목책 fire nothing and draw nothing.
 */
export function drawMunitionPreview(
  ctx: CanvasRenderingContext2D,
  kind: BuildKind,
  level: number,
  width: number,
  height: number,
  dpr = 1,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  if (kind === 'wall' || kind === 'caltrop') return;

  // One board tile is 1.0, so scaling by the strip height would draw the
  // munition at exactly its in-game size -- too small to compare three levels
  // side by side, hence the magnification.
  const unit = height * dpr * 1.7;
  ctx.save();
  ctx.scale(unit, unit);
  const across = (width * dpr) / unit;

  if (kind === 'hwacha') {
    drawBeam(ctx, {
      ax: 0.1,
      ay: 0.29,
      bx: across - 0.14,
      by: 0.29,
      life: 1,
      span: 1,
      delay: 0,
      hop: 0,
      seed: 0.3,
      level,
    });
    return ctx.restore();
  }

  drawShot(ctx, {
    kind,
    level,
    x: across * 0.62,
    y: 0.29,
    vx: 1,
    vy: 0,
    speed: 1,
    targetId: 0,
    damage: 0,
    splash: 0,
    pierceArmor: false,
    color: BUILDS[kind].color,
    life: 1,
  });
  ctx.restore();
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  view: View,
  time: number,
  previewKind: BuildKind | null = null,
): void {
  const { tile, ox, oy, width, height, dpr } = view;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, width, height);

  const jitter = engine.shake > 0 ? engine.shake * tile * 0.16 : 0;
  const shakeX = jitter ? (Math.random() - 0.5) * jitter : 0;
  const shakeY = jitter ? (Math.random() - 0.5) * jitter : 0;

  ctx.save();
  ctx.translate(ox + shakeX, oy + shakeY);
  ctx.scale(tile, tile);

  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, COLS, ROWS);

  drawTerrain(ctx);
  drawCoast(ctx, time);
  drawGrid(ctx);
  strokeRoute(ctx, engine.route, (time * 1.1) % 0.66);
  drawPads(ctx, engine);
  drawLanding(ctx, time);
  drawCheckpoints(ctx, time);
  drawSelection(ctx, engine, previewKind);
  drawFortress(ctx, engine, time);
  drawScorches(ctx, engine.scorches);

  for (const build of engine.builds.values()) drawBuild(ctx, build, time);

  for (const ring of engine.rings) {
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = Math.max(0, ring.life * 2.6);
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const enemy of engine.enemies) drawEnemy(ctx, enemy, time);

  // Each piece throws its own munition: a fletched arrow, an iron ball trailing
  // powder smoke, and the hwacha's fire arrows as streaks along their flight.
  ctx.lineCap = 'round';
  for (const shot of engine.shots) drawShot(ctx, shot);

  for (const beam of engine.beams) drawBeam(ctx, beam);
  drawParticles(ctx, engine.particles);
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = PALETTE.ink;
  ctx.font = Math.round(tile * 0.32) + "px 'Song Myung', 'Batang', serif";
  CHECKPOINTS.forEach((cell, i) => {
    ctx.fillText(
      CHECKPOINT_NUMERALS[i] ?? String(i + 1),
      ox + shakeX + (cell.col + 0.54) * tile,
      oy + shakeY + (cell.row + 0.31 + checkpointWave(time, i) * 0.5) * tile,
    );
  });

  // 연속 격파 숫자: 왜군이 상륙하는 배 옆에 띄워, 적이 쏟아지는 자리와 붙여
  // 보여준다. 늘어날 땐 즉시 커지고, 끊기면 "콤보 끊김" 같은 문구 없이
  // comboEcho 가 스스로 옅어지며 줄어드는 동안 함께 흐려지다 사라진다.
  if (engine.comboEcho > 1.5) {
    const mul = comboMultiplier(Math.round(engine.comboEcho));
    const alpha = Math.min(1, engine.comboEcho / 3);
    const tier = mul >= 3.5 ? PALETTE.boss : mul >= 2 ? PALETTE.ochre : PALETTE.celadon;
    const pulse = 1 + engine.comboPulse * 0.34;
    const label = String(Math.round(engine.comboEcho));

    ctx.save();
    ctx.translate(ox + shakeX + (ENTRY.col + 2.75) * tile, oy + shakeY + (ENTRY.row + 0.85) * tile);

    // 격파할 때마다 한 번씩 퍼지는 충격 고리
    if (engine.comboPulse > 0.02) {
      ctx.globalAlpha = engine.comboPulse * alpha * 0.6;
      ctx.strokeStyle = tier;
      ctx.lineWidth = tile * 0.022;
      ctx.beginPath();
      ctx.arc(0, 0, tile * (0.36 + (1 - engine.comboPulse) * 0.55), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 숫자 뒤로 은은히 번지는 빛무리
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, tile * 0.85);
    halo.addColorStop(0, tier + 'a0');
    halo.addColorStop(0.55, tier + '30');
    halo.addColorStop(1, tier + '00');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, tile * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // 최고 배율이면 사방으로 빛살이 돈다
    if (mul >= 3.5) {
      ctx.save();
      ctx.rotate(time * 1.4);
      ctx.strokeStyle = tier;
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = tile * 0.02;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * tile * 0.5, Math.sin(a) * tile * 0.5);
        ctx.lineTo(Math.cos(a) * tile * 0.8, Math.sin(a) * tile * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.scale(pulse, pulse);
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.font = '800 ' + Math.round(tile * 0.72) + "px 'Song Myung', 'Batang', serif";
    ctx.lineWidth = tile * 0.05;
    ctx.strokeStyle = 'rgba(18,14,9,0.85)';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = tier;
    ctx.fillText(label, 0, 0);

    ctx.font = '700 ' + Math.round(tile * 0.19) + "px 'Gowun Batang', 'Batang', serif";
    ctx.lineWidth = tile * 0.026;
    ctx.strokeText('연속 격파', 0, tile * 0.44);
    ctx.fillStyle = PALETTE.paper;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillText('연속 격파', 0, tile * 0.44);
    ctx.restore();
  }

  ctx.font = '700 ' + Math.round(tile * 0.22) + "px 'Gowun Batang', 'Batang', serif";
  ctx.fillStyle = PALETTE.boss;
  for (const enemy of engine.enemies) {
    if (enemy.kind !== 'boss' || enemy.dead) continue;
    ctx.fillText(
      ENEMIES.boss.name,
      ox + shakeX + (enemy.x + enemy.kickX) * tile,
      oy + shakeY + (enemy.y + enemy.kickY - enemy.radius - 0.4) * tile,
    );
  }

  for (const note of engine.notes) {
    ctx.globalAlpha = Math.min(1, note.life * 1.6);
    ctx.fillStyle = note.color;
    ctx.font =
      (note.big ? 700 : 600) +
      ' ' +
      Math.round(tile * (note.big ? 0.34 : 0.28)) +
      "px 'Gowun Batang', 'Batang', serif";
    ctx.fillText(note.text, ox + note.x * tile, oy + note.y * tile);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
