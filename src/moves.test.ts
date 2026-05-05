import { describe, expect, it } from "vitest";
import { applyMove, legalMoves, type Move } from "./moves.js";
import {
  cellAt,
  encodePiece,
  initialState,
  reserveOf,
  setCell,
  setReserve,
  setTurn,
  turn,
} from "./state.js";

describe("legalMoves", () => {
  it("returns 27 moves on the initial board (3 sizes × 9 empty cells)", () => {
    const moves = legalMoves(initialState());
    expect(moves).toHaveLength(27);
  });

  it("excludes a size whose reserve is empty", () => {
    const s = initialState();
    setReserve(s, 0, 3, 0);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(18);
    expect(moves.every((m) => m.size !== 3)).toBe(true);
  });

  it("forbids any cover of the current player's own piece", () => {
    const s = initialState();
    setCell(s, 1, 1, encodePiece(0, 1));
    const moves = legalMoves(s);
    expect(moves.some((m) => m.row === 1 && m.col === 1)).toBe(false);
  });

  it("allows strictly larger covers over the opponent's piece", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 1));
    const center = (m: Move) => m.row === 0 && m.col === 0;
    const moves = legalMoves(s).filter(center);
    expect(moves.map((m) => m.size).sort()).toEqual([2, 3]);
  });

  it("returns empty when the current player has no piece that can cover and no empty squares", () => {
    const s = initialState();
    // Fill every square with opponent's large pieces — but P1 only has 2 larges,
    // so we use a mix. The intent here is just to verify the empty-list branch.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        setCell(s, r as 0 | 1 | 2, c as 0 | 1 | 2, encodePiece(1, 3));
      }
    }
    expect(legalMoves(s)).toEqual([]);
  });

  it("uses the current turn's player, not a fixed one", () => {
    const s = initialState();
    setTurn(s, 1);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(27);
  });
});

describe("applyMove", () => {
  it("places the piece, decrements reserve, flips turn", () => {
    const s = initialState();
    const next = applyMove(s, { size: 2, row: 1, col: 1 });
    expect(cellAt(next, 1, 1)).toBe(encodePiece(0, 2));
    expect(reserveOf(next, 0, 2)).toBe(2);
    expect(turn(next)).toBe(1);
    // P1 untouched.
    expect(reserveOf(next, 1, 2)).toBe(3);
  });

  it("does not mutate the input state", () => {
    const s = initialState();
    const before = new Uint8Array(s.data);
    applyMove(s, { size: 1, row: 0, col: 0 });
    expect(s.data).toEqual(before);
  });

  it("supports a chain of two moves", () => {
    const s0 = initialState();
    const s1 = applyMove(s0, { size: 2, row: 0, col: 0 });
    const s2 = applyMove(s1, { size: 3, row: 0, col: 0 });
    expect(cellAt(s2, 0, 0)).toBe(encodePiece(1, 3));
    expect(reserveOf(s2, 0, 2)).toBe(2);
    expect(reserveOf(s2, 1, 3)).toBe(1);
    expect(turn(s2)).toBe(0);
  });

  it("throws on covering own piece", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    expect(() => applyMove(s, { size: 2, row: 0, col: 0 })).toThrow(/illegal/);
  });

  it("throws on same-size opponent cover", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 2));
    expect(() => applyMove(s, { size: 2, row: 0, col: 0 })).toThrow(/illegal/);
  });

  it("throws when reserve is empty", () => {
    const s = initialState();
    setReserve(s, 0, 3, 0);
    expect(() => applyMove(s, { size: 3, row: 1, col: 1 })).toThrow(/illegal/);
  });
});
