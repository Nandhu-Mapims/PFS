/**
 * Reset the password on any existing account.
 *
 * Passwords are stored as bcrypt hashes, so a forgotten one cannot be read back
 * — it can only be replaced. seedSuperadmin.js covers the Super Admin; this
 * covers everyone else (management, HODs, staff).
 *
 * The account's role and mappings are left untouched — only the hash changes.
 *
 *   npm run reset-password -- --username management --password 'S3cret!'
 *   npm run reset-password -- --list            # show accounts and roles
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { User, mongoose } = await import("../src/models.js");

/** Matches the minimum the Add user form enforces, so both paths agree. */
const MIN_PASSWORD_LENGTH = 6;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function listAccounts() {
  const users = await User.find({}, { username: 1, role: 1 }).sort({
    role: 1,
    username: 1,
  });
  // eslint-disable-next-line no-console
  console.log(`[reset] ${users.length} accounts:`);
  for (const user of users) {
    // eslint-disable-next-line no-console
    console.log(`  ${String(user.role).padEnd(12)} ${user.username}`);
  }
}

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

async function main() {
  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log("[reset] connected:", mongoose.connection.db.databaseName);

  if (process.argv.includes("--list")) {
    await listAccounts();
    await mongoose.disconnect();
    return;
  }

  const username = String(argValue("--username") || "")
    .trim()
    .toLowerCase();
  const password = String(argValue("--password") || "");

  if (!username) {
    throw new Error("No username given. Pass --username '<value>', or --list to see accounts.");
  }
  if (!password) {
    throw new Error("No password given. Pass --password '<value>'.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const user = await User.findOne({ username });
  if (!user) {
    await listAccounts();
    throw new Error(`No user named "${username}" — pick one of the accounts above.`);
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  // eslint-disable-next-line no-console
  console.log(`[reset] password updated for "${username}" (role ${user.role}, unchanged)`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("[reset]", err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
