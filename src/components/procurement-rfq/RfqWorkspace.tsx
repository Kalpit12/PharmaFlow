"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import {
  PROCUREMENT_RFQ_VIEWS,
  type ProcurementRfqListSnapshot,
  type ProcurementRfqStatus,
  type ProcurementRfqViewId,
} from "@/lib/procurement-rfq/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<ProcurementRfqViewId, string> = {
  all: "All",
  draft: "Draft",
  review: "Review",
  ready: "Ready",
  responses: "Awaiting responses",
  evaluation: "Evaluation",
  awarded: "Awarded",
  closed: "Closed",
};

const statusTone: Record<ProcurementRfqStatus, StatusTone> = {
  DRAFT: "neutral",
  REVIEW: "neutral",
  READY: "info",
  RESPONSES: "info",
  EVALUATION: "primary",
  AWARDED: "intel",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

type FormProduct = { id: string; name: string; sku: string; unit: string | null };
type FormSupplier = { id: string; name: string; code: string; status: string };

export function RfqWorkspace({
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New procurement RFQ</DialogTitle>
            <DialogDescription>Create an internal draft. No supplier communication is sent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="rfq-title">Title</Label>
              <Input id="rfq-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="rfq-due">Due date</Label>
              <Input id="rfq-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="rfq-material">Material</Label>
              <select
                id="rfq-material"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {formOptions.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="rfq-qty">Quantity</Label>
              <Input id="rfq-qty" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Suppliers (optional)</Label>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {formOptions.suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-8">
                      <input
                        type="checkbox"
                        checked={supplierIds.includes(supplier.id)}
                        onChange={() => toggleSupplier(supplier.id)}
                      />
                      {supplier.name} <span className="text-muted-foreground">({supplier.code})</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Label htmlFor="rfq-notes">Notes</Label>
              <Textarea id="rfq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={3} />
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void createDraft()}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
