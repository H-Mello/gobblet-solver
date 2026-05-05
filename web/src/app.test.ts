import { describe, expect, it } from "vitest";
import {
  cellAt,
  encodePiece,
  reserveOf,
  turn,
} from "../../src/index.js";
import {
  createAppState,
  currentState,
  jumpTo,
  placeAt,
  resetGame,
  selectReserve,
  undo,
} from "./app.js";

describe("AppState — initial", () => {
  it("starts with the initial board, no selection, hints off", () => {
    const app = createAppState();
    expect(app.history.length).toBe(1);
    expect(app.current).toBe(0);
    expect(app.selectedReserveSize).toBeNull();
    expect(app.hintsEnabled).toBe(false);
    expect(turn(currentState(app))).toBe(0);
  });
});

describe("selectReserve", () => {
  it("picks up a piece, switches sizes, and toggles off when same size clicked again", () => {
    const app = createAppState();
    selectReserve(app, 2);
    expect(app.selectedReserveSize).toBe(2);
    selectReserve(app, 3);
    expect(app.selectedReserveSize).toBe(3);
    selectReserve(app, 3);
    expect(app.selectedReserveSize).toBeNull();
  });
});

describe("placeAt", () => {
  it("places when a reserve is selected and the move is legal", () => {
    const app = createAppState();
    selectReserve(app, 2);
    placeAt(app, 1, 1);
    expect(app.history.length).toBe(2);
    expect(app.current).toBe(1);
    const s = currentState(app);
    expect(cellAt(s, 1, 1)).toBe(encodePiece(0, 2));
    expect(reserveOf(s, 0, 2)).toBe(2);
    expect(turn(s)).toBe(1);
    expect(app.selectedReserveSize).toBeNull();
  });

  it("does nothing if no reserve is selected", () => {
    const app = createAppState();
    placeAt(app, 1, 1);
    expect(app.history.length).toBe(1);
  });

  it("does nothing if the move is illegal (same-size cover)", () => {
    const app = createAppState();
    // P0 places small at (0,0).
    selectReserve(app, 1);
    placeAt(app, 0, 0);
    // P1's turn. Try to cover P0's small with another small — same size is illegal.
    selectReserve(app, 1);
    const lengthBefore = app.history.length;
    placeAt(app, 0, 0);
    expect(app.history.length).toBe(lengthBefore);
    expect(app.selectedReserveSize).toBe(1); // selection survives a no-op
  });

  it("allows every strictly-larger same-player cover combination", () => {
    // (placed, covering) pairs where covering > placed. Under the rule "strictly
    // larger covers anything strictly smaller, regardless of owner", these
    // should all succeed.
    const cases: Array<[1 | 2, 2 | 3]> = [
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    for (const [placed, attempt] of cases) {
      const app = createAppState();
      selectReserve(app, placed); placeAt(app, 0, 0); // P0 places at (0,0)
      selectReserve(app, 1); placeAt(app, 1, 1);      // P1 plays elsewhere
      selectReserve(app, attempt);                     // P0 picks bigger size
      placeAt(app, 0, 0);
      expect(cellAt(currentState(app), 0, 0)).toBe(encodePiece(0, attempt));
    }
  });

  it("truncates future history when a move is made after a jump-back", () => {
    const app = createAppState();
    selectReserve(app, 1); placeAt(app, 0, 0); // move 1
    selectReserve(app, 1); placeAt(app, 1, 1); // move 2
    expect(app.history.length).toBe(3);
    jumpTo(app, 1);
    expect(app.current).toBe(1);
    expect(app.history.length).toBe(3);
    selectReserve(app, 1); placeAt(app, 2, 2); // new move from current=1
    expect(app.history.length).toBe(3); // truncated then appended
    expect(app.current).toBe(2);
  });
});

describe("undo / reset", () => {
  it("undo steps back one and clears selection", () => {
    const app = createAppState();
    selectReserve(app, 2);
    placeAt(app, 0, 0);
    selectReserve(app, 2);
    expect(app.selectedReserveSize).toBe(2);
    undo(app);
    expect(app.current).toBe(0);
    expect(app.selectedReserveSize).toBeNull();
  });

  it("undo at the root is a no-op", () => {
    const app = createAppState();
    undo(app);
    expect(app.current).toBe(0);
  });

  it("reset returns to the initial position but preserves the memo", () => {
    const app = createAppState();
    const memoRef = app.memo;
    selectReserve(app, 2);
    placeAt(app, 0, 0);
    resetGame(app);
    expect(app.history.length).toBe(1);
    expect(app.current).toBe(0);
    expect(app.memo).toBe(memoRef);
  });
});
