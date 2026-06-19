interface FeedbackRemarkFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function FeedbackRemarkField({ value, onChange }: FeedbackRemarkFieldProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
      <label className="block text-sm font-medium text-gray-800 mb-1">Remark (optional)</label>
      <p className="text-xs text-gray-600 mb-2">
        Any extra note to include with this feedback. Leave blank if not needed.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Collected at the desk, patient needed assistance…"
        className="w-full h-24 p-3 text-sm border border-gray-200 rounded-lg outline-none resize-none bg-white"
      />
    </div>
  );
}

/** @deprecated use FeedbackRemarkField */
export const StaffRemarksField = FeedbackRemarkField;
