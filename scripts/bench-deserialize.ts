// Build a full memo via the worker's actual code path (bestPlay), serialize
// it, and time how long deserialize takes — both the chunked variant the
// web app uses and the synchronous one. Lets us measure optimization wins.

import {
  bestPlay,
  createMemo,
  initialState,
} from "../src/index.js";
import {
  deserializeMemo,
  deserializeMemoChunked,
  serializeMemo,
} from "../web/src/serialize.js";

console.time("populate via bestPlay()");
const memo = createMemo();
bestPlay(initialState(), memo);
console.timeEnd("populate via bestPlay()");
console.log(`  ${memo.size.toLocaleString()} entries`);

console.time("serialize");
const bytes = serializeMemo(memo);
console.timeEnd("serialize");
console.log(`  ${bytes.byteLength.toLocaleString()} bytes`);

// Synchronous deserialize.
console.time("deserialize (sync)");
const map1 = deserializeMemo(bytes);
console.timeEnd("deserialize (sync)");
console.log(`  ${map1.size.toLocaleString()} entries restored`);

// Chunked variant (what the web actually uses, with progress callbacks but
// no real yielding cost since there's no UI thread to yield to here).
let lastReport = 0;
console.time("deserialize (chunked, 100K)");
const map2 = await deserializeMemoChunked(bytes, (current) => {
  lastReport = current;
});
console.timeEnd("deserialize (chunked, 100K)");
console.log(`  ${map2.size.toLocaleString()} entries restored, last progress=${lastReport.toLocaleString()}`);
