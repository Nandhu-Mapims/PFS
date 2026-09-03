/**
 * Checks the feedbacks collection for patientName values that contain raw HTML
 * (e.g. the "<a href=\"javascript:fnViewDataURL(...)\">Name</a>" markup the EMR's
 * front-office report grid embeds in its NAME column). Read-only — makes no writes.
 *
 * Usage (from backend/ with MONGODB_URI set, same as the app):
 *   node scripts/checkPatientNameHtml.js
 *
 * Or point at a specific connection string directly:
 *   node scripts/checkPatientNameHtml.js "mongodb://user:pass@host:27017/dbname"
 */
import mongoose from "mongoose";
import "dotenv/config";

const uri = process.argv[2] || process.env.MONGODB_URI;
if (!uri) {
  console.error("Provide a Mongo connection string as an argument, or set MONGODB_URI.");
  process.exit(1);
}

const HTML_TAG_REGEX = /<[a-zA-Z][^>]*>/;

async function main() {
  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;
  const col = mongoose.connection.collection("feedbacks");

  const total = await col.countDocuments({});
  const tagged = await col
    .find({ patientName: { $regex: HTML_TAG_REGEX.source } }, { projection: { patientName: 1, patientRegNo: 1, submissionMode: 1, createdAt: 1, ticketId: 1 } })
    .limit(2000)
    .toArray();

  console.log(`[check] db: ${dbName}`);
  console.log(`[check] total feedback docs: ${total}`);
  console.log(`[check] docs with HTML-tagged patientName: ${tagged.length}`);

  if (tagged.length) {
    console.log("\n--- sample (up to 20) ---");
    for (const doc of tagged.slice(0, 20)) {
      console.log({
        _id: String(doc._id),
        ticketId: doc.ticketId || null,
        patientRegNo: doc.patientRegNo || null,
        submissionMode: doc.submissionMode || null,
        createdAt: doc.createdAt,
        patientName: doc.patientName,
      });
    }
    if (tagged.length > 20) {
      console.log(`... and ${tagged.length - 20} more (raise the .limit(2000) above if you need the full list)`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[check] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
