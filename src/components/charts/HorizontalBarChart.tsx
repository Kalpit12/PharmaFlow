import Link from "next/link";

import { ChartSurface } from "@/components/charts/ChartSurface";
import { chartBarFill } from "@/lib/charts/tokens";
import type { ChartBarRow } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

function formatValue(value: number): string {
  return value.toLocaleString("en-KE");
}

export function HorizontalBarChart({
  title,
  description,
  rows,
  valueSuffix = "",
  emptyMessage = "No data available for this view.",
  embedded = false,
  showValues = false,
}: {
  title: string;
  description?: string;
  rows: ChartBarRow[];
  valueSuffix?: string;
  emptyMessage?: string;
  embedded?: boolean;
  /** Power BI–style end labels on bars. */
  showValues?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0 && !embedded) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} />;
  }

  const body = (
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const tone = row.tone ?? "default";
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <p className="min-w-0 truncate font-medium">{row.label}</p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {!showValues ? (
                    <>
                      {formatValue(row.value)}
                      {valueSuffix}
                      {row.hint ? ` · ${row.hint}` : ""}
                    </>
                  ) : row.hint ? (
                    row.hint
                  ) : null}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/80">
                  <div
                    className={cn("h-full duration-150", chartBarFill[tone])}
                    style={{ width: `${(row.value / max) * 100}%` }}
                  />
                </div>
                {showValues ? (
                  <span className="w-14 shrink-0 text-right text-[10px] font-medium tabular-nums text-foreground">
                    {formatValue(row.value)}
                    {valueSuffix}
                  </span>
                ) : null}
              </div>
            </>
          );
          return (
            <li key={row.id}>
              {row.href ? (
                <Link href={row.href} className="block rounded-sm py-0.5 transition-colors hover:bg-muted/40">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    );

  if (embedded) {
    if (rows.length === 0) return <div className="mt-3 text-sm text-muted-foreground">{emptyMessage}</div>;
    return <div className="mt-3">{body}</div>;
  }

  return (
    <ChartSurface title={title} description={description} empty={rows.length === 0 ? emptyMessage : undefined}>
      {body}
    </ChartSurface>
  );
}
