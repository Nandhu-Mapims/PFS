import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  deleteFeedback,
  getFeedback,
  getFeedbackAnalytics,
  type FeedbackAnalytics,
  type FeedbackItem,
} from "../lib/api";
import {
  fetchFeedbackChanges,
  fetchFeedbackList,
  mergeFeedbackLists,
} from "../lib/feedbackListSync";
import {
  feedbackCacheKey,
  getFeedbackCache,
  patchFeedbackCache,
  setFeedbackCache,
} from "../lib/feedbackCache";
import {
  defaultFeedbackListScope,
  feedbackMatchesListScope,
  feedbackQueryFromListScope,
  last12WeeksRange,
  last30DaysRange,
  type FeedbackListScope,
} from "../lib/insightsFilters";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import feedbackLogo from "./image/feedback_logo.png";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocation, useNavigate } from "react-router";
import * as XLSX from "xlsx";
import { RecentFeedbackBySentiment } from "./RecentFeedbackBySentiment";
import { countPatientFeedbackGroups } from "../lib/patientFeedbackGroups";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

const STATUS_COLORS: Record<string, string> = {
  New: "#2A6FDB",
  "In Progress": "#F4A261",
  Resolved: "#2FBF71",
};

/** QR + frame colours aligned with feedback logo (deep red / cream / gold) */
const BRAND_QR = {
  modules: "#8B1538",
  background: "#FFFBF7",
  borderGold: "#C9A227",
};

