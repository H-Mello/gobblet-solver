import { type GameState, type Player, opp, turn } from "./state.js";
import { winner } from "./legality.js";
import { type Move, applyMove, legalMoves } from "./moves.js";
import { canonicalKey } from "./symmetry.js";

export type Outcome = { winner: Player } | { winner: "draw" };

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

function compute(state: GameState, memo: SolverMemo): Outcome {
  const w = winner(state);
  if (w !== null) return { winner: w };

  const player = turn(state);
  const moves = legalMoves(state);
  if (moves.length === 0) return { winner: "draw" };

  let best: Outcome = { winner: opp(player) };
  let bestScore = -1;
  for (const move of moves) {
    const child = applyMove(state, move);
    const childOutcome = solve(child, memo);
    const score = scoreFor(childOutcome, player);
    if (score > bestScore) {
      bestScore = score;
      best = childOutcome;
      if (score === 1) break;
    }
  }
  return best;
}

function scoreFor(o: Outcome, player: Player): number {
  if (o.winner === "draw") return 0;
  return o.winner === player ? 1 : -1;
}

export function bestPlay(state: GameState, memo: SolverMemo = createMemo()): BestPlay {
  const w = winner(state);
  if (w !== null) return { outcome: { winner: w }, moves: [], stats: emptyStats() };

  const player = turn(state);
  const candidates = legalMoves(state);
  if (candidates.length === 0) {
    return { outcome: { winner: "draw" }, moves: [], stats: emptyStats() };
  }

  let best: Outcome = { winner: opp(player) };
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
