import React, { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  getFeedback,
  getFeedbackAnalytics,
  type FeedbackAnalytics,
  type FeedbackItem,
} from "../lib/api";
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
import { useNavigate } from "react-router";

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
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string | null>(null);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (opts?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const [feedbackData, analyticsData] = await Promise.all([
        getFeedback(),
        getFeedbackAnalytics(),
      ]);
      setItems(feedbackData);
      setAnalytics(analyticsData);
    } catch {
      setError("Failed to load feedback. Please check API and database.");
    } finally {
      if (opts?.silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadData({ silent: true });
      }
    }
    function onFocus() {
      void loadData({ silent: true });
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadData({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    void loadBrandingSettings().then((next) => {
      setBrandLogoDataUrl(next.logoDataUrl);
    });
    return onBrandingSettingsChange(() => {
      const updated = getBrandingSettings();
      setBrandLogoDataUrl(updated.logoDataUrl);
    });
  }, []);

  const averageRating = analytics?.totals.averageRating ?? 0;

  const feedbackLink = useMemo(() => {
    return "http://localhost:5173/feedback";
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
  const recentItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => b._id.localeCompare(a._id))
        .slice(0, 10),
    [items]
  );

  function escapeCsv(value: string): string {
    const normalized = value.replace(/"/g, '""');
    return `"${normalized}"`;
  }

  function downloadCsv(rows: FeedbackItem[], fileName: string) {
    const header = [
      "patientName",
      "department",
      "rating",
      "status",
      "source",
      "comments",
      "createdAt",
    ];
    const lines = rows.map((item) =>
      [
        escapeCsv(item.patientName),
        escapeCsv(item.department || ""),
        String(item.rating),
        escapeCsv(item.status),
        escapeCsv(item.source),
        escapeCsv(item.comments || ""),
        escapeCsv(new Date(item.createdAt).toISOString()),
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllFeedbackCsv() {
    if (!items.length) return;
    downloadCsv(items, "feedback-all-data.csv");
  }

  function downloadRangeFeedbackCsv() {
    if (!fromDate || !toDate) return;
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59.999`);
    const rows = items.filter((item) => {
      const created = new Date(item.createdAt);
      return created >= start && created <= end;
    });
    if (!rows.length) return;
    downloadCsv(rows, `feedback-${fromDate}-to-${toDate}.csv`);
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Admin Panel</h2>
          <p className="text-base md:text-lg text-gray-600 mt-2">
            SaaS-level analytics for patient feedback performance
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/tickets")}
            className="px-4 py-2 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd]"
          >
            Ticket management
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#2A6FDB]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Total Tickets</p>
          <p className="text-3xl font-bold text-gray-800">{analytics?.totals.all ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#2FBF71]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Average Rating</p>
          <p className="text-3xl font-bold text-gray-800">{averageRating}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#F4A261]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Negative Tickets</p>
          <p className="text-3xl font-bold text-gray-800">
            {analytics?.totals.negative ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#7C3AED]">
          <p className="text-gray-600 text-sm mb-1 font-medium">AI Uploaded Tickets</p>
          <p className="text-3xl font-bold text-gray-800">
            {analytics?.totals.aiTickets ?? 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Ticket Status Distribution</h3>
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

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800">Recent feedback (latest 10 rows)</h3>
              <button
                type="button"
                disabled={isLoading || isRefreshing}
                onClick={() => void loadData({ silent: true })}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <button
              type="button"
              disabled={!items.length}
              onClick={downloadAllFeedbackCsv}
              className="px-4 py-2 rounded-lg bg-[#2A6FDB] text-white text-sm font-semibold hover:bg-[#1e5bbd] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download all data (CSV)
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="button"
              disabled={!fromDate || !toDate || !items.length}
              onClick={downloadRangeFeedbackCsv}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download by range (CSV)
            </button>
          </div>
        </div>
        {isLoading ? (
          <p className="p-6 text-gray-600">Loading feedback...</p>
        ) : error ? (
          <p className="p-6 text-red-600">{error}</p>
        ) : !items.length ? (
          <p className="p-6 text-gray-600">No feedback submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F5F7FA]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Department</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Rating</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Comments</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentItems.map((item) => (
                  <tr key={item._id} className="hover:bg-[#F5F7FA] transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">{item.patientName}</td>
                    <td className="px-6 py-4 text-gray-600">{item.department?.trim() || "—"}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.rating} - {ratingLabel[item.rating] ?? "N/A"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.status}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.comments || "No comment"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
