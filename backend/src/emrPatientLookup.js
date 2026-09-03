import { extractObjectRows } from "./csvExcel.js";
import { sanitizeOptionalLabel } from "./fieldSanitize.js";

const DEFAULT_EMR_URL =
  "http://emr.mapims.edu.in/BB15SE/QueryBuilder/wsQueryBuilder.asmx/Getdataset1";

function sqlLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

/**
 * Date literals for @frmdate / @todate must match the SQL Server session language.
 * US English commonly expects MM/DD/YYYY (matches the original MapIMS snippet). Using DD/MM
 * with US parsing breaks when the day is >12 (e.g. 16/05/… → “month 16”) and yields HTTP 500.
 */
function sqlDateOrder() {
  const v = String(process.env.EMR_SQL_DATE_ORDER || "mdy")
    .trim()
    .toLowerCase();
  return v === "dmy" ? "dmy" : "mdy";
}

function formatSqlCalendarDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return sqlDateOrder() === "dmy"
    ? `${dd}/${mm}/${yyyy}`
    : `${mm}/${dd}/${yyyy}`;
}

function defaultLookbackDays() {
  const n = Number(process.env.EMR_LOOKUP_LOOKBACK_DAYS);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 3650);
  return 90;
}

/**
 * When the UI omits dates, search from (today − lookback) through today so recent visits are included.
 * Optional frm/to from the client are passed through as typed (must match EMR_SQL_DATE_ORDER).
 */
function resolveDateRange(frmDate, toDate) {
  const envFrom = process.env.EMR_FRMDATE?.trim() || process.env.FRMDATE?.trim();
  const envTo = process.env.EMR_TODATE?.trim() || process.env.TODATE?.trim();
  const reqFrm = frmDate && String(frmDate).trim();
  const reqTo = toDate && String(toDate).trim();
  const todayStr = formatSqlCalendarDate(new Date());

  if (reqFrm || reqTo) {
    const from = reqFrm || envFrom || todayStr;
    const to = reqTo || envTo || from;
    return { frmDate: from, toDate: to };
  }

  if (envFrom || envTo) {
    const from = envFrom || todayStr;
    const to = envTo || from;
    return { frmDate: from, toDate: to };
  }

  const start = new Date();
  start.setDate(start.getDate() - defaultLookbackDays());
  return { frmDate: formatSqlCalendarDate(start), toDate: todayStr };
}

export function isEmrPatientLookupEnabled() {
  return process.env.EMR_PATIENT_LOOKUP_DISABLED !== "true";
}

function buildOpQuery({ frmDate, toDate, regno, patname }) {
  const r = sqlLiteral(regno ?? "");
  const p = sqlLiteral(patname ?? "");
  return (
    `Use kmch_frontoffice Exec Fo_Rpt_OPPatdetailsprint_QB  @frmdate = ${sqlLiteral(frmDate)} , @todate = ${sqlLiteral(toDate)} , ` +
    `@regno = ${r} , @patname = ${p} , @docid = '0' , @IncludingDirectIP = '1' , @Visittype = '0' , @PatType = '0' , ` +
    `@MatrixFormat = '0' , @ReferredSource = '0' , @Type = '0' , @ClassId = '0' , @CorporateId = '0' , ` +
    `@Corporate_type = '0' , @depid = '0' , @RefDocCity = '0' , @ReligionId = '0' , @RefDocDays = '0' , ` +
    `@RefDocId = '0' , @VisitCategory = '' `
  );
}

