/**
 * Unit test for sanitizePatientName — no DB/network needed.
 * Usage: node scripts/testSanitizePatientName.js
 */
import assert from "node:assert/strict";
import { sanitizePatientName } from "../src/fieldSanitize.js";

const cases = [
  ["Mrs.MEHARAJ", "Mrs.MEHARAJ"],
  ["Mr.RAJESH", "Mr.RAJESH"],
  ["Dr. JOHN PETER", "Dr. JOHN PETER"],
  ['<a href="javascript:test()">Ms.MAHALAKHMI</a>', "Ms.MAHALAKHMI"],
  ["<div><a href=\"#\">Mrs.KALA</a></div>", "Mrs.KALA"],
  ["   Ms.SAITHANI BEE", "Ms.SAITHANI BEE"],
  [
    `<div style="display:flex;justify-content: space-between;align-items: center;"><a href="javascript:fnViewDataURL('PATIENT DETAIL','../FrontOfficeCS/PatientDemographic.aspx?patid=5218138')">Ms.MAHALAKHMI</a>`,
    "Ms.MAHALAKHMI",
  ],
  ["Tom &amp; Jerry", "Tom & Jerry"],
  ["<script>alert(1)</script>Ms.KALA", "Ms.KALA"],
  ["", ""],
  [null, ""],
  [undefined, ""],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = sanitizePatientName(input);
  try {
    assert.equal(actual, expected);
    console.log(`PASS  ${JSON.stringify(input)} -> ${JSON.stringify(actual)}`);
  } catch {
    failed += 1;
    console.error(`FAIL  ${JSON.stringify(input)} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} tests passed`);
