import { describe, expect, it } from "vitest";
import { canPlace, winner } from "./legality.js";
import {
  type Player,
  type Size,
  encodePiece,
  initialState,
  setCell,
  setReserve,
} from "./state.js";

describe("canPlace", () => {
  it("allows placing on an empty cell when reserve has the size", () => {
    const s = initialState();
    expect(canPlace(s, 0, 2, 1, 1)).toBe(true);
  });

  it("rejects when reserve is empty", () => {
    const s = initialState();
    setReserve(s, 0, 2, 0);
    expect(canPlace(s, 0, 2, 1, 1)).toBe(false);
  });

  it("allows covering opponent's strictly smaller piece", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 1));
    expect(canPlace(s, 0, 2, 0, 0)).toBe(true);
    expect(canPlace(s, 0, 3, 0, 0)).toBe(true);
  });

  it("rejects covering own piece, regardless of size", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    expect(canPlace(s, 0, 2, 0, 0)).toBe(false);
    expect(canPlace(s, 0, 3, 0, 0)).toBe(false);
  });

  it("rejects same-size opponent cover", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 2));
    expect(canPlace(s, 0, 2, 0, 0)).toBe(false);
  });

  it("rejects covering opponent's larger or equal piece", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 3));
    expect(canPlace(s, 0, 1, 0, 0)).toBe(false);
    expect(canPlace(s, 0, 2, 0, 0)).toBe(false);
    expect(canPlace(s, 0, 3, 0, 0)).toBe(false);
  });
});

describe("winner", () => {
  function fillRow(p: Player, size: Size = 1) {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(p, size));
    setCell(s, 0, 1, encodePiece(p, size));
    setCell(s, 0, 2, encodePiece(p, size));
    return s;
  }

  it("detects a row win", () => {
    expect(winner(fillRow(0))).toBe(0);
    expect(winner(fillRow(1))).toBe(1);
  });

  it("detects a column win", () => {
    const s = initialState();
    setCell(s, 0, 1, encodePiece(0, 1));
    setCell(s, 1, 1, encodePiece(0, 2));
    setCell(s, 2, 1, encodePiece(0, 3));
    expect(winner(s)).toBe(0);
  });

  it("detects both diagonals", () => {
    const a = initialState();
    setCell(a, 0, 0, encodePiece(1, 1));
    setCell(a, 1, 1, encodePiece(1, 1));
    setCell(a, 2, 2, encodePiece(1, 1));
    expect(winner(a)).toBe(1);

    const b = initialState();
    setCell(b, 0, 2, encodePiece(0, 2));
    setCell(b, 1, 1, encodePiece(0, 2));
    setCell(b, 2, 0, encodePiece(0, 2));
    expect(winner(b)).toBe(0);
  });

  it("returns null for a mixed-owner row", () => {
    const s = initialState();
    setCell(s, 0, 0, encodePiece(0, 1));
    setCell(s, 0, 1, encodePiece(1, 1));
    setCell(s, 0, 2, encodePiece(0, 1));
    expect(winner(s)).toBeNull();
  });

  it("only counts the top piece (covered pieces are invisible)", () => {
    // P0 small under P1 medium across a row should be a P1 win.
    const s = initialState();
    setCell(s, 0, 0, encodePiece(1, 2));
    setCell(s, 0, 1, encodePiece(1, 2));
    setCell(s, 0, 2, encodePiece(1, 2));
    expect(winner(s)).toBe(1);
  });

  it("returns null on initial board", () => {
    expect(winner(initialState())).toBeNull();
  });
});
