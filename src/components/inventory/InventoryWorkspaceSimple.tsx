"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { InventoryItemSheet } from "@/components/inventory/InventoryItemSheet";
import { formatQty, healthRank, healthTone } from "@/components/inventory/inventory-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { InventorySnapshot, InventoryViewId } from "@/lib/inventory/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const VIEW_LABEL: Record<InventoryViewId, string> = {
  overview: "Overview",
  health: "Health",
  expiry: "Expiry",
  ageing: "Ageing",
  requirements: "Requirements",
};

const SIMPLE_VIEWS: InventoryViewId[] = ["health", "expiry", "overview"];
const KPI_IDS = ["low", "out", "soon", "expired"] as const;

function findingSeverity(text: string): AttentionSeverity {
  if (text.toLowerCase().includes("expired") || text.toLowerCase().includes("out of stock")) return "CRITICAL";
  if (text.toLowerCase().includes("low") || text.toLowerCase().includes("expiring")) return "HIGH";
  return "WATCH";
}

export function InventoryWorkspaceSimple({ data }: { data: InventorySnapshot }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.items.find((item) => item.id === selectedId) ?? null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as InventorySnapshot["kpis"];

  const attentionFindings = data.findings.filter((line) => !line.toLowerCase().includes("nothing requires"));

  const listRows = useMemo(() => {
    const rows = [...data.items];
    rows.sort(
      (a, b) =>
        (healthRank[b.health] ?? 0) - (healthRank[a.health] ?? 0) ||
        (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999)
    );
    return rows.slice(0, 15);
  }, [data.items]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Inventory views" className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view, bucket: undefined })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Charts & filters
        </Button>
      </div>

      <section aria-label="Inventory KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.id} href={kpi.href} className="work-surface px-4 py-3 transition-colors hover:bg-muted/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <StatusBadge tone={healthTone[kpi.risk] ?? "neutral"} className="shrink-0">
                {kpi.risk.replace(/_/g, " ")}
              </StatusBadge>
            </div>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </Link>
        ))}
      </section>

      <AttentionList
        title="Stock signals"
        subtitle={attentionFindings.length === 0 ? "Stock levels look stable in this view." : "Summary from current lots and safety stock."}
      >
        {attentionFindings.length === 0 ? (
          <AttentionItem domain="Inventory" severity="INFO" issue="No immediate stock exceptions." href="/inventory?view=health" actionLabel="Browse" />
        ) : (
          attentionFindings.slice(0, 6).map((line, index) => (
            <AttentionItem
              key={`${index}-${line.slice(0, 24)}`}
              domain="Inventory"
              severity={findingSeverity(line)}
              issue={line}
              href={href({ view: "health" })}
              actionLabel="View"
            />
          ))
        )}
      </AttentionList>

      {listRows.length === 0 ? (
        <EmptyState title="No inventory items" description="Adjust filters in advanced layout or clear search." />
      ) : (
        <section aria-label="Priority items" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Priority items</p>
            <p className="text-xs text-muted-foreground">Health and expiry risk first — tap for lot detail.</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku} · {formatQty(item.onHand)} {item.unit} on hand
                    </p>
                  </div>
                  <StatusBadge tone={healthTone[item.health]}>{item.health.replace(/_/g, " ")}</StatusBadge>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="ghost" className="min-h-11 w-full sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
              Open full inventory for ageing, requirements, and category charts
            </Button>
          </div>
        </section>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-md"}
        >
          {selected ? <InventoryItemSheet item={selected} compact /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
