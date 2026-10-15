import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusBadge } from "@/components/ds/status-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getProductionExecutionSnapshot, resolveProductionExecutionFilters } from "@/lib/server/production-execution";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ workstation?: string }>;
}) {
  const params = await searchParams;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const data = await getProductionExecutionSnapshot(
      ctx,
      resolveProductionExecutionFilters({ view: "active", workstation: params.workstation }),
      { includeMaterials: false }
    );

    return (
      <WorkspacePage width="full">
        <PageHeader
          context="Operations"
          title="Shop floor board"
          description="Read-only live queue for shared screens. Refreshes on load every ~30s."
        />
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link href="/execution/production" className="text-primary underline-offset-2 hover:underline">
            Open execution console
          </Link>
          <Link href="/operations" className="text-primary underline-offset-2 hover:underline">
            Operations planner
          </Link>
        </div>
        <section className="work-surface overflow-x-auto p-4">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Order</th>
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Station</th>
                <th className="py-2 pr-3 font-medium">State</th>
                <th className="py-2 pr-3 font-medium">Planned end</th>
                <th className="py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-muted-foreground">
                    No active jobs{params.workstation ? " on this station" : ""}.
                  </td>
                </tr>
              ) : (
                data.orders.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{row.orderNumber}</td>
                    <td className="py-2 pr-3">{row.productName}</td>
                    <td className="py-2 pr-3">{row.workstationName ?? "—"}</td>
                    <td className="py-2 pr-3">{row.executionState.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-3">
                      {row.plannedEnd ? new Date(row.plannedEnd).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : "—"}
                    </td>
                    <td className="py-2">
                      <StatusBadge tone={row.risk === "LATE" || row.risk === "BLOCKED" ? "danger" : row.risk === "AT_RISK" ? "warning" : "neutral"}>
                        {row.risk.replace(/_/g, " ")}
                      </StatusBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </WorkspacePage>
    );
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage>
        <PageHeader context="Operations" title="Shop floor board" description="Unable to load board." />
      </WorkspacePage>
    );
  }
}
