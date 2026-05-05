import {
  bestPlay,
  createMemo,
  initialState,
  solve,
  type SolverMemo,
} from "../src/index.js";

// Phase 1: solve() — what the worker actually does. Has an early-cutoff in
// compute() so it stops exploring as soon as a forced win is found, caching
// only the states needed to prove the result.
{
  const memo: SolverMemo = createMemo();
  const t0 = performance.now();
  solve(initialState(), memo);
  const ms = performance.now() - t0;
  console.log(
    `solve(initialState): ${ms.toFixed(1)} ms, ${memo.size.toLocaleString()} states cached`,
  );
}

// Phase 2: bestPlay() — exhaustively evaluates every legal move at the root
// to build the W/L/D tally, so it caches a strict superset of the states
// solve() does.
{
  const memo: SolverMemo = createMemo();
  const t0 = performance.now();
  const result = bestPlay(initialState(), memo);
  const ms = performance.now() - t0;
  console.log(
    `bestPlay(initialState): ${ms.toFixed(1)} ms, ${memo.size.toLocaleString()} states cached`,
  );
  console.log(`  outcome: ${JSON.stringify(result.outcome)}`);
  const { p0Wins, p1Wins, draws } = result.stats;
  console.log(
    `  tally over all 27 first moves: P0 wins=${p0Wins}, P1 wins=${p1Wins}, draws=${draws}`,
  );
  console.log(`  optimal first moves (${result.moves.length}):`);
  for (const m of result.moves) {
    const sizeName = ["", "small", "medium", "large"][m.size];
    console.log(`    ${sizeName} at (${m.row}, ${m.col})`);
  }
}
