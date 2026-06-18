/**
 * Patient comments and staff remarks are stored separately; AI uses the combined text.
 * Staff remarks may be typed or voice-transcribed; both are merged under [Staff note].
 */
export function combineFeedbackTextForAi(patientComments, staffRemarks) {
  const patient = String(patientComments || "").trim();
  const staff = String(staffRemarks || "").trim();
  if (!staff) return patient;
  if (!patient) return `[Staff note] ${staff}`;
  return `${patient}\n\n[Staff note] ${staff}`;
}
