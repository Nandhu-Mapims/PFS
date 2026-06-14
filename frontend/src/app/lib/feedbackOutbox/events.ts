export const OUTBOX_CHANGED_EVENT = "pfs-outbox-changed";

export function notifyOutboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
  }
}
