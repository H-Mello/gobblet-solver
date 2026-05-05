# Web UI for Celestial Chess Solver — Design

## Context

We have a working solver library in `src/` that fully solves the modified-tic-tac-toe variant in TypeScript: `bestPlay(state)` returns the optimal outcome, optimal moves, and per-move W/L/D tally; `solve()` populates a memo of canonical states; the initial position is decided in ~15 seconds across ~10M canonical states. There is no user-facing way to interact with it.

## Game rules (current)

- 3×3 grid. Two players (P0, P1). P0 moves first.
- Each player starts with 8 pieces: 3 small, 3 medium, 2 large.
- A turn places one piece on the board. Placements are final — pieces never move once placed.
- Cover rule: a piece may be placed on a non-empty cell **iff its size is strictly larger** than the existing top piece. The covered piece's owner doesn't matter — own pieces and opponent pieces are both coverable.
- Same-size and smaller pieces cannot cover.
- Win: three squares in a line (row / column / diagonal) whose top pieces all belong to you.
- A player with no legal placement skips. Both players stuck consecutively → draw.

The goal is a small, static web app that lets a person play out positions on a 3×3 board, with optional solver-driven hints showing the outcome under perfect play and color-coded legality of every legal move. The app must be deployable as a static page (no server) and should not pay the full 8-second solve cost more than once per browser profile.

## Scope

**In scope (v1)**

- Interactive 3×3 board with concentric-circle pieces, color-coded by player.
- Click-reserve → click-cell placement; supports both players from the same screen.
- Reset, undo, and clickable move history (jumping to a past position branches forward when a new move is made).
- Toggleable hints: when on, show outcome label, side-to-move's W/L/D tally over legal moves, and per-cell green/yellow/red tints for the selected reserve piece.
- First solve runs synchronously in the main thread with a "solving…" overlay; the memo is persisted to IndexedDB so subsequent sessions load it instantly.
- Static build via Vite; output is plain HTML/JS/CSS deployable to any static host.

**Out of scope (v1)**

