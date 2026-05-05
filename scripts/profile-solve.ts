// Instrumented profile of the initial-state solve.
//
// Strategy: run solve once "cold" with counters wired into the hot paths so we
// can see which phase costs what. We patch the public functions to count calls
// and accumulate time spent inside each.
//
// Caveat: instrumentation itself slows things down (every call does
// performance.now() bookkeeping). Treat the *ratios* between phases as the
// signal, not the absolute times.

import {
  applyMove as origApplyMove,
  bestPlay,
  canPlace as origCanPlace,
  initialState,
  legalMoves as origLegalMoves,
  solve,
  winner as origWinner,
} from "../src/index.js";
import { canonicalKey as origCanonicalKey } from "../src/symmetry.js";

type Counter = { count: number; nanos: bigint };
const counters: Record<string, Counter> = {};
function counter(name: string): Counter {
  return (counters[name] ??= { count: 0, nanos: 0n });
}

function instrument<T extends (...args: never[]) => unknown>(
  name: string,
  fn: T,
): T {
  const c = counter(name);
  return ((...args: Parameters<T>) => {
    const t0 = process.hrtime.bigint();
    const out = fn(...args);
    c.nanos += process.hrtime.bigint() - t0;
    c.count += 1;
    return out;
  }) as T;
}

// Replace the hot functions with instrumented versions for this script only.
// We use module-level shims so the solver internally still calls the originals
// (Vite-style binding); but `bestPlay` / `solve` we can replace at call site.
//
// For the solver internals (compute, canonicalKey, applyMove, etc.) the only
// way to instrument is to patch via a re-export wrapper script in the main
// entry. Since those calls are intra-module, this script measures only what
// the consumer can observe directly: solve, canonicalKey (called from solve),
// and the public move/legality helpers via a separate measurement.

const solveCounter = counter("solve");
const canonicalCounter = counter("canonicalKey");
const applyMoveCounter = counter("applyMove");
const legalMovesCounter = counter("legalMoves");
const canPlaceCounter = counter("canPlace");
const winnerCounter = counter("winner");

const solveInstr = instrument("solve", solve);
const canonicalInstr = instrument("canonicalKey", origCanonicalKey);
// Note: these aren't called from inside solve directly because the solver
// internally references its own private copies. We measure them with a
// secondary loop below to estimate per-call cost.
void instrument;
void [
  solveCounter,
  canonicalCounter,
  applyMoveCounter,
  legalMovesCounter,
  canPlaceCounter,
  winnerCounter,
  origApplyMove,
  origCanPlace,
  origLegalMoves,
  origWinner,
  canonicalInstr,
];

// --- Phase 1: full solve -----------------------------------------------------

console.log("Phase 1: cold solve from initial state");
const t0 = performance.now();
const memo = new Map();
const result = bestPlay(initialState(), memo);
const totalMs = performance.now() - t0;
console.log(`  outcome:        ${JSON.stringify(result.outcome)}`);
console.log(`  states cached:  ${memo.size.toLocaleString()}`);
console.log(`  total time:     ${totalMs.toFixed(0)} ms`);

// --- Phase 2: micro-benchmarks for the hot helpers ---------------------------

console.log("\nPhase 2: micro-benchmark of hot helpers");

// canonicalKey throughput — sample N keys from the live memo, compute their
// canonicalKey-equivalent on a constructed state, and time it.
const sampleKeys = Array.from(memo.keys()).slice(0, 100_000);
console.log(`  canonicalKey samples: ${sampleKeys.length.toLocaleString()}`);

// Reconstruct a state from each key and time canonicalKey on it.
function stateFromKey(key: string) {
  const data = new Uint8Array(16);
  for (let i = 0; i < 16; i++) data[i] = key.charCodeAt(i);
  return { data };
}

{
  const states = sampleKeys.map(stateFromKey);
  const t = performance.now();
  for (const s of states) origCanonicalKey(s);
  const dt = performance.now() - t;
  const per = (dt / states.length) * 1e6; // ns per call
  console.log(`  canonicalKey:   ${dt.toFixed(0)} ms total / ${per.toFixed(0)} ns per call`);
}

{
  const states = sampleKeys.map(stateFromKey);
  const t = performance.now();
  for (const s of states) origLegalMoves(s);
  const dt = performance.now() - t;
  const per = (dt / states.length) * 1e6;
  console.log(`  legalMoves:     ${dt.toFixed(0)} ms total / ${per.toFixed(0)} ns per call`);
}

{
  const states = sampleKeys.map(stateFromKey);
  const t = performance.now();
  let movesCount = 0;
  for (const s of states) {
    const ms = origLegalMoves(s);
    if (ms.length > 0) {
      const m = ms[0]!;
      origApplyMove(s, m);
      movesCount++;
    }
  }
  const dt = performance.now() - t;
  const per = (dt / movesCount) * 1e6;
  console.log(`  legalMoves+1 applyMove: ${dt.toFixed(0)} ms / ${per.toFixed(0)} ns per legalMoves+applyMove pair`);
}

{
  const states = sampleKeys.map(stateFromKey);
  const t = performance.now();
  for (const s of states) origWinner(s);
  const dt = performance.now() - t;
  const per = (dt / states.length) * 1e6;
  console.log(`  winner:         ${dt.toFixed(0)} ms total / ${per.toFixed(0)} ns per call`);
}

// Map<string, Outcome> ops
{
  const t = performance.now();
  for (const k of sampleKeys) memo.get(k);
  const dt = performance.now() - t;
  const per = (dt / sampleKeys.length) * 1e6;
  console.log(`  Map.get:        ${dt.toFixed(0)} ms total / ${per.toFixed(0)} ns per call`);
}

// String allocation cost (approximate the canonicalKey output cost in isolation)
{
  const data = new Uint8Array(16);
  const t = performance.now();
  let s = "";
  for (let i = 0; i < 100_000; i++) {
    s = String.fromCharCode(
      data[0]!, data[1]!, data[2]!, data[3]!, data[4]!, data[5]!, data[6]!, data[7]!,
      data[8]!, data[9]!, data[10]!, data[11]!, data[12]!, data[13]!, data[14]!, data[15]!,
    );
  }
  const dt = performance.now() - t;
  const per = (dt / 100_000) * 1e6;
  console.log(`  String.fromCharCode(16 args): ${dt.toFixed(0)} ms / ${per.toFixed(0)} ns per call`);
  void s;
}

// --- Phase 3: compute extrapolations -----------------------------------------

console.log("\nPhase 3: extrapolation");

// Approximate # of recursive solve invocations.
// In a memoized search, # of solve invocations = # of unique states visited
// (cache misses) PLUS cache hits (each child is solved once but parents look
// up cached children many times). We can estimate cache hits by branching
// factor.

// Rough: avg branching ~10 (real game tree at 3x3). Each parent triggers up to
// branching child solves; child solves usually hit memo. So cache lookups ~=
// states * avg branching = 10M * 10 = 100M.
console.log(`  states cached: ${memo.size.toLocaleString()}`);
console.log(`  est. memo lookups (states * ~10 branching) = ${(memo.size * 10).toLocaleString()}`);
console.log(`  est. applyMove calls (memo writes * branching) ≈ ${(memo.size * 10).toLocaleString()}`);
console.log(`  est. canonicalKey calls = lookups + writes ≈ ${(memo.size * 11).toLocaleString()}`);
