/**
 * Clears app data in MongoDB and loads demo departments, routing services, and sample feedback.
 *
 *   npm run seed-mock
 *   npm run seed-mock -- --yes   (skip confirmation)
 */
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SEED_DEPARTMENTS,
  SEED_ROUTING_SERVICES,
  buildSeedFeedback,
} from "../src/mockData.js";
import {
  Branding,
  Department,
  Feedback,
  RoutingService,
  User,
  mongoose,
} from "../src/models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

const confirmed =
  process.argv.includes("--yes") || process.argv.includes("-y");

async function seedUsers() {
  const adminUsername = (process.env.SEED_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const staffUsername = (process.env.SEED_STAFF_USERNAME || "staff").trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const staffPassword = process.env.SEED_STAFF_PASSWORD || "staff123";
  const salt = await bcrypt.genSalt(10);
  const emergency = await Department.findOne({ name: "Emergency" }).lean();

  const users = [
    {
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, salt),
      role: "admin",
      departmentId: null,
    },
    {
      username: staffUsername,
      passwordHash: await bcrypt.hash(staffPassword, salt),
      role: "staff",
      departmentId: emergency?._id || null,
    },
  ];

  for (const row of users) {
    await User.create(row);
  }
  return users.map((u) => u.username);
}

async function main() {
  if (!confirmed) {
    console.error(
      "This will DELETE all feedback, departments, routing services, users, and branding.\n" +
        "Run:  npm run seed-mock -- --yes"
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.db.databaseName;

  console.warn(`[seed-mock] Clearing data in database: ${dbName}`);

  await Promise.all([
    Feedback.deleteMany({}),
    RoutingService.deleteMany({}),
    Department.deleteMany({}),
    User.deleteMany({}),
    Branding.deleteMany({}),
  ]);

  await Department.insertMany(SEED_DEPARTMENTS);
  await RoutingService.insertMany(SEED_ROUTING_SERVICES);

  const feedbackRows = buildSeedFeedback().map((row) => ({
    ...row,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    aiAnalyzedAt: row.aiAnalyzedAt ? new Date(row.aiAnalyzedAt) : null,
  }));
  await Feedback.insertMany(feedbackRows);

  await Branding.create({
    key: "global",
    primaryColor: "#2A6FDB",
    accentColor: "#2FBF71",
    pageBackgroundColor: "#F5F7FA",
    logoDataUrl: null,
    voiceRecordingMaxSeconds: 120,
    botThinkSeconds: 3,
  });

  const usernames = await seedUsers();

  const counts = {
    departments: await Department.countDocuments(),
    services: await RoutingService.countDocuments(),
    feedback: await Feedback.countDocuments(),
    users: await User.countDocuments(),
  };

  console.log("[seed-mock] Done.", counts);
  console.log("[seed-mock] Logins:", usernames.join(", "), "(default passwords in .env.example)");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
