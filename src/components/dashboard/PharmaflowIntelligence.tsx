import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { IntelligenceSignal } from "@/lib/mock/dashboard";

export function PharmaflowIntelligence({ signals }: { signals: IntelligenceSignal[] }) {
  return (
    <DashboardPanel title="Pharmaflow Intelligence" subtitle="AI-detected business signals">
      {signals.length === 0 ? (
        <EmptyState
          className="w-full border-0 bg-transparent px-0 py-6"
          title="No signals yet"
          description="Commercial signals appear when there are realized orders, RFQs, or customer follow-ups."
        />
      ) : (
        <ol className="space-y-4">
          {signals.map((signal) => (
            <li key={signal.id} className="border-b border-border/60 py-3 last:border-0">
              <StatusBadge tone="primary">{signal.category}</StatusBadge>
              <p className="mt-2 text-sm font-medium leading-snug">{signal.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Potential impact. </span>
                {signal.impact}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Recommended action. </span>
                {signal.recommendation}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href={signal.href}>{signal.actionLabel}</Link>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </DashboardPanel>
  );
}
