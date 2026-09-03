import type { FeedbackInsightsQuery, FeedbackItem } from "./api";

export type FeedbackCacheEntry = {
  items: FeedbackItem[];
  lastSyncMs: number;
  loadedAt: number;
};

/**
 * Two-level cache for insights windows.
 *
 * L1 is an in-memory Map — synchronous, so render paths can read it without
 * awaiting. L2 is IndexedDB, which survives a page reload: without it every
 * refresh re-downloaded the whole window even though the rows had not changed.
 * A restored L2 entry keeps its lastSyncMs, so the next load is an incremental
 * `sinceMs` fetch rather than a full one.
 *
 * IndexedDB is best-effort throughout. Private windows, blocked site data and
 * quota errors all degrade to memory-only rather than breaking the screen.
 */

const DB_NAME = "pfs-feedback-cache";
const STORE = "windows";
const DB_VERSION = 1;

/** Keep memory bounded — a session can touch many filter combinations. */
const MAX_MEMORY_ENTRIES = 8;
/** Rows older than this are refetched instead of restored. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, FeedbackCacheEntry>();

export function feedbackCacheKey(query: FeedbackInsightsQuery): string {
  return JSON.stringify({
    startMs: query.startMs ?? null,
    endMs: query.endMs ?? null,
    encounter: query.encounter ?? "all",
    lite: query.lite ? 1 : 0,
    assignedToUserId: query.assignedToUserId?.trim() || null,
  });
}

function rememberInMemory(key: string, entry: FeedbackCacheEntry): void {
  // Re-insert so the Map's insertion order doubles as LRU ordering.
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_MEMORY_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<FeedbackCacheEntry | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as FeedbackCacheEntry | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function idbPut(key: string, entry: FeedbackCacheEntry): void {
  // Fire-and-forget: persistence must never delay or break a render.
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, key);
    } catch {
      /* quota or transaction failure — memory cache still serves this session */
    }
  });
}

/** Synchronous L1 read, for render paths. */
export function getFeedbackCache(key: string): FeedbackCacheEntry | undefined {
  return store.get(key);
}

/**
 * L2 read used on mount when L1 misses. Restores into memory so later synchronous
 * reads hit. Returns undefined when nothing usable is stored.
 */
export async function hydrateFeedbackCache(
  key: string
): Promise<FeedbackCacheEntry | undefined> {
  const inMemory = store.get(key);
  if (inMemory) return inMemory;

  const stored = await idbGet(key);
  if (!stored || !Array.isArray(stored.items) || !stored.items.length) return undefined;
  if (Date.now() - (stored.loadedAt ?? 0) > MAX_AGE_MS) return undefined;

  rememberInMemory(key, stored);
  return stored;
}

export function setFeedbackCache(
  key: string,
  items: FeedbackItem[],
  lastSyncMs: number = Date.now()
): void {
  const entry: FeedbackCacheEntry = { items, lastSyncMs, loadedAt: Date.now() };
  rememberInMemory(key, entry);
  idbPut(key, entry);
}

export function patchFeedbackCache(
  key: string,
  items: FeedbackItem[],
  lastSyncMs: number = Date.now()
): void {
  const existing = store.get(key);
  const entry: FeedbackCacheEntry = {
    items,
    lastSyncMs,
    loadedAt: existing?.loadedAt ?? Date.now(),
  };
  rememberInMemory(key, entry);
  idbPut(key, entry);
}
