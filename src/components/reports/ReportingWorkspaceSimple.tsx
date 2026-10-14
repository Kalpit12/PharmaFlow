"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { StatusBadge } from "@/components/ds/status-badge";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import { REPORT_PRIMARY_VIEWS, type ReportingSnapshot, type ReportViewId } from "@/lib/reports/types";

const VIEW_LABEL: Record<ReportViewId, string> = {
  executive: "Executive",
  sales: "Sales",
  operations: "Operations",
  inventory: "Inventory",
  procurement: "Procurement",
  suppliers: "Suppliers",
  overview: "Overview",
  health: "Health",
  expiry: "Expiry",
  ageing: "Ageing",
  production: "Production",
  materials: "Materials",
  "finished-goods": "Finished goods",
  "raw-materials": "Raw materials",
  packaging: "Packaging",
};

const riskTone: Record<string, "danger" | "warning" | "neutral" | "success" | "info"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "warning",
  LOW: "info",
  HEALTHY: "success",
  OK: "success",
};

export function ReportingWorkspaceSimple({ data }: { data: ReportingSnapshot }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLayoutMode } = usePreferences();

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis =
    data.view === "executive" && data.executiveKpis.length > 0
      ? data.executiveKpis.slice(0, 4)
      : data.kpis.slice(0, 4);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Reports" className="flex flex-wrap gap-1">
          {REPORT_PRIMARY_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view, bucket: undefined })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Full reports
        </Button>
      </div>

      {kpis.length > 0 ? (
        <section aria-label="Key metrics" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Link key={kpi.id} href={kpi.href} className="work-surface px-4 py-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <StatusBadge tone={riskTone[kpi.risk] ?? "neutral"}>{kpi.risk}</StatusBadge>
              </div>
              <p className="metric-value mt-1 text-xl">{kpi.available ? kpi.value : "—"}</p>
            </Link>
          ))}
        </section>
      ) : null}

      <AttentionList
        title="Management Attention"
        subtitle={`${data.managementAttention.length} ranked signal${data.managementAttention.length === 1 ? "" : "s"} in this snapshot.`}
        empty={
          data.managementAttention.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No ranked operational signals right now.</p>
          ) : undefined
        }
      >
        {data.managementAttention.slice(0, 8).map((item) => (
          <AttentionItem
            key={item.id}
            domain={item.domain}
            severity={item.severity}
            issue={item.issue}
            href={item.href}
            actionLabel="Inspect"
          />
        ))}
      </AttentionList>

      <section className="work-surface px-4 py-3">
        <p className="text-sm font-medium">Key findings</p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {data.findings.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
          <Link href="/command-center">Command Center</Link>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Charts, filters, and export
        </Button>
      </div>
    </div>
  );
}
