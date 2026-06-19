import { FeedbackRemarkField } from "./StaffRemarksField";

interface FeedbackSubmitOverviewProps {
  patientName: string;
  submissionLabel: string;
  remark: string;
  onRemarkChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  primaryColor: string;
}

export function FeedbackSubmitOverview({
  patientName,
  submissionLabel,
  remark,
  onRemarkChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
  primaryColor,
}: FeedbackSubmitOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">Almost done</h2>
        <p className="text-sm text-gray-600">
          Feedback from <span className="font-semibold text-gray-800">{patientName || "patient"}</span>{" "}
          ({submissionLabel}) is ready. Add an optional remark below, then submit.
        </p>
      </div>

      <FeedbackRemarkField value={remark} onChange={onRemarkChange} />

      {submitError ? <p className="text-sm text-red-600 text-center font-medium">{submitError}</p> : null}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full py-5 rounded-2xl text-xl font-bold text-white shadow-lg disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {isSubmitting ? "Submitting…" : "Submit feedback"}
        </button>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl text-base font-medium text-gray-600 hover:underline disabled:opacity-50"
          >
            ← Go back and edit
          </button>
        ) : null}
      </div>
    </div>
  );
}
