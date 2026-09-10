"use client";

import { useState } from "react";
import Link from "next/link";

import { LineComboChart } from "@/components/charts/LineComboChart";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { Button } from "@/components/ui/button";
import type { DashboardRange, SalesPoint } from "@/lib/mock/dashboard";

const ranges: DashboardRange[] = ["7D", "30D", "90D", "12M"];

export function SalesPerformance({ series }: { series: Record<DashboardRange, SalesPoint[]> }) {
  const [range, setRange] = useState<DashboardRange>("30D");
  const points = series[range];

  return (
    <DashboardPanel
      title="Sales Performance"
      subtitle="Revenue, orders and RFQ activity"
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
          <Button asChild size="xs" variant="outline">
            <Link href="/reports?view=sales">View full report</Link>
          </Button>
        </div>
      }
    >
      <LineComboChart
        title="Revenue & Order Trend"
        description={`Confirmed + fulfilled orders (${range}). Revenue in KSh millions.`}
        points={points.map((point) => ({ label: point.label, primary: point.revenue, secondary: point.orders }))}
        emptyMessage="Not enough realized-order history for this period."
        dominant
      />
    </DashboardPanel>
  );
}
