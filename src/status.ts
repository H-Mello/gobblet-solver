import {
  type GameState,
  type Player,
  cloneState,
  opp,
  setTurn,
  turn,
} from "./state.js";
import { winner } from "./legality.js";
import { legalMoves } from "./moves.js";

export type GameStatus =
  | { kind: "win"; player: Player }
  | { kind: "draw" }
  | { kind: "ongoing"; toMove: Player };

export function gameStatus(state: GameState): GameStatus {
  const w = winner(state);
  if (w !== null) return { kind: "win", player: w };

  const player = turn(state);
  if (legalMoves(state).length > 0) return { kind: "ongoing", toMove: player };

  const other = opp(player);
  const skipped = cloneState(state);
  setTurn(skipped, other);
  if (legalMoves(skipped).length > 0) return { kind: "ongoing", toMove: other };

  return { kind: "draw" };
}
