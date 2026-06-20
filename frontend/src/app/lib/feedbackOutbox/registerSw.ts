import { SW_PATH, SYNC_TAG } from "./constants";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function registerFeedbackSyncServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_PATH, { scope: "/" })
      .then((reg) => {
        void reg.update();
        return reg;
      })
      .catch(() => null);
  }
  return registrationPromise;
}

export async function requestBackgroundSync(): Promise<void> {
  const reg = await registerFeedbackSyncServiceWorker();
  if (!reg) return;

  if ("sync" in reg && typeof (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync?.register === "function") {
    try {
      await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(
        SYNC_TAG
      );
      return;
    } catch {
      /* fall through to message */
    }
  }

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SYNC_OUTBOX_NOW" });
  }
}

export function listenForSwMessages(onSyncRequested: () => void): () => void {
  if (!("serviceWorker" in navigator)) return () => {};

  const handler = (event: MessageEvent) => {
    if (
      event.data?.type === "SYNC_OUTBOX_NOW" ||
      event.data?.type === "OUTBOX_ENTRY_COMPLETED"
    ) {
      onSyncRequested();
    }
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
