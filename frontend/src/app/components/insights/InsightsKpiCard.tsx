import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function InsightsKpiCard({
  label,
  value,
  sub,
  valueClass = "",
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  valueClass?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-sm border border-gray-100">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-[10px] uppercase tracking-wider font-medium">
            {label}
          </CardDescription>
          {icon}
        </div>
        <CardTitle className={`text-3xl tabular-nums ${valueClass}`}>{value}</CardTitle>
      </CardHeader>
      {sub ? <CardContent className="pt-0 text-muted-foreground text-xs">{sub}</CardContent> : null}
    </Card>
  );
}
