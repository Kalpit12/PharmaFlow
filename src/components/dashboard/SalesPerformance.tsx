"use client";

import { useState } from "react";
import Link from "next/link";

import { LineComboChart } from "@/components/charts/LineComboChart";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import type { DashboardRange, SalesPoint } from "@/lib/mock/dashboard";

const ranges: DashboardRange[] = ["7D", "30D", "90D", "12M"];

export function SalesPerformance({ series }: { series: Record<DashboardRange, SalesPoint[]> }) {
  const [range, setRange] = useState<DashboardRange>("30D");
  const { simple } = useLayoutMode();
  const points = series[range];

  return (
    <DashboardPanel
      title={simple ? "Sales trend" : "Sales Performance"}
      subtitle={simple ? undefined : "Revenue, orders and RFQ activity"}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Performance period">
            {ranges.map((item) => (
              <Button
                key={item}
                type="button"
                size="xs"
                variant={item === range ? "secondary" : "ghost"}
                aria-pressed={item === range}
                onClick={() => setRange(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <Button asChild size="xs" variant="outline" className="min-h-11 sm:min-h-8">
            <Link href="/reports?view=sales">{simple ? "Full report" : "View full report"}</Link>
          </Button>
        </div>
      }
    >
      <LineComboChart
        title="Revenue & Order Trend"
        description={simple ? undefined : `Confirmed + fulfilled orders (${range}). Revenue in KSh millions.`}
        points={points.map((point) => ({ label: point.label, primary: point.revenue, secondary: point.orders }))}
        emptyMessage="Not enough realized-order history for this period."
        dominant={!simple}
        bare={simple}
      />
    </DashboardPanel>
  );
}
