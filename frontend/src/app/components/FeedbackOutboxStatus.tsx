import { useCallback, useEffect, useState } from "react";
import { Loader, WifiOff } from "lucide-react";
import {
  listVisiblePending,
  syncAllPendingOutbox,
  OUTBOX_CHANGED_EVENT,
  notifyOutboxChanged,
} from "../lib/feedbackOutbox";

export function FeedbackOutboxStatus() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listVisiblePending();
    setPending(rows.length);
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChange);
    window.addEventListener("online", onChange);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onChange);
      window.removeEventListener("online", onChange);
    };
  }, [refresh]);

  if (pending === 0) return null;

  const retry = async () => {
    setSyncing(true);
    try {
      await syncAllPendingOutbox();
      notifyOutboxChanged();
    } finally {
      setSyncing(false);
      void refresh();
    }
  };

  return (
    <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{pending}</span> feedback submission
            {pending === 1 ? "" : "s"} saved on this device — waiting to finish uploading.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={syncing || !navigator.onLine}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {syncing ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
          Retry now
        </button>
      </div>
    </div>
  );
}
