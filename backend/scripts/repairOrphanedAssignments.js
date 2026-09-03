/**
 * Clear ticket assignments that point at deleted users.
 *
 * DELETE /api/users/:id removes the user and clears their department/service
 * catalog mappings, but leaves feedback.assignedToUserId dangling. Those tickets
 * then belong to nobody: they never appear in any HOD queue, yet still read as
 * "assigned" on the admin board, so they silently fall out of the workflow.
 *
 * This unassigns them (back to the New/unassigned pool) so an admin can route
 * them to a real HOD.
 *
 * Dry run (default):  npm run repair-orphan-assignments
 * Apply changes:      npm run repair-orphan-assignments -- --yes
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

const APPLY = process.argv.includes("--yes");

const looseSchema = new mongoose.Schema({}, { strict: false });
const Feedback =
  mongoose.models.Feedback || mongoose.model("Feedback", looseSchema);
const User = mongoose.models.User || mongoose.model("User", looseSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log("[orphan-assign] connected:", mongoose.connection.db.databaseName);

  const userIds = new Set(
    (await User.find({}, { _id: 1 }).lean()).map((u) => String(u._id))
  );

  const assigned = await Feedback.find(
    { assignedToUserId: { $ne: null } },
    { assignedToUserId: 1, assignedToUsername: 1, ticketId: 1, department: 1, status: 1 }
  ).lean();

  const orphans = assigned.filter(
    (row) => !userIds.has(String(row.assignedToUserId))
  );

  // eslint-disable-next-line no-console
  console.log("[orphan-assign] scanned", {
    assignedTickets: assigned.length,
    liveUsers: userIds.size,
    orphaned: orphans.length,
  });

  for (const row of orphans) {
    // eslint-disable-next-line no-console
    console.log("  orphan:", {
      id: String(row._id),
      ticketId: row.ticketId || null,
      department: row.department || "",
      status: row.status,
      staleAssignee: row.assignedToUsername || String(row.assignedToUserId),
    });
  }

  if (!orphans.length) {
    // eslint-disable-next-line no-console
    console.log("[orphan-assign] nothing to repair");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    // eslint-disable-next-line no-console
    console.log(
      `[orphan-assign] DRY RUN — re-run with --yes to unassign these ${orphans.length} ticket(s)`
    );
    await mongoose.disconnect();
    return;
  }

  const result = await Feedback.updateMany(
    { _id: { $in: orphans.map((row) => row._id) } },
    {
      $set: {
        assignedToUserId: null,
        assignedToUsername: "",
        assignedAt: null,
      },
    }
  );

  // eslint-disable-next-line no-console
  console.log("[orphan-assign] done", { unassigned: result.modifiedCount });
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
