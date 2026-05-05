import {
  type Coord,
  type GameState,
  type Size,
  cloneState,
  decReserve,
  encodePiece,
  reserveOf,
  setCell,
  setTurn,
  turn,
} from "./state.js";
import { canPlace } from "./legality.js";

export interface Move {
  size: Size;
  row: Coord;
  col: Coord;
}

const SIZES: readonly Size[] = [1, 2, 3];
const COORDS: readonly Coord[] = [0, 1, 2];

export function legalMoves(state: GameState): Move[] {
  const player = turn(state);
  const moves: Move[] = [];
  for (const size of SIZES) {
    if (reserveOf(state, player, size) <= 0) continue;
    for (const row of COORDS) {
      for (const col of COORDS) {
        if (canPlace(state, player, size, row, col)) {
          moves.push({ size, row, col });
        }
      }
    }
  }
  return moves;
}

export function applyMove(state: GameState, move: Move): GameState {
  const player = turn(state);
  if (!canPlace(state, player, move.size, move.row, move.col)) {
    throw new Error(
      `illegal move: player=${player} size=${move.size} cell=(${move.row},${move.col})`,
    );
  }
  const next = cloneState(state);
  decReserve(next, player, move.size);
  setCell(next, move.row, move.col, encodePiece(player, move.size));
  setTurn(next, player === 0 ? 1 : 0);
  return next;
}
