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

// Canonical cache key: lex-smallest D4 transform of the board portion,
// concatenated with the (transform-invariant) reserve and turn bytes.
export function canonicalKey(state: GameState): string {
  const data = state.data;
  let bestIdx = 0;
  outer: for (let t = 1; t < T_COUNT; t++) {
    const cur = TRANSFORMS[t]!;
    const best = TRANSFORMS[bestIdx]!;
    for (let i = 0; i < 9; i++) {
      const a = data[cur[i]!]!;
      const b = data[best[i]!]!;
      if (a < b) {
        bestIdx = t;
        continue outer;
      }
      if (a > b) continue outer;
    }
  }
  const perm = TRANSFORMS[bestIdx]!;
  const out = new Array<number>(16);
  for (let i = 0; i < 9; i++) out[i] = data[perm[i]!]!;
  for (let i = 9; i < 16; i++) out[i] = data[i]!;
  return String.fromCharCode(...out);
}