- Drag-and-drop piece placement.
- Web Worker for the solver. (Solve happens in the main thread.)
- Showing buried pieces beneath a covered cell. (Our state model doesn't track them.)
- Mobile-specific layouts beyond the natural single-column fallback.
- Account / sync / cross-device persistence. The memo is per-browser.

## Layout

Single column on narrow screens; two columns on wide screens (board + side panels on the left, history sidebar on the right).

```
┌─────────────────────────────────────────────────────┐
│  Celestial Chess Solver                             │
│  Status / Hints panel                               │
├──────────────────────────────┬──────────────────────┤
│  P1 reserve                  │  Move History        │
│                              │   1. P0 medium (1,1) │
│  [3×3 board]                 │   2. P1 small  (0,0) │
│                              │   3. P0 large  (1,1) │
│  P0 reserve                  │   ...                │
│                              │                      │
│  [Reset] [Undo] [Hints: OFF] │                      │
└──────────────────────────────┴──────────────────────┘
```

- Reserves are grouped left-to-right by size (small, medium, large), each piece a clickable concentric-circle SVG. Diameters scale with size: large ≈ 80% of cell, medium ≈ 60%, small ≈ 35%. Two distinct colors for P0 and P1 (specific palette decided at implementation).
- The active player's reserve panel is interactive; the opponent's is dimmed.
- A picked-up piece gets a highlight ring; clicking the same piece again deselects.
- Cell tints (when hints on AND a reserve is selected): green = the move wins for the side to move under perfect play, yellow = draws, red = loses.
- Status bar text comes from `gameStatus(state)`: "P0 to move" / "P1 wins!" / "Draw".

## File structure

A new top-level `web/` directory. The existing `src/` solver library is unchanged; the web app imports it as a relative module.

```
web/
  index.html              entry, mounts <main id="app">
  vite.config.ts          root: web/, build to dist/web/
  package.json            web-only deps (vite); shares parent tsconfig
  src/
    main.ts               bootstrap; build initial AppState; first render; attach listeners
    app.ts                AppState type and action handlers
    render.ts             pure render(state) functions; updates DOM nodes in place
    pieces.ts             SVG/CSS for concentric-circle pieces
    persistence.ts        IndexedDB: loadMemo / saveMemo / hasMemo
    serialize.ts          memo ↔ Uint8Array
    styles.css            grid layout, colors, hint tints
```

`web/src/app.ts` does `import { bestPlay, solve, initialState, applyMove, canonicalKey, ... } from "../../src/index.js"`. Vite handles the cross-directory transpile. We do not need to publish the solver as an npm package.

## State model

Single source of truth. No framework; a pure `render(app)` function rewrites the DOM.

```ts
interface AppState {
  history: GameState[];                                   // history[0] = initialState; never mutated
  current: number;                                        // index into history of what's on screen
  selectedReserveSize: Size | null;                       // which size you've "picked up"
  hintsEnabled: boolean;
  memo: SolverMemo;                                       // shared across the session
  memoStatus: "uninit" | "loading" | "ready" | "computing";
}
```

### Action handlers

Each handler mutates `AppState` in place, then calls `render(app)`:

- `selectReserve(size)` — toggle: same size deselects; different size switches. No-op if it's the opponent's turn.
- `placeAt(row, col)` — only if a reserve is selected and the move is legal. Truncates `history` at `current + 1`, appends `applyMove(...)`, advances `current`, clears selection.
- `undo()` — `current = max(0, current - 1)`. Clears selection.
- `jumpTo(i)` — read-only navigation: just changes `current`. The first placement after a jump truncates and branches.
- `reset()` — `history = [initialState()]`, `current = 0`, selection cleared. **Memo is preserved.**
- `toggleHints()` — flips `hintsEnabled`. If turning ON and `memoStatus === "uninit"`, kicks off load/solve (see Persistence).

### Render rules

- The position drawn is always `app.history[app.current]`.
- Reserves: read from that GameState; opponent's panel is dimmed.
- Selection ring: drawn around the chosen reserve piece if any.
- Status bar text: from `gameStatus(state)`.
- Hint panel: rendered only when `hintsEnabled && memoStatus === "ready"`. Shows `bestPlay(state, memo).outcome` and `.stats`.
- Cell tints: applied only when hints ON and a reserve is selected. For each cell, if `canPlace(state, currentPlayer, selectedSize, r, c)` is true, compute `applyMove(...)`, look up `solve(child, memo)`, and tint green / yellow / red based on the child's outcome from the side-to-move's perspective.
- History sidebar: render `history[1..]` as clickable rows; the row at `current` is highlighted.

Each render fully rewrites the children of a few container nodes (`<div id="board">`, `<div id="reserves-p0">`, `<div id="history">`, etc.). No diffing.

## Persistence

### IndexedDB schema

| | |
|---|---|
| DB name | `celestial-chess-solver` |
| Store name | `memo` |
| Key | `"default"` |
| Value | `Uint8Array` (the serialized memo) |

### Serialization format

A flat byte stream of fixed-size records.

```
[ 4 bytes: magic "CCS\0" ]
[ 1 byte:  format version = 1 ]
[ 4 bytes: entry count (uint32 LE) ]
[ N entries × 17 bytes:
    16 bytes canonical key  (board[9] + reserves[6] + turn[1])
     1 byte  outcome        (0 = P0 wins, 1 = P1 wins, 2 = draw) ]
```

For ~10M entries the blob is ~170 MB. Acceptable for desktop; borderline on mobile. Bit-packing the key to 5 bytes would cut this to ~60 MB but is deferred for v1.

### Load / solve flow on first hint toggle

```
toggleHints() turning ON
   ↓
memoStatus = "loading"  → render() shows "Loading saved analysis…" overlay
   ↓
loadMemo()  (async; reads IDB record)
   ↓
   ├─ found:    decode bytes → populate memo → memoStatus = "ready" → render()
   │
   └─ missing:  memoStatus = "computing"  → render() shows "Solving (≈8s)…" overlay
                requestAnimationFrame  → solve(currentState, memo)  (synchronous, blocks)
                memoStatus = "ready"   → render()
                saveMemo()  (async; serialize + write to IDB; non-blocking)
```

`requestAnimationFrame` before the synchronous `solve` lets the overlay actually paint before the main thread freezes.

### Edge cases

- **IndexedDB unavailable** (some private-browsing modes, very old engines): `loadMemo()` rejects; `saveMemo()` is a no-op. Each session pays the 8s cost and the hint panel shows "(local cache disabled)". Functionality otherwise intact.
- **Stored format mismatch** (magic or version): treat as not-found and recompute.
- **Quota exceeded on save**: log a warning, don't crash. Hints still work in-memory for the session.

## Verification

End-to-end the app must:

1. **Start**: `npm run dev:web` opens a Vite dev server with the empty board, reset/undo/hints buttons, both reserve panels.
2. **Place a piece**: click a reserve → highlight; click a cell → piece appears, turn flips, history row appended.
3. **Cover an opponent piece**: place P0 small at (0,0), P1 medium at (0,0) — top piece becomes P1 medium, history shows both, undoing twice returns to empty.
4. **Win detection**: place three P0 pieces in a row → status bar reads "P0 wins!", further placement is disallowed.
5. **Reset**: clears the board but does **not** clear the memo (verified by toggling hints again — should not re-trigger an 8s solve).
6. **Undo / jump**: history list is clickable; selecting a past row redraws that position; placing then truncates the future.
7. **Hints toggle (cold)**: first toggle on a fresh profile shows the "Solving…" overlay for ~15s, then the hint panel appears with `outcome: P0 wins` and `9 / 18 / 0` for the empty board.
8. **Hints toggle (warm)**: reload the page, toggle hints — overlay flashes briefly while IDB loads, then ready. No 8s solve.
9. **Cell tinting** (initial state, hints on, P0 medium picked up): the eight non-center cells tint green (winning), and the center tints red (losing). Picking up a P0 large instead: only the center is green, the eight others are red. Picking up a P0 small: all nine cells are red.
10. **Build**: `npm run build:web` emits a working static bundle in `dist/web/` — open `index.html` directly via `python -m http.server` and run through tasks 1–9.

Automated tests aren't required for v1 UI logic, but the existing solver test suite (`npm test`) must continue to pass since `src/` is unchanged.
