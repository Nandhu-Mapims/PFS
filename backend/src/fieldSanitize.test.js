import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePatientName } from "./fieldSanitize.js";

test("plain name is unchanged", () => {
  assert.equal(sanitizePatientName("Mrs.MEHARAJ"), "Mrs.MEHARAJ");
});

test("HTML anchor extracts visible text", () => {
  assert.equal(
    sanitizePatientName(
      `<a href="javascript:fnViewDataURL('PATIENT DETAIL','../FrontOfficeCS/PatientDemographic.aspx?patid=5218138')">Ms.MAHALAKHMI</a>`
    ),
    "Ms.MAHALAKHMI"
  );
});

test("HTML div + anchor extracts visible text", () => {
  assert.equal(sanitizePatientName('<div><a href="#">Mrs.KALA</a></div>'), "Mrs.KALA");
});

test("leading and trailing whitespace is trimmed", () => {
  assert.equal(sanitizePatientName("   Ms.SAITHANI BEE"), "Ms.SAITHANI BEE");
});

test("HIS flex-div wrapper extracts visible name", () => {
  assert.equal(
    sanitizePatientName(
      `<div style="display:flex;justify-content: space-between;align-items: center;"><a href="javascript:fnViewDataURL('PATIENT DETAIL','../FrontOfficeCS/PatientDemographic.aspx?patid=5218138')">Ms.MAHALAKHMI</a>`
    ),
    "Ms.MAHALAKHMI"
  );
});

test("honorifics with spaces are preserved", () => {
  assert.equal(sanitizePatientName("Dr. JOHN PETER"), "Dr. JOHN PETER");
  assert.equal(sanitizePatientName("Mr.RAJESH"), "Mr.RAJESH");
});

test("nullish and empty become empty string", () => {
  assert.equal(sanitizePatientName(null), "");
  assert.equal(sanitizePatientName(undefined), "");
  assert.equal(sanitizePatientName(""), "");
});
