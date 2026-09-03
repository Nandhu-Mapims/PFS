import { useOutletContext } from "react-router";
import { ManagementOverviewDashboard } from "./ManagementOverviewDashboard";
import type { InsightsDataState } from "./useInsightsData";

export function ManagementOverviewRoute() {
  const data = useOutletContext<InsightsDataState>();
  return (
    <ManagementOverviewDashboard
      filteredByPeriod={data.filteredByPeriod}
      ticketRows={data.ticketRows}
      periodFilter={data.periodFilter}
      timeFilter={data.timeFilter}
      encounterFilter={data.encounterFilter}
      customRange={data.customRange}
    />
  );
}
