/**
 * Create (or promote) the Super Admin account.
 *
 * The Super Admin owns role and permission management — no other role can grant
 * roles.manage, so this account has to be created out-of-band.
 *
 *   npm run seed-superadmin                       # uses SEED_SUPERADMIN_* from .env
 *   npm run seed-superadmin -- --username boss --password 'S3cret!'
 *   npm run seed-superadmin -- --promote admin    # promote an existing user
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Role, User, mongoose } = await import("../src/models.js");
const { ensureRolesSeeded, refreshRoleCache, SUPERADMIN_ROLE } = await import(
  "../src/roles.js"
);

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

async function main() {
  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log("[superadmin] connected:", mongoose.connection.db.databaseName);

  await ensureRolesSeeded();
  await refreshRoleCache();
  const roleCount = await Role.countDocuments();
  // eslint-disable-next-line no-console
  console.log("[superadmin] roles available:", roleCount);

  const promoteTarget = argValue("--promote");
  if (promoteTarget) {
    const username = String(promoteTarget).trim().toLowerCase();
    const user = await User.findOne({ username });
    if (!user) {
      throw new Error(`No user named "${username}" — create it first or omit --promote.`);
    }
    user.role = SUPERADMIN_ROLE;
    await user.save();
    // eslint-disable-next-line no-console
    console.log(`[superadmin] promoted existing user "${username}" to ${SUPERADMIN_ROLE}`);
    await mongoose.disconnect();
    return;
  }

  const username = String(
    argValue("--username") || process.env.SEED_SUPERADMIN_USERNAME || "superadmin"
  )
    .trim()
    .toLowerCase();
  const password = String(
    argValue("--password") || process.env.SEED_SUPERADMIN_PASSWORD || ""
  );

  if (!password) {
    throw new Error(
      "No password given. Pass --password '<value>' or set SEED_SUPERADMIN_PASSWORD in backend/.env."
    );
  }
  if (password.length < 8) {
    throw new Error("Super Admin password must be at least 8 characters.");
  }

  const existing = await User.findOne({ username });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    existing.role = SUPERADMIN_ROLE;
    existing.passwordHash = passwordHash;
    await existing.save();
    // eslint-disable-next-line no-console
    console.log(`[superadmin] updated "${username}" (role + password reset)`);
  } else {
    await User.create({
      username,
      passwordHash,
      role: SUPERADMIN_ROLE,
      departmentId: null,
      serviceId: null,
    });
    // eslint-disable-next-line no-console
    console.log(`[superadmin] created "${username}"`);
  }

  const total = await User.countDocuments({ role: SUPERADMIN_ROLE });
  // eslint-disable-next-line no-console
  console.log(`[superadmin] super admins in system: ${total}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[superadmin]", err.message || err);
  process.exit(1);
});
