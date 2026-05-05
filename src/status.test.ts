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

  it("flips toMove when the current player has no legal moves but the opponent does", () => {
    const s = initialState();
    // Drain P0's reserves entirely; P0 has no moves, P1 still does.
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    setTurn(s, 0);
    expect(gameStatus(s)).toEqual({ kind: "ongoing", toMove: 1 });
  });

  it("reports draw when both players are stuck and no winner exists", () => {
    const s = initialState();
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    setReserve(s, 1, 1, 0);
    setReserve(s, 1, 2, 0);
    setReserve(s, 1, 3, 0);
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