export function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDeleteMode = location.pathname.includes("/delete");
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string | null>(null);
  const [listScope, setListScope] = useState<FeedbackListScope>(defaultFeedbackListScope);
  const [excelDownloadBusy, setExcelDownloadBusy] = useState(false);
  const lastFeedbackSyncMsRef = useRef(0);

  const listQuery = useCallback(
    () => ({ lite: true as const, ...feedbackQueryFromListScope(listScope) }),
    [listScope]
  );

  const markFeedbackSynced = useCallback(() => {
    lastFeedbackSyncMsRef.current = Date.now();
  }, []);

  const loadAnalytics = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (opts?.silent) setIsRefreshing(true);
      const analyticsData = await getFeedbackAnalytics();
      setAnalytics(analyticsData);
    } catch {
      if (!opts?.silent) {
        setError("Failed to load analytics. Please check API and database.");
      }
    } finally {
      if (opts?.silent) setIsRefreshing(false);
    }
  }, []);

  const loadData = useCallback(
    async (opts?: { silent?: boolean; incremental?: boolean }) => {
      const query = listQuery();
      const key = feedbackCacheKey(query);
      const cached = getFeedbackCache(key);

      try {
        if (opts?.silent) {
          setIsRefreshing(true);
        } else if (cached) {
          setItems(cached.items);
          lastFeedbackSyncMsRef.current = cached.lastSyncMs;
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
        if (!opts?.silent) setError(null);

        const useIncremental = Boolean(
          opts?.incremental && (lastFeedbackSyncMsRef.current > 0 || cached?.lastSyncMs)
        );
        const sinceMs = lastFeedbackSyncMsRef.current || cached?.lastSyncMs || 0;

        const feedbackPromise = useIncremental
          ? fetchFeedbackChanges(query, sinceMs)
          : fetchFeedbackList(query);

        const [feedbackData, analyticsData] = await Promise.all([
          feedbackPromise,
          opts?.silent ? Promise.resolve(null) : getFeedbackAnalytics(),
        ]);

        if (useIncremental) {
          if (feedbackData.length) {
            setItems((current) => {
              let merged = mergeFeedbackLists(current, feedbackData);
              if (!listScope.allTime) {
                merged = merged.filter((row) => feedbackMatchesListScope(row, listScope));
              }
              patchFeedbackCache(key, merged, Date.now());
              return merged;
            });
          } else {
            setItems((current) => {
              patchFeedbackCache(key, current, Date.now());
              return current;
            });
          }
        } else {
          setItems(feedbackData);
          setFeedbackCache(key, feedbackData, Date.now());
        }
        markFeedbackSynced();

        if (analyticsData) {
          setAnalytics(analyticsData);
        }
      } catch {
        if (!opts?.silent && !cached) {
          setError("Failed to load feedback. Please check API and database.");
        }
      } finally {
        if (opts?.silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [listQuery, listScope, markFeedbackSynced]
  );

  const reloadFeedbackList = useCallback(
    async (scope: FeedbackListScope, opts?: { silent?: boolean }) => {
      const query = { lite: true as const, ...feedbackQueryFromListScope(scope) };
      const key = feedbackCacheKey(query);
      try {
        if (opts?.silent) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);
        lastFeedbackSyncMsRef.current = 0;
        const feedbackData = await fetchFeedbackList(query);
        setItems(feedbackData);
        setFeedbackCache(key, feedbackData, Date.now());
        markFeedbackSynced();
      } catch {
        setError("Failed to load feedback. Please check API and database.");
      } finally {
        if (opts?.silent) setIsRefreshing(false);
        else setIsLoading(false);
      }
    },
    [markFeedbackSynced]
  );

  const handleListScopeChange = useCallback((scope: FeedbackListScope) => {
    setListScope(scope);
    void reloadFeedbackList(scope);
  }, [reloadFeedbackList]);

  const handleDeleteFeedback = useCallback(
    async (item: FeedbackItem) => {
      const label = item.ticketId ?? item.patientName ?? item._id;
      const confirmed = window.confirm(
        `Delete feedback ${label}? This removes the submission${item.ticketId ? " and its ticket" : ""}. This cannot be undone.`
      );
      if (!confirmed) return;
      try {
        setError(null);
        await deleteFeedback(item._id);
        setItems((current) => current.filter((row) => row._id !== item._id));
      } catch {
        setError("Failed to delete feedback.");
      }
    },
    []
  );

  useEffect(() => {
    const query = listQuery();
    const key = feedbackCacheKey(query);
    const cached = getFeedbackCache(key);
    if (cached) {
      setItems(cached.items);
      lastFeedbackSyncMsRef.current = cached.lastSyncMs;
      setIsLoading(false);
      void loadData({ silent: true, incremental: true });
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadAnalytics({ silent: true });
      }
    }
    function onFocus() {
      void loadAnalytics({ silent: true });
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAnalytics]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadAnalytics({ silent: true });
      void loadData({ silent: true, incremental: true });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadAnalytics, loadData]);

  useEffect(() => {
    void loadBrandingSettings().then((next) => {
      setBrandLogoDataUrl(next.logoDataUrl);
    });
    return onBrandingSettingsChange(() => {
      const updated = getBrandingSettings();
      setBrandLogoDataUrl(updated.logoDataUrl);
    });
  }, []);

  const totalSubmissions = analytics?.totals?.all ?? items.length;
  const patientCount = useMemo(() => countPatientFeedbackGroups(items), [items]);
  const averageRatingFromItems = useMemo(() => {
    if (!items.length) return 0;
    const parents = items.filter((row) => !row.isSplitChild);
    const base = parents.length ? parents : items;
    return Number((base.reduce((sum, row) => sum + row.rating, 0) / base.length).toFixed(1));
  }, [items]);
  const averageRating = analytics?.totals?.averageRating ?? averageRatingFromItems;
  const negativeAiCount =
    analytics?.totals?.negative ?? items.filter((i) => i.aiSentiment === "negative").length;
  const aiChannelCount = analytics?.totals?.aiTickets ?? items.filter((i) => i.source === "ai").length;

  const feedbackLink = useMemo(() => {
    const envBase = (
      import.meta.env.VITE_PUBLIC_FEEDBACK_ORIGIN as string | undefined
    )?.trim();
    const origin =
      envBase ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const base = origin.replace(/\/$/, "");
    return `${base}/feedback`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(feedbackLink, {
      width: 240,
      margin: 2,
      color: {
        dark: BRAND_QR.modules,
        light: BRAND_QR.background,
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackLink]);

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Logo failed to load"));
      img.src = src;
    });
  }

  function drawWrappedUrl(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number {
    let line = "";
    let yy = y;
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, yy);
        yy += lineHeight;
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, yy);
      yy += lineHeight;
    }
    return yy;
  }

  async function downloadQrPoster() {
    setDownloadBusy(true);
    try {
      const W = 720;
      const H = 1280;
      const pad = 40;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = BRAND_QR.background;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = BRAND_QR.borderGold;
      ctx.fillRect(0, 0, W, 10);

      ctx.strokeStyle = `${BRAND_QR.borderGold}99`;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, W - 24, H - 24);

      const logoImg = await loadImage(brandLogoDataUrl || feedbackLogo);
      const logoMaxW = W - pad * 2;
      const logoScale = Math.min(logoMaxW / logoImg.width, 400 / logoImg.height);
      const lw = logoImg.width * logoScale;
      const lh = logoImg.height * logoScale;
      const lx = (W - lw) / 2;
      let yCursor = 36;
      ctx.drawImage(logoImg, lx, yCursor, lw, lh);
      yCursor += lh + 14;

      ctx.fillStyle = BRAND_QR.modules;
      ctx.font = "bold 28px system-ui, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Patient feedback", W / 2, yCursor);
      yCursor += 38;
      ctx.font = "17px system-ui, Segoe UI, sans-serif";
      ctx.fillStyle = "#6b1229";
      ctx.fillText("Scan the code below with your phone camera", W / 2, yCursor);
      yCursor += 42;

      const qrSize = 480;
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, feedbackLink, {
        width: qrSize,
        margin: 2,
        color: {
          dark: BRAND_QR.modules,
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });

      const qrX = (W - qrSize) / 2;
      const padQr = 16;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrX - padQr, yCursor - padQr, qrSize + padQr * 2, qrSize + padQr * 2);
      ctx.strokeStyle = BRAND_QR.borderGold;
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - padQr, yCursor - padQr, qrSize + padQr * 2, qrSize + padQr * 2);
      ctx.drawImage(qrCanvas, qrX, yCursor);
      yCursor += qrSize + padQr * 2 + 22;

      ctx.textAlign = "center";
      ctx.font = "13px ui-monospace, monospace";
      ctx.fillStyle = "#4a0d18";
      const urlBottom = drawWrappedUrl(ctx, feedbackLink, W / 2, yCursor, W - pad * 2, 18);
      yCursor = urlBottom + 24;

      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "#8B1538";
      ctx.fillText("MAPIMS Hospital · Feedback System", W / 2, H - pad);

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Export failed"));
              return;
            }
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "mapims-feedback-qr-poster.png";
            anchor.click();
            URL.revokeObjectURL(url);
            resolve();
          },
          "image/png",
          1
        );
      });
    } catch {
      // silent; optional: toast
    } finally {
      setDownloadBusy(false);
    }
  }

  const statusChartData = analytics?.byStatus ?? [];
  const pieData = useMemo(
    () =>
      statusChartData.map((d) => ({
        ...d,
        fill: STATUS_COLORS[d.status] ?? "#94a3b8",
      })),
    [statusChartData]
  );
  const negativeDepartmentData = analytics?.negativeByDepartment ?? [];
  const trendData = analytics?.submissionsByDay ?? [];
  function downloadExcel(rows: FeedbackItem[], fileName: string) {
    const data = rows.map((item) => ({
      patientName: item.patientName,
      UHID: item.patientRegNo?.trim() || "",
      department: item.department || "",
      rating: item.rating,
      status: item.status,
      aiSentiment: item.aiSentiment || "",
      source: item.source,
      comments: item.comments || "",
      createdAt: new Date(item.createdAt).toISOString(),
    }));
    const sheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Feedback");
    XLSX.writeFile(workbook, fileName);
  }

  function downloadAllFeedbackExcel() {
    void (async () => {
      if (excelDownloadBusy) return;
      try {
        setExcelDownloadBusy(true);
        const all = await getFeedback({ lite: true });
        if (!all.length) return;
        downloadExcel(all, "feedback-all-data.xlsx");
      } catch {
        setError("Could not download all feedback. Try again.");
      } finally {
        setExcelDownloadBusy(false);
      }
    })();
  }

  function downloadFilteredFeedbackExcel(rows: FeedbackItem[]) {
    if (!rows.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadExcel(rows, `feedback-filtered-${stamp}.xlsx`);
  }

  return (
    <div className="w-full">
      <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800">Admin Panel</h2>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-1.5 sm:mt-2">
            SaaS-level analytics for patient feedback performance
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Charts use all-time totals · table below loads{" "}
            {listScope.allTime ? "all submissions" : `${listScope.from} to ${listScope.to}`} only
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => navigate("/admin/settings")}
            className="px-3 sm:px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/tickets")}
            className="px-3 sm:px-4 py-2 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd]"
          >
            Ticket management
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 border-l-4 border-l-[#2A6FDB]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Submissions (all time)</p>
          <p className="text-3xl font-bold text-gray-800">{totalSubmissions}</p>
          <p className="text-xs text-gray-500 mt-1">All rows incl. split tickets</p>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 border-l-4 border-l-indigo-500">
          <p className="text-gray-600 text-sm mb-1 font-medium">Patients (all time)</p>
          <p className="text-3xl font-bold text-gray-800">{patientCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            Unique patients · from {totalSubmissions} submission rows
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 border-l-4 border-l-[#2FBF71]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Average Rating</p>
          <p className="text-3xl font-bold text-gray-800">{averageRating}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 border-l-4 border-l-[#F4A261]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Negative (AI)</p>
          <p className="text-3xl font-bold text-gray-800">{negativeAiCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 border-l-4 border-l-[#7C3AED]">
          <p className="text-gray-600 text-sm mb-1 font-medium">AI Channel Submissions</p>
          <p className="text-3xl font-bold text-gray-800">{aiChannelCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Submission Status Distribution</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Negative Feedback by Department
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={negativeDepartmentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#E5533D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Submission Trend (Last 14 Days)
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2A6FDB" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-[#C9A227] bg-gradient-to-br from-[#FFFBF7] via-[#FFF8F0] to-[#FFF0F0] p-6 sm:p-8 shadow-md mb-6">
        <h3 className="text-xl font-bold text-[#8B1538] mb-1">Feedback QR Code</h3>
        <p className="text-sm text-[#6b1229] mb-6">
          Logo and QR use the same brand colours. Download saves a tall poster: logo on top, QR
          below (rectangle PNG for print or WhatsApp).
        </p>
        <div className="flex flex-col lg:flex-row lg:items-center gap-8">
          <div className="flex flex-col items-center justify-center gap-3 shrink-0 lg:border-r lg:border-[#C9A227]/40 lg:pr-8">
            <img
              src={brandLogoDataUrl || feedbackLogo}
              alt="MAPIMS feedback system"
              className="h-28 w-auto max-w-[220px] object-contain drop-shadow-sm"
            />
            <p className="text-xs font-bold uppercase tracking-wider text-[#8B1538]">
              Official MAPIMS feedback
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-1 min-w-0">
            <div
              className="mx-auto sm:mx-0 rounded-xl bg-white p-3 shadow-md ring-2 ring-[#8B1538]/20"
              style={{ backgroundColor: BRAND_QR.background }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR code linking to patient feedback form"
                  width={240}
                  height={240}
                  className="block rounded-lg"
                />
              ) : (
                <div
                  className="w-[240px] h-[240px] rounded-lg animate-pulse"
                  style={{ backgroundColor: `${BRAND_QR.modules}18` }}
                  aria-hidden
                />
              )}
            </div>
            <div className="space-y-3 text-center sm:text-left flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#8B1538] uppercase tracking-wide">
                Scan target
              </p>
              <p className="text-sm text-[#4a0d18] break-all font-mono bg-white/70 rounded-lg px-3 py-2 border border-[#C9A227]/30">
                {feedbackLink}
              </p>
              <button
                type="button"
                disabled={downloadBusy}
                onClick={() => void downloadQrPoster()}
                className="inline-flex px-4 py-2 rounded-lg font-semibold text-white bg-[#8B1538] hover:bg-[#6f1029] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ring-1 ring-[#C9A227]/40"
              >
                {downloadBusy ? "Preparing download…" : "Download poster (logo + QR)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <RecentFeedbackBySentiment
        items={items}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        error={error}
        isDeleteMode={isDeleteMode}
        listScope={listScope}
        onListScopeChange={handleListScopeChange}
        onRefresh={() => void loadData({ silent: true, incremental: true })}
        onDownloadAll={downloadAllFeedbackExcel}
        excelDownloadBusy={excelDownloadBusy}
        onDownloadRange={downloadFilteredFeedbackExcel}
        onDeleteItem={isDeleteMode ? (item) => void handleDeleteFeedback(item) : undefined}
      />
    </div>
  );
}
