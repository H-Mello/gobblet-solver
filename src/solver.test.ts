import { describe, expect, it } from "vitest";
import { bestPlay, solve, type SolverMemo } from "./solver.js";
import {
  encodePiece,
  initialState,
  setCell,
  setReserve,
  setTurn,
} from "./state.js";
import { canonicalKey } from "./symmetry.js";

describe("solve", () => {
  it("returns the winner of an already-won state", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setCell(s, 0, 2, encodePiece(0, 1));
    expect(solve(s)).toEqual({ winner: 0 });
  });

  it("returns draw when both players are stuck", () => {
    const s = initialState();
    for (const p of [0, 1] as const) {
      setReserve(s, p, 1, 0);
      setReserve(s, p, 2, 0);
      setReserve(s, p, 3, 0);
    }
    expect(solve(s)).toEqual({ winner: "draw" });
  });

  it("recognizes a one-move forced win for the player to move", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setReserve(s, 0, 1, 1);
    setCell(s, 1, 0, encodePiece(1, 1));
    setReserve(s, 1, 1, 2);
    setTurn(s, 0);
    expect(solve(s)).toEqual({ winner: 0 });
  });

  it("populates the memo with the original state's outcome", () => {
    const memo: SolverMemo = new Map();
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setCell(s, 0, 2, encodePiece(0, 1));
    solve(s, memo);
    expect(memo.get(canonicalKey(s))).toEqual({ winner: 0 });
  });

  it("handles forced skip turns", () => {
    // P0 to move, but P0 reserves are empty → P0 must skip.
    // P1 has placed two smalls in row 0 and has one small left → after the skip P1 wins.
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 1));
    setCell(s, 0, 1, encodePiece(1, 1));
    setReserve(s, 1, 1, 1);
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    setTurn(s, 0);
    expect(solve(s)).toEqual({ winner: 1 });
  });
});

describe("bestPlay", () => {
  it("returns winning placements when a one-move win exists", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setReserve(s, 0, 1, 1);
    setCell(s, 1, 0, encodePiece(1, 1));
    setReserve(s, 1, 1, 2);
    setTurn(s, 0);

    const result = bestPlay(s);
    expect(result.outcome).toEqual({ winner: 0 });
    expect(result.moves.some((m) => m.row === 0 && m.col === 2)).toBe(true);
  });

  it("returns no moves and zero stats when the game is already over", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setCell(s, 0, 2, encodePiece(0, 1));
    expect(bestPlay(s)).toEqual({
      outcome: { winner: 0 },
      moves: [],
      stats: { p0Wins: 0, p1Wins: 0, draws: 0 },
    });
  });

  it("returns no moves when the player must skip, with the skipped-state outcome", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 1));
    setCell(s, 0, 1, encodePiece(1, 1));
    setReserve(s, 1, 1, 1);
    setReserve(s, 0, 1, 0);
    setReserve(s, 0, 2, 0);
    setReserve(s, 0, 3, 0);
    setTurn(s, 0);
    const result = bestPlay(s);
    expect(result.outcome).toEqual({ winner: 1 });
    expect(result.moves).toEqual([]);
    expect(result.stats).toEqual({ p0Wins: 0, p1Wins: 0, draws: 0 });
  });

  it("tallies child outcomes across all legal moves", () => {
    // P0 to move. Reserves: P0 has only 1 small left; P1 has nothing.
    // (0,0) and (0,1) are P0 smalls — 7 empty cells.
    // Placing at (0,2) wins for P0. Other 6 placements drain P0's last piece;
    // P1 then has no moves (skip), P0 also has no moves → draw on each.
    const s = initialState();
    for (const p of [0, 1] as const) {
      setReserve(s, p, 1, 0);
      setReserve(s, p, 2, 0);
      setReserve(s, p, 3, 0);
    }
    setReserve(s, 0, 1, 1);
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(0, 1));
    setTurn(s, 0);

    const result = bestPlay(s);
    expect(result.outcome).toEqual({ winner: 0 });
    expect(result.moves).toEqual([{ size: 1, row: 0, col: 2 }]);
    expect(result.stats).toEqual({ p0Wins: 1, p1Wins: 0, draws: 6 });
  });
});
