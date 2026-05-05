import {
  type Coord,
  type GameState,
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

export interface AppState {
  history: GameState[];
  current: number;
  selectedReserveSize: Size | null;
  hintsEnabled: boolean;
  memo: SolverMemo;
  memoStatus: MemoStatus;
}

export function createAppState(memo: SolverMemo = createMemo()): AppState {
  return {
    history: [initialState()],
    current: 0,
    selectedReserveSize: null,
    hintsEnabled: false,
    memo,
    memoStatus: "uninit",
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
}

export function undo(app: AppState): void {
  if (app.current === 0) return;
  app.current -= 1;
  app.selectedReserveSize = null;
}

export function jumpTo(app: AppState, index: number): void {
  if (index < 0 || index >= app.history.length) return;
  app.current = index;
  app.selectedReserveSize = null;
}

export function resetGame(app: AppState): void {
  app.history = [initialState()];
  app.current = 0;
  app.selectedReserveSize = null;
}

export function setHintsEnabled(app: AppState, enabled: boolean): void {
  app.hintsEnabled = enabled;
}

export function setMemoStatus(app: AppState, status: MemoStatus): void {
  app.memoStatus = status;
}
