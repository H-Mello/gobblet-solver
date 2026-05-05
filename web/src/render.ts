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
} from "../../src/index.js";
import {
  type AppState,
  type CellHintInfo,
  type HintCache,
  currentPlayer,
  currentState,
} from "./app.js";
import { pieceSVG } from "./pieces.js";

export function render(app: AppState): void {
  const state = currentState(app);
  // Make sure the hint cache is populated for the current state before any
  // panel reads from it. Cheap when memo is ready (~30 cached lookups + a
  // bestPlay on the parent); a no-op when hints are off or memo is not
  // ready yet. This is the change that removes the first-click delay:
  // selection toggles no longer call solve()/applyMove() during render.
  ensureHintCache(app, state);

  renderStatus(state);
  renderHintPanel(app, state);
  renderReserves(app, state, 0, document.getElementById("reserves-p0")!);
  renderReserves(app, state, 1, document.getElementById("reserves-p1")!);
  renderBoard(app, state);
  renderHistory(app);
  renderOverlay(app);
  renderHintsButton(app);
}

// Display label. Internally we use 0/1; users see 1/2.
function displayPlayer(p: Player): string {
  return `P${p + 1}`;
}

function renderStatus(state: GameState): void {
  const el = document.getElementById("status")!;
  const status = gameStatus(state);
  if (status.kind === "win") {
    el.textContent = `${displayPlayer(status.player)} wins!`;
  } else if (status.kind === "draw") {
    el.textContent = "Draw — no legal moves.";
  } else {
    el.textContent = `${displayPlayer(status.toMove)} to move.`;
  }
}

function renderHintPanel(app: AppState, state: GameState): void {
  const el = document.getElementById("hint-panel")!;
  if (!app.hintsEnabled || app.memoStatus !== "ready" || app.hintCache === null) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  void state;
  const oc = app.hintCache.topOutcome;
  const outcomeText =
    oc.winner === "draw" ? "Draw under perfect play"
    : `${displayPlayer(oc.winner)} wins under perfect play`;
  const { p0Wins, p1Wins, draws } = app.hintCache.topStats;
  const total = p0Wins + p1Wins + draws;
  const tally = total === 0
    ? "(no moves available — terminal or forced skip)"
    : `From here: ${p0Wins} ${displayPlayer(0)}-win / ${p1Wins} ${displayPlayer(1)}-win / ${draws} draw across ${total} legal moves.`;
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
  let html = `<span class="reserve-label">${displayPlayer(player)}</span>`;
  for (const size of sizes) {
    const count = reserveOf(state, player, size);
    const enabled = active && count > 0;
    const selected = enabled && app.selectedReserveSize === size;
    // Reserve hint tint comes from the cache when it's the active player's
    // turn. The opponent's reserves never get hint colors (their moves are
    // not "ours" to evaluate at this state).
    const hintTint = enabled && app.hintCache !== null
      ? app.hintCache.byReserveSize[size - 1] ?? null
      : null;
    const classes = ["reserve-piece"];
    if (selected) classes.push("selected");
    if (hintTint) classes.push(`tint-${hintTint}`);
    const disabled = enabled ? "" : "disabled";
    html += `<button class="${classes.join(" ")}" data-size="${size}" data-player="${player}" type="button" ${disabled}>${pieceSVG(player, size, { dim: !active })}<span class="count">${count}</span></button>`;
  }
  container.innerHTML = html;
}

function renderBoard(app: AppState, state: GameState): void {
  const board = document.getElementById("board")!;
  const selected = app.selectedReserveSize;

  // Pull the relevant slice of cell hints from the cache. Empty (all null)
  // when hints are off, no piece is selected, or memo isn't ready.
  const cellHints: Array<CellHintInfo | null> = new Array(9).fill(null);
  if (
    app.hintsEnabled &&
    app.memoStatus === "ready" &&
    app.hintCache !== null &&
    selected !== null &&
    gameStatus(state).kind === "ongoing"
  ) {
    const base = (selected - 1) * 9;
    for (let i = 0; i < 9; i++) {
      cellHints[i] = app.hintCache.byMove[base + i] ?? null;
    }
  }

  // Find the highest-scoring cell so we can outline it.
  let topScore = -Infinity;
  for (const h of cellHints) {
    if (!h) continue;
    const s = scoreHint(h);
    if (s > topScore) topScore = s;
  }

  let html = "";
  for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
    for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
      const v = cellAt(state, r as Coord, c as Coord);
      const inner = v === 0 ? "" : pieceSVGFromCell(v);
      const idx = r * 3 + c;
      const hint = cellHints[idx];
      const isBest = hint !== undefined && hint !== null && topScore !== -Infinity && scoreHint(hint) === topScore;
      const classes = ["cell"];
      if (hint) classes.push(`tint-${hint.tint}`);
      if (isBest) classes.push("best");
      let statsHtml = "";
      if (hint) {
        if (hint.counts) {
          statsHtml = `<div class="cell-stats"><span class="cs-w">${hint.counts.wins}</span>·<span class="cs-d">${hint.counts.draws}</span>·<span class="cs-l">${hint.counts.losses}</span></div>`;
        } else {
          // Terminal placement (immediate win or forced-stuck draw — no
          // opponent responses to count). Show the outcome name in place of
          // the W·D·L tally so the corner isn't blank.
          const label = hint.tint === "win" ? "Win" : hint.tint === "draw" ? "Draw" : "Loss";
          const colorClass = hint.tint === "win" ? "cs-w" : hint.tint === "draw" ? "cs-d" : "cs-l";
          statsHtml = `<div class="cell-stats"><span class="${colorClass}">${label}</span></div>`;
        }
      }
      html += `<div class="${classes.join(" ")}" data-row="${r}" data-col="${c}">${inner}${statsHtml}</div>`;
    }
  }
  board.innerHTML = html;
}

