import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import type { ActivityItem } from "@/lib/mock/dashboard";

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <DashboardPanel title="Recent Activity" subtitle="Latest commercial events">
      {items.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No recent activity"
          description="Commercial events for this workspace will appear in this timeline."
        />
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-4">
          {items.map((item) => (
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