function buildIpQuery({ frmDate, toDate, regno, patname }) {
  const r = sqlLiteral(regno ?? "");
  const p = sqlLiteral(patname ?? "");
  return (
    `Use kmch_frontoffice EXEC Fo_Rpt_IPPatdetailsprint_QB  @frmdate = ${sqlLiteral(frmDate)} , @todate = ${sqlLiteral(toDate)} , ` +
    `@patname = ${p} , @regno = ${r} , @ipno = '' , @docid = '0' , @MatrixFormat = '0' , @wardid = '0' , ` +
    `@Status = '0' , @PatType = '0' , @Corporate_type = '0' , @depid = '0' , @BedId = '0' , ` +
    `@RegDocCity = '0' , @optoip = '0' , @ReligionId = '0' , @RefDocDays = '0' , @VisitCategory = '' , ` +
    `@CorporateId = '' , @unit = '0' , @grpby = '0' `
  );
}

function normKey(k) {
  return String(k || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {Record<string, unknown>} row */
function getFromRow(row, ...aliases) {
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), v);
  }
  for (const a of aliases) {
    const v = map.get(normKey(a));
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseLooseDate(s) {
  const raw = String(s || "").trim();
  if (!raw) return 0;
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    const year = Number(dmy[3]);
    const ms = new Date(year, month, day).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** @param {Record<string, unknown>} row */
function mapOpRow(row, frmDate, toDate) {
  const regNo = getFromRow(row, "REG NO", "REGNO", "REG_NO");
  const patientName = getFromRow(row, "NAME", "PATIENT NAME");
  const department = sanitizeOptionalLabel(getFromRow(row, "DEPARTMENT"));
  const ward = getFromRow(row, "WARD");
  const patientType = getFromRow(row, "PATIENT TYPE");
  const tokenNo = getFromRow(row, "TOKEN NO");
  const visitDate = getFromRow(row, "VISIT DATE");
  const ipNo = "";
  const sortKey = parseLooseDate(visitDate);
  return {
    encounterType: /** @type {"op"} */ ("op"),
    regNo,
    patientName,
    department,
    ward,
    patientType,
    ipNo,
    visitDate,
    admissionDate: "",
    tokenNo,
    sortKey,
    frmDate,
    toDate,
  };
}

/** @param {Record<string, unknown>} row */
function mapIpRow(row, frmDate, toDate) {
  const regNo = getFromRow(row, "REG NO", "REGNO", "REG_NO");
  const patientName = getFromRow(row, "PATIENT NAME", "NAME");
  const department = sanitizeOptionalLabel(getFromRow(row, "DEPARTMENT"));
  const ward = getFromRow(row, "WARD");
  const patientType = getFromRow(row, "PATIENT TYPE");
  const ipNo = getFromRow(row, "IP NO");
  const admissionDate = getFromRow(row, "ADMISSION DATE");
  const visitDate = admissionDate;
  const tokenNo = "";
  const sortKey = parseLooseDate(admissionDate);
  return {
    encounterType: /** @type {"ip"} */ ("ip"),
    regNo,
    patientName,
    department,
    ward,
    patientType,
    ipNo,
    visitDate,
    admissionDate,
    tokenNo,
    sortKey,
    frmDate,
    toDate,
  };
}

function summarizeEmrFailure(status, text, json) {
  const j = json && typeof json === "object" ? json : {};
  const asp =
    j.Message ||
    j.ExceptionMessage ||
    j.message ||
    j["soap:Reason"]?.text ||
    j.fault?.faultstring;
  const hint = typeof asp === "string" && asp.trim() ? asp.trim().slice(0, 400) : "";
  const stripHtml = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const body = hint || stripHtml(String(text || "").slice(0, 500));
  return body ? `EMR HTTP ${status}: ${body}` : `EMR HTTP ${status}`;
}

async function fetchEmrRows(strQuery) {
  const url = process.env.EMR_QUERY_BUILDER_URL?.trim() || DEFAULT_EMR_URL;
  const strCon = process.env.EMR_STR_CON?.trim() || "BB_CONSTR";
  const headers = { "Content-Type": "application/json; charset=UTF-8" };
  const cookie = process.env.EMR_COOKIE?.trim();
  if (cookie) headers.Cookie = cookie;

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ strCon, strQuery }),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }

    if (!res.ok) {
      throw new Error(summarizeEmrFailure(res.status, text, json));
    }

    const d = json?.d;
    let parsed = d;
    if (typeof d === "string") {
      try {
        parsed = JSON.parse(d);
      } catch {
        throw new Error("EMR returned non-JSON dataset payload");
      }
    }
    return extractObjectRows(parsed);
  } finally {
    clearTimeout(tid);
  }
}

