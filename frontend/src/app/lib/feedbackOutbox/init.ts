import { syncAllPendingOutbox } from "./sync";
import { getSyncPollIntervalMs } from "./networkQuality";
import { registerFeedbackSyncServiceWorker, listenForSwMessages } from "./registerSw";

export { OUTBOX_CHANGED_EVENT, notifyOutboxChanged } from "./events";

let started = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBackgroundSyncPoll(): void {
  if (pollTimer != null) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    if (navigator.onLine) {
      void syncAllPendingOutbox().finally(() => scheduleBackgroundSyncPoll());
    } else {
      scheduleBackgroundSyncPoll();
    }
  }, getSyncPollIntervalMs());
}

export function initFeedbackOutboxSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const run = () => {
    void syncAllPendingOutbox();
  };

  void registerFeedbackSyncServiceWorker();

  window.addEventListener("online", run);
  listenForSwMessages(run);

  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(() => run()).catch(() => {});
  } else {
    run();
  }

  scheduleBackgroundSyncPoll();
}
