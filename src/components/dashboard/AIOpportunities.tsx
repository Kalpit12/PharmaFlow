import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { Opportunity } from "@/lib/mock/dashboard";

export function AIOpportunities({ items }: { items: Opportunity[] }) {
  return (
    <DashboardPanel title="AI Opportunities" subtitle="From data to recommended action">
      {items.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No opportunities yet"
          description="Demand, retention, and regional signals appear when there is enough commercial activity to compare."
        />
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border-b border-border/60 py-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-muted-foreground">{item.index}</p>
                <StatusBadge>{item.category}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-snug">{item.insight}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Recommended action. </span>
                {item.action}
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href={item.href}>Act on this</Link>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  );
}
