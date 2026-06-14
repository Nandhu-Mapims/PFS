import { OUTBOX_DB_NAME, OUTBOX_DB_VERSION, OUTBOX_STORE } from "./constants";
import type { FeedbackOutboxEntry } from "./types";

function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Could not open outbox database"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function putOutboxRecord(
  entry: FeedbackOutboxEntry,
  audioBlob?: Blob | null
): Promise<void> {
  const db = await openOutboxDb();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);
  store.put({ ...entry, audioBlob: audioBlob ?? undefined });
  await txDone(tx);
  db.close();
}

export async function getOutboxRecord(id: string): Promise<(FeedbackOutboxEntry & { audioBlob?: Blob }) | null> {
  const db = await openOutboxDb();
  const tx = db.transaction(OUTBOX_STORE, "readonly");
  const store = tx.objectStore(OUTBOX_STORE);
  const row = await new Promise<(FeedbackOutboxEntry & { audioBlob?: Blob }) | undefined>(
    (resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as (FeedbackOutboxEntry & { audioBlob?: Blob }) | undefined);
      req.onerror = () => reject(req.error);
    }
  );
  await txDone(tx);
  db.close();
  return row ?? null;
}

export async function deleteOutboxRecord(id: string): Promise<void> {
  const db = await openOutboxDb();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  tx.objectStore(OUTBOX_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function listOutboxRecords(): Promise<(FeedbackOutboxEntry & { audioBlob?: Blob })[]> {
  const db = await openOutboxDb();
  const tx = db.transaction(OUTBOX_STORE, "readonly");
  const store = tx.objectStore(OUTBOX_STORE);
  const rows = await new Promise<(FeedbackOutboxEntry & { audioBlob?: Blob })[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () =>
      resolve((req.result as (FeedbackOutboxEntry & { audioBlob?: Blob })[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingOutbox(): Promise<number> {
  const rows = await listOutboxRecords();
  return rows.filter((r) =>
    ["pending_sync", "text_synced", "syncing", "draft"].includes(r.status)
  ).length;
}
