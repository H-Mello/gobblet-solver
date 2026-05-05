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

// Pre-allocated outcome sentinels. The deserialize hot path runs ~10M
// iterations; freshly allocating { winner: ... } each time was a meaningful
// chunk of total cost. The Outcome type is conceptually immutable.
const OUT_P0: Outcome = { winner: 0 };
const OUT_P1: Outcome = { winner: 1 };
const OUT_DRAW: Outcome = { winner: "draw" };

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
  const { count } = readHeader(bytes);
  const result = new Map<number, Outcome>();
  decodeRange(bytes, result, HEADER_BYTES, count);
  return result;
}

// Async chunked variant. Yields back to the event loop every `chunkSize`
// entries so the UI can paint the progress bar / spinner / etc. between
// chunks. `onProgress` is called with the running entry count after each
// chunk and once at the end. `total` is reported alongside so the caller
// can show a determinate bar from the very first tick.
export async function deserializeMemoChunked(
  bytes: Uint8Array,
  onProgress: (current: number, total: number) => void,
  // Bigger chunks = fewer setTimeout(0) yields = less scheduling overhead.
  // 500K entries is ~100 ms of work per chunk on a desktop, ~250 ms on a
  // phone — fast enough that the UI still feels responsive between chunks.
  chunkSize = 500_000,
): Promise<Map<number, Outcome>> {
  const { count } = readHeader(bytes);
  onProgress(0, count);
  const result = new Map<number, Outcome>();
  let offset = HEADER_BYTES;
  let i = 0;
  while (i < count) {
    const end = Math.min(i + chunkSize, count);
    offset = decodeRangePartial(bytes, result, offset, i, end);
    i = end;
    onProgress(i, count);
    if (i < count) {
      // Yield to the event loop so the UI can repaint the progress bar.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return result;
}

// Tight decode loop. Avoids DataView method-call overhead, the function call
// to byteToOutcome, and per-entry Outcome allocation. ~30% faster than the
// previous implementation on a 10M-entry memo.
function decodeRange(
  bytes: Uint8Array,
  result: Map<number, Outcome>,
  startOffset: number,
  count: number,
): void {
  decodeRangePartial(bytes, result, startOffset, 0, count);
}

function decodeRangePartial(
  bytes: Uint8Array,
  result: Map<number, Outcome>,
  startOffset: number,
  fromIdx: number,
  toIdx: number,
): number {
  let offset = startOffset;
  for (let i = fromIdx; i < toIdx; i++) {
    // 5-byte little-endian uint40 inline. Avoids DataView indirection.
    const b0 = bytes[offset]!;
    const b1 = bytes[offset + 1]!;
    const b2 = bytes[offset + 2]!;
    const b3 = bytes[offset + 3]!;
    const b4 = bytes[offset + 4]!;
    // Reconstruct lower 32 bits as unsigned. The `>>> 0` defends against
    // sign-extension when b3 has its high bit set.
    const lo = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    const key = b4 * 0x100000000 + lo;
    const outByte = bytes[offset + 5]!;
    const outcome =
      outByte === 0 ? OUT_P0
      : outByte === 1 ? OUT_P1
      : outByte === 2 ? OUT_DRAW
      : null;
    if (outcome === null) {
      throw new Error(`unknown outcome byte ${outByte} at entry ${i}`);
    }
    result.set(key, outcome);
    offset += ENTRY_BYTES;
  }
  return offset;
}

function readHeader(bytes: Uint8Array): { count: number } {
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== MEMO_MAGIC) {
    throw new Error(`bad magic: expected ${JSON.stringify(MEMO_MAGIC)}, got ${JSON.stringify(magic)}`);
  }
  const version = bytes[4];
  if (version !== MEMO_VERSION) {
    throw new Error(`unsupported memo version ${version}`);
  }
  // count is a uint32 LE at byte 5.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(5, true);
  return { count };
}
