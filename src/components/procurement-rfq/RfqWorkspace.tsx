"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { RfqCreateDialog } from "@/components/procurement-rfq/RfqCreateDialog";
import { RfqWorkspaceSimple } from "@/components/procurement-rfq/RfqWorkspaceSimple";
import { formatDay, statusTone, VIEW_LABEL } from "@/components/procurement-rfq/rfq-display";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { PROCUREMENT_RFQ_VIEWS, type ProcurementRfqListSnapshot, type ProcurementRfqViewId } from "@/lib/procurement-rfq/types";

type FormProduct = { id: string; name: string; sku: string; unit: string | null };
type FormSupplier = { id: string; name: string; code: string; status: string };

export function RfqWorkspace({
  data,
  formOptions,
}: {
  data: ProcurementRfqListSnapshot;
  formOptions: { products: FormProduct[]; suppliers: FormSupplier[] };
}) {
  const { simple } = useLayoutMode();
  if (simple) return <RfqWorkspaceSimple data={data} formOptions={formOptions} />;
  return <RfqWorkspaceFull data={data} formOptions={formOptions} />;
}

function RfqWorkspaceFull({
  data,
  formOptions,
}: {
  data: ProcurementRfqListSnapshot;
  formOptions: { products: FormProduct[]; suppliers: FormSupplier[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
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
  const query = searchParams.get("q") ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (row) =>
        row.reference.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q) ||
        row.itemsLabel.toLowerCase().includes(q)
    );
  }, [data.rows, query]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PROCUREMENT_RFQ_VIEWS.map((id) => (
            <Button
              key={id}
              asChild
              size="xs"
              variant={view === id ? "secondary" : "ghost"}
              className="min-h-11 sm:min-h-8"
            >
              <Link href={href({ status: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
            </Button>
          ))}
        </div>
        <Button type="button" className="min-h-11 sm:min-h-9" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          New RFQ
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="rounded-lg border border-border/80 px-3 py-2">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          className="w-full sm:max-w-xs"
          placeholder="Search reference, material…"
          defaultValue={query}
          aria-label="Search RFQs"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              router.push(href({ q: event.currentTarget.value || undefined }));
            }
          }}
        />
        {compact && view !== "all" ? (
          <p className="text-xs text-muted-foreground">Filter: {VIEW_LABEL[view]}</p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No RFQs in this view"
          description={data.emptyReason ?? "Adjust filters or create a new draft RFQ."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/30 text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">RFQ</th>
                <th className="px-3 py-2 font-medium">Material / items</th>
                <th className="px-3 py-2 font-medium">Suppliers</th>
                <th className="px-3 py-2 font-medium">Quantity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Responses</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <Link href={`/rfqs/${row.id}`} className="font-medium hover:underline">
                      {row.reference}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.title}</p>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{row.itemsLabel}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.supplierCount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.quantityLabel}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.responseStatus}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDay(row.dueDate)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDay(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {data.planningNote}{" "}
        <Link href="/supplier-performance" className="font-medium text-foreground hover:underline">
          Compare suppliers
        </Link>
      </p>

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
    </div>
  );
}
