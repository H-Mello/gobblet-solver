import { type GameState, type Player, opp, turn } from "./state.js";
import { winner } from "./legality.js";
import { type Move, applyMove, legalMoves } from "./moves.js";
import { canonicalKey } from "./symmetry.js";

export type Outcome = { winner: Player } | { winner: "draw" };

// Pre-allocated singletons. The recursion sees ~10M outcome returns; allocating
// a fresh `{ winner: ... }` each time was a few hundred ms of GC pressure.
// Outcomes are conceptually immutable, so sharing is safe.
const OUTCOME_P0_WIN: Outcome = Object.freeze({ winner: 0 }) as Outcome;
const OUTCOME_P1_WIN: Outcome = Object.freeze({ winner: 1 }) as Outcome;
const OUTCOME_DRAW: Outcome = Object.freeze({ winner: "draw" }) as Outcome;

function outcomeForWinner(w: Player): Outcome {
  return w === 0 ? OUTCOME_P0_WIN : OUTCOME_P1_WIN;
}

export interface SolverMemo {
  get(key: string): Outcome | undefined;
  set(key: string, value: Outcome): void;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, Outcome]>;
}

class ShardedSolverMemo implements SolverMemo {
  readonly #shards: Map<string, Outcome>[];
  readonly #count: number;

  constructor(count = 16) {
    this.#count = count;
    this.#shards = Array.from({ length: count }, () => new Map());
  }

  #shardFor(key: string): Map<string, Outcome> {
    // djb2-ish over the board bytes (skip turn byte to spread uniformly).
    let h = 5381;
    for (let i = 0; i < 9; i++) {
      h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    }
    return this.#shards[(h >>> 0) % this.#count]!;
  }

  get(key: string): Outcome | undefined {
    return this.#shardFor(key).get(key);
  }

  set(key: string, value: Outcome): void {
    this.#shardFor(key).set(key, value);
  }

  get size(): number {
    let n = 0;
    for (const m of this.#shards) n += m.size;
    return n;
  }

  *[Symbol.iterator](): IterableIterator<[string, Outcome]> {
    for (const shard of this.#shards) {
      yield* shard;
    }
  }
}

export function createMemo(shards = 16): SolverMemo {
  return new ShardedSolverMemo(shards);
}

export interface MoveStats {
  p0Wins: number;
  p1Wins: number;
  draws: number;
}

export interface BestPlay {
  outcome: Outcome;
  moves: Move[];
  stats: MoveStats;
}

function emptyStats(): MoveStats {
  return { p0Wins: 0, p1Wins: 0, draws: 0 };
}

function tallyOutcome(stats: MoveStats, outcome: Outcome): void {
  if (outcome.winner === "draw") stats.draws++;
  else if (outcome.winner === 0) stats.p0Wins++;
  else stats.p1Wins++;
}

export function solve(state: GameState, memo: SolverMemo = createMemo()): Outcome {
  const key = canonicalKey(state);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const result = compute(state, memo);
  memo.set(key, result);
  return result;
}

// In-place make/undo move generation. Avoids two big sources of allocation:
//   1. The Move[] from legalMoves(): each call allocates an array of objects.
//   2. The fresh Uint8Array per applyMove(): one clone per move tried.
// Instead we mutate the parent's state, recurse, then undo before trying the
// next move. The mutation is invisible outside compute() because we always
// restore before returning. Cuts ~100M Uint8Array allocations and ~100M
// object allocations from a full initial-state solve.
function compute(state: GameState, memo: SolverMemo): Outcome {
  const w = winner(state);
  if (w !== null) return outcomeForWinner(w);

  const data = state.data;
  const player = (data[15]! & 1) as Player;
  const oppPlayer = (1 - player) as Player;

  let best: Outcome = outcomeForWinner(oppPlayer);
  let bestScore = -1;
  let foundAnyLegal = false;

  // size: 1 = small, 2 = medium, 3 = large
  search: for (let size = 1; size <= 3; size++) {
    const reserveIdx = 9 + player * 3 + (size - 1);
    const reserveCount = data[reserveIdx]!;
    if (reserveCount === 0) continue;
    // Cell encoding: piece byte = ((size-1)<<1) + player + 1.
    const piece = ((size - 1) << 1) + player + 1;

    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      const top = data[cellIdx]!;
      if (top !== 0) {
        const topSize = ((top - 1) >> 1) + 1;
        if (size <= topSize) continue;
      }
      foundAnyLegal = true;

      // Make
      data[cellIdx] = piece;
      data[reserveIdx] = reserveCount - 1;
      data[15] = oppPlayer;

      const childOutcome = solve(state, memo);

      // Undo (always — even when we're about to break out — so the caller's
      // state object stays consistent across the entire recursion).
      data[cellIdx] = top;
      data[reserveIdx] = reserveCount;
      data[15] = player;

      // Score from `player`'s perspective.
      let score: number;
      if (childOutcome.winner === "draw") {
        score = 0;
      } else {
        score = childOutcome.winner === player ? 1 : -1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = childOutcome;
        if (score === 1) break search;
      }
    }
  }

  if (!foundAnyLegal) return OUTCOME_DRAW;
  return best;
}

function scoreFor(o: Outcome, player: Player): number {
  if (o.winner === "draw") return 0;
  return o.winner === player ? 1 : -1;
}

export function bestPlay(state: GameState, memo: SolverMemo = createMemo()): BestPlay {
  const w = winner(state);
  if (w !== null) return { outcome: outcomeForWinner(w), moves: [], stats: emptyStats() };

  const player = turn(state);
  const candidates = legalMoves(state);
  if (candidates.length === 0) {
    return { outcome: OUTCOME_DRAW, moves: [], stats: emptyStats() };
  }

  let best: Outcome = outcomeForWinner(opp(player));
  let bestScore = -2;
  let bestMoves: Move[] = [];
  const stats = emptyStats();
  for (const move of candidates) {
    const child = applyMove(state, move);
    const childOutcome = solve(child, memo);
    tallyOutcome(stats, childOutcome);
    const score = scoreFor(childOutcome, player);
    if (score > bestScore) {
      bestScore = score;
      best = childOutcome;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return { outcome: best, moves: bestMoves, stats };
}
