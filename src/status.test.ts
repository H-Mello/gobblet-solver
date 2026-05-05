import { describe, expect, it } from "vitest";
import { gameStatus } from "./status.js";
import {
  encodePiece,
  initialState,
  setCell,
  setReserve,
  setTurn,
} from "./state.js";

describe("gameStatus", () => {
  it("reports ongoing with toMove=0 on the initial board", () => {
    expect(gameStatus(initialState())).toEqual({ kind: "ongoing", toMove: 0 });
  });

  it("reports a win when there is a 3-in-a-row of top pieces", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 2));
    setCell(s, 0, 2, encodePiece(0, 3));
    expect(gameStatus(s)).toEqual({ kind: "win", player: 0 });
  });

  it("reports draw when the current player has no legal moves", () => {
    // Drain P0's reserves entirely. Whether or not P1 has moves, the game ends
    // immediately as a draw under the current rule.
    const s = initialState();
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    setTurn(s, 0);
    expect(gameStatus(s)).toEqual({ kind: "draw" });
  });

  it("does not mutate the input state", () => {
    const s = initialState();
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    const before = new Uint8Array(s.data);
    gameStatus(s);
    expect(s.data).toEqual(before);
  });
});
