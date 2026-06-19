/**
 * Patient comments and remarks are stored separately; AI uses the combined text.
 */
export function combineFeedbackTextForAi(patientComments, staffRemarks) {
  const patient = String(patientComments || "").trim();
  const remark = String(staffRemarks || "").trim();
  if (!remark) return patient;
  if (!patient) return `[Remark] ${remark}`;
  return `${patient}\n\n[Remark] ${remark}`;
}
