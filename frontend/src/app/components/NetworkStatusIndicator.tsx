import { CloudOff, Signal, SignalLow, Upload } from "lucide-react";
import { useNetworkStatus } from "../lib/useNetworkStatus";

const LABELS = {
  offline: {
    title: "No internet",
    shortHint: "Saved on device — will upload when online",
    hint: "Feedback is saved on this device and will upload when you are back online.",
    className: "border-red-200 bg-red-50 text-red-900",
    dot: "bg-red-500",
    mobileBar: "bg-red-600 text-white",
  },
  slow: {
    title: "Slow connection",
    shortHint: "Uploads may take longer — wait for submit to finish",
    hint: "Uploads may take longer. Stay on this page until submit finishes.",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    dot: "bg-amber-500",
    mobileBar: "bg-amber-500 text-white",
  },
  online: {
    title: "Online",
    shortHint: "Connection looks good",
    hint: "Connection looks good.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    dot: "bg-emerald-500",
    mobileBar: "bg-emerald-600 text-white",
  },
} as const;

type Variant = "inline" | "mobile-fixed";

type Props = {
  variant?: Variant;
};

export function NetworkStatusIndicator({ variant = "inline" }: Props) {
  const { isOnline, quality, effectiveType, pendingUploads } = useNetworkStatus();
  const key = !isOnline ? "offline" : quality;
  const meta = LABELS[key];
  const Icon = key === "offline" ? CloudOff : key === "slow" ? SignalLow : Signal;

  const detail =
    key === "offline"
      ? meta.hint
      : pendingUploads > 0
        ? `${pendingUploads} feedback item${pendingUploads === 1 ? "" : "s"} waiting to upload.`
        : key === "slow"
          ? `${meta.hint}${effectiveType ? ` (${effectiveType})` : ""}`
          : meta.hint;

  const mobileHint =
    pendingUploads > 0
      ? `${pendingUploads} waiting to upload`
      : key === "slow" && effectiveType
        ? `${meta.shortHint} (${effectiveType})`
        : meta.shortHint;

  if (variant === "mobile-fixed") {
    return (
      <div
        className={`fixed left-0 right-0 top-0 z-[100] w-full border-b border-black/10 shadow-md lg:hidden ${meta.mobileBar}`}
        role="status"
        aria-live="polite"
      >
        <div
          className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold leading-tight">{meta.title}</p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-white/90">{mobileHint}</p>
          </div>
          {pendingUploads > 0 && (
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-black/20 px-2.5 text-xs font-semibold">
              <Upload className="h-3.5 w-3.5" />
              {pendingUploads}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`hidden items-start gap-2 rounded-xl border px-3 py-2 text-left lg:flex lg:max-w-xs ${meta.className}`}
      role="status"
      aria-live="polite"
      title={detail}
    >
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon className="h-4 w-4" aria-hidden />
        <span
          className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${meta.dot}`}
          aria-hidden
        />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold">{meta.title}</p>
        <p className="text-xs opacity-90">{detail}</p>
      </div>
    </div>
  );
}

/** Matches fixed mobile bar height (44px row + safe area). */
export const MOBILE_NETWORK_BAR_OFFSET_CLASS =
  "max-lg:pt-[calc(3.25rem+env(safe-area-inset-top,0px))]";
