/**
 * Seeds hospital departments (100+) and initial admin/staff users.
 * Run from backend folder: npm run seed
 *
 * Departments: skips names already in the database (idempotent).
 * Users: creates admin/staff only if those usernames do not exist.
 *
 * Configure SEED_* vars in .env (see .env.example).
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import path from "path";
import { HOSPITAL_DEPARTMENTS } from "./data/hospitalDepartments.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/feedbacksystem";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], required: true },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
  },
  { timestamps: true }
);

const Department =
  mongoose.models.Department || mongoose.model("Department", departmentSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

async function main() {
  const adminUsername = (process.env.SEED_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const staffUsername = (process.env.SEED_STAFF_USERNAME || "staff").trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const staffPassword = process.env.SEED_STAFF_PASSWORD || "staff123";

  await mongoose.connect(MONGODB_URI);
  const salt = await bcrypt.genSalt(10);

  const existing = await Department.find().select("name").lean();
  const existingNames = new Set(
    existing.map((d) => String(d.name).trim().toLowerCase())
  );
  const toInsert = HOSPITAL_DEPARTMENTS.filter(
    (d) => !existingNames.has(String(d.name).trim().toLowerCase())
  );
  if (toInsert.length > 0) {
    await Department.insertMany(toInsert, { ordered: false });
  }
  console.log(
    `Departments: added ${toInsert.length} new (total in seed list: ${HOSPITAL_DEPARTMENTS.length}, already in DB: ${existing.length}).`
  );

  let usersCreated = 0;

  const existingAdmin = await User.findOne({ username: adminUsername });
  if (!existingAdmin) {
    await User.create({
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, salt),
      role: "admin",
      departmentId: null,
    });
    usersCreated += 1;
    console.log(`Created user: ${adminUsername} (admin)`);
  } else {
    console.log(`Skipped admin — "${adminUsername}" already exists`);
  }

  const existingStaff = await User.findOne({ username: staffUsername });
  if (!existingStaff) {
    await User.create({
      username: staffUsername,
      passwordHash: await bcrypt.hash(staffPassword, salt),
      role: "staff",
      departmentId: null,
    });
    usersCreated += 1;
    console.log(`Created user: ${staffUsername} (staff)`);
  } else {
    console.log(`Skipped staff — "${staffUsername}" already exists`);
  }

  await mongoose.disconnect();
  console.log(
    usersCreated > 0
      ? `Done. Created ${usersCreated} new user(s).`
      : "Done. No new users."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
