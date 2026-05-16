/**
 * Smoke-test EMR patient lookup from the shell (uses backend/.env).
 * Usage: node scripts/testEmrLookup.js 4857073
 */
import dotenv from "dotenv";
import { lookupPatientRecords } from "../src/emrPatientLookup.js";

dotenv.config();

const regNo = process.argv[2] || "4857073";

async function main() {
  try {
    const out = await lookupPatientRecords({ regNo });
    console.log("frmDate:", out.frmDate, "toDate:", out.toDate);
    console.log("matches:", out.matches.length);
    console.log(JSON.stringify(out.matches.slice(0, 5), null, 2));
  } catch (e) {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
