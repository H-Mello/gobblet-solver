export type Player = 0 | 1;
export type Size = 1 | 2 | 3;
export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Coord = 0 | 1 | 2;

export const BOARD_SIZE = 3;
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
export const STATE_BYTES = 16;

export const INITIAL_RESERVES: readonly [number, number, number] = [3, 3, 2];

const BOARD_OFFSET = 0;
const RESERVE_OFFSET = 9;
const TURN_OFFSET = 15;

export interface GameState {
  data: Uint8Array;
}

export function initialState(): GameState {
  const data = new Uint8Array(STATE_BYTES);
  data[RESERVE_OFFSET + 0] = INITIAL_RESERVES[0];
  data[RESERVE_OFFSET + 1] = INITIAL_RESERVES[1];
  data[RESERVE_OFFSET + 2] = INITIAL_RESERVES[2];
  data[RESERVE_OFFSET + 3] = INITIAL_RESERVES[0];
  data[RESERVE_OFFSET + 4] = INITIAL_RESERVES[1];
  data[RESERVE_OFFSET + 5] = INITIAL_RESERVES[2];
  return { data };
}

export function cloneState(s: GameState): GameState {
  return { data: new Uint8Array(s.data) };
}

export function cellIndex(r: Coord, c: Coord): number {
  return r * BOARD_SIZE + c;
}

export function cellAt(s: GameState, r: Coord, c: Coord): CellValue {
  return s.data[BOARD_OFFSET + cellIndex(r, c)] as CellValue;
}

export function setCell(s: GameState, r: Coord, c: Coord, v: CellValue): void {
  s.data[BOARD_OFFSET + cellIndex(r, c)] = v;
}

export function reserveOf(s: GameState, player: Player, size: Size): number {
  return s.data[RESERVE_OFFSET + player * 3 + (size - 1)] as number;
}

export function setReserve(s: GameState, player: Player, size: Size, count: number): void {
  s.data[RESERVE_OFFSET + player * 3 + (size - 1)] = count;
}

export function decReserve(s: GameState, player: Player, size: Size): void {
  const idx = RESERVE_OFFSET + player * 3 + (size - 1);
  const cur = s.data[idx] as number;
  if (cur <= 0) {
    throw new Error(`reserve underflow: player=${player} size=${size}`);
  }
  s.data[idx] = cur - 1;
}

export function turn(s: GameState): Player {
  return s.data[TURN_OFFSET] === 1 ? 1 : 0;
}

export function setTurn(s: GameState, p: Player): void {
  s.data[TURN_OFFSET] = p;
}

export function opp(p: Player): Player {
  return (1 - p) as Player;
}

export function encodePiece(player: Player, size: Size): CellValue {
  return ((size - 1) * 2 + player + 1) as CellValue;
}

export function ownerOf(v: CellValue): Player | null {
  if (v === 0) return null;
  return ((v - 1) & 1) as Player;
}

export function sizeOf(v: CellValue): Size | null {
  if (v === 0) return null;
  return (((v - 1) >> 1) + 1) as Size;
}

export function hashState(s: GameState): string {
  return String.fromCharCode(...s.data);
}
