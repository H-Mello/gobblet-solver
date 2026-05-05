import { describe, expect, it } from "vitest";
import {
  cellAt,
  cloneState,
  decReserve,
  encodePiece,
  hashState,
  initialState,
  ownerOf,
  reserveOf,
  setCell,
  setTurn,
  sizeOf,
  turn,
} from "./state.js";

describe("initialState", () => {
  it("starts empty with full reserves and turn 0", () => {
    const s = initialState();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(cellAt(s, r as 0 | 1 | 2, c as 0 | 1 | 2)).toBe(0);
      }
    }
    for (const p of [0, 1] as const) {
      expect(reserveOf(s, p, 1)).toBe(3);
      expect(reserveOf(s, p, 2)).toBe(3);
      expect(reserveOf(s, p, 3)).toBe(2);
    }
    expect(turn(s)).toBe(0);
  });
});

describe("piece encoding round-trip", () => {
  it("matches the encoding table from the design", () => {
    expect(encodePiece(0, 1)).toBe(1);
    expect(encodePiece(1, 1)).toBe(2);
    expect(encodePiece(0, 2)).toBe(3);
    expect(encodePiece(1, 2)).toBe(4);
    expect(encodePiece(0, 3)).toBe(5);
    expect(encodePiece(1, 3)).toBe(6);
  });

  it("decodes owner and size correctly", () => {
    for (const p of [0, 1] as const) {
      for (const sz of [1, 2, 3] as const) {
        const v = encodePiece(p, sz);
        expect(ownerOf(v)).toBe(p);
        expect(sizeOf(v)).toBe(sz);
      }
    }
    expect(ownerOf(0)).toBeNull();
    expect(sizeOf(0)).toBeNull();
  });
});

describe("cloneState", () => {
  it("does not share the underlying buffer", () => {
    const a = initialState();
    setCell(a, 0, 0, 5);
    const b = cloneState(a);
    setCell(b, 0, 0, 0);
    expect(cellAt(a, 0, 0)).toBe(5);
    expect(cellAt(b, 0, 0)).toBe(0);
  });
});

describe("decReserve", () => {
  it("decrements and underflows loudly", () => {
    const s = initialState();
    decReserve(s, 0, 3);
    decReserve(s, 0, 3);
    expect(reserveOf(s, 0, 3)).toBe(0);
    expect(() => decReserve(s, 0, 3)).toThrow(/underflow/);
  });
});

describe("hashState", () => {
  it("matches for identical states", () => {
    const a = initialState();
    const b = initialState();
    expect(hashState(a)).toBe(hashState(b));
  });

  it("differs when any byte differs", () => {
    const a = initialState();
    const b = initialState();
    setCell(b, 1, 1, 1);
    expect(hashState(a)).not.toBe(hashState(b));

    const c = initialState();
    setTurn(c, 1);
    expect(hashState(a)).not.toBe(hashState(c));
  });

  it("works as a Map key", () => {
    const m = new Map<string, number>();
    const a = initialState();
    m.set(hashState(a), 42);
    const b = initialState();
    expect(m.get(hashState(b))).toBe(42);
    setCell(b, 0, 0, 1);
    expect(m.get(hashState(b))).toBeUndefined();
  });
});
