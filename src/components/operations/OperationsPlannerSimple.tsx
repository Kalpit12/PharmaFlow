"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { ScheduleControlPanel } from "@/components/operations/ScheduleControlPanel";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { OperationsView } from "@/lib/server/operations";
import { cn } from "@/lib/utils";

type Order = OperationsView["orders"][number];
type Conflict = OperationsView["conflicts"][number];

const KPI_IDS = ["at-risk", "unscheduled", "material-shortage", "utilization"] as const;

function mapSeverity(severity: "INFO" | "WARNING" | "CRITICAL"): AttentionSeverity {
  if (severity === "CRITICAL") return "CRITICAL";
  if (severity === "WARNING") return "HIGH";
  return "INFO";
}

function conflictHref(conflict: Conflict): string {
  if (conflict.kind === "material-unavailable") return "/materials?view=shortages";
  return "/operations";
}

function orderRank(order: Order): number {
  if (order.displayStatus === "AT_RISK") return 0;
  if (order.displayStatus === "UNSCHEDULED") return 1;
  if (order.materialReadiness === "SHORTAGE" || order.materialReadiness === "AT_RISK") return 2;
  return 3;
}

function statusTone(order: Order): "danger" | "warning" | "neutral" | "success" {
  if (order.displayStatus === "AT_RISK") return "danger";
  if (order.displayStatus === "UNSCHEDULED") return "warning";
  if (order.materialReadiness === "SHORTAGE") return "danger";
  if (order.materialReadiness === "AT_RISK") return "warning";
  return "success";
}

function statusLabel(order: Order): string {
  if (order.displayStatus === "UNSCHEDULED") return "Unscheduled";
  if (order.displayStatus === "AT_RISK") return "At risk";
  if (order.materialReadiness === "SHORTAGE") return "Material shortage";
  if (order.materialReadiness === "AT_RISK") return "Material risk";
  return "Scheduled";
}

function dueLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function OperationsPlannerSimple({ data }: { data: OperationsView }) {
  const router = useRouter();
  const { setLayoutMode } = usePreferences();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const scheduledCount = data.orders.filter((order) => order.plannedStart && order.plannedEnd).length;
  const unscheduledCount = data.orders.filter((order) => order.displayStatus === "UNSCHEDULED").length;
  const riskCount = data.orders.filter((order) => order.displayStatus === "AT_RISK").length;

  const refreshPlanner = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const runPlannerAction = async (url: string, init: RequestInit) => {
    setActionError(null);
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setActionError(payload.message ?? "Unable to update production plan.");
      return false;
    }
    refreshPlanner();
    return true;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as OperationsView["kpis"];

  const attentionItems = (() => {
    const rows = [
      ...data.planningAttention.map((item) => ({
        id: item.id,
        domain: "Planning",
        severity: mapSeverity(item.severity),
        issue: item.title,
        href: item.href.startsWith("/") ? item.href : "/operations",
        actionLabel: "Open",
      })),
      ...data.conflicts.map((item) => ({
        id: `${item.kind}-${item.orderNumber}-${item.title}`,
        domain: "Schedule",
        severity: mapSeverity(item.severity),
        issue: item.title,
        href: conflictHref(item),
        actionLabel: item.nextAction.length <= 24 ? item.nextAction : "Review",
      })),
    ];
    const seen = new Set<string>();
    const unique: typeof rows = [];
    for (const row of rows) {
      const key = row.issue.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
      if (unique.length >= 8) break;
    }
    return unique;
  })();

  const ordersToReview = [...data.orders]
    .filter((order) => orderRank(order) < 3)
    .sort((a, b) => orderRank(a) - orderRank(b) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 12);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">This planning window</p>
          <p className="text-xs text-muted-foreground">
            {scheduledCount} scheduled · {unscheduledCount} unscheduled · {riskCount} at risk
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
            Gantt &amp; capacity
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
            <Link href="/execution/production">Shop floor</Link>
          </Button>
        </div>
      </div>

      {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}

      <ScheduleControlPanel
        compact
        data={data}
        pending={pending}
        onRescheduleAll={() => {
          startTransition(async () => {
            await runPlannerAction("/api/schedule-plans", {
              method: "POST",
              body: JSON.stringify({ windowStart: data.window.start }),
            });
          });
        }}
        onAccept={() => {
          if (!data.proposal) return;
          startTransition(async () => {
            await runPlannerAction(`/api/schedule-plans/${data.proposal!.id}/accept`, { method: "POST" });
          });
        }}
        onReject={() => {
          if (!data.proposal) return;
          startTransition(async () => {
            await runPlannerAction(`/api/schedule-plans/${data.proposal!.id}/reject`, { method: "POST" });
          });
        }}
        onSavePolicy={(patch) => {
          startTransition(async () => {
            await runPlannerAction("/api/planning-policy", {
              method: "PATCH",
              body: JSON.stringify(patch),
            });
          });
        }}
      />

      <section aria-label="Planning KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Needs attention"
        subtitle={
          attentionItems.length === 0
            ? "No planning conflicts in this window."
            : `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} to review`
        }
      >
        {attentionItems.map((item) => (
          <AttentionItem
            key={item.id}
            domain={item.domain}
            severity={item.severity}
            issue={item.issue}
            href={item.href}
            actionLabel={item.actionLabel}
          />
        ))}
      </AttentionList>

      <section aria-label="Orders to review" className="work-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Orders to review</p>
          <p className="text-xs text-muted-foreground">At risk, unscheduled, or blocked by materials — due soon first.</p>
        </div>
        {ordersToReview.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">All orders in this window are on plan.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ordersToReview.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.productName} · Due {dueLabel(order.dueDate)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(order)}>{statusLabel(order)}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
        <div className={cn("border-t border-border px-4 py-3", ordersToReview.length === 0 && "border-t-0")}>
          <Button type="button" size="sm" variant="ghost" className="min-h-11 w-full sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
            Open full timeline to move or reschedule orders
          </Button>
        </div>
      </section>
    </div>
  );
}
