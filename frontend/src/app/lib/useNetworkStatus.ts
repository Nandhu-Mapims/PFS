import { useCallback, useEffect, useState } from "react";
import { OUTBOX_CHANGED_EVENT } from "./feedbackOutbox";
import { listVisiblePending } from "./feedbackOutbox/store";
import {
  getNetworkQuality,
  type NetworkQuality,
} from "./feedbackOutbox/networkQuality";

export type ConnectionQuality = NetworkQuality;

export interface NetworkStatus {
  isOnline: boolean;
  quality: ConnectionQuality;
  effectiveType: string | null;
  downlinkMbps: number | null;
  pendingUploads: number;
}

function readConnectionMeta(): Pick<NetworkStatus, "effectiveType" | "downlinkMbps" | "quality"> {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    return { effectiveType: null, downlinkMbps: null, quality: "offline" };
  }

  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; addEventListener?: (t: string, fn: () => void) => void };
  }).connection;

  return {
    effectiveType: conn?.effectiveType ?? null,
    downlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
    quality: getNetworkQuality(),
  };
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    pendingUploads: 0,
    ...readConnectionMeta(),
  }));

  const refresh = useCallback(async () => {
    const meta = readConnectionMeta();
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    let pendingUploads = 0;
    try {
      const rows = await listVisiblePending();
      pendingUploads = rows.length;
    } catch {
      pendingUploads = 0;
    }
    setStatus({
      isOnline,
      pendingUploads,
      ...meta,
      quality: isOnline ? meta.quality : "offline",
    });
  }, []);

  useEffect(() => {
    void refresh();

    const onOnline = () => void refresh();
    const onOffline = () => void refresh();
    const onOutbox = () => void refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutbox);

    const conn = (navigator as Navigator & {
      connection?: { addEventListener?: (t: string, fn: () => void) => void; removeEventListener?: (t: string, fn: () => void) => void };
    }).connection;
    conn?.addEventListener?.("change", onOnline);

    const interval = window.setInterval(() => void refresh(), 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutbox);
      conn?.removeEventListener?.("change", onOnline);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return status;
}
