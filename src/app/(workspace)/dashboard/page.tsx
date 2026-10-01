import { redirect } from "next/navigation";

import { AIOpportunities } from "@/components/dashboard/AIOpportunities";
import { DashboardHeaderActions } from "@/components/dashboard/DashboardHeaderActions";
import { ExecutiveKpis } from "@/components/dashboard/ExecutiveKpis";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { PharmaflowIntelligence } from "@/components/dashboard/PharmaflowIntelligence";
import { ProductIntelligence } from "@/components/dashboard/ProductIntelligence";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RegionalIntelligence } from "@/components/dashboard/RegionalIntelligence";
import { SalesPerformance } from "@/components/dashboard/SalesPerformance";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getDashboardData } from "@/lib/server/dashboard";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getDashboardData(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      redirect("/login");
    }
    return (
      <WorkspacePage>
        <PageHeader context="Overview" title="Dashboard" description="Commercial movement and operational follow-up." />
        <p className="text-sm text-muted-foreground">Unable to load workspace data. Try again later.</p>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Overview"
        title="Dashboard"
        description="Executive operating surface — commercial movement and items that need follow-up."
        metadata={data.disclaimer}
        relatedPath="/dashboard"
        actions={<DashboardHeaderActions />}
      />

      <ExecutiveKpis metrics={data.metrics} />

      <div className="grid min-w-0 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <SalesPerformance series={data.sales} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <PharmaflowIntelligence signals={data.intelligence} />
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <NeedsAttention items={data.attention} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ProductIntelligence rows={data.products} />
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <RegionalIntelligence rows={data.regions} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <AIOpportunities items={data.opportunities} />
        </div>
      </div>

      <RecentActivity items={data.activity} />
    </WorkspacePage>
  );
}
