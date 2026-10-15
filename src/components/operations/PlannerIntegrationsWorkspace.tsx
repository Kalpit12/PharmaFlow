"use client";

import Link from "next/link";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { StatusBadge } from "@/components/ds/status-badge";
import type { PlannerIntegrationSnapshot } from "@/lib/server/planner-integrations";

export function PlannerIntegrationsWorkspace({ data }: { data: PlannerIntegrationSnapshot }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <p className="text-sm text-muted-foreground">
          Phase 6 — planner signals wired to materials, procurement, and command surfaces. Material delays rank by severity;
          supply timeline changes can trigger autopilot proposals when enabled ({data.autopilotMode}).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.capacityUtilization ? (
            <StatusBadge tone="intel">Capacity {data.capacityUtilization}</StatusBadge>
          ) : null}
          <StatusBadge tone={data.atRiskOrders > 0 ? "warning" : "neutral"}>{data.atRiskOrders} at-risk orders</StatusBadge>
          {data.scheduleAdherencePercent != null ? (
            <StatusBadge tone="neutral">{data.scheduleAdherencePercent}% schedule adherence</StatusBadge>
          ) : null}
          {data.openProposalName ? <StatusBadge tone="intel">{data.openProposalName}</StatusBadge> : null}
        </div>
      </section>

      {data.materialDelays.length > 0 ? (
        <AttentionList title="Material-delayed batches" subtitle="Ranked for Command Center and Daily Review.">
          {data.materialDelays.map((row) => (
            <AttentionItem
              key={row.id}
              domain="Materials"
              severity={row.severity === "CRITICAL" ? "CRITICAL" : row.severity === "HIGH" ? "HIGH" : "MEDIUM"}
              issue={row.message}
              evidence={`Order ${row.orderNumber} · ${row.delayDays} day impact`}
              consequence="Finite-capacity schedule may slip until supply is dated and received."
              href={row.href}
            />
          ))}
        </AttentionList>
      ) : (
        <section className="work-surface p-4 text-sm text-muted-foreground">
          No material-blocked or delayed production orders in the current horizon.
        </section>
      )}

      <section className="work-surface p-4 text-sm">
        <p className="font-medium">Cross-module links</p>
        <ul className="mt-2 list-inside list-disc text-muted-foreground">
          <li>
            <Link href="/command-center" className="text-primary underline-offset-2 hover:underline">
              Command Center
            </Link>{" "}
            — production + material delay signals
          </li>
          <li>
            <Link href="/daily-review" className="text-primary underline-offset-2 hover:underline">
              Daily Review
            </Link>{" "}
            — ranked batch material delays
          </li>
          <li>
            <Link href="/materials?view=shortages" className="text-primary underline-offset-2 hover:underline">
              Materials shortages
            </Link>
          </li>
          <li>
            <Link href="/procurement?view=needs-review" className="text-primary underline-offset-2 hover:underline">
              Procurement review
            </Link>
          </li>
          <li>
            <Link href="/execution" className="text-primary underline-offset-2 hover:underline">
              Execution queue
            </Link>{" "}
            — plan accept and approvals
          </li>
        </ul>
      </section>
    </div>
  );
}
