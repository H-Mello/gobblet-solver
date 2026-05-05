import type { GameState } from "./state.js";

// Each entry is a permutation of cell indices 0..8 (row-major) representing
// one of the 8 elements of D4. permuted[i] = data[ TRANSFORMS[t][i] ].
const TRANSFORMS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8], // identity
  [6, 3, 0, 7, 4, 1, 8, 5, 2], // rotate 90 CW
  [8, 7, 6, 5, 4, 3, 2, 1, 0], // rotate 180
  [2, 5, 8, 1, 4, 7, 0, 3, 6], // rotate 270 CW
  [2, 1, 0, 5, 4, 3, 8, 7, 6], // flip horizontal
  [6, 7, 8, 3, 4, 5, 0, 1, 2], // flip vertical
  [0, 3, 6, 1, 4, 7, 2, 5, 8], // transpose
  [8, 5, 2, 7, 4, 1, 6, 3, 0], // anti-transpose
];

const T_COUNT = TRANSFORMS.length;

// Canonical cache key, packed into a 40-bit integer (fits in a JS Number; the
// safe-integer cap is 2^53 - 1).
//
//   bits 13..39  (27 bits) : lex-smallest D4-transformed board, base-8 encoded
//   bits  1..12  (12 bits) : reserves [P0-S, P0-M, P0-L, P1-S, P1-M, P1-L]
//                            packed 2 bits each (each reserve is 0..3)
//   bit  0       ( 1 bit ) : side to move (0 = P0, 1 = P1)
//
// Numeric keys are noticeably faster for Map<number, Outcome> than 16-char
// string keys: no allocation per lookup, no per-byte string comparison, and
// no String.fromCharCode call. Comparing two encodings of the board to find
// the lex-min transform is also just `<` between two numbers.
export function canonicalKey(state: GameState): number {
  const data = state.data;
  let minBoard = Number.MAX_SAFE_INTEGER;
  for (let t = 0; t < T_COUNT; t++) {
    const perm = TRANSFORMS[t]!;
    let v = 0;
    for (let i = 0; i < 9; i++) {
      v = (v << 3) | data[perm[i]!]!;
    }
    if (v < minBoard) minBoard = v;
  }
  // Pack reserves: 6 values * 2 bits.
  let reserves = 0;
  for (let i = 9; i < 15; i++) {
    reserves = (reserves << 2) | data[i]!;
  }
  // Combine: minBoard (27) << 13 | reserves (12) << 1 | turn (1).
  // The 27-bit shift exceeds JS << (32-bit signed), so use multiplication.
  return minBoard * 8192 + reserves * 2 + data[15]!;
}
