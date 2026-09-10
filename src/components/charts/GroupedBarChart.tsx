import Link from "next/link";

import { ChartSurface } from "@/components/charts/ChartSurface";
import type { GroupedBarRow } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

function formatQty(value: number): string {
  return value.toLocaleString("en-KE");
}

export function GroupedBarChart({
  title,
  description,
  rows,
  primaryLabel = "Planned",
  secondaryLabel = "Produced",
  emptyMessage = "No production data available.",
  note,
}: {
  title: string;
  description?: string;
  rows: GroupedBarRow[];
  primaryLabel?: string;
  secondaryLabel?: string;
  emptyMessage?: string;
  note?: string;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.primary, row.secondary ?? 0]));

  if (rows.length === 0) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} />;
  }

  return (
    <ChartSurface title={title} description={description}>
      <ul className="space-y-3">
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <p className="min-w-0 truncate font-medium">{row.label}</p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {formatQty(row.primary)} {primaryLabel.toLowerCase()}
                  {row.secondary != null ? ` · ${formatQty(row.secondary)} ${secondaryLabel.toLowerCase()}` : " · produced pending"}
                </p>
              </div>
              <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-sm bg-muted">
                <div className="h-full bg-chart-6" style={{ width: `${(row.primary / max) * 100}%` }} title={`${primaryLabel}: ${formatQty(row.primary)}`} />
                {row.secondary != null ? (
                  <div className="h-full bg-chart-2" style={{ width: `${(row.secondary / max) * 100}%` }} title={`${secondaryLabel}: ${formatQty(row.secondary)}`} />
                ) : null}
              </div>
            </>
          );
          return (
            <li key={row.id}>
              {row.href ? (
                <Link href={row.href} className={cn("block rounded-sm py-0.5 transition-colors hover:bg-muted/40")}>
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-6" aria-hidden />
          {primaryLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-2" aria-hidden />
          {secondaryLabel}
        </li>
      </ul>
      {note ? <p className="mt-2 text-[11px] text-muted-foreground">{note}</p> : null}
    </ChartSurface>
  );
}
