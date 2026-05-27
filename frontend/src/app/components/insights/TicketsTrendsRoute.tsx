import { useOutletContext } from "react-router";
import { TicketsTrendsDashboard } from "./TicketsTrendsDashboard";
import type { InsightsDataState } from "./useInsightsData";

export function TicketsTrendsRoute() {
  const data = useOutletContext<InsightsDataState>();
  return (
    <TicketsTrendsDashboard
      ticketRows={data.ticketRows}
      periodFilter={data.periodFilter}
      timeFilter={data.timeFilter}
      customRange={data.customRange}
      filterWindow={data.filterWindow}
    />
  );
}
