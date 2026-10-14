"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { TracePath } from "@/components/traceability/TracePath";
import {
  ENTITY_LABEL,
  attentionSeverity,
  coverageTone,
  scopeTone,
} from "@/components/traceability/traceability-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { confidenceLabel, coverageLabel, scopeLabel } from "@/lib/traceability/impact";
import type { TraceabilityEntityOption, TraceabilitySnapshot } from "@/lib/traceability/types";

const KPI_IDS = ["lots", "linked", "gaps", "batches"] as const;

function toAttention(severity: string): AttentionSeverity {
  const mapped = attentionSeverity(severity);
  return mapped === "WATCH" ? "WATCH" : mapped;
}

export function TraceabilityWorkspaceSimple({ data }: { data: TraceabilitySnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLayoutMode } = usePreferences();

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["lot", "batch", "order", "customer", "q"]) params.delete(key);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const filteredOptions = useMemo(() => {
    const query = (searchParams.get("q") ?? data.query ?? "").trim().toLowerCase();
    if (!query) return data.options.slice(0, 25);
    return data.options
      .filter(
        (option) =>
          option.label.toLowerCase().includes(query) ||
          option.sublabel.toLowerCase().includes(query) ||
          ENTITY_LABEL[option.type].toLowerCase().includes(query)
      )
      .slice(0, 25);
  }, [data.options, data.query, searchParams]);

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as TraceabilitySnapshot["kpis"];
  const investigation = data.investigation;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-0 flex-1 text-xs text-muted-foreground sm:max-w-md">
          Investigate
          <select
            aria-label="Select traceability entity"
            className="mt-1 block h-11 w-full rounded-sm border border-border bg-background px-2 text-sm sm:h-9"
            value={data.entityType && data.entityId ? `${data.entityType}:${data.entityId}` : ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                router.push(pathname);
                return;
              }
              const [type, id] = value.split(":");
              if (type === "lot") router.push(href({ lot: id }));
              else if (type === "batch") router.push(href({ batch: id }));
              else if (type === "order") router.push(href({ order: id }));
              else if (type === "customer") router.push(href({ customer: id }));
            }}
          >
            <option value="">Choose entity…</option>
            {filteredOptions.map((option: TraceabilityEntityOption) => (
              <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                {ENTITY_LABEL[option.type]} · {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Search & tables
        </Button>
      </div>

      <section aria-label="Traceability KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl tabular-nums">{kpi.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Trace gaps"
        subtitle={data.attention.length === 0 ? "No traceability exceptions in catalog scope." : "Missing or partial links to investigate."}
      >
        {data.attention.length === 0 ? (
          <AttentionItem domain="Traceability" severity="INFO" issue="No traceability gaps flagged." href="/inventory" actionLabel="Inventory" />
        ) : (
          data.attention.slice(0, 6).map((item) => (
            <AttentionItem
              key={item.id}
              domain="Traceability"
              severity={toAttention(item.severity)}
              issue={item.title}
              evidence={item.detail}
              href={item.href}
              actionLabel="Investigate"
            />
          ))
        )}
      </AttentionList>

      {!investigation ? (
        <EmptyState title="Select an entity to trace" description={data.emptyReason ?? "Pick a lot, batch, order, or customer from the list above."} />
      ) : (
        <>
          <section className="work-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {investigation.direction === "forward" ? "Forward trace" : "Backward trace"} · {ENTITY_LABEL[investigation.entityType]}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{investigation.entityLabel}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">{confidenceLabel(investigation.impact.confidence)} confidence</StatusBadge>
                <StatusBadge tone={scopeTone(investigation.impact.scope)}>{scopeLabel(investigation.impact.scope)}</StatusBadge>
              </div>
            </div>
            <div className="mt-4">
              <TracePath nodes={investigation.path} compact={true} />
            </div>
          </section>

          <section className="work-surface p-4">
            <p className="text-sm font-medium">{investigation.impact.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{investigation.impact.allocationNote}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["Material lots", investigation.impact.affectedMaterialLots],
                ["Production batches", investigation.impact.affectedProductionBatches],
                ["Sales orders", investigation.impact.affectedSalesOrders],
                ["Customers", investigation.impact.affectedCustomers],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-sm border border-border px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground uppercase">{label}</dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {investigation.impact.rows.length > 0 ? (
            <section aria-label="Affected entities" className="work-surface">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">Affected entities</p>
              </div>
              <ul className="divide-y divide-border">
                {investigation.impact.rows.slice(0, 8).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      {row.href ? (
                        <Link href={row.href} className="font-medium hover:underline">{row.label}</Link>
                      ) : (
                        <span className="font-medium">{row.label}</span>
                      )}
                      <p className="text-xs capitalize text-muted-foreground">{row.kind}</p>
                    </div>
                    <StatusBadge tone={coverageTone[row.coverage]}>{coverageLabel(row.coverage)}</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

    </div>
  );
}
