import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import type { ProductPerformanceRow } from "@/lib/mock/dashboard";
import type { StatusTone } from "@/types/status";
import { cn } from "@/lib/utils";

const statusTone: Record<ProductPerformanceRow["status"], StatusTone> = {
  High: "success",
  Stable: "info",
  Watch: "warning",
};

export function ProductIntelligence({ rows }: { rows: ProductPerformanceRow[] }) {
  return (
    <DashboardPanel title="Product Intelligence" subtitle="Top products by commercial activity">
      {rows.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No products yet"
          description="Product activity appears when this workspace has catalog items and realized orders."
        />
      ) : (
        <>
          <div className="hidden min-w-0 overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Product commercial activity</caption>
              <thead>
                <tr className="border-b border-border text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Orders</th>
                  <th className="pb-2 font-medium">Demand</th>
                  <th className="pb-2 font-medium">Growth</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{row.product}</p>
                      <p className="text-xs text-muted-foreground">{row.form}</p>
                    </td>
                    <td className="py-2.5 tabular-nums">{row.orders}</td>
                    <td className="py-2.5 text-muted-foreground">{row.demand}</td>
                    <td className={cn("py-2.5 tabular-nums", row.growthUp ? "text-success" : "text-danger")}>
                      {row.growth}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{row.product}</p>
                    <p className="text-xs text-muted-foreground">{row.form}</p>
                  </div>
                  <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Orders</dt>
                    <dd className="font-medium tabular-nums">{row.orders}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Demand</dt>
                    <dd className="font-medium">{row.demand}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Growth</dt>
                    <dd className={cn("font-medium tabular-nums", row.growthUp ? "text-success" : "text-danger")}>
                      {row.growth}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardPanel>
  );
}
