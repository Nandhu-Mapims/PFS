/** Public patient feedback URLs (kiosk / QR). */
export const patientRoutes = {
  home: "/welcome",
  mode: "/feedback",
  give: "/feedback/give",
  giveVoice: "/feedback/give?mode=voice",
  bot: "/feedback/bot",
  review: "/feedback/review",
  paper: "/paper-upload",
  thankYou: "/thank-you",
} as const;

const PATIENT_PATHS = new Set([
  patientRoutes.home,
  patientRoutes.mode,
  patientRoutes.give,
  patientRoutes.bot,
  patientRoutes.review,
  patientRoutes.paper,
  patientRoutes.thankYou,
  "/feedback-mode",
  "/feedback-form",
  "/voice-feedback",
  "/bot-feedback",
]);

/** True on patient-facing screens (hide staff chrome). */
export function isUserFeedPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (PATIENT_PATHS.has(path)) return true;
  if (path.startsWith("/feedback/")) return true;
  return false;
}
