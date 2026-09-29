import { CHECKPOINTS, COLS, ENTRY, EXIT, ROWS, type Cell } from './config';

export const CELL_COUNT = COLS * ROWS;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function index(col: number, row: number): number {
  return row * COLS + col;
}

export function colOf(cell: number): number {
  return cell % COLS;
}

export function rowOf(cell: number): number {
  return Math.floor(cell / COLS);
}

export function onBoard(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

const RESERVED = new Uint8Array(CELL_COUNT);
RESERVED[index(ENTRY.col, ENTRY.row)] = 1;
RESERVED[index(EXIT.col, EXIT.row)] = 1;
for (const cell of CHECKPOINTS) RESERVED[index(cell.col, cell.row)] = 1;

export function isReserved(col: number, row: number): boolean {
  return onBoard(col, row) && RESERVED[index(col, row)] === 1;
}

/** Every tile is buildable except the entry, the exit and the four checkpoints. */
export function isBuildable(col: number, row: number): boolean {
  return onBoard(col, row) && RESERVED[index(col, row)] === 0;
}

export const LEG_TARGETS: readonly number[] = [
  index(ENTRY.col, ENTRY.row),
  ...CHECKPOINTS.map((cell) => index(cell.col, cell.row)),
  index(EXIT.col, EXIT.row),
];

export const CHECKPOINT_CELLS: readonly number[] = CHECKPOINTS.map((cell) =>
  index(cell.col, cell.row),
);

const queue = new Int32Array(CELL_COUNT);
const prev = new Int32Array(CELL_COUNT);

/**
 * Shortest walk between two tiles, four directional, treating built tiles as
 * walls. `from` is allowed to be blocked so a walker standing inside a fresh
 * wall can still find its way out.
 */
export function walk(blocked: Uint8Array, from: number, to: number): number[] | null {
  if (from === to) return [from];
  prev.fill(-1);
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  prev[from] = from;

  while (head < tail) {
    const current = queue[head++]!;
    const col = current % COLS;
    const row = (current - col) / COLS;
    for (let k = 0; k < 4; k += 1) {
      const nc = col + DX[k]!;
      const nr = row + DY[k]!;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const next = nr * COLS + nc;
      if (prev[next] !== -1) continue;
      if (blocked[next] === 1) continue;
      prev[next] = current;
      if (next === to) {
        const path: number[] = [next];
        let step = current;
        while (step !== from) {
          path.push(step);
          step = prev[step]!;
        }
        path.push(from);
        path.reverse();
        return path;
      }
      queue[tail++] = next;
    }
  }
  return null;
}

/** The walk a fresh walker takes: entry, then each checkpoint in order, then the
 *  exit. Returns null when the board is sealed. */
export function fullRoute(blocked: Uint8Array): number[] | null {
  const route: number[] = [];
  for (let i = 0; i < LEG_TARGETS.length - 1; i += 1) {
    const leg = walk(blocked, LEG_TARGETS[i]!, LEG_TARGETS[i + 1]!);
    if (!leg) return null;
    if (i === 0) route.push(...leg);
    else route.push(...leg.slice(1));
  }
  return route;
}

export function routeExists(blocked: Uint8Array): boolean {
  for (let i = 0; i < LEG_TARGETS.length - 1; i += 1) {
    if (!walk(blocked, LEG_TARGETS[i]!, LEG_TARGETS[i + 1]!)) return false;
  }
  return true;
}

export function centerOf(cell: number): { x: number; y: number } {
  return { x: (cell % COLS) + 0.5, y: Math.floor(cell / COLS) + 0.5 };
}

export function cellsToPoints(cells: readonly number[]): Array<{ x: number; y: number }> {
  return cells.map((cell) => centerOf(cell));
}

export function checkpointCell(leg: number): number {
  return leg < CHECKPOINT_CELLS.length ? CHECKPOINT_CELLS[leg]! : index(EXIT.col, EXIT.row);
}

export function cellFromPoint(x: number, y: number): Cell {
  return { col: Math.floor(x), row: Math.floor(y) };
}
