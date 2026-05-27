import { BarChart2, ClipboardList, TrendingUp } from "lucide-react";
import { NavLink } from "react-router";

function tabClass({ isActive }: { isActive: boolean }) {
  return `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
    isActive
      ? "bg-[#2A6FDB] text-white shadow-sm"
      : "text-gray-600 hover:bg-white hover:text-gray-900"
  }`;
}

export function InsightsViewTabs({ basePath }: { basePath: string }) {
  const submissionsPath = `${basePath}/submissions`;
  const ticketsPath = `${basePath}/tickets`;
  const sentimentPath = `${basePath}/sentiment`;

  return (
    <div
      className="inline-flex max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1"
      role="tablist"
      aria-label="Insights views"
    >
      <NavLink to={submissionsPath} className={tabClass} end>
        <TrendingUp size={16} className="shrink-0" />
        Submissions
      </NavLink>
      <NavLink to={ticketsPath} className={tabClass}>
        <ClipboardList size={16} className="shrink-0" />
        Tickets
      </NavLink>
      <NavLink to={sentimentPath} className={tabClass}>
        <BarChart2 size={16} className="shrink-0" />
        Dept / service scores
      </NavLink>
    </div>
  );
}
