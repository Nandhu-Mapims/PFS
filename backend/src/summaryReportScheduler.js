import { SummaryReport } from "./models.js";
import { currentPeriodKey, periodRangeForKey } from "./reportPeriods.js";
import { generateSummaryReports } from "./summaryReportBuilder.js";

/**
 * Periodically checks the *current* (in-progress) weekly and monthly periods and generates
 * their SummaryReport rows exactly once each — it does not regenerate a period that already
 * has a report. When a period rolls over (new week/month), the next tick generates the new one.
 * Users can still force a refresh of an existing period via the manual /generate endpoint.
 */
export function createSummaryReportWorker({ isEnabled }) {
  let running = false;
  let intervalHandle = null;
  let initialTimeoutHandle = null;

  const pollMinutes = Math.max(15, Number(process.env.SUMMARY_REPORT_POLL_MINUTES) || 60);

  async function generateCurrentPeriods() {
    if (!isEnabled()) return;
    if (running) return;
    running = true;
    try {
      const now = new Date();
      for (const periodType of ["weekly", "monthly"]) {
        const periodKey = currentPeriodKey(periodType, now);
        const range = periodRangeForKey(periodType, periodKey);
        if (!range) continue;
        try {
          const alreadyGenerated = await SummaryReport.exists({ periodType, periodKey });
          if (alreadyGenerated) continue;
          await generateSummaryReports({
            periodType,
            periodKey,
            periodStart: range.start,
            periodEnd: range.end,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[summary-report] tick failed", {
            periodType,
            periodKey,
            message: err?.message || String(err),
          });
        }
      }
    } finally {
      running = false;
    }
  }

  function start() {
    if (!isEnabled()) {
      // eslint-disable-next-line no-console
      console.log("[summary-report] worker disabled (OPENROUTER_API_KEY not set)");
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[summary-report] worker started", { pollMinutes });

    initialTimeoutHandle = setTimeout(() => {
      void generateCurrentPeriods();
    }, 20_000);

    intervalHandle = setInterval(() => {
      void generateCurrentPeriods();
    }, pollMinutes * 60_000);
  }

  function stop() {
    if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle);
    if (intervalHandle) clearInterval(intervalHandle);
  }

  return { start, stop, generateCurrentPeriods };
}
