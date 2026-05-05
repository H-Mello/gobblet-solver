import {
  type CellValue,
  type Coord,
  type GameState,
  type Player,
  type Size,
  BOARD_SIZE,
  cellAt,
  ownerOf,
  reserveOf,
  sizeOf,
} from "./state.js";

export function canPlace(
  state: GameState,
  player: Player,
  size: Size,
  r: Coord,
  c: Coord,
): boolean {
  if (reserveOf(state, player, size) <= 0) return false;

  const top = cellAt(state, r, c);
  if (top === 0) return true;

  const topSize = sizeOf(top);
  if (topSize === null) return false;

  // A piece covers any strictly smaller top piece, regardless of owner.
  return size > topSize;
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function winner(state: GameState): Player | null {
  for (const line of LINES) {
    const a = state.data[line[0]] as CellValue;
    const b = state.data[line[1]] as CellValue;
    const c = state.data[line[2]] as CellValue;
    if (a === 0 || b === 0 || c === 0) continue;
    const oa = ownerOf(a);
    if (oa === null) continue;
    if (ownerOf(b) === oa && ownerOf(c) === oa) return oa;
  }
  return null;
}

// re-exported for callers that want to iterate the board manually.
export { BOARD_SIZE };
