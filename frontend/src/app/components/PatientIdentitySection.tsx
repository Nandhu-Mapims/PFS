import type { FocusEvent } from "react";
import { DepartmentSearchSelect } from "./DepartmentSearchSelect";
import { displayOptionalLabel } from "../lib/fieldSanitize";
import type { PatientIdentityState } from "../lib/usePatientIdentity";

type PatientIdentitySectionProps = {
  identity: PatientIdentityState;
  primaryColor: string;
  /** Hide mode toggle when only one mode is needed */
  showModeToggle?: boolean;
  compact?: boolean;
};

export function PatientIdentitySection({
  identity,
  primaryColor,
  showModeToggle = true,
  compact = false,
}: PatientIdentitySectionProps) {
  const primaryTint = `${primaryColor}1A`;
  const readonlyBox =
    "w-full min-h-[56px] p-4 text-lg border-2 border-gray-200 rounded-2xl bg-gray-50 text-gray-800";
  const inputClass = compact
    ? "w-full p-4 text-lg border-2 border-gray-300 rounded-xl outline-none transition-all"
    : "w-full p-4 text-lg border-2 border-gray-300 rounded-2xl outline-none transition-all";

  const focusHandlers = {
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = primaryColor;
      e.currentTarget.style.boxShadow = `0 0 0 4px ${primaryColor}33`;
    },
    onBlur: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = "";
      e.currentTarget.style.boxShadow = "none";
    },
  };

  return (
    <div className={compact ? "space-y-4" : "mb-8"}>
      {showModeToggle ? (
        <div className={compact ? "" : "mb-8"}>
          <p
            className={`text-sm font-semibold text-gray-700 mb-3 ${
              compact ? "" : "text-center md:text-left"
            }`}
          >
            How should we identify you?
          </p>
          <div className={`flex flex-wrap gap-2 ${compact ? "" : "justify-center md:justify-start"}`}>
            <button
              type="button"
              onClick={() => identity.setIdentificationMode("name")}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                identity.identificationMode === "name"
                  ? "text-white shadow-md"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
              style={
                identity.identificationMode === "name"
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : undefined
              }
            >
              Name only
            </button>
            <button
              type="button"
              onClick={() => identity.setIdentificationMode("uhid")}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                identity.identificationMode === "uhid"
                  ? "text-white shadow-md"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
              style={
                identity.identificationMode === "uhid"
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : undefined
              }
            >
              UHID / EMR look up
            </button>
          </div>
        </div>
      ) : null}

      {identity.identificationMode === "uhid" && (
        <div
          className={`space-y-4 rounded-2xl border-2 border-gray-200 p-4 md:p-5 bg-gray-50/80 ${
            compact ? "" : "mb-8"
          }`}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={identity.uhidInput}
              onChange={(e) => identity.setUhidInput(e.target.value)}
              placeholder="Hospital registration no. (UHID)"
              className={`flex-1 ${inputClass} bg-white`}
              {...focusHandlers}
            />
            <button
              type="button"
              onClick={() => void identity.runPatientLookup()}
              disabled={identity.lookupLoading}
              className="sm:w-44 py-4 rounded-2xl font-bold text-white shadow-md disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {identity.lookupLoading ? "Searching…" : "Look up"}
            </button>
          </div>
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer font-semibold text-gray-700">
              Optional date range (usually MM/DD/YYYY — match hospital SQL)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <input
                type="text"
                value={identity.lookupFrmDate}
                onChange={(e) => identity.setLookupFrmDate(e.target.value)}
                placeholder="From — MM/DD/YYYY"
                className="p-3 border-2 border-gray-300 rounded-xl bg-white outline-none"
              />
              <input
                type="text"
                value={identity.lookupToDate}
                onChange={(e) => identity.setLookupToDate(e.target.value)}
                placeholder="To — MM/DD/YYYY"
                className="p-3 border-2 border-gray-300 rounded-xl bg-white outline-none"
              />
            </div>
            <p className="text-xs mt-2">
              Leave both blank to search the default window on the server (typically the last several
              weeks through today).
            </p>
          </details>

          {identity.lookupRangeLabel ? (
            <p className="text-xs text-gray-500">
              Query range sent to EMR:{" "}
              <span className="font-mono">{identity.lookupRangeLabel}</span>
            </p>
          ) : null}

          {identity.lookupMatches.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">Select your visit (from EMR)</p>
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {identity.lookupMatches.map((m) => (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => identity.onPickMatch(m)}
                      className={`w-full text-left rounded-xl border-2 p-3 transition-all text-sm ${
                        identity.selectedMatchKey === m.key
                          ? "shadow-md"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                      style={
                        identity.selectedMatchKey === m.key
                          ? { borderColor: primaryColor, backgroundColor: primaryTint }
                          : undefined
                      }
                    >
                      <span className="font-bold text-gray-900 uppercase">{m.encounterType}</span>
                      <span className="text-gray-500"> · </span>
                      <span className="text-gray-800">{m.patientName || "—"}</span>
                      <span className="text-gray-500"> · </span>
                      {displayOptionalLabel(m.department) !== "—" ? (
                        <span className="text-gray-800">{displayOptionalLabel(m.department)}</span>
                      ) : null}
                      {m.ward ? (
                        <>
                          <span className="text-gray-500"> · Ward </span>
                          <span className="text-gray-800">{m.ward}</span>
                        </>
                      ) : null}
                      <div className="text-xs text-gray-600 mt-1">
                        {m.encounterType === "ip"
                          ? m.admissionDate
                            ? `Admitted ${m.admissionDate}`
                            : "Inpatient"
                          : m.visitDate
                            ? `Visit ${m.visitDate}`
                            : "Outpatient"}
                        {m.ipNo ? ` · IP ${m.ipNo}` : ""}
                        {m.tokenNo ? ` · Token ${m.tokenNo}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {identity.lookupMatches.length === 1 && identity.selectedMatch && (
            <p className="text-sm text-gray-700 rounded-xl border border-gray-200 bg-white p-3">
              <span className="font-semibold">Matched from EMR: </span>
              <span className="uppercase font-bold">{identity.selectedMatch.encounterType}</span>
              {identity.selectedMatch.patientName ? (
                <>
                  {" "}
                  · <span>{identity.selectedMatch.patientName}</span>
                </>
              ) : null}
              {identity.selectedMatch.department ? (
                <>
                  {" "}
                  · <span>{identity.selectedMatch.department}</span>
                </>
              ) : null}
              {identity.selectedMatch.ward ? (
                <>
                  {" "}
                  · Ward <span>{identity.selectedMatch.ward}</span>
                </>
              ) : null}
            </p>
          )}

          {identity.lookupError ? (
            <p className="text-sm text-amber-800 font-medium">{identity.lookupError}</p>
          ) : null}
        </div>
      )}

      <div
        className={
          compact ? "space-y-4" : "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        }
      >
        {identity.identificationMode === "name" ? (
          <>
            <div className={compact ? "" : undefined}>
              {compact ? (
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your name</label>
              ) : null}
              <input
                type="text"
                value={identity.manualPatientName}
                onChange={(e) => identity.setManualPatientName(e.target.value)}
                placeholder={compact ? "உங்கள் பெயர்" : "Your name"}
                className={inputClass}
                {...focusHandlers}
              />
            </div>
            {!compact ? (
              <>
                {identity.hospitalDepartments.length > 0 ? (
                  <DepartmentSearchSelect
                    departments={identity.hospitalDepartments}
                    value={identity.manualDepartment}
                    onChange={identity.setManualDepartment}
                  />
                ) : (
                  <input
                    type="text"
                    value={identity.manualDepartment}
                    onChange={(e) => identity.setManualDepartment(e.target.value)}
                    placeholder="Department (optional)"
                    className={inputClass}
                    {...focusHandlers}
                  />
                )}
                <input
                  type="text"
                  value={identity.manualWard}
                  onChange={(e) => identity.setManualWard(e.target.value)}
                  placeholder="Ward (optional)"
                  className={inputClass}
                  {...focusHandlers}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Name (EMR)
              </p>
              <div className={readonlyBox}>
                {identity.selectedMatch?.patientName?.trim() || "—"}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Department (EMR)
              </p>
              <div className={readonlyBox}>
                {displayOptionalLabel(identity.selectedMatch?.department)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Ward (EMR)
              </p>
              <div className={readonlyBox}>{identity.selectedMatch?.ward?.trim() || "—"}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
