import { type Size, solve } from "../../src/index.js";
import {
  type AppState,
  createAppState,
  currentState,
  jumpTo,
  placeAt,
  resetGame,
  selectReserve,
  setHintsEnabled,
  setMemoStatus,
  undo,
} from "./app.js";
import { loadMemoBytes, persistenceAvailable, saveMemoBytes } from "./persistence.js";
import { render } from "./render.js";
import { deserializeMemo, serializeMemo } from "./serialize.js";

const app: AppState = createAppState();

function rerender(): void {
  render(app);
}

function handleReserveClick(target: HTMLElement): void {
  const sizeAttr = target.closest<HTMLElement>("[data-size]")?.dataset["size"];
  if (!sizeAttr) return;
  const size = Number(sizeAttr) as Size;
  selectReserve(app, size);
  rerender();
}

function handleCellClick(target: HTMLElement): void {
  const cell = target.closest<HTMLElement>(".cell");
  if (!cell) return;
  const r = Number(cell.dataset["row"]) as 0 | 1 | 2;
  const c = Number(cell.dataset["col"]) as 0 | 1 | 2;
  placeAt(app, r, c);
  rerender();
}

function handleHistoryClick(target: HTMLElement): void {
  const li = target.closest<HTMLElement>("[data-index]");
  if (!li) return;
  jumpTo(app, Number(li.dataset["index"]));
  rerender();
}

async function handleHintsToggle(): Promise<void> {
  if (app.hintsEnabled) {
    setHintsEnabled(app, false);
    rerender();
    return;
  }
  setHintsEnabled(app, true);
  if (app.memoStatus === "ready") {
    rerender();
    return;
  }
  // First time: load from IDB or solve.
  setMemoStatus(app, "loading");
  rerender();

  let restored = false;
  if (persistenceAvailable()) {
    try {
      const bytes = await loadMemoBytes();
      if (bytes) {
        const map = deserializeMemo(bytes);
        for (const [k, v] of map) app.memo.set(k, v);
        restored = true;
      }
    } catch (err) {
      console.warn("loadMemoBytes failed:", err);
    }
  }

  if (restored) {
    setMemoStatus(app, "ready");
    rerender();
    return;
  }

  setMemoStatus(app, "computing");
  rerender();
  // Let the browser paint the overlay before the synchronous solve.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
  solve(currentState(app), app.memo);
  setMemoStatus(app, "ready");
  rerender();

  // Persist async; don't block UI.
  if (persistenceAvailable()) {
    try {
      const bytes = serializeMemo(app.memo);
      void saveMemoBytes(bytes);
    } catch (err) {
      console.warn("saveMemoBytes failed:", err);
    }
  }
}

function attachListeners(): void {
  document.getElementById("reserves-p0")!.addEventListener("click", (e) => {
    handleReserveClick(e.target as HTMLElement);
  });
  document.getElementById("reserves-p1")!.addEventListener("click", (e) => {
    handleReserveClick(e.target as HTMLElement);
  });
  document.getElementById("board")!.addEventListener("click", (e) => {
    handleCellClick(e.target as HTMLElement);
  });
  document.getElementById("history")!.addEventListener("click", (e) => {
    handleHistoryClick(e.target as HTMLElement);
  });
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    resetGame(app);
    rerender();
  });
  document.getElementById("btn-undo")!.addEventListener("click", () => {
    undo(app);
    rerender();
  });
  document.getElementById("btn-hints")!.addEventListener("click", () => {
    void handleHintsToggle();
  });
}

attachListeners();
rerender();
