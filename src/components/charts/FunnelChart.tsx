import Link from "next/link";

import { ChartSurface } from "@/components/charts/ChartSurface";
import { funnelStageBarClasses } from "@/lib/charts/tokens";
import type { FunnelStage } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

export function FunnelChart({
  title,
  description,
  stages,
  emptyMessage = "No procurement records in this workspace.",
}: {
  title: string;
  description?: string;
  stages: FunnelStage[];
  emptyMessage?: string;
}) {
  const max = Math.max(1, ...stages.map((stage) => stage.count));

  if (stages.every((stage) => stage.count === 0)) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} />;
  }

  return (
    <ChartSurface title={title} description={description}>
      <ol className="space-y-2">
        {stages.map((stage, index) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{stage.label}</span>
                <span className="metric-value tabular-nums">{stage.count.toLocaleString("en-KE")}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted">
                <div
                  className={cn("h-full duration-150", funnelStageBarClasses[index % funnelStageBarClasses.length])}
                  style={{ width: `${Math.max(4, (stage.count / max) * 100)}%` }}
                />
              </div>
            </>
          );
          return (
            <li key={stage.id}>
              {stage.href ? (
                <Link href={stage.href} className="block rounded-sm py-0.5 transition-colors hover:bg-muted/40">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground">Counts are independent snapshots across procurement stages.</p>
    </ChartSurface>
  );
}
