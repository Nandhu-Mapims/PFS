import { syncAllPendingOutbox } from "./sync";
import { registerFeedbackSyncServiceWorker, listenForSwMessages } from "./registerSw";

export { OUTBOX_CHANGED_EVENT, notifyOutboxChanged } from "./events";

let started = false;

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

  window.setInterval(() => {
    if (navigator.onLine) run();
  }, 45_000);
}
