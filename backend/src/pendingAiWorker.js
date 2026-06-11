import { Feedback, mongoose } from "./models.js";

/**
 * Periodically finds feedback with comments but no AI sentiment and runs full analysis.
 * Skips split-child rows (parent analysis creates them).
 */
export function createPendingAiWorker({ reanalyzeFeedbackById, isEnabled }) {
  let running = false;
  let intervalHandle = null;
  let initialTimeoutHandle = null;

  const pollSeconds = Math.max(15, Number(process.env.PENDING_AI_POLL_SECONDS) || 45);
  const batchSize = Math.max(1, Math.min(20, Number(process.env.PENDING_AI_BATCH_SIZE) || 5));
  const minAgeSeconds = Math.max(10, Number(process.env.PENDING_AI_MIN_AGE_SECONDS) || 30);

  async function findPendingRows(limit) {
    const cutoffOid = mongoose.Types.ObjectId.createFromTime(
      Math.floor((Date.now() - minAgeSeconds * 1000) / 1000)
    );
    return Feedback.find({
      isSplitChild: { $ne: true },
      _id: { $lte: cutoffOid },
      $or: [{ aiSentiment: null }, { aiSentiment: { $exists: false } }, { aiSentiment: "" }],
      comments: { $type: "string", $ne: "" },
    })
      .sort({ _id: 1 })
      .limit(limit)
      .lean();
  }

  async function processBatch() {
    if (!isEnabled()) return { processed: 0, updated: 0, failed: 0 };
    if (running) return { processed: 0, updated: 0, failed: 0, skipped: true };

    running = true;
    let updated = 0;
    let failed = 0;

    try {
      const rows = await findPendingRows(batchSize);
      if (!rows.length) {
        return { processed: 0, updated: 0, failed: 0 };
      }

      // eslint-disable-next-line no-console
      console.log("[pending-ai] auto-processing batch", { count: rows.length });

      for (const row of rows) {
        try {
          const ok = await reanalyzeFeedbackById(row._id);
          if (ok) updated += 1;
          else failed += 1;
        } catch (err) {
          failed += 1;
          // eslint-disable-next-line no-console
          console.error("[pending-ai] row failed", {
            feedbackId: String(row._id),
            message: err?.message || String(err),
          });
        }
      }

      // eslint-disable-next-line no-console
      console.log("[pending-ai] batch done", { updated, failed });
      return { processed: rows.length, updated, failed };
    } finally {
      running = false;
    }
  }

  function scheduleRetry(feedbackId, delayMs = 45_000) {
    if (!isEnabled()) return;
    setTimeout(() => {
      void reanalyzeFeedbackById(feedbackId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[pending-ai] scheduled retry failed", {
          feedbackId: String(feedbackId),
          message: err?.message || String(err),
        });
      });
    }, delayMs);
  }

  function start() {
    if (!isEnabled()) {
      // eslint-disable-next-line no-console
      console.log("[pending-ai] worker disabled (OPENROUTER_API_KEY not set)");
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[pending-ai] worker started", {
      pollSeconds,
      batchSize,
      minAgeSeconds,
    });

    initialTimeoutHandle = setTimeout(() => {
      void processBatch();
    }, 12_000);

    intervalHandle = setInterval(() => {
      void processBatch();
    }, pollSeconds * 1000);
  }

  function stop() {
    if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle);
    if (intervalHandle) clearInterval(intervalHandle);
  }

  return { start, stop, processBatch, scheduleRetry };
}
