import { useOutletContext } from "react-router";
import { SubmissionTrendsDashboard } from "./SubmissionTrendsDashboard";
import type { InsightsDataState } from "./useInsightsData";

export function SubmissionTrendsRoute() {
  const data = useOutletContext<InsightsDataState>();
  return (
    <SubmissionTrendsDashboard
      submissionRows={data.submissionRows}
      periodFilter={data.periodFilter}
      timeFilter={data.timeFilter}
      customRange={data.customRange}
      filterWindow={data.filterWindow}
      analytics={data.analytics}
    />
  );
}