/**
 * @param {{ regNo?: string; patientName?: string; frmDate?: string; toDate?: string }} params
 */
export async function lookupPatientRecords(params) {
  const regNo = String(params.regNo || "").trim();
  const patientName = String(params.patientName || "").trim();

  if (!regNo && !patientName) {
    const err = new Error("Provide either regNo (UHID) or patientName for lookup.");
    err.code = "VALIDATION";
    throw err;
  }

  const { frmDate, toDate } = resolveDateRange(params.frmDate, params.toDate);

  const opQuery =
    regNo || patientName
      ? buildOpQuery({
          frmDate,
          toDate,
          regno: regNo,
          patname: regNo ? "" : patientName,
        })
      : null;

  const ipQuery =
    regNo || patientName
      ? buildIpQuery({
          frmDate,
          toDate,
          regno: regNo,
          patname: regNo ? "" : patientName,
        })
      : null;

  /** Run OP and IP separately so one failing proc does not blank the other. */
  let opRaw = [];
  let ipRaw = [];
  /** @type {string[]} */
  const partialErrors = [];

  if (opQuery) {
    try {
      opRaw = await fetchEmrRows(opQuery);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      partialErrors.push(`OP: ${msg}`);
      // eslint-disable-next-line no-console
      console.error("[patient lookup] OP query failed", { message: msg });
    }
  }

  if (ipQuery) {
    try {
      ipRaw = await fetchEmrRows(ipQuery);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      partialErrors.push(`IP: ${msg}`);
      // eslint-disable-next-line no-console
      console.error("[patient lookup] IP query failed", { message: msg });
    }
  }

  if (!opRaw.length && !ipRaw.length && partialErrors.length) {
    const err = new Error(partialErrors.join(" | "));
    throw err;
  }

  const opMatches = opRaw.map((row, idx) => {
    const m = mapOpRow(row, frmDate, toDate);
    return { ...m, key: `op:${idx}:${m.regNo}:${m.visitDate}:${m.tokenNo}:${m.sortKey}` };
  });
  const ipMatches = ipRaw.map((row, idx) => {
    const m = mapIpRow(row, frmDate, toDate);
    return { ...m, key: `ip:${idx}:${m.regNo}:${m.ipNo}:${m.admissionDate}:${m.sortKey}` };
  });

  const matches = [...opMatches, ...ipMatches].sort((a, b) => b.sortKey - a.sortKey);

  return {
    frmDate,
    toDate,
    matches,
  };
}

/**
 * First-time department bootstrap for feedback form dropdowns.
 * Pulls distinct non-empty department labels from recent OP/IP EMR rows.
 *
 * @param {{ frmDate?: string; toDate?: string }} [params]
 * @returns {Promise<string[]>}
 */
export async function listEmrDepartments(params = {}) {
  const { frmDate, toDate } = resolveDateRange(params.frmDate, params.toDate);
  const opQuery = buildOpQuery({ frmDate, toDate, regno: "", patname: "" });
  const ipQuery = buildIpQuery({ frmDate, toDate, regno: "", patname: "" });

  let opRows = [];
  let ipRows = [];
  try {
    opRows = await fetchEmrRows(opQuery);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[emr departments] OP query failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    ipRows = await fetchEmrRows(ipQuery);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[emr departments] IP query failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const labels = [...opRows, ...ipRows]
    .map((row) => sanitizeOptionalLabel(getFromRow(row, "DEPARTMENT")))
    .filter(Boolean);
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}
