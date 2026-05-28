/**
 * One-time cleanup:
 * - Remove ticketId from feedback rows where aiSentiment is positive
 * - Remove nested feedbackIssues[].ticketId where issue sentiment is positive
 *
 * Run from backend: npm run clean-positive-tickets
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

const feedbackSchema = new mongoose.Schema(
  {
    ticketId: { type: String, default: null, index: true },
    aiSentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: null,
    },
    feedbackIssues: {
      type: [
        {
          sentiment: {
            type: String,
            enum: ["positive", "neutral", "negative"],
            default: null,
          },
          ticketId: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Feedback =
  mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);

  const rowsWithPositiveTicketBefore = await Feedback.countDocuments({
    aiSentiment: "positive",
    ticketId: { $nin: [null, ""] },
  });

  const rowResult = await Feedback.updateMany(
    {
      aiSentiment: "positive",
      ticketId: { $nin: [null, ""] },
    },
    {
      $set: { ticketId: null },
    }
  );

  const issueResult = await Feedback.updateMany(
    {
      feedbackIssues: {
        $elemMatch: {
          sentiment: "positive",
          ticketId: { $nin: [null, ""] },
        },
      },
    },
    {
      $set: { "feedbackIssues.$[issue].ticketId": null },
    },
    {
      arrayFilters: [{ "issue.sentiment": "positive", "issue.ticketId": { $nin: [null, ""] } }],
    }
  );

  const rowsWithPositiveTicketAfter = await Feedback.countDocuments({
    aiSentiment: "positive",
    ticketId: { $nin: [null, ""] },
  });

  await mongoose.disconnect();

  console.log(
    [
      `Rows matched (positive + ticketId): ${rowsWithPositiveTicketBefore}`,
      `Rows modified (ticketId cleared): ${rowResult.modifiedCount}`,
      `Rows modified (positive issue ticketId cleared): ${issueResult.modifiedCount}`,
      `Rows remaining with positive + ticketId: ${rowsWithPositiveTicketAfter}`,
    ].join("\n")
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
