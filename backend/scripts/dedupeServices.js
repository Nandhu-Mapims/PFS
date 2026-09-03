/**
 * Removes case-duplicate routing-service catalog entries, but only the half
 * of each duplicate pair that has no HOD assigned — e.g. "OP billing" (no
 * HOD) next to "OP Billing" (HOD: manikandan.s). A service with no HOD that
 * is NOT a duplicate of anything is left alone; this only touches groups
 * where the same service name (case/punctuation-insensitive) appears more
 * than once. Mirrors dedupeDepartments.js exactly, same safety rules.
 *
 * Any User whose serviceId points at a duplicate being deleted is repointed
 * to the surviving (HOD-assigned) service first, so no account is left with
 * a dangling reference.
 *
 * Ambiguous groups are reported and left untouched, never guessed at:
 *   - more than one member already has an HOD assigned
 *   - every member is missing an HOD (nothing safe to prefer)
 *   - more than two members share the same normalized name
 *
 *   npm run dedupe-services               # dry run — report only
 *   npm run dedupe-services -- --apply     # actually delete + repoint
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { RoutingService, User, mongoose } = await import("../src/models.js");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

/** Same normalization the app itself uses to match labels (index.js labelKey). */
function labelKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function main() {
  const apply = process.argv.includes("--apply");

  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log("[dedupe] connected:", mongoose.connection.db.databaseName, apply ? "(APPLY)" : "(dry run)");

  const services = await RoutingService.find({}, { name: 1, hodUserId: 1 }).lean();

  const groups = new Map();
  for (const svc of services) {
    const key = labelKey(svc.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(svc);
  }

  let deleted = 0;
  let repointed = 0;
  let skipped = 0;

  for (const [key, members] of groups) {
    if (members.length < 2) continue;

    const withHod = members.filter((m) => m.hodUserId);
    const withoutHod = members.filter((m) => !m.hodUserId);

    if (members.length > 2 || withHod.length !== 1 || withoutHod.length !== 1) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[dedupe] SKIP "${key}" — ${members.length} member(s), ${withHod.length} with HOD: ` +
          members.map((m) => `${m.name}${m.hodUserId ? " (HOD)" : ""}`).join(", ")
      );
      continue;
    }

    const survivor = withHod[0];
    const duplicate = withoutHod[0];

    // eslint-disable-next-line no-console
    console.log(`[dedupe] "${duplicate.name}" (no HOD) -> merge into "${survivor.name}" (HOD assigned)`);

    if (apply) {
      const repointResult = await User.updateMany(
        { serviceId: duplicate._id },
        { $set: { serviceId: survivor._id } }
      );
      repointed += repointResult.modifiedCount || 0;
      await RoutingService.deleteOne({ _id: duplicate._id });
      deleted += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[dedupe] ${apply ? "deleted" : "would delete"} ${deleted} duplicate(s), ` +
      `${apply ? "repointed" : "would repoint"} ${repointed} user(s), skipped ${skipped} ambiguous group(s)`
  );
  if (!apply) {
    // eslint-disable-next-line no-console
    console.log("[dedupe] dry run only — re-run with --apply to make these changes.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("[dedupe]", err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
