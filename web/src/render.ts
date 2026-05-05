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
  const legend = " Cell counts: wins · draws · losses (your perspective).";
  el.textContent = `${outcomeText}. ${tally}${legend}`;
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
  let html = `<span class="reserve-label">P${player}</span>`;
  for (const size of sizes) {
    const count = reserveOf(state, player, size);
    const enabled = active && count > 0;
    const selected = enabled && app.selectedReserveSize === size;
    const hintTint = enabled ? bestOutcomeForSize(app, state, player, size) : null;
    const classes = ["reserve-piece"];
    if (selected) classes.push("selected");
    if (hintTint) classes.push(`tint-${hintTint}`);
    const disabled = enabled ? "" : "disabled";
    html += `<button class="${classes.join(" ")}" data-size="${size}" data-player="${player}" type="button" ${disabled}>${pieceSVG(player, size, { dim: !active })}<span class="count">${count}</span></button>`;
  }
  container.innerHTML = html;
}

// Best outcome (from `player`'s perspective) achievable by placing a piece of
// `size` somewhere legal on the board. Returns null if hints are off, the memo
// isn't ready, or there is no legal placement for this size.
function bestOutcomeForSize(
  app: AppState,
  state: GameState,
  player: Player,
  size: Size,
): "win" | "draw" | "lose" | null {
  if (!app.hintsEnabled || app.memoStatus !== "ready") return null;
  let best: "win" | "draw" | "lose" | null = null;
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      if (!canPlace(state, player, size, r as Coord, c as Coord)) continue;
      const child = applyMove(state, { size, row: r as Coord, col: c as Coord });
      const oc = solve(child, app.memo);
      const tint: "win" | "draw" | "lose" =
        oc.winner === "draw" ? "draw" : oc.winner === player ? "win" : "lose";
      if (best === null || tintRank(tint) > tintRank(best)) best = tint;
      if (best === "win") return best;
    }
  }
  return best;
}

function tintRank(t: "win" | "draw" | "lose"): number {
  return t === "win" ? 2 : t === "draw" ? 1 : 0;
}

function renderBoard(app: AppState, state: GameState): void {
  const board = document.getElementById("board")!;
  const player = currentPlayer(app);
  const ongoing = gameStatus(state).kind === "ongoing";

  // Pass 1: compute every cell's hint so we know which one(s) score best.
  const hints: Array<CellHint | null> = [];
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      hints.push(computeCellHint(app, state, player, r as Coord, c as Coord, ongoing));
    }
  }
  let topScore = -Infinity;
  for (const h of hints) {
    if (!h) continue;
    const s = scoreHint(h);
    if (s > topScore) topScore = s;
  }

  // Pass 2: render, marking cells whose score equals topScore.
  let html = "";
  let idx = 0;
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      const v = cellAt(state, r as Coord, c as Coord);
      const inner = v === 0 ? "" : pieceSVGFromCell(v);
      const hint = hints[idx++]!;
      const isBest = hint !== null && topScore !== -Infinity && scoreHint(hint) === topScore;
      const classes = ["cell"];
      if (hint) classes.push(`tint-${hint.tint}`);
      if (isBest) classes.push("best");
      const statsHtml = hint?.counts
        ? `<div class="cell-stats"><span class="cs-w">${hint.counts.wins}</span>·<span class="cs-d">${hint.counts.draws}</span>·<span class="cs-l">${hint.counts.losses}</span></div>`
        : "";
      html += `<div class="${classes.join(" ")}" data-row="${r}" data-col="${c}">${inner}${statsHtml}</div>`;
    }
  }
  board.innerHTML = html;
}

// Higher is better. Tint dominates: win > draw > lose. Within the same tint,
// more wins beats fewer wins, then fewer losses beats more losses. Terminal
// placements (no opponent responses) get the top of their tint class because
// the result is forced.
function scoreHint(h: CellHint): number {
  const tintBase = h.tint === "win" ? 1_000_000 : h.tint === "draw" ? 1_000 : 0;
  if (!h.counts) return tintBase + 999_999; // terminal — locks the result in
  return tintBase + h.counts.wins * 100 - h.counts.losses;
}

function pieceSVGFromCell(v: number): string {
  // Cell encoding: 1=P0-S, 2=P1-S, 3=P0-M, 4=P1-M, 5=P0-L, 6=P1-L
  const owner = ((v - 1) & 1) as Player;
  const size = (((v - 1) >> 1) + 1) as Size;
  return pieceSVG(owner, size);
}

interface CellHint {
  tint: "win" | "draw" | "lose";
  // Tally over the OPPONENT's legal responses to this placement, expressed in
  // the placing player's frame. Null when the placement is terminal (no
  // responses) — the tint alone tells the story there.
  counts: { wins: number; draws: number; losses: number } | null;
}

function computeCellHint(
  app: AppState,
  state: GameState,
  player: Player,
  r: Coord,
  c: Coord,
  ongoing: boolean,
): CellHint | null {
  if (!app.hintsEnabled || app.memoStatus !== "ready") return null;
  if (!ongoing) return null;
  if (app.selectedReserveSize === null) return null;
  if (!canPlace(state, player, app.selectedReserveSize, r, c)) return null;
  const child = applyMove(state, { size: app.selectedReserveSize, row: r, col: c });
  const bp = bestPlay(child, app.memo);
  const tint: "win" | "draw" | "lose" =
    bp.outcome.winner === "draw" ? "draw" : bp.outcome.winner === player ? "win" : "lose";
  const total = bp.stats.p0Wins + bp.stats.p1Wins + bp.stats.draws;
  const counts = total === 0
    ? null
    : {
        wins: player === 0 ? bp.stats.p0Wins : bp.stats.p1Wins,
        losses: player === 0 ? bp.stats.p1Wins : bp.stats.p0Wins,
        draws: bp.stats.draws,
      };
  return { tint, counts };
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
    msg.textContent = "Solving (≈15s)…";
  } else {
    el.hidden = true;
  }
}

function renderHintsButton(app: AppState): void {
  const btn = document.getElementById("btn-hints") as HTMLButtonElement;
  btn.textContent = `Hints: ${app.hintsEnabled ? "ON" : "OFF"}`;
}
