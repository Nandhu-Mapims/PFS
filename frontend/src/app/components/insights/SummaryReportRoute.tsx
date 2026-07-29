import { useCallback, useEffect, useState } from "react";
import {
  fetchSummaryReport,
  fetchSummaryReportPeriods,
  triggerSummaryReportGenerate,
  type SummaryReport,
  type SummaryReportPeriod,
  type SummaryReportPeriodType,
} from "../../lib/api";
import { SummaryReportDashboard } from "./SummaryReportDashboard";

export function SummaryReportRoute() {
  const [periodType, setPeriodType] = useState<SummaryReportPeriodType>("weekly");
  const [periods, setPeriods] = useState<SummaryReportPeriod[]>([]);
  const [periodKey, setPeriodKey] = useState("");
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeriods = useCallback(async (type: SummaryReportPeriodType) => {
    const list = await fetchSummaryReportPeriods(type);
    setPeriods(list);
    return list;
  }, []);

  const loadReport = useCallback(async (type: SummaryReportPeriodType, key: string) => {
    setIsLoading(true);
    setError(null);
    try {
      setReport(await fetchSummaryReport(type, key));
    } catch {
      setError("Failed to load summary report. Check that the API and database are running.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const list = await loadPeriods(periodType);
        if (cancelled) return;
        const key = list[0]?.periodKey ?? "";
        setPeriodKey(key);
        if (key) await loadReport(periodType, key);
        else setReport(null);
      } catch {
        if (!cancelled) setError("Failed to load report periods.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodType, loadPeriods, loadReport]);

  const handlePeriodKeyChange = (key: string) => {
    setPeriodKey(key);
    void loadReport(periodType, key);
  };

  const handleGenerate = async () => {
    if (!periodKey) return;
    setIsGenerating(true);
    setError(null);
    try {
      setReport(await triggerSummaryReportGenerate(periodType, periodKey));
      await loadPeriods(periodType);
    } catch {
      setError("Failed to generate summary report.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SummaryReportDashboard
      periodType={periodType}
      onPeriodTypeChange={setPeriodType}
      periods={periods}
      periodKey={periodKey}
      onPeriodKeyChange={handlePeriodKeyChange}
      report={report}
      isLoading={isLoading}
      isGenerating={isGenerating}
      error={error}
      onGenerate={() => void handleGenerate()}
    />
  );
}
