import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import type { RegionalRow } from "@/lib/mock/dashboard";
import type { StatusTone } from "@/types/status";

const activityTone: Record<RegionalRow["activity"], StatusTone> = {
  High: "success",
  Growing: "primary",
  Stable: "neutral",
};

export function RegionalIntelligence({ rows }: { rows: RegionalRow[] }) {
  const max = Math.max(...rows.map((row) => row.revenueValue), 0);

  return (
    <DashboardPanel title="Regional Intelligence" subtitle="Commercial activity by market">
      {rows.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No regional activity"
          description="Regional revenue appears when customers in a market have realized orders."
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="mb-1 flex min-w-0 items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{row.country}</p>
                <p className="shrink-0 text-sm tabular-nums">{row.revenue}</p>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.max(max > 0 ? (row.revenueValue / max) * 100 : 0, 6)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-success">{row.growth}</span>
                <StatusBadge tone={activityTone[row.activity]}>{row.activity}</StatusBadge>
              </div>
              <span className="sr-only">
                {row.country}: {row.revenue}, growth {row.growth}, activity {row.activity}
              </span>
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  );
}
