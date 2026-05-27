import { RefreshCw } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router";
import { InsightsPeriodFilterBar } from "./InsightsPeriodFilterBar";
import { InsightsViewTabs } from "./InsightsViewTabs";
import { useInsightsData } from "./useInsightsData";

function insightsBasePath(pathname: string): string {
  if (pathname.startsWith("/admin/")) return "/admin/management-overview";
  return "/management";
}

export function InsightsHub() {
  const location = useLocation();
  const basePath = insightsBasePath(location.pathname);
  const data = useInsightsData();

  if (
    location.pathname === basePath ||
    location.pathname === `${basePath}/` ||
    location.pathname === "/admin/insights" ||
    location.pathname === "/admin/analytics" ||
    location.pathname === "/analytics" ||
    location.pathname === "/insights"
  ) {
    return <Navigate to={`${basePath}/submissions`} replace />;
  }

  if (data.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-700 font-medium">{data.error}</p>
        <button
          type="button"
          onClick={() => void data.loadData()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submissions, tickets, and department/service sentiment rankings (includes split issues).
          </p>
        </div>
        <InsightsViewTabs basePath={basePath} />
      </div>

      <InsightsPeriodFilterBar
        periodFilter={data.periodFilter}
        setPeriodFilter={data.setPeriodFilter}
        timeFilter={data.timeFilter}
        setTimeFilter={data.setTimeFilter}
        customFrom={data.customFrom}
        setCustomFrom={data.setCustomFrom}
        customTo={data.customTo}
        setCustomTo={data.setCustomTo}
        customRange={data.customRange}
        applyRange={data.applyRange}
        clearRange={data.clearRange}
        loadData={data.loadData}
        isLoading={data.isLoading}
      />

      <Outlet context={data} />
    </div>
  );
}
