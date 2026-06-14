import { useOutletContext } from "react-router";
import { SentimentLeaderboardDashboard } from "./SentimentLeaderboardDashboard";
import type { InsightsDataState } from "./useInsightsData";

export function SentimentLeaderboardRoute() {
  const data = useOutletContext<InsightsDataState>();
  return (
    <SentimentLeaderboardDashboard
      filteredByPeriod={data.filteredByPeriod}
      periodFilter={data.periodFilter}
      timeFilter={data.timeFilter}
      encounterFilter={data.encounterFilter}
      customRange={data.customRange}
    />
  );
}
