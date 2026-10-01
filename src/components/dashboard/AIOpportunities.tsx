import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { Opportunity } from "@/lib/mock/dashboard";

export function AIOpportunities({ items }: { items: Opportunity[] }) {
  return (
    <DashboardPanel title="Follow-up opportunities" subtitle="Deterministic commercial signals — not autonomous recommendations">
      {items.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No opportunities yet"
          description="Demand, retention, and regional signals appear when there is enough commercial activity to compare."
        />
      ) : (
        <ol className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-muted-foreground">{item.index}</p>
                <StatusBadge>{item.category}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-snug">{item.insight}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Next step. </span>
                {item.action}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-8">
                <Link href={item.href}>Inspect</Link>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  );
}
