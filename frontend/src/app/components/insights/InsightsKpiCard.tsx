import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function InsightsKpiCard({
  label,
  value,
  sub,
  valueClass = "",
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  valueClass?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <Card
      className={`rounded-2xl shadow-sm border border-gray-100${interactive ? " cursor-pointer transition-shadow hover:shadow-md hover:border-indigo-200" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
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
