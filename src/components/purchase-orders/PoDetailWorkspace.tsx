"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StructuredAIResponse } from "@/lib/ai/response";
import type { PurchaseOrderDetail } from "@/lib/purchase-orders/types";
import type { StatusTone } from "@/types/status";

const statusTone: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "material",
  APPROVED: "intel",
  REJECTED: "neutral",
  CANCELLED: "neutral",
  CLOSED: "neutral",
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function PoDetailWorkspace({ data }: { data: PurchaseOrderDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(data.notes ?? "");
  const [items, setItems] = useState(
    data.items.map((row) => ({ id: row.id, quantity: row.quantity, unitPrice: row.unitPrice.replace(/[^\d.-]/g, "") }))
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  const post = async (path: string, method = "POST", body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await result.json()) as { message?: string };
      if (!result.ok) {
        setError(payload.message ?? "Unable to complete action.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Unable to complete action.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    await post(`/api/purchase-orders/${data.id}`, "PATCH", {
      notes,
      items: items.map((row) => ({ id: row.id, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) })),
    });
  };

  const explain = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `Explain this purchase order purchase-order:${data.id}` }),
      });
      if (!res.ok) throw new Error("ai");
      setExplanation((await res.json()) as StructuredAIResponse);
    } catch {
      setError("AI explanation unavailable.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="min-h-11 w-fit px-0 sm:min-h-8">
        <Link href="/purchase-orders">
          <ArrowLeft data-icon="inline-start" />
          Purchase orders
        </Link>
      </Button>

      <header className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{data.poNumber}</h1>
          <StatusBadge tone={statusTone[data.status] ?? "neutral"}>{data.status.replaceAll("_", " ")}</StatusBadge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.supplierName} ({data.supplierCode})
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">RFQ</dt>
            <dd>{data.rfqHref ? <Link href={data.rfqHref} className="hover:underline">{data.rfqReference}</Link> : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Requisition</dt>
            <dd>{data.requisitionHref ? <Link href={data.requisitionHref} className="hover:underline">View</Link> : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Created</dt>
            <dd>{formatDay(data.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Created by</dt>
            <dd>{data.createdByName}</dd>
          </div>
        </dl>
        {data.status === "APPROVED" ? (
          <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Approved for purchasing. No supplier communication has been sent.
            {data.remainingQuantity > 0 ? ` ${data.receivedQuantity} of ${data.receivedQuantity + data.remainingQuantity} units received.` : null}
          </p>
        ) : null}
        {data.canReceive && data.receivingHref ? (
          <div className="mt-3">
            <Button asChild className="min-h-11 sm:min-h-9">
              <Link href={data.receivingHref}>Receive goods</Link>
            </Button>
          </div>
        ) : null}
      </header>

      <section className="rounded-xl border border-border/80">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Line items</h2>
        </div>
        <ul className="divide-y divide-border/60">
          {data.items.map((item, index) => (
            <li key={item.id} className="px-4 py-3 text-sm sm:px-5">
              <p className="font-medium">{item.description}</p>
              {data.canEdit ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={items[index]?.quantity ?? item.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index]!, quantity: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                  <Input
                    placeholder="Unit price"
                    value={items[index]?.unitPrice ?? ""}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index]!, unitPrice: e.target.value };
                      setItems(next);
                    }}
                  />
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Qty {item.quantity}
                  {item.receivedQuantity > 0 ? ` · Received ${item.receivedQuantity}` : ""}
                  {item.remainingQuantity > 0 ? ` · Remaining ${item.remainingQuantity}` : ""}
                  {" · "}
                  {item.unitPrice} · {item.lineTotal}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-border/70 px-4 py-3 text-sm font-medium sm:px-5">Subtotal: {data.subtotal}</div>
      </section>

      {data.canEdit ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void saveDraft()}>
              Save draft
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void post(`/api/purchase-orders/${data.id}/submit`)}>
              Submit for approval
            </Button>
          </div>
        </div>
      ) : null}

      {data.canApprove ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void post(`/api/purchase-orders/${data.id}/approve`)}>
            Approve
          </Button>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void post(`/api/purchase-orders/${data.id}/reject`)}>
            Reject
          </Button>
        </div>
      ) : null}

      {(data.reviewedByName || data.reviewedAt) && (
        <p className="text-xs text-muted-foreground">
          Reviewed by {data.reviewedByName ?? "—"} · {formatDay(data.reviewedAt)}
        </p>
      )}

      <section className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">AI explanation</h2>
        </div>
        {explanation ? <p className="text-sm leading-relaxed">{explanation.summary}</p> : null}
        <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-8" disabled={aiLoading} onClick={() => void explain()}>
          {aiLoading ? <Loader2 className="size-4 animate-spin" /> : "Explain this purchase order"}
        </Button>
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
