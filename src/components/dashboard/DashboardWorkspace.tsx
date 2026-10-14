"use client";

import Link from "next/link";

import { AIOpportunities } from "@/components/dashboard/AIOpportunities";
import { DashboardDayBrief } from "@/components/dashboard/DashboardDayBrief";
import { ExecutiveKpis } from "@/components/dashboard/ExecutiveKpis";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { PharmaflowIntelligence } from "@/components/dashboard/PharmaflowIntelligence";
import { ProductIntelligence } from "@/components/dashboard/ProductIntelligence";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RegionalIntelligence } from "@/components/dashboard/RegionalIntelligence";
import { SalesPerformance } from "@/components/dashboard/SalesPerformance";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import type { DashboardData } from "@/lib/server/dashboard";
import { cn } from "@/lib/utils";

export function DashboardWorkspace({ data }: { data: DashboardData }) {
  const { simple } = useLayoutMode();

  if (simple) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <DashboardDayBrief brief={data.dayBrief} />
        <ExecutiveKpis metrics={data.metrics} />
        <NeedsAttention items={data.attention} />
        <SalesPerformance series={data.sales} />
        {data.products.length > 0 ? <ProductIntelligence rows={data.products} maxRows={3} compact /> : null}
        <RecentActivity items={data.activity} maxItems={5} compact />
        <p className="text-center text-xs text-muted-foreground">
          Operations and supply chain?{" "}
          <Link href="/daily-review" className="text-primary hover:underline">Open Today</Link>
          {" · "}
          <Link href="/reports" className="text-primary hover:underline">Reports</Link>
          {" · "}
          <Link href="/settings#preferences" className="text-primary hover:underline">Advanced layout</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DashboardDayBrief brief={data.dayBrief} />
      <ExecutiveKpis metrics={data.metrics} />

      <NeedsAttention items={data.attention} />

      <div className={cn("grid min-w-0 gap-6 lg:grid-cols-12")}>
        <div className="min-w-0 lg:col-span-8">
          <SalesPerformance series={data.sales} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <PharmaflowIntelligence signals={data.intelligence} />
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <ProductIntelligence rows={data.products} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <RegionalIntelligence rows={data.regions} />
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <AIOpportunities items={data.opportunities} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <RecentActivity items={data.activity} />
        </div>
      </div>
    </div>
  );
}
