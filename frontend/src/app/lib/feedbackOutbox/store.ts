import { putOutboxRecord, getOutboxRecord, deleteOutboxRecord, listOutboxRecords } from "./db";
import { notifyOutboxChanged } from "./events";
import type { FeedbackOutboxEntry, OutboxPayload, OutboxStatus } from "./types";

function now() {
  return Date.now();
}

export function newOutboxId(): string {
  return crypto.randomUUID();
}

export async function saveVoiceDraft(
  id: string,
  payload: OutboxPayload,
  audioBlob: Blob | null
): Promise<FeedbackOutboxEntry> {
  const existing = await getOutboxRecord(id);
  const entry: FeedbackOutboxEntry = {
    id,
    status: "draft",
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
    attempts: existing?.attempts ?? 0,
    audioUploaded: false,
    hasAudio: Boolean(audioBlob?.size),
    payload,
  };
  await putOutboxRecord(entry, audioBlob);
  notifyOutboxChanged();
  return entry;
}

export async function enqueueFeedbackSubmission(input: {
  id: string;
  payload: OutboxPayload;
  audioBlob?: Blob | null;
  thankYouState?: FeedbackOutboxEntry["thankYouState"];
}): Promise<FeedbackOutboxEntry> {
  const existing = await getOutboxRecord(input.id);
  const entry: FeedbackOutboxEntry = {
    id: input.id,
    status: "pending_sync",
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
    attempts: existing?.attempts ?? 0,
    serverFeedbackId: existing?.serverFeedbackId,
    audioUploaded: existing?.audioUploaded ?? false,
    hasAudio: Boolean(input.audioBlob?.size),
    payload: input.payload,
    thankYouState: input.thankYouState,
  };
  await putOutboxRecord(entry, input.audioBlob ?? existing?.audioBlob);
  notifyOutboxChanged();
  return entry;
}

export async function patchOutboxEntry(
  id: string,
  patch: Partial<FeedbackOutboxEntry>
): Promise<FeedbackOutboxEntry | null> {
  const row = await getOutboxRecord(id);
  if (!row) return null;
  const { audioBlob, ...rest } = row;
  const next: FeedbackOutboxEntry = {
    ...rest,
    ...patch,
    id,
    updatedAt: now(),
  };
  await putOutboxRecord(next, audioBlob);
  return next;
}

export async function removeCompletedOutbox(id: string): Promise<void> {
  await deleteOutboxRecord(id);
}

export async function listSyncableOutbox(): Promise<(FeedbackOutboxEntry & { audioBlob?: Blob })[]> {
  const rows = await listOutboxRecords();
  return rows.filter((r) => ["pending_sync", "text_synced", "syncing"].includes(r.status));
}

export async function listVisiblePending(): Promise<FeedbackOutboxEntry[]> {
  const rows = await listOutboxRecords();
  return rows.filter((r) =>
    (["pending_sync", "text_synced", "syncing", "failed"] as OutboxStatus[]).includes(r.status)
  );
}
