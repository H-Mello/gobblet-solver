const DB_NAME = "celestial-chess-solver";
const STORE_NAME = "memo";
const KEY = "default";
const DB_VERSION = 1;

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function persistenceAvailable(): boolean {
  return isAvailable();
}

export async function loadMemoBytes(): Promise<Uint8Array | null> {
  if (!isAvailable()) return null;
  let db: IDBDatabase;
  try {
    db = await open();
  } catch {
    return null;
  }
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY);
      req.onsuccess = () => {
        const value = req.result;
        if (value instanceof Uint8Array) resolve(value);
        else if (value instanceof ArrayBuffer) resolve(new Uint8Array(value));
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveMemoBytes(bytes: Uint8Array): Promise<void> {
  if (!isAvailable()) return;
  let db: IDBDatabase;
  try {
    db = await open();
  } catch {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(bytes, KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("saveMemoBytes failed:", err);
  } finally {
    db.close();
  }
}
