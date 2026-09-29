import {
  BUILDS,
  CHECKPOINTS,
  COLS,
  ENTRY,
  EXIT,
  PALETTE,
  ROWS,
  START_LIVES,
  towerRange,
} from './config';
import type { Beam, Build, Engine, Enemy, Shot } from './engine';
import { ENEMIES } from './config';
import type { BuildKind } from './config';
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

function hexPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = rot + (i / 6) * Math.PI * 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
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
  earth: '#182a1f',
  earthRim: '#22382a',
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
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = PALETTE.route;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 0.46;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.strokeStyle = PALETTE.celadon;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.07;
  ctx.setLineDash([0.26, 0.4]);
  ctx.lineDashOffset = -dash;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, time: number): void {
  const x = ENTRY.col + 0.5;
  const y = ENTRY.row + 0.5;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);

  ctx.fillStyle = 'rgba(232,71,111,0.14)';
  ctx.fillRect(ENTRY.col, ENTRY.row, 1, 1);
  ctx.strokeStyle = 'rgba(232,71,111,' + (0.4 + pulse * 0.45).toFixed(3) + ')';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(x, y - 0.1, 0.42, Math.PI * 0.06, Math.PI * 0.94);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,71,111,0.45)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(x - 0.26, y + 0.36);
  ctx.lineTo(x, y + 0.12);
  ctx.lineTo(x + 0.26, y + 0.36);
  ctx.stroke();
}

function drawCheckpoints(ctx: CanvasRenderingContext2D, time: number): void {
  CHECKPOINTS.forEach((cell, i) => {
    const x = cell.col + 0.5;
    const y = cell.row + 0.5;
    ctx.fillStyle = 'rgba(242,180,65,0.12)';
    ctx.fillRect(cell.col, cell.row, 1, 1);
    ctx.strokeStyle = PALETTE.ochre;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 0.055;
    hexPath(ctx, x, y, 0.34, time * 0.25 + i);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawExit(ctx: CanvasRenderingContext2D, engine: Engine, time: number): void {
  const x = EXIT.col + 0.5;
  const y = EXIT.row + 0.5;
  const ratio = Math.max(0, engine.lives) / START_LIVES;
  const flash = engine.coreFlash;
  const breathe = 1 + Math.sin(time * 1.8) * 0.03;

  const glow = ctx.createRadialGradient(x, y, 0.1, x, y, 1.6);
  glow.addColorStop(0, flash > 0 ? 'rgba(255,46,86,0.4)' : 'rgba(127,212,232,0.24)');
  glow.addColorStop(1, 'rgba(127,212,232,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = flash > 0 ? PALETTE.boss : PALETTE.celadon;
  ctx.lineWidth = 0.07;
  hexPath(ctx, x, y, 0.42 * breathe, time * 0.35);
  ctx.stroke();
  ctx.fillStyle = flash > 0 ? 'rgba(255,46,86,0.32)' : 'rgba(127,212,232,0.2)';
  hexPath(ctx, x, y, 0.32 * breathe, -time * 0.5);
  ctx.fill();

  ctx.strokeStyle = 'rgba(9,24,35,0.85)';
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.arc(x, y, 0.58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ratio > 0.5 ? PALETTE.celadon : ratio > 0.25 ? PALETTE.ochre : PALETTE.boss;
  ctx.lineWidth = 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, 0.58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  ctx.stroke();
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

  // 마름쇠 burns no powder, so it gets the halo but never the embers.
  drawRank(ctx, build, def.color, time, build.kind !== 'caltrop');

  if (build.kind === 'wall') {
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
  ctx.translate(enemy.x, enemy.y);

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

  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  if (ratio < 1) {
    const w = enemy.kind === 'boss' ? 1 : 0.58;
    const barY = enemy.y - r - (enemy.ignoresWalls ? 0.36 : 0.24);
    ctx.fillStyle = 'rgba(12,20,16,0.85)';
    roundRect(ctx, enemy.x - w / 2, barY, w, 0.09, 0.045);
    ctx.fill();
    ctx.fillStyle = enemy.kind === 'boss' ? PALETTE.boss : PALETTE.paper;
    roundRect(ctx, enemy.x - w / 2, barY, w * ratio, 0.09, 0.045);
    ctx.fill();
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, engine: Engine): void {
  if (engine.selected === null) return;
  const col = colOf(engine.selected);
  const row = rowOf(engine.selected);
  const build = engine.buildAt(col, row);
  const kind = build ? build.kind : engine.pending;
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

/** One 신기전 volley, likewise shared with the codex. */
function drawBeam(ctx: CanvasRenderingContext2D, beam: Beam): void {
  const fade = Math.min(1, beam.life * 7);
  const along = Math.atan2(beam.by - beam.ay, beam.bx - beam.ax);
  // A wider rack sends more 신기전 down the same line, fanned across it.
  const nx = -Math.sin(along);
  const ny = Math.cos(along);
  const shafts = beam.level;

  ctx.globalAlpha = fade * 0.45;
  ctx.strokeStyle = SHADE.ember;
  ctx.lineWidth = 0.075 + (beam.level - 1) * 0.03;
  ctx.beginPath();
  ctx.moveTo(beam.ax, beam.ay);
  ctx.lineTo(beam.bx, beam.by);
  ctx.stroke();

  ctx.globalAlpha = fade;
  ctx.strokeStyle = SHADE.flash;
  ctx.lineWidth = 0.026;
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

  drawGrid(ctx);
  strokeRoute(ctx, engine.route, (time * 1.1) % 0.66);
  drawPads(ctx, engine);
  drawGate(ctx, time);
  drawCheckpoints(ctx, time);
  drawSelection(ctx, engine);
  drawExit(ctx, engine, time);

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
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = PALETTE.ochre;
  ctx.font = '700 ' + Math.round(tile * 0.38) + "px 'IBM Plex Mono', ui-monospace, monospace";
  CHECKPOINTS.forEach((cell, i) => {
    ctx.fillText(
      String(i + 1),
      ox + shakeX + (cell.col + 0.5) * tile,
      oy + shakeY + (cell.row + 0.5) * tile + tile * 0.02,
    );
  });

  for (const note of engine.notes) {
    ctx.globalAlpha = Math.min(1, note.life * 1.6);
    ctx.fillStyle = note.color;
    ctx.font =
      (note.big ? 700 : 600) +
      ' ' +
      Math.round(tile * (note.big ? 0.34 : 0.28)) +
      "px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillText(note.text, ox + note.x * tile, oy + note.y * tile);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
