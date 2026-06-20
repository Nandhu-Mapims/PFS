import { QUICK_RETRY_DELAYS_MS } from "./constants";
import { getOutboxRecord, listOutboxRecords } from "./db";
import {
  getDelayBeforeVoiceUploadMs,
  getDelayBetweenOutboxItemsMs,
  getMaxItemsPerBackgroundSync,
  getNetworkQuality,
  getSubmitQuickRetryCount,
} from "./networkQuality";
import { patchOutboxEntry, removeCompletedOutbox, listSyncableOutbox } from "./store";
import { delay, postFeedbackText, postFeedbackVoice } from "./syncApi";
import type { FeedbackOutboxEntry, SyncOneResult } from "./types";
import { requestBackgroundSync } from "./registerSw";
import { notifyOutboxChanged } from "./events";

type OutboxRow = FeedbackOutboxEntry & { audioBlob?: Blob };

const STALE_SYNCING_MS = 5 * 60 * 1000;

function readServerFeedbackId(body: Record<string, unknown>): string {
  const id = body._id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (id && typeof id === "object" && "$oid" in id) {
    const oid = (id as { $oid?: unknown }).$oid;
    if (typeof oid === "string" && oid.trim()) return oid.trim();
  }
  return "";
}

/** Reset stuck rows and drop outbox entries whose text is already on the server. */
export async function reconcileOutboxEntries(): Promise<void> {
  const rows = await listOutboxRecords();
  const now = Date.now();

  for (const row of rows) {
    if (row.status === "completed") {
      await removeCompletedOutbox(row.id);
      continue;
    }

    if (row.serverFeedbackId && row.status === "failed") {
      await patchOutboxEntry(row.id, {
        status: row.hasAudio && !row.audioUploaded ? "text_synced" : "pending_sync",
      });
      continue;
    }

    if (row.serverFeedbackId && row.status === "pending_sync") {
      await patchOutboxEntry(row.id, { status: "text_synced" });
      continue;
    }

    if (!row.hasAudio && row.serverFeedbackId && row.status === "text_synced") {
      await removeCompletedOutbox(row.id);
      continue;
    }

    if (row.status === "failed" && !row.serverFeedbackId) {
      await patchOutboxEntry(row.id, { status: "pending_sync" });
      continue;
    }

    if (row.status === "syncing" && now - row.updatedAt > STALE_SYNCING_MS) {
      await patchOutboxEntry(row.id, {
        status: row.serverFeedbackId ? "text_synced" : "pending_sync",
      });
    }
  }
}

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
      const updated = (await patchOutboxEntry(row.id, {
        status: "pending_sync",
        attempts,
        lastError: textRes.message,
      }))!;
      void requestBackgroundSync();
      return { outcome: "retry", entry: updated };
    }
    response = textRes.body;
    serverFeedbackId = readServerFeedbackId(textRes.body);
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
    const pauseMs = getDelayBeforeVoiceUploadMs();
    if (pauseMs > 0) await delay(pauseMs);
    const voiceRes = await postFeedbackVoice(fresh.serverFeedbackId, fresh.audioBlob);
    if (!voiceRes.ok) {
      const attempts = fresh.attempts + 1;
      if (voiceRes.permanent) {
        await removeCompletedOutbox(row.id);
        return { outcome: "completed", entry: fresh, response };
      }
      const updated = (await patchOutboxEntry(row.id, {
        status: "text_synced",
        attempts,
        lastError: voiceRes.message,
      }))!;
      void requestBackgroundSync();
      return { outcome: "text_synced", entry: updated, response };
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
    if (!["pending_sync", "text_synced", "syncing", "failed"].includes(row.status)) {
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
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  await reconcileOutboxEntries();
  const rows = await listSyncableOutbox();
  const maxItems = getMaxItemsPerBackgroundSync();
  let processed = 0;

  for (const row of rows) {
    if (processed >= maxItems) break;

    const result = await syncOneOutboxEntry(row.id, {
      quickRetries: getNetworkQuality() === "slow" ? 1 : 2,
    });
    processed += 1;

    if (result.outcome === "retry" || result.outcome === "text_synced" || result.outcome === "failed") {
      void requestBackgroundSync();
    }

    if (processed < maxItems && processed < rows.length) {
      await delay(getDelayBetweenOutboxItemsMs());
    }
  }

  await reconcileOutboxEntries();
  notifyOutboxChanged();
}

export type SubmitSyncSummary =
  | { kind: "completed"; response: Record<string, unknown> }
  | { kind: "text_only"; response: Record<string, unknown> }
  | { kind: "queued" };

export async function syncAfterEnqueue(entryId: string): Promise<SubmitSyncSummary> {
  const quickRetries = getSubmitQuickRetryCount();
  const result = await syncOneOutboxEntry(entryId, { quickRetries });

  if (result.outcome === "completed") {
    return { kind: "completed", response: result.response ?? {} };
  }
  if (result.outcome === "text_synced") {
    return { kind: "text_only", response: result.response ?? {} };
  }

  void requestBackgroundSync();
  return { kind: "queued" };
}
