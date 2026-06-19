/**
 * Report voice/bot audio paths in MongoDB vs files on disk.
 *
 * Run from backend: npm run uploads:check
 */
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const feedbackSchema = new mongoose.Schema({}, { strict: false });
const Feedback =
  mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

function collectPaths(row) {
  const paths = new Set();
  if (row.voiceRecordingRelPath) {
    paths.add(String(row.voiceRecordingRelPath).replace(/^\/+/, ""));
  }
  for (const answer of row.botConversationAnswers || []) {
    const rel = answer?.audioRelPath;
    if (rel) paths.add(String(rel).replace(/^\/+/, ""));
  }
  return [...paths];
}

async function fileExists(rel) {
  try {
    await fs.access(path.join(UPLOADS_ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const rows = await Feedback.find({
    $or: [
      { voiceRecordingRelPath: { $type: "string", $ne: "" } },
      { "botConversationAnswers.audioRelPath": { $type: "string", $ne: "" } },
    ],
  }).lean();

  const allPaths = new Set();
  for (const row of rows) {
    for (const p of collectPaths(row)) allPaths.add(p);
  }

  const sorted = [...allPaths].sort();
  let present = 0;
  let missing = 0;
  const missingList = [];

  for (const rel of sorted) {
    if (await fileExists(rel)) {
      present += 1;
    } else {
      missing += 1;
      missingList.push(rel);
    }
  }

  // eslint-disable-next-line no-console
  console.log("[uploads:check]", {
    uploadsRoot: UPLOADS_ROOT,
    dbPaths: sorted.length,
    present,
    missing,
  });

  if (missingList.length) {
    // eslint-disable-next-line no-console
    console.log("Missing files:");
    for (const rel of missingList.slice(0, 50)) {
      // eslint-disable-next-line no-console
      console.log(`  - ${rel}`);
    }
    if (missingList.length > 50) {
      // eslint-disable-next-line no-console
      console.log(`  ... and ${missingList.length - 50} more`);
    }
  }

  await mongoose.disconnect();
  process.exit(missing > 0 ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
