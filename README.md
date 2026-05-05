# gobblet-solver

A complete brute-force solver and a small static web UI for a Gobblet-Jr-style
modification of tic-tac-toe.

## The game

- 3×3 board. Two players (P0, P1). P0 moves first.
- Each player starts with 8 pieces: 3 small, 3 medium, 2 large.
- A turn places one piece. Placements are final — pieces never move.
- A piece may be placed on a non-empty cell **iff its size is strictly larger**
  than the existing top piece. The covered piece's owner doesn't matter — own
  pieces and opponent pieces are both coverable.
- Win: three squares in a line whose top pieces all belong to you.
- The moment the side-to-move has no legal placement, the game is a **draw**.

## Result

P0 has a forced win from the initial position. The optimal openers are
**medium in any of the eight non-center cells** or **large at the center**.
Of P0's 27 first moves, 9 win and 18 lose under perfect play — every opener
is decisive (no drawing moves). The full state space is ≈10.2 M canonical
positions after D4 board-symmetry canonicalization.

## Running it

```bash
npm install
npm test          # 65 unit tests across the solver + web app
npm run dev:web   # Vite dev server, http://localhost:5173
npm run build:web # static bundle in dist/web/
```

The web app is plain TypeScript + Vite, no framework. The first time you turn
hints on it solves the initial position in ~15 s on the main thread (with an
overlay), then persists the resulting memo to IndexedDB. Subsequent sessions
deserialize the memo in ~2 s.

## Layout

- `src/` — solver library (state, legality, move gen, status, D4 symmetry,
  negamax with subtree W/L/D tally).
- `web/src/` — UI (board, reserve panels, hints, history, IndexedDB
  persistence).
- `scripts/solve-initial.ts` — CLI benchmark: solves the initial position and
  prints timing + state count.
- `docs/superpowers/` — design spec and the original implementation plan.

## Hosting

Designed for Cloudflare Pages. Build command `npm run build:web`, output
directory `dist/web`. Vite serves static assets from root, so no `base` URL
configuration is needed.
