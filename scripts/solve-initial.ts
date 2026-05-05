import { bestPlay, initialState, type SolverMemo } from "../src/index.js";

const memo: SolverMemo = new Map();
const t0 = performance.now();
const result = bestPlay(initialState(), memo);
const ms = performance.now() - t0;

console.log(`solved initial position in ${ms.toFixed(1)} ms`);
console.log(`memoized states: ${memo.size}`);
console.log(`outcome: ${JSON.stringify(result.outcome)}`);
const { p0Wins, p1Wins, draws } = result.stats;
console.log(
  `tally over all 27 first moves: P0 wins=${p0Wins}, P1 wins=${p1Wins}, draws=${draws}`,
);
console.log(`optimal first moves (${result.moves.length}):`);
for (const m of result.moves) {
  const sizeName = ["", "small", "medium", "large"][m.size];
  console.log(`  ${sizeName} at (${m.row}, ${m.col})`);
}
