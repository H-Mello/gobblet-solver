import {
  type Coord,
  type GameState,
  type MoveStats,
  type Outcome,
  type Player,
  type Size,
  type SolverMemo,
  applyMove,
  canPlace,
  createMemo,
  initialState,
  turn,
} from "../../src/index.js";

export type MemoStatus = "uninit" | "loading" | "ready" | "computing";

// Per-cell hint info, computed once per state change rather than once per
// render. The render layer reads from this cache so toggling reserve
// selections doesn't have to call solve()/applyMove() during DOM update.
export interface CellHintInfo {
  tint: "win" | "draw" | "lose";
  // Tally over the OPPONENT's legal responses to this placement, in the
  // placing player's frame. Null when the placement is terminal (no
  // responses) — the tint conveys it.
  counts: { wins: number; draws: number; losses: number } | null;
}

export interface HintCache {
  // For the current player to move. Indexed by (size - 1) * 9 + r * 3 + c.
  // Null where the placement is illegal.
  byMove: Array<CellHintInfo | null>;
  // Best outcome per size (used to tint the reserve buttons themselves).
  // Indexed by size - 1. Null if no legal placement at that size exists.
  byReserveSize: Array<"win" | "draw" | "lose" | null>;
  // Top-level position outcome and tally (for the hint panel).
  topOutcome: Outcome;
  topStats: MoveStats;
}

// What the overlay should display. `current` and `total` drive the bar; if
// total is 0 the overlay shows a spinner only.
export interface OverlayProgress {
  current: number;
  total: number;
}

export interface AppState {
  history: GameState[];
  current: number;
  selectedReserveSize: Size | null;
  hintsEnabled: boolean;
  memo: SolverMemo;
  memoStatus: MemoStatus;
  // Progress for whichever long-running operation is active (solving or
  // deserializing). Null when nothing is running.
  overlayProgress: OverlayProgress | null;
  // Lazily filled by render() when hints are on and memo is ready. Cleared
  // (set to null) by every state-change action so it gets recomputed for
  // the new position.
  hintCache: HintCache | null;
}

export function createAppState(memo: SolverMemo = createMemo()): AppState {
  return {
    history: [initialState()],
    current: 0,
    selectedReserveSize: null,
    hintsEnabled: false,
    memo,
    memoStatus: "uninit",
    overlayProgress: null,
    hintCache: null,
  };
}

export function currentState(app: AppState): GameState {
  return app.history[app.current]!;
}

export function currentPlayer(app: AppState): Player {
  return turn(currentState(app));
}

export function selectReserve(app: AppState, size: Size): void {
  if (app.selectedReserveSize === size) {
    app.selectedReserveSize = null;
  } else {
    app.selectedReserveSize = size;
  }
}

// Forces the selection to a particular size (or clears it). Used by the drag
// pipeline, which needs to commit a specific selection regardless of current
// state — selectReserve's toggle behavior would deselect if the same size was
// already up.
export function setSelectedReserveSize(app: AppState, size: Size | null): void {
  app.selectedReserveSize = size;
}

export function placeAt(app: AppState, row: Coord, col: Coord): void {
  const size = app.selectedReserveSize;
  if (size === null) return;
  const state = currentState(app);
  const player = turn(state);
  if (!canPlace(state, player, size, row, col)) return;
  const next = applyMove(state, { size, row, col });
  app.history = app.history.slice(0, app.current + 1);
  app.history.push(next);
  app.current = app.history.length - 1;
  app.selectedReserveSize = null;
  app.hintCache = null;
}

export function undo(app: AppState): void {
  if (app.current === 0) return;
  app.current -= 1;
  app.selectedReserveSize = null;
  app.hintCache = null;
}

export function jumpTo(app: AppState, index: number): void {
  if (index < 0 || index >= app.history.length) return;
  app.current = index;
  app.selectedReserveSize = null;
  app.hintCache = null;
}

export function resetGame(app: AppState): void {
  app.history = [initialState()];
  app.current = 0;
  app.selectedReserveSize = null;
  app.hintCache = null;
}

export function setHintsEnabled(app: AppState, enabled: boolean): void {
  app.hintsEnabled = enabled;
  if (!enabled) app.hintCache = null;
}

export function setMemoStatus(app: AppState, status: MemoStatus): void {
  app.memoStatus = status;
  if (status !== "ready") app.hintCache = null;
}

export function setOverlayProgress(
  app: AppState,
  progress: OverlayProgress | null,
): void {
  app.overlayProgress = progress;
}
