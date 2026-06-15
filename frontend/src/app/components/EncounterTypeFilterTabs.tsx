import type { EncounterTypeFilter } from "../lib/insightsFilters";

const OPTIONS: { id: EncounterTypeFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "op", label: "OP" },
  { id: "ip", label: "IP" },
  { id: "name-only", label: "Name-only" },
];

type Props = {
  value: EncounterTypeFilter;
  onChange: (value: EncounterTypeFilter) => void;
  showHint?: boolean;
  className?: string;
};

export function EncounterTypeFilterTabs({
  value,
  onChange,
  showHint = false,
  className = "",
}: Props) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div>
        <p className="text-sm font-semibold text-gray-800">Patient type</p>
        {showHint ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            All types · OP/IP = UHID visit · Name-only = no UHID
          </p>
        ) : null}
      </div>
      <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 w-full sm:w-auto">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              value === opt.id
                ? "bg-[#2A6FDB] text-white shadow-sm"
                : "text-gray-600 hover:bg-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
