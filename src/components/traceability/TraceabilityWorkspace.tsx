"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { ProcessTrail } from "@/components/ds/process-trail";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { confidenceLabel, coverageLabel, scopeLabel } from "@/lib/traceability/impact";
import type {
  TraceabilityCoverage,
  TraceabilityEntityOption,
  TraceabilityEntityType,
  TraceabilityPathNode,
  TraceabilitySnapshot,
} from "@/lib/traceability/types";
import type { StatusTone } from "@/types/status";

const ENTITY_LABEL: Record<TraceabilityEntityType, string> = {
  lot: "Material lot",
  batch: "Production batch",
  order: "Sales order",
  customer: "Customer",
};

const coverageTone: Record<TraceabilityCoverage, StatusTone> = {
  TRACEABLE: "intel",
  PARTIAL: "material",
  NOT_RECORDED: "warning",
};


function TracePath({ nodes, compact }: { nodes: TraceabilityPathNode[]; compact: boolean }) {
  if (nodes.length === 0) return null;

  if (compact) {
    return (
      <ol className="flex min-w-0 flex-col gap-3" aria-label="Traceability path">
        {nodes.map((node, index) => (
          <li key={`${node.kind}-${node.id}`} className="relative border-l border-border pl-4">
            {index < nodes.length - 1 ? <span className="absolute -bottom-3 left-[-1px] h-3 w-px bg-border" aria-hidden /> : null}
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{node.kind.replaceAll("_", " ")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone={coverageTone[node.coverage]}>{coverageLabel(node.coverage)}</StatusBadge>
              {node.href ? (
                <Link href={node.href} className="font-medium hover:underline">
                  {node.label}
                </Link>
              ) : (
                <span className="font-medium">{node.label}</span>
              )}
            </div>
            {node.sublabel ? <p className="mt-1 text-xs text-muted-foreground">{node.sublabel}</p> : null}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <ol className="flex min-w-max items-start gap-0" aria-label="Traceability path">
        {nodes.map((node, index) => (
          <li key={`${node.kind}-${node.id}`} className="flex min-w-[9rem] max-w-[12rem] shrink-0 flex-col px-3 first:pl-0 last:pr-0">
            <div className="flex items-center gap-2">
              {index > 0 ? <span className="text-border" aria-hidden>↓</span> : null}
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{node.kind.replaceAll("_", " ")}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={coverageTone[node.coverage]}>{coverageLabel(node.coverage)}</StatusBadge>
            </div>
            {node.href ? (
              <Link href={node.href} className="mt-2 font-medium hover:underline">
                {node.label}
              </Link>
            ) : (
              <p className="mt-2 font-medium">{node.label}</p>
            )}
            {node.sublabel ? <p className="mt-1 text-xs text-muted-foreground">{node.sublabel}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TraceabilityWorkspace({ data }: { data: TraceabilitySnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [sheetNode, setSheetNode] = useState<TraceabilityPathNode | null>(null);

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
    if (!query) return data.options.slice(0, 40);
    return data.options
      .filter(
        (option) =>
          option.label.toLowerCase().includes(query) ||
          option.sublabel.toLowerCase().includes(query) ||
          ENTITY_LABEL[option.type].toLowerCase().includes(query)
      )
      .slice(0, 40);
  }, [data.options, data.query, searchParams]);

  const investigation = data.investigation;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessTrail
        steps={[
          { id: "supplier", label: "Supplier", href: "/suppliers" },
          { id: "lot", label: "Material lot", href: "/inventory" },
          { id: "batch", label: "Production batch", href: "/batches" },
          { id: "finished", label: "Finished product" },
          { id: "order", label: "Sales order" },
          { id: "customer", label: "Customer" },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="text-xs text-muted-foreground">
            Investigate
            <select
              aria-label="Select traceability entity"
              className="mt-1 block h-11 w-full min-w-[14rem] rounded-sm border border-border bg-background px-2 text-sm sm:h-8"
              value={
                data.entityType && data.entityId ? `${data.entityType}:${data.entityId}` : ""
              }
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
        </div>
        <SearchInput
          defaultValue={searchParams.get("q") ?? data.query ?? ""}
          placeholder="Lot, batch, product, customer, order"
          aria-label="Search traceability"
          className="md:max-w-72 [&_input]:h-11 md:[&_input]:h-8"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              router.push(href({ q: event.currentTarget.value || undefined }));
            }
          }}
        />
      </div>

      <section aria-label="Traceability metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {data.attention.length > 0 ? (
        <section aria-label="Traceability exceptions" className="min-w-0 work-surface p-3">
          <p className="text-sm font-medium">Traceability exceptions</p>
          <ul className="mt-2 divide-y divide-border">
            {data.attention.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={item.severity === "CRITICAL" ? "danger" : item.severity === "HIGH" ? "danger" : "warning"}>
                      {item.severity}
                    </StatusBadge>
                    <p className="font-medium">{item.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <Link href={item.href} className="text-xs hover:underline">
                  Investigate
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!investigation ? (
        <EmptyState title="Select an entity to trace" description={data.emptyReason ?? "Search or choose a lot, batch, order, or customer."} />
      ) : (
        <>
          <section className="min-w-0 work-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {investigation.direction === "forward" ? "Forward trace" : "Backward trace"} · {ENTITY_LABEL[investigation.entityType]}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{investigation.entityLabel}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">{confidenceLabel(investigation.impact.confidence)} confidence</StatusBadge>
                <StatusBadge tone={investigation.impact.scope === "SIGNIFICANT_IMPACT" ? "danger" : investigation.impact.scope === "LIMITED_IMPACT" ? "material" : "warning"}>
                  {scopeLabel(investigation.impact.scope)}
                </StatusBadge>
              </div>
            </div>
            <div className="mt-4">
              <TracePath nodes={investigation.path} compact={compact} />
            </div>
          </section>

          <section aria-label="Potential impact summary" className="min-w-0 work-surface p-4">
            <p className="text-sm font-medium">{investigation.impact.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{investigation.impact.allocationNote}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Material lots", investigation.impact.affectedMaterialLots],
                ["Production batches", investigation.impact.affectedProductionBatches],
                ["Finished batches", investigation.impact.affectedFinishedBatches],
                ["Sales orders", investigation.impact.affectedSalesOrders],
                ["Customers", investigation.impact.affectedCustomers],
                ["Quantity", investigation.impact.affectedQuantityLabel],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-sm border border-border px-3 py-2">
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <section className="min-w-0 work-surface p-4">
              <p className="text-sm font-medium">Traceability coverage</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm" aria-label="Traceability coverage table">
                  <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-2 py-2 font-medium">Link</th>
                      <th className="px-2 py-2 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investigation.coverage.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          <p>{row.link}</p>
                          <p className="text-xs text-muted-foreground">{row.note}</p>
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge tone={coverageTone[row.coverage]}>{coverageLabel(row.coverage)}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="min-w-0 work-surface p-4">
              <p className="text-sm font-medium">Affected entities</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm" aria-label="Affected entities table">
                  <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-2 py-2 font-medium">Entity</th>
                      <th className="px-2 py-2 font-medium">Detail</th>
                      <th className="px-2 py-2 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investigation.impact.rows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          {row.href ? (
                            <Link href={row.href} className="font-medium hover:underline">
                              {row.label}
                            </Link>
                          ) : (
                            <span className="font-medium">{row.label}</span>
                          )}
                          <p className="text-xs capitalize text-muted-foreground">{row.kind}</p>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{row.detail}</td>
                        <td className="px-2 py-2">
                          <StatusBadge tone={coverageTone[row.coverage]}>{coverageLabel(row.coverage)}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {investigation.exceptions.length > 0 ? (
            <section className="min-w-0 work-surface p-4">
              <p className="text-sm font-medium">Missing links</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {investigation.exceptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {investigation.path
              .filter((node) => node.href)
              .slice(0, 6)
              .map((node) => (
                <Button
                  key={`${node.kind}-${node.id}`}
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-8"
                  aria-label={`Inspect ${node.label}`}
                  onClick={() => setSheetNode(node)}
                >
                  Inspect {node.label}
                </Button>
              ))}
          </div>
        </>
      )}

      <Sheet open={sheetNode != null} onOpenChange={(open) => !open && setSheetNode(null)}>
        <SheetContent side={compact ? "bottom" : "right"} className={compact ? "max-h-[85vh]" : "sm:max-w-md"}>
          {sheetNode ? (
            <>
              <SheetHeader>
                <SheetTitle>{sheetNode.label}</SheetTitle>
                <SheetDescription>{sheetNode.kind.replaceAll("_", " ")} · {coverageLabel(sheetNode.coverage)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Identity</p>
                  <p className="mt-1 font-medium">{sheetNode.label}</p>
                  {sheetNode.sublabel ? <p className="mt-1 text-muted-foreground">{sheetNode.sublabel}</p> : null}
                </section>
                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Coverage</p>
                  <StatusBadge tone={coverageTone[sheetNode.coverage]} className="mt-2">
                    {coverageLabel(sheetNode.coverage)}
                  </StatusBadge>
                </section>
                {sheetNode.href ? (
                  <Button asChild className="min-h-11 w-full sm:min-h-9">
                    <Link href={sheetNode.href}>Open related workspace</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
