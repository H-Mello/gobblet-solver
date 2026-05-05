import { type Player, type Size } from "../../src/index.js";
import {
  type AppState,
  createAppState,
  currentPlayer,
  currentState,
  jumpTo,
  placeAt,
  resetGame,
  selectReserve,
  setHintsEnabled,
  setMemoStatus,
  setOverlayProgress,
  setSelectedReserveSize,
  undo,
} from "./app.js";
import { loadMemoBytes, persistenceAvailable, saveMemoBytes } from "./persistence.js";
import { pieceSVG } from "./pieces.js";
import { render } from "./render.js";
import { deserializeMemoChunked } from "./serialize.js";

// Empirical canonical-state count for the initial-state solve (post all
// optimizations). Used as the denominator for the solve progress bar.
const EXPECTED_SOLVE_STATES = 10_242_158;

const app: AppState = createAppState();

function rerender(): void {
  render(app);
}

// requestAnimationFrame-throttled render. Multiple calls within the same
// frame collapse to one render. Used for high-frequency state updates such
// as worker progress messages — a full rerender per message was the
// original cause of the bar appearing to "stick" at ~80% on slower devices.
let pendingRenderRAF: number | null = null;
function scheduleRender(): void {
  if (pendingRenderRAF !== null) return;
  pendingRenderRAF = requestAnimationFrame(() => {
    pendingRenderRAF = null;
    render(app);
  });
}

// ---------- click handlers (kept; drag layered on top) ----------

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

// ---------- drag (Pointer Events: mouse, touch, pen) ----------

const DRAG_THRESHOLD_PX = 6;

interface DragState {
  size: Size;
  player: Player;
  pointerId: number;
  startX: number;
  startY: number;
  isDragging: boolean;
  ghost: HTMLElement | null;
  prevSelected: Size | null;
}

let drag: DragState | null = null;

function onReservePointerDown(e: PointerEvent): void {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    "button.reserve-piece",
  );
  if (!btn || btn.disabled) return;
  if (e.button !== undefined && e.button !== 0) return;

  const size = Number(btn.dataset["size"]) as Size;
  const player = Number(btn.dataset["player"]) as Player;
  if (currentPlayer(app) !== player) return;

  e.preventDefault();
  drag = {
    size,
    player,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    isDragging: false,
    ghost: null,
    prevSelected: app.selectedReserveSize,
  };
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
}

function onPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
    drag.isDragging = true;
    setSelectedReserveSize(app, drag.size);
    rerender();
    drag.ghost = createDragGhost(drag.player, drag.size);
    document.body.appendChild(drag.ghost);
  }
  if (drag.isDragging && drag.ghost) {
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
  }
}

function onPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const wasDragging = drag.isDragging;
  const size = drag.size;
  const dropX = e.clientX;
  const dropY = e.clientY;
  cleanupDrag();

  if (wasDragging) {
    const el = document.elementFromPoint(dropX, dropY);
    const cell = el?.closest<HTMLElement>(".cell") ?? null;
    if (cell) {
      const r = Number(cell.dataset["row"]) as 0 | 1 | 2;
      const c = Number(cell.dataset["col"]) as 0 | 1 | 2;
      placeAt(app, r, c);
    }
    rerender();
  } else {
    selectReserve(app, size);
    rerender();
  }
}

function onPointerCancel(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  cleanupDrag();
  rerender();
}

function cleanupDrag(): void {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  drag = null;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  document.removeEventListener("pointercancel", onPointerCancel);
}

function createDragGhost(player: Player, size: Size): HTMLElement {
  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.innerHTML = pieceSVG(player, size);
  return g;
}

// ---------- hints toggle: load from IDB or kick off worker solve ----------

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

  setMemoStatus(app, "loading");
  setOverlayProgress(app, null);
  rerender();

  let restored = false;
  if (persistenceAvailable()) {
    try {
      console.time("memo: read from IDB");
      const bytes = await loadMemoBytes();
      console.timeEnd("memo: read from IDB");
      if (bytes) {
        console.log(`memo: loaded ${bytes.length.toLocaleString()} bytes from IDB`);
        console.time("memo: deserialize");
        const map = await deserializeMemoChunked(bytes, (current, total) => {
          setOverlayProgress(app, { current, total });
          scheduleRender();
        });
        console.timeEnd("memo: deserialize");
        app.memo = map;
        console.log(`memo: ${app.memo.size.toLocaleString()} entries restored`);
        restored = true;
      }
    } catch (err) {
      console.warn("loadMemoBytes failed:", err);
    }
  }

  if (restored) {
    setMemoStatus(app, "ready");
    setOverlayProgress(app, null);
    rerender();
    return;
  }

  setMemoStatus(app, "computing");
  setOverlayProgress(app, { current: 0, total: EXPECTED_SOLVE_STATES });
  rerender();
  await runWorkerSolve();
}

function runWorkerSolve(): Promise<void> {
  return new Promise<void>((resolve) => {
    const worker = new Worker(
      new URL("./solver-worker.ts", import.meta.url),
      { type: "module" },
    );
    const t0 = performance.now();
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "progress"; size: number }
        | { type: "done"; size: number; bytes: Uint8Array };
      if (msg.type === "progress") {
        // rAF-throttle so backed-up progress messages don't pile up renders.
        setOverlayProgress(app, { current: msg.size, total: EXPECTED_SOLVE_STATES });
        scheduleRender();
      } else if (msg.type === "done") {
        const elapsed = performance.now() - t0;
        console.log(
          `memo: solve from initial state: ${elapsed.toFixed(0)} ms (${msg.size.toLocaleString()} entries)`,
        );

        // Switch from "computing" to "loading" while we hydrate the in-memory
        // Map from the bytes the worker just sent. The chunked deserialize
        // yields between chunks so the progress bar can update during the
        // 1–2s rebuild — important on slower devices where the freeze
        // post-solve was previously confusing.
        setMemoStatus(app, "loading");
        setOverlayProgress(app, { current: 0, total: 0 });
        rerender();

        const bytes = msg.bytes;
        void deserializeMemoChunked(bytes, (current, total) => {
          setOverlayProgress(app, { current, total });
          scheduleRender();
        }).then(
          (map) => {
            app.memo = map;
            setMemoStatus(app, "ready");
            setOverlayProgress(app, null);
            rerender();
            worker.terminate();

            if (persistenceAvailable()) {
              console.log(
                `memo: serialized to ${bytes.length.toLocaleString()} bytes; writing to IDB…`,
              );
              void saveMemoBytes(bytes).then(
                () => console.log("memo: write to IDB done"),
                (err) => console.warn("memo: write to IDB failed:", err),
              );
            }
            resolve();
          },
          (err) => {
            console.warn("post-solve deserialize failed:", err);
            setMemoStatus(app, "ready");
            setOverlayProgress(app, null);
            rerender();
            worker.terminate();
            resolve();
          },
        );
      }
    };
    worker.onerror = (err) => {
      console.warn("solver worker errored:", err);
      worker.terminate();
      setMemoStatus(app, "ready");
      setOverlayProgress(app, null);
      rerender();
      resolve();
    };
    worker.postMessage({
      type: "solve",
      state: currentState(app),
    });
  });
}

// ---------- bootstrap ----------

function attachListeners(): void {
  for (const id of ["reserves-p0", "reserves-p1"]) {
    const el = document.getElementById(id)!;
    el.addEventListener("pointerdown", onReservePointerDown);
  }
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
