/** Build Mongo filter for insights list queries (date window + OP/IP/name-only). */

export function buildFeedbackInsightsFilter(query = {}) {
  const filter = {};
  const startMs = Number(query.startMs);
  const endMs = Number(query.endMs);

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= endMs) {
    filter.createdAt = {
      $gte: new Date(startMs),
      $lte: new Date(endMs),
    };
  }

  const sinceMs = Number(query.sinceMs);
  if (Number.isFinite(sinceMs) && sinceMs > 0) {
    filter.updatedAt = { $gte: new Date(sinceMs) };
  }

  const encounter = String(query.encounter || "all").toLowerCase();
  if (encounter === "op") {
    filter.patientEncounterType = "op";
  } else if (encounter === "ip") {
    filter.patientEncounterType = "ip";
  } else if (encounter === "op-ip") {
    filter.patientEncounterType = { $in: ["op", "ip"] };
  } else if (encounter === "name-only") {
    filter.patientEncounterType = { $nin: ["op", "ip"] };
  }

  return filter;
}

export function hasInsightsFilterQuery(query = {}) {
  return (
    (Number.isFinite(Number(query.startMs)) && Number.isFinite(Number(query.endMs))) ||
    (Number.isFinite(Number(query.sinceMs)) && Number(query.sinceMs) > 0) ||
    ["op", "ip", "op-ip", "name-only"].includes(String(query.encounter || "").toLowerCase())
  );
}
