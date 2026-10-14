import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import type { ActivityItem } from "@/lib/mock/dashboard";

export function RecentActivity({
  items,
  maxItems,
  compact = false,
}: {
  items: ActivityItem[];
  maxItems?: number;
  compact?: boolean;
}) {
  const visible = maxItems ? items.slice(0, maxItems) : items;

  return (
    <DashboardPanel
      title={compact ? "Recent activity" : "Recent Activity"}
      subtitle={compact ? undefined : "Latest commercial events"}
    >
      {visible.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No recent activity"
          description="Commercial events for this workspace will appear in this timeline."
        />
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-4">
          {visible.map((item) => (
            <li key={item.id} className="relative pb-3 last:pb-0">
              <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden />
              <p className="text-[11px] tabular-nums text-muted-foreground">{item.time}</p>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  );
}
