"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { RfqCreateDialog } from "@/components/procurement-rfq/RfqCreateDialog";
import { formatDay, statusTone, VIEW_LABEL } from "@/components/procurement-rfq/rfq-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { ProcurementRfqListSnapshot, ProcurementRfqViewId } from "@/lib/procurement-rfq/types";

const SIMPLE_VIEWS: ProcurementRfqViewId[] = ["draft", "review", "responses", "all"];
const KPI_IDS = ["draft", "review", "responses", "total"] as const;

type FormProduct = { id: string; name: string; sku: string; unit: string | null };
type FormSupplier = { id: string; name: string; code: string; status: string };

export function RfqWorkspaceSimple({
  data,
  formOptions,
}: {
  data: ProcurementRfqListSnapshot;
  formOptions: { products: FormProduct[]; suppliers: FormSupplier[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLayoutMode } = usePreferences();
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState(formOptions.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [supplierIds, setSupplierIds] = useState<string[]>([]);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const view = (searchParams.get("status") as ProcurementRfqViewId) || data.view;

  const listRows = useMemo(() => [...data.rows].slice(0, 15), [data.rows]);

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as ProcurementRfqListSnapshot["kpis"];

  const toggleSupplier = (id: string) => {
    setSupplierIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const createDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const qty = Number(quantity);
      if (!title.trim() || !productId || !Number.isFinite(qty) || qty <= 0) {
        setError("Title, material, and quantity are required.");
        return;
      }
      const result = await fetch("/api/procurement-rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dueDate || null,
          notes: notes.trim() || null,
          items: [{ productId, quantity: qty }],
          supplierIds,
        }),
      });
      const payload = (await result.json()) as { rfq?: { id: string }; message?: string };
      if (!result.ok || !payload.rfq) {
        setError(payload.message ?? "Unable to create RFQ.");
        return;
      }
      setCreateOpen(false);
      router.push(`/rfqs/${payload.rfq.id}`);
    } catch {
      setError("Unable to create RFQ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((id) => (
            <Button key={id} asChild size="sm" variant={view === id ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ status: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            New RFQ
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
            Search & table
          </Button>
        </div>
      </div>

      <RfqCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={busy}
        error={error}
        title={title}
        dueDate={dueDate}
        notes={notes}
        productId={productId}
        quantity={quantity}
        supplierIds={supplierIds}
        formOptions={formOptions}
        onTitleChange={setTitle}
        onDueDateChange={setDueDate}
        onNotesChange={setNotes}
        onProductIdChange={setProductId}
        onQuantityChange={setQuantity}
        onToggleSupplier={toggleSupplier}
        onSubmit={() => void createDraft()}
      />

      <section aria-label="RFQ KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </section>

      {listRows.length === 0 ? (
        <EmptyState title="No RFQs in this view" description={data.emptyReason ?? "Create a draft or switch view."} />
      ) : (
        <section aria-label="RFQ queue" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">RFQs to work</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/rfqs/${row.id}`}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.reference}</p>
                    <p className="text-xs text-muted-foreground">{row.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>
                    <span className="text-xs text-muted-foreground">Due {formatDay(row.dueDate)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
