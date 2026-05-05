import {
  type Coord,
  type GameState,
  type Player,
  type Size,
  applyMove,
  bestPlay,
  canPlace,
  cellAt,
  gameStatus,
  reserveOf,
  solve,
  turn,
} from "../../src/index.js";
import type { AppState } from "./app.js";
import { currentPlayer, currentState } from "./app.js";
import { pieceSVG } from "./pieces.js";

export function render(app: AppState): void {
  const state = currentState(app);
  renderStatus(state);
  renderHintPanel(app, state);
  renderReserves(app, state, 0, document.getElementById("reserves-p0")!);
  renderReserves(app, state, 1, document.getElementById("reserves-p1")!);
  renderBoard(app, state);
  renderHistory(app);
  renderOverlay(app);
  renderHintsButton(app);
}

function renderStatus(state: GameState): void {
  const el = document.getElementById("status")!;
  const status = gameStatus(state);
  if (status.kind === "win") {
    el.textContent = `P${status.player} wins!`;
  } else if (status.kind === "draw") {
    el.textContent = "Draw — neither player can move.";
  } else {
    const must = status.toMove !== turn(state) ? " (forced skip)" : "";
    el.textContent = `P${status.toMove} to move${must}.`;
  }
}

function renderHintPanel(app: AppState, state: GameState): void {
  const el = document.getElementById("hint-panel")!;
  if (!app.hintsEnabled || app.memoStatus !== "ready") {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  const result = bestPlay(state, app.memo);
  const oc = result.outcome;
  const outcomeText =
    oc.winner === "draw" ? "Draw under perfect play"
    : `P${oc.winner} wins under perfect play`;
  const { p0Wins, p1Wins, draws } = result.stats;
  const total = p0Wins + p1Wins + draws;
  const tally = total === 0
    ? "(no moves available — terminal or forced skip)"
    : `From here: ${p0Wins} P0-win / ${p1Wins} P1-win / ${draws} draw across ${total} legal moves.`;
  el.textContent = `${outcomeText}. ${tally}`;
}

function renderReserves(
  app: AppState,
  state: GameState,
  player: Player,
  container: HTMLElement,
): void {
  const active = currentPlayer(app) === player && gameStatus(state).kind === "ongoing";
  container.dataset["active"] = String(active);
  const sizes: Size[] = [1, 2, 3];
  let html = "";
  for (const size of sizes) {
    const count = reserveOf(state, player, size);
    const enabled = active && count > 0;
    const selected = enabled && app.selectedReserveSize === size;
    const cls = selected ? "reserve-piece selected" : "reserve-piece";
    const disabled = enabled ? "" : "disabled";
    html += `<button class="${cls}" data-size="${size}" data-player="${player}" type="button" ${disabled}>${pieceSVG(player, size, { dim: !active })}<span class="count">${count}</span></button>`;
  }
  container.innerHTML = html;
}

function renderBoard(app: AppState, state: GameState): void {
  const board = document.getElementById("board")!;
  const player = currentPlayer(app);
  const ongoing = gameStatus(state).kind === "ongoing";
  let html = "";
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      const v = cellAt(state, r as Coord, c as Coord);
      const inner = v === 0 ? "" : pieceSVGFromCell(v);
      const tint = computeTint(app, state, player, r as Coord, c as Coord, ongoing);
      const cls = tint ? `cell tint-${tint}` : "cell";
      html += `<div class="${cls}" data-row="${r}" data-col="${c}">${inner}</div>`;
    }
  }
  board.innerHTML = html;
}

function pieceSVGFromCell(v: number): string {
  // Cell encoding: 1=P0-S, 2=P1-S, 3=P0-M, 4=P1-M, 5=P0-L, 6=P1-L
  const owner = ((v - 1) & 1) as Player;
  const size = (((v - 1) >> 1) + 1) as Size;
  return pieceSVG(owner, size);
}

function computeTint(
  app: AppState,
  state: GameState,
  player: Player,
  r: Coord,
  c: Coord,
  ongoing: boolean,
): "win" | "draw" | "lose" | null {
  if (!app.hintsEnabled || app.memoStatus !== "ready") return null;
  if (!ongoing) return null;
  if (app.selectedReserveSize === null) return null;
  if (!canPlace(state, player, app.selectedReserveSize, r, c)) return null;
  const child = applyMove(state, { size: app.selectedReserveSize, row: r, col: c });
  const outcome = solve(child, app.memo);
  if (outcome.winner === "draw") return "draw";
  return outcome.winner === player ? "win" : "lose";
}

function renderHistory(app: AppState): void {
  const list = document.getElementById("history")!;
  let html = "";
  for (let i = 0; i < app.history.length; i++) {
    const label = i === 0 ? "(start)" : describeMoveAt(app, i);
    const cls = i === app.current ? "current" : "";
    html += `<li class="${cls}" data-index="${i}">${label}</li>`;
  }
  list.innerHTML = html;
}

function describeMoveAt(app: AppState, i: number): string {
  // Compare history[i-1] vs history[i] to recover the move that was played.
  const prev = app.history[i - 1]!;
  const next = app.history[i]!;
  const sizes = ["", "small", "medium", "large"];
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      const before = cellAt(prev, r as Coord, c as Coord);
      const after = cellAt(next, r as Coord, c as Coord);
      if (before !== after) {
        const owner = ((after - 1) & 1) as Player;
        const size = (((after - 1) >> 1) + 1) as Size;
        const annotation = before !== 0 ? " (covers)" : "";
        return `P${owner} ${sizes[size]} → (${r},${c})${annotation}`;
      }
    }
  }
  return "(?)";
}

function renderOverlay(app: AppState): void {
  const el = document.getElementById("overlay")!;
  const msg = document.getElementById("overlay-message")!;
  if (app.hintsEnabled && app.memoStatus === "loading") {
    el.hidden = false;
    msg.textContent = "Loading saved analysis…";
  } else if (app.hintsEnabled && app.memoStatus === "computing") {
    el.hidden = false;
    msg.textContent = "Solving (≈8s)…";
  } else {
    el.hidden = true;
  }
}

function renderHintsButton(app: AppState): void {
  const btn = document.getElementById("btn-hints") as HTMLButtonElement;
  btn.textContent = `Hints: ${app.hintsEnabled ? "ON" : "OFF"}`;
}
