import type { Outcome, SolverMemo } from "../../src/index.js";

export const MEMO_MAGIC = "CCS\0";
// Bump on rule changes or format changes so cached results from older
// versions get rejected.
// v1 = strictly larger, opponent only; stuck → skip turn.    (16-byte string keys)
// v2 = strictly larger, any owner; stuck → skip turn.        (16-byte string keys)
// v3 = strictly larger, any owner; stuck → immediate draw.   (16-byte string keys)
// v4 = same rules as v3, but the memo key is a 40-bit int    (5-byte LE keys).
export const MEMO_VERSION = 4;

const HEADER_BYTES = 4 + 1 + 4; // magic + version + count
const KEY_BYTES = 5;
const ENTRY_BYTES = KEY_BYTES + 1;

function outcomeToByte(o: Outcome): number {
  if (o.winner === "draw") return 2;
  return o.winner === 0 ? 0 : 1;
}

function byteToOutcome(b: number): Outcome {
  if (b === 0) return { winner: 0 };
  if (b === 1) return { winner: 1 };
  if (b === 2) return { winner: "draw" };
  throw new Error(`unknown outcome byte: ${b}`);
}

export function serializeMemo(memo: SolverMemo): Uint8Array {
  const entries: Array<[number, Outcome]> = [];
  for (const [k, v] of memo) {
    entries.push([k, v]);
  }
  const bytes = new Uint8Array(HEADER_BYTES + entries.length * ENTRY_BYTES);
  for (let i = 0; i < MEMO_MAGIC.length; i++) {
    bytes[i] = MEMO_MAGIC.charCodeAt(i);
  }
  bytes[4] = MEMO_VERSION;
  const view = new DataView(bytes.buffer);
  view.setUint32(5, entries.length, true);

  let offset = HEADER_BYTES;
  for (const [key, outcome] of entries) {
    // Lower 32 bits via uint32 LE; high 8 bits separately.
    view.setUint32(offset, key >>> 0, true);
    view.setUint8(offset + 4, Math.floor(key / 0x100000000));
    bytes[offset + KEY_BYTES] = outcomeToByte(outcome);
    offset += ENTRY_BYTES;
  }
  return bytes;
}

export function deserializeMemo(bytes: Uint8Array): Map<number, Outcome> {
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== MEMO_MAGIC) {
    throw new Error(`bad magic: expected ${JSON.stringify(MEMO_MAGIC)}, got ${JSON.stringify(magic)}`);
  }
  const version = bytes[4];
  if (version !== MEMO_VERSION) {
    throw new Error(`unsupported memo version ${version}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(5, true);
  const result = new Map<number, Outcome>();
  let offset = HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    const lo = view.getUint32(offset, true);
    const hi = view.getUint8(offset + 4);
    const key = hi * 0x100000000 + lo;
    result.set(key, byteToOutcome(bytes[offset + KEY_BYTES]!));
    offset += ENTRY_BYTES;
  }
  return result;
}
