/// <reference lib="webworker" />

import {
  type GameState,
  type Outcome,
  type SolverMemo,
  bestPlay,
} from "../../src/index.js";
import { serializeMemo } from "./serialize.js";

// Thin wrapper over a Map that posts a "progress" message every N inserts.
// Postings are queued from the worker's microtask queue while the synchronous
// solve runs, so they reach the main thread continuously rather than only at
// the end.
class ReportingMemo implements SolverMemo {
  readonly #inner = new Map<number, Outcome>();
  #lastReported = 0;

  constructor(private readonly reportEvery: number) {}

  get(key: number): Outcome | undefined {
    return this.#inner.get(key);
  }

  set(key: number, value: Outcome): void {
    this.#inner.set(key, value);
    const size = this.#inner.size;
    if (size - this.#lastReported >= this.reportEvery) {
      this.#lastReported = size;
      (self as unknown as Worker).postMessage({ type: "progress", size });
    }
  }

  get size(): number {
    return this.#inner.size;
  }

  *[Symbol.iterator](): IterableIterator<[number, Outcome]> {
    yield* this.#inner;
  }
}

interface SolveRequest {
  type: "solve";
  state: GameState;
  reportEvery?: number;
}

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  if (e.data.type !== "solve") return;
  const memo = new ReportingMemo(e.data.reportEvery ?? 50_000);
  // bestPlay() instead of solve() so the memo is fully populated for the
  // entire reachable game tree (~10.24M states), not just the subset solve()
  // needs to prove the result (~8.37M). This costs ~3s extra at solve time
  // but means every later HintCache build is a pure memo lookup — no
  // on-demand exploration during hint render. Worth it for the UX.
  bestPlay(e.data.state, memo);
  // Final progress tick so the UI snaps to its true last value.
  (self as unknown as Worker).postMessage({ type: "progress", size: memo.size });
  const bytes = serializeMemo(memo);
  // Transfer the buffer zero-copy.
  (self as unknown as Worker).postMessage(
    { type: "done", size: memo.size, bytes },
    [bytes.buffer],
  );
};
