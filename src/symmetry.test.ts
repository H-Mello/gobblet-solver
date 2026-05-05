import { describe, expect, it } from "vitest";
import { canonicalKey } from "./symmetry.js";
import {
  type Coord,
  encodePiece,
  initialState,
  setCell,
} from "./state.js";

function place(s: ReturnType<typeof initialState>, r: Coord, c: Coord, v: number) {
  setCell(s, r, c, v as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

describe("canonicalKey", () => {
  it("is identical for the empty board across all transforms", () => {
    expect(canonicalKey(initialState())).toBe(canonicalKey(initialState()));
  });

  it("matches across rotations", () => {
    // P0 small at (0,0) — under rotations it lands at (0,2), (2,2), (2,0).
    const positions: [Coord, Coord][] = [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
    ];
    const keys = positions.map(([r, c]) => {
      const s = initialState();
      place(s, r, c, encodePiece(0, 1));
      return canonicalKey(s);
    });
    for (const k of keys) expect(k).toBe(keys[0]);
  });

  it("matches across reflections", () => {
    // Diagonal pair on each diagonal — equivalent under reflection.
    const a = initialState();
    place(a, 0, 0, encodePiece(0, 2));
    place(a, 1, 1, encodePiece(1, 1));

    const b = initialState();
    place(b, 0, 2, encodePiece(0, 2));
    place(b, 1, 1, encodePiece(1, 1));

    expect(canonicalKey(a)).toBe(canonicalKey(b));
  });

  it("differs for non-symmetric boards", () => {
    const a = initialState();
    place(a, 0, 0, encodePiece(0, 1));
    place(a, 0, 1, encodePiece(0, 1));

    const b = initialState();
    place(b, 0, 0, encodePiece(0, 1));
    place(b, 1, 1, encodePiece(0, 1));

    expect(canonicalKey(a)).not.toBe(canonicalKey(b));
  });

  it("does not conflate states that differ only in reserves or turn", () => {
    const a = initialState();
    const b = initialState();
    b.data[15] = 1; // flip turn
    expect(canonicalKey(a)).not.toBe(canonicalKey(b));

    const c = initialState();
    c.data[9] = 0; // P0 used a small
    expect(canonicalKey(a)).not.toBe(canonicalKey(c));
  });
});
