import { MAX_SYNC_ATTEMPTS, QUICK_RETRY_DELAYS_MS } from "./constants";
import { getOutboxRecord } from "./db";
import { patchOutboxEntry, removeCompletedOutbox, listSyncableOutbox } from "./store";
import { delay, postFeedbackText, postFeedbackVoice } from "./syncApi";
import type { FeedbackOutboxEntry, SyncOneResult } from "./types";
import { requestBackgroundSync } from "./registerSw";
import { notifyOutboxChanged } from "./events";

type OutboxRow = FeedbackOutboxEntry & { audioBlob?: Blob };

async function syncOneEntryInternal(row: OutboxRow): Promise<SyncOneResult> {
  if (row.status === "completed") {
    return { outcome: "completed", entry: row };
  }

  await patchOutboxEntry(row.id, { status: "syncing" });

  let serverFeedbackId = row.serverFeedbackId;
  let response: Record<string, unknown> | undefined;

  if (!serverFeedbackId) {
    const textRes = await postFeedbackText(row.payload, row.id);
    if (!textRes.ok) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_SYNC_ATTEMPTS;
      const updated = (await patchOutboxEntry(row.id, {
        status: failed ? "failed" : "pending_sync",
        attempts,
        lastError: textRes.message,
      }))!;
      return failed
        ? { outcome: "failed", entry: updated }
        : { outcome: "retry", entry: updated };
    }
    response = textRes.body;
    serverFeedbackId = String(textRes.body._id || "");
    if (!serverFeedbackId) {
      const updated = (await patchOutboxEntry(row.id, {
        status: "pending_sync",
        attempts: row.attempts + 1,
        lastError: "Server response missing feedback id",
      }))!;
      return { outcome: "retry", entry: updated };
    }
    await patchOutboxEntry(row.id, {
      serverFeedbackId,
      status: "text_synced",
    });
  }

  const fresh = await getOutboxRecord(row.id);
  if (!fresh) {
    return { outcome: "failed", entry: row };
  }

  const needsAudio = Boolean(fresh.hasAudio && fresh.audioBlob?.size && !fresh.audioUploaded);
  if (needsAudio && fresh.serverFeedbackId && fresh.audioBlob) {
    const voiceRes = await postFeedbackVoice(fresh.serverFeedbackId, fresh.audioBlob);
    if (!voiceRes.ok) {
      const attempts = fresh.attempts + 1;
      const failed = voiceRes.permanent || attempts >= MAX_SYNC_ATTEMPTS;
      const updated = (await patchOutboxEntry(row.id, {
        status: failed ? "failed" : "text_synced",
        attempts,
        lastError: voiceRes.message,
      }))!;
      return failed
        ? { outcome: "failed", entry: updated }
        : { outcome: "text_synced", entry: updated, response };
    }
    await patchOutboxEntry(row.id, { audioUploaded: true });
  }

  const done = await patchOutboxEntry(row.id, { status: "completed" });
  await removeCompletedOutbox(row.id);
  return { outcome: "completed", entry: done ?? row, response };
}

export async function syncOneOutboxEntry(
  id: string,
  options?: { quickRetries?: number }
): Promise<SyncOneResult> {
  const quickRetries = options?.quickRetries ?? 0;
  let last: SyncOneResult | null = null;

  for (let attempt = 0; attempt <= quickRetries; attempt++) {
    const row = await getOutboxRecord(id);
    if (!row) {
      return { outcome: "completed", entry: { id } as FeedbackOutboxEntry };
    }
    if (!["pending_sync", "text_synced", "syncing"].includes(row.status)) {
      if (row.status === "completed") {
        return { outcome: "completed", entry: row };
      }
      return { outcome: "retry", entry: row };
    }

    last = await syncOneEntryInternal(row);
    if (last.outcome === "completed" || last.outcome === "failed") {
      return last;
    }
    if (last.outcome === "text_synced" && attempt >= quickRetries) {
      return last;
    }
    if (attempt < quickRetries) {
      const delayMs = QUICK_RETRY_DELAYS_MS[attempt] ?? 15000;
      await delay(delayMs);
    }
  }

  return last ?? { outcome: "retry", entry: (await getOutboxRecord(id))! };
}

export async function syncAllPendingOutbox(): Promise<void> {
  const rows = await listSyncableOutbox();
  for (const row of rows) {
    const result = await syncOneOutboxEntry(row.id, { quickRetries: 1 });
    if (result.outcome === "retry" || result.outcome === "text_synced") {
      void requestBackgroundSync();
    }
  }
  notifyOutboxChanged();
}

export type SubmitSyncSummary =
  | { kind: "completed"; response: Record<string, unknown> }
  | { kind: "text_only"; response: Record<string, unknown> }
  | { kind: "queued" };

export async function syncAfterEnqueue(entryId: string): Promise<SubmitSyncSummary> {
  const result = await syncOneOutboxEntry(entryId, { quickRetries: QUICK_RETRY_DELAYS_MS.length });

  if (result.outcome === "completed") {
    return { kind: "completed", response: result.response ?? {} };
  }
  if (result.outcome === "text_synced") {
    return { kind: "text_only", response: result.response ?? {} };
  }

  void requestBackgroundSync();
  return { kind: "queued" };
}
