/**
 * Drops the entire MongoDB database named in MONGODB_URI (destructive).
 *
 *   node scripts/resetDatabase.js --yes
 *
 * After reset: start the API once (creates departments + branding), then run seed users.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

const confirmed =
  process.argv.includes("--yes") || process.argv.includes("-y");

async function main() {
  if (!confirmed) {
    console.error(
      "This will DROP the whole database. To confirm, run:\n" +
        "  node scripts/resetDatabase.js --yes"
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.db.databaseName;
  // eslint-disable-next-line no-console
  console.warn(`Dropping database: ${dbName}`);
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  // eslint-disable-next-line no-console
  console.log("Database reset complete.");
  // eslint-disable-next-line no-console
  console.log("Next: npm start (or dev) to recreate defaults; then npm run seed for admin/staff.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
