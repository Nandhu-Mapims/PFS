/** Keep in sync with public/feedback-sync-sw.js */
export const OUTBOX_DB_NAME = "pfs-feedback-outbox";
export const OUTBOX_DB_VERSION = 1;
export const OUTBOX_STORE = "entries";
export const SYNC_TAG = "pfs-feedback-sync";
export const SW_PATH = "/feedback-sync-sw.js";

export const MAX_SYNC_ATTEMPTS = 24;
export const QUICK_RETRY_DELAYS_MS = [2000, 5000, 15000] as const;
