import { type GameState, type Player, turn } from "./state.js";
import { winner } from "./legality.js";
import { legalMoves } from "./moves.js";

export type GameStatus =
  | { kind: "win"; player: Player }
  | { kind: "draw" }
  | { kind: "ongoing"; toMove: Player };

export function gameStatus(state: GameState): GameStatus {
  const w = winner(state);
  if (w !== null) return { kind: "win", player: w };
  if (legalMoves(state).length === 0) return { kind: "draw" };
  return { kind: "ongoing", toMove: turn(state) };
}
