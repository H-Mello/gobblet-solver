import { describe, expect, it } from "vitest";
import type { Outcome } from "../../src/index.js";
import { deserializeMemo, serializeMemo, MEMO_MAGIC, MEMO_VERSION } from "./serialize.js";

function makeMemo(entries: Array<[number, Outcome]>): Map<number, Outcome> {
  return new Map(entries);
}

describe("serialize / deserialize memo", () => {
  it("round-trips an empty memo", () => {
    const bytes = serializeMemo(new Map());
    expect(bytes.length).toBe(9); // 4 magic + 1 version + 4 count
    const restored = deserializeMemo(bytes);
    expect(restored.size).toBe(0);
  });

  it("round-trips a small memo", () => {
    // Use a large key (>2^32) and a small one to exercise both halves of the
    // 5-byte uint40 encoding.
    const key1 = 0;
    const key2 = 0xFE_DCBA_9876; // ~1.09 trillion, fits in 40 bits
    const memo = makeMemo([
      [key1, { winner: "draw" }],
      [key2, { winner: 0 }],
    ]);
    const bytes = serializeMemo(memo);
    expect(bytes.length).toBe(9 + 2 * 6);
    const restored = deserializeMemo(bytes);
    expect(restored.size).toBe(2);
    expect(restored.get(key1)).toEqual({ winner: "draw" });
    expect(restored.get(key2)).toEqual({ winner: 0 });
  });

  it("encodes the magic and version in the header", () => {
    const bytes = serializeMemo(new Map());
    const magic = Array.from(bytes.slice(0, 4))
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(magic).toBe(MEMO_MAGIC);
    expect(bytes[4]).toBe(MEMO_VERSION);
  });

  it("rejects an unknown magic", () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(() => deserializeMemo(bytes)).toThrow(/magic/i);
  });

  it("rejects an unsupported version", () => {
    const bytes = new Uint8Array(9);
    new TextEncoder().encodeInto("CCS\0", bytes);
    bytes[4] = 99;
    expect(() => deserializeMemo(bytes)).toThrow(/version/i);
  });
});