// Higher is better. Tint dominates: win > draw > lose. Within the same tint,
// more wins beats fewer wins, then fewer losses beats more losses. Terminal
// placements (no opponent responses) get the top of their tint class because
// the result is forced.
function scoreHint(h: CellHintInfo): number {
  const tintBase = h.tint === "win" ? 1_000_000 : h.tint === "draw" ? 1_000 : 0;
  if (!h.counts) return tintBase + 999_999;
  return tintBase + h.counts.wins * 100 - h.counts.losses;
}

function pieceSVGFromCell(v: number): string {
  // Cell encoding: 1=P0-S, 2=P1-S, 3=P0-M, 4=P1-M, 5=P0-L, 6=P1-L
  const owner = ((v - 1) & 1) as Player;
  const size = (((v - 1) >> 1) + 1) as Size;
  return pieceSVG(owner, size);
}

// ---------- hint cache: precomputed once per state -------------------------

function ensureHintCache(app: AppState, state: GameState): void {
  if (app.hintCache !== null) return;
  if (!app.hintsEnabled || app.memoStatus !== "ready") return;
  if (gameStatus(state).kind !== "ongoing") {
    // Terminal: still populate a "no hints" cache so later renders see a
    // valid (empty) cache instead of recomputing.
    app.hintCache = {
      byMove: new Array(27).fill(null),
      byReserveSize: [null, null, null],
      topOutcome: bestPlay(state, app.memo).outcome,
      topStats: { p0Wins: 0, p1Wins: 0, draws: 0 },
    };
    return;
  }
  app.hintCache = computeHintCache(state, app.memo, currentPlayer(app));
}

function computeHintCache(
  state: GameState,
  memo: AppState["memo"],
  player: Player,
): HintCache {
  const byMove: Array<CellHintInfo | null> = new Array(27).fill(null);
  const byReserveSize: Array<"win" | "draw" | "lose" | null> = [null, null, null];
  const sizes: Size[] = [1, 2, 3];
  for (const size of sizes) {
    let bestForSize: "win" | "draw" | "lose" | null = null;
    for (let r = 0 as Coord; r < 3; r = (r + 1) as Coord) {
      for (let c = 0 as Coord; c < 3; c = (c + 1) as Coord) {
        const cellIdx = r * 3 + c;
        const slot = (size - 1) * 9 + cellIdx;
        if (!canPlace(state, player, size, r as Coord, c as Coord)) continue;
        const child = applyMove(state, { size, row: r as Coord, col: c as Coord });
        const bp = bestPlay(child, memo);
        const tint: "win" | "draw" | "lose" =
          bp.outcome.winner === "draw" ? "draw"
          : bp.outcome.winner === player ? "win"
          : "lose";
        const total = bp.stats.p0Wins + bp.stats.p1Wins + bp.stats.draws;
        const counts = total === 0
          ? null
          : {
              wins: player === 0 ? bp.stats.p0Wins : bp.stats.p1Wins,
              losses: player === 0 ? bp.stats.p1Wins : bp.stats.p0Wins,
              draws: bp.stats.draws,
            };
        byMove[slot] = { tint, counts };
        if (bestForSize === null || tintRank(tint) > tintRank(bestForSize)) {
          bestForSize = tint;
        }
      }
    }
    byReserveSize[size - 1] = bestForSize;
  }
  const top = bestPlay(state, memo);
  return {
    byMove,
    byReserveSize,
    topOutcome: top.outcome,
    topStats: top.stats,
  };
}

function tintRank(t: "win" | "draw" | "lose"): number {
  return t === "win" ? 2 : t === "draw" ? 1 : 0;
}

// ---------- history -------------------------------------------------------

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
        return `${displayPlayer(owner)} ${sizes[size]} → (${r},${c})${annotation}`;
      }
    }
  }
  return "(?)";
}

// ---------- overlay -------------------------------------------------------

function renderOverlay(app: AppState): void {
  const el = document.getElementById("overlay")!;
  const msg = document.getElementById("overlay-message")!;
  const progressTrack = document.getElementById("overlay-progress-track")!;
  const progressFill = document.getElementById("overlay-progress-fill")!;
  const progressText = document.getElementById("overlay-progress-text")!;

  if (!app.hintsEnabled || app.memoStatus === "ready" || app.memoStatus === "uninit") {
    el.hidden = true;
    return;
  }

  el.hidden = false;
  if (app.memoStatus === "loading") {
    msg.textContent = "Loading saved analysis…";
  } else if (app.memoStatus === "computing") {
    msg.textContent = "Solving…";
  }

  const p = app.overlayProgress;
  if (p === null || p.total === 0) {
    progressTrack.hidden = true;
    progressText.hidden = true;
    return;
  }
  progressTrack.hidden = false;
  progressText.hidden = false;
  const pct = Math.min(100, Math.floor((p.current / p.total) * 100));
  progressFill.style.width = `${pct}%`;
  const verb = app.memoStatus === "computing" ? "states" : "entries";
  progressText.textContent = `${p.current.toLocaleString()} / ${p.total.toLocaleString()} ${verb} (${pct}%)`;
}

function renderHintsButton(app: AppState): void {
  const btn = document.getElementById("btn-hints") as HTMLButtonElement;
  btn.textContent = `Hints: ${app.hintsEnabled ? "ON" : "OFF"}`;
}
