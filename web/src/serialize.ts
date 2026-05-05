import type { Outcome, SolverMemo } from "../../src/index.js";

export const MEMO_MAGIC = "CCS\0";
export const MEMO_VERSION = 1;

const HEADER_BYTES = 4 + 1 + 4; // magic + version + count
const KEY_BYTES = 16;
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
  // We treat the memo as "iterable of [key, value]". Map satisfies this directly.
  // For ShardedSolverMemo, the caller is responsible for producing entries
  // (we only ever serialize a Map in v1; ShardedSolverMemo is unused at write time).
  const entries: Array<[string, Outcome]> = [];
  for (const [k, v] of memo as unknown as Map<string, Outcome>) {
    entries.push([k, v]);
  }
  const bytes = new Uint8Array(HEADER_BYTES + entries.length * ENTRY_BYTES);
  // magic
  for (let i = 0; i < MEMO_MAGIC.length; i++) {
    bytes[i] = MEMO_MAGIC.charCodeAt(i);
  }
  bytes[4] = MEMO_VERSION;
  // count (uint32 LE)
  const view = new DataView(bytes.buffer);
  view.setUint32(5, entries.length, true);
  // entries
  let offset = HEADER_BYTES;
  for (const [key, outcome] of entries) {
    if (key.length !== KEY_BYTES) {
      throw new Error(`expected ${KEY_BYTES}-byte key, got ${key.length}`);
    }
    for (let i = 0; i < KEY_BYTES; i++) {
      bytes[offset + i] = key.charCodeAt(i);
    }
    bytes[offset + KEY_BYTES] = outcomeToByte(outcome);
    offset += ENTRY_BYTES;
  }
  return bytes;
}

export function deserializeMemo(bytes: Uint8Array): Map<string, Outcome> {
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
  const result = new Map<string, Outcome>();
  let offset = HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    // One String.fromCharCode call per entry (16 args inline) is much faster
    // than a 16-iteration `key += String.fromCharCode(...)` loop.
    const key = String.fromCharCode(
      bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!,
      bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!,
      bytes[offset + 8]!, bytes[offset + 9]!, bytes[offset + 10]!, bytes[offset + 11]!,
      bytes[offset + 12]!, bytes[offset + 13]!, bytes[offset + 14]!, bytes[offset + 15]!,
    );
    result.set(key, byteToOutcome(bytes[offset + KEY_BYTES]!));
    offset += ENTRY_BYTES;
  }
  return result;
}
