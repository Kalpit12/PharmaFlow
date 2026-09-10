"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

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
import type { StructuredAIResponse } from "@/lib/ai/response";
import type { ProcurementRfqDetail, ProcurementRfqStatus } from "@/lib/procurement-rfq/types";
import type { StatusTone } from "@/types/status";

const statusTone: Record<ProcurementRfqStatus, StatusTone> = {
  DRAFT: "neutral",
  REVIEW: "warning",
  READY: "info",
  RESPONSES: "info",
  EVALUATION: "warning",
  AWARDED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

const severityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
  OK: "success",
};

const NEXT_STATUS: Partial<Record<ProcurementRfqStatus, ProcurementRfqStatus>> = {
  DRAFT: "REVIEW",
  REVIEW: "READY",
  READY: "RESPONSES",
  RESPONSES: "EVALUATION",
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function RfqDetailWorkspace({ data }: { data: ProcurementRfqDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [awardTarget, setAwardTarget] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  const [supplierId, setSupplierId] = useState(data.invitedSuppliers[0]?.supplierId ?? data.suppliers[0]?.supplierId ?? "");
  const [currency, setCurrency] = useState("KES");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [quotedAt, setQuotedAt] = useState(new Date().toISOString().slice(0, 10));
  const [responseNotes, setResponseNotes] = useState("");
  const [lineItems, setLineItems] = useState(
    data.items.map((item) => ({ rfqItemId: item.id, quantity: item.quantity, unitPrice: "", notes: "" }))
  );

  const patchStatus = async (status: ProcurementRfqStatus) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/procurement-rfqs/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await result.json()) as { message?: string };
      if (!result.ok) {
        setError(payload.message ?? "Unable to update status.");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to update status.");
    } finally {
      setBusy(false);
    }
  };

  const recordResponse = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/procurement-rfqs/${data.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          currency,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
          quotedAt,
          notes: responseNotes || null,
          items: lineItems.map((row) => ({
            rfqItemId: row.rfqItemId,
            quantity: row.quantity,
            unitPrice: row.unitPrice ? Number(row.unitPrice) : null,
            notes: row.notes || null,
          })),
        }),
      });
      const payload = (await result.json()) as { message?: string };
      if (!result.ok) {
        setError(payload.message ?? "Unable to record response.");
        return;
      }
      setResponseOpen(false);
      router.refresh();
    } catch {
      setError("Unable to record response.");
    } finally {
      setBusy(false);
    }
  };

  const awardResponse = async () => {
    if (!awardTarget) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/procurement-rfqs/${data.id}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: awardTarget }),
      });
      const payload = (await result.json()) as { message?: string };
      if (!result.ok) {
        setError(payload.message ?? "Unable to award response.");
        return;
      }
      setAwardTarget(null);
      router.refresh();
    } catch {
      setError("Unable to award response.");
    } finally {
      setBusy(false);
    }
  };

  const analyzeRfq = async () => {
    setAiLoading(true);
    setAiError(false);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `Analyze RFQ procurement-rfq:${data.id}` }),
      });
      if (!res.ok) throw new Error("ai");
      const payload = (await res.json()) as StructuredAIResponse;
      setExplanation(payload);
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const next = NEXT_STATUS[data.status];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="min-h-11 px-0 sm:min-h-8">
          <Link href="/rfqs">
            <ArrowLeft data-icon="inline-start" />
            RFQ list
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {next && data.canReview ? (
            <Button type="button" size="sm" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => void patchStatus(next)}>
              Advance to {next}
            </Button>
          ) : null}
          {data.status !== "AWARDED" && data.status !== "CLOSED" && data.status !== "CANCELLED" ? (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => setResponseOpen(true)}>
              Record response
            </Button>
          ) : null}
          {data.status === "AWARDED" && data.canReview ? (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => void patchStatus("CLOSED")}>
              Close RFQ
            </Button>
          ) : null}
        </div>
      </div>

      <header className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{data.reference}</h1>
          <StatusBadge tone={statusTone[data.status]}>{data.status}</StatusBadge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{data.title}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Due</dt>
            <dd className="font-medium">{formatDay(data.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Created</dt>
            <dd className="font-medium">{formatDay(data.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Created by</dt>
            <dd className="font-medium">{data.createdByName}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Procurement source</dt>
            <dd className="font-medium">
              {data.procurementSourceHref ? (
                <Link href={data.procurementSourceHref} className="hover:underline">
                  {data.procurementSourceLabel}
                </Link>
              ) : (
                "Manual"
              )}
            </dd>
          </div>
        </dl>
        {data.notes ? <p className="mt-3 text-sm text-muted-foreground">{data.notes}</p> : null}
      </header>

      <section className="rounded-xl border border-border/80">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Requested items</h2>
        </div>
        <ul className="divide-y divide-border/60">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.sku}</p>
              </div>
              <p className="tabular-nums">
                {item.quantity.toLocaleString("en-KE")} {item.unit}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border/80">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Suppliers</h2>
          <p className="text-xs text-muted-foreground">Internal selection only — no automatic award.</p>
        </div>
        {data.invitedSuppliers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">No suppliers linked yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.invitedSuppliers.map((supplier) => (
              <li key={supplier.id} className="px-4 py-3 text-sm sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{supplier.name}</p>
                  <span className="text-xs text-muted-foreground">({supplier.code})</span>
                  {supplier.preferred ? <StatusBadge tone="success">Preferred</StatusBadge> : null}
                  <StatusBadge tone={supplier.status === "ACTIVE" ? "success" : "warning"}>{supplier.status}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lead time: {supplier.leadTimeDays !== null ? `${supplier.leadTimeDays} days` : "Not available"} · Price:{" "}
                  {supplier.unitPrice ?? "Not available"} · Invitation: {supplier.invitationStatus}
                </p>
              </li>
            ))}
          </ul>
        )}
        {data.suppliers.length > 0 ? (
          <div className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:px-5">
            Additional supplier options available from material intelligence ({data.suppliers.length}).
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border/80">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Response comparison</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{data.evaluationSummary}</p>
          {!data.currencyComparable && data.comparison.length > 1 ? (
            <p className="mt-1 text-xs text-warning">Currency comparison unavailable</p>
          ) : null}
        </div>
        {data.comparison.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No submitted responses yet.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit price</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Lead time</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Completeness</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.supplierName}</p>
                        <p className="text-xs text-muted-foreground">{row.reasoning}</p>
                      </td>
                      <td className="px-3 py-2.5">{row.quotedQuantity}</td>
                      <td className="px-3 py-2.5">{row.unitPrice}</td>
                      <td className="px-3 py-2.5">{row.total}</td>
                      <td className="px-3 py-2.5">{row.leadTime}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={severityTone[row.severity] ?? "neutral"}>{row.responseStatus}</StatusBadge>
                      </td>
                      <td className="px-3 py-2.5">{row.completeness}</td>
                      <td className="px-3 py-2.5">
                        {data.canAward && row.responseStatus === "SUBMITTED" ? (
                          <Button type="button" size="xs" className="min-h-11 sm:min-h-7" onClick={() => setAwardTarget(row.responseId)}>
                            Award
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border/60 md:hidden">
              {data.comparison.map((row) => (
                <li key={row.id} className="space-y-2 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{row.supplierName}</p>
                    <StatusBadge tone={severityTone[row.severity] ?? "neutral"}>{row.responseStatus}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Total</dt>
                      <dd>{row.total}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Lead time</dt>
                      <dd>{row.leadTime}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Completeness</dt>
                      <dd>{row.completeness}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Unit price</dt>
                      <dd>{row.unitPrice}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">{row.reasoning}</p>
                  {data.canAward && row.responseStatus === "SUBMITTED" ? (
                    <Button type="button" className="min-h-11 w-full" onClick={() => setAwardTarget(row.responseId)}>
                      Award response
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

        {data.status === "AWARDED" ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {data.linkedPurchaseOrder ? (
              <Button asChild className="min-h-11 sm:min-h-9">
                <Link href={`/purchase-orders/${data.linkedPurchaseOrder.id}`}>View Purchase Order · {data.linkedPurchaseOrder.poNumber}</Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11 sm:min-h-9"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const result = await fetch("/api/purchase-orders", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ rfqId: data.id }),
                    });
                    const payload = (await result.json()) as { purchaseOrder?: { id: string }; message?: string };
                    if (!result.ok || !payload.purchaseOrder) {
                      setError(payload.message ?? "Unable to create purchase order.");
                      return;
                    }
                    router.push(`/purchase-orders/${payload.purchaseOrder.id}`);
                  } catch {
                    setError("Unable to create purchase order.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Create Purchase Order
              </Button>
            )}
          </div>
        ) : null}

        <section className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">AI analysis</h2>
        </div>
        {!explanation && !aiError && !aiLoading && (
          <p className="text-sm text-muted-foreground">
            Comparison and evaluation are calculated without AI. Request analysis when you want the differences explained.
          </p>
        )}
        {aiLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Analyzing…
          </p>
        )}
        {aiError && (
          <p className="text-sm text-muted-foreground">AI analysis unavailable. Deterministic comparison remains fully usable.</p>
        )}
        {explanation ? (
          <div className="space-y-2 text-sm">
            <p className="leading-relaxed">{explanation.summary}</p>
            {explanation.keySignals.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {explanation.keySignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-8" disabled={aiLoading} onClick={() => void analyzeRfq()}>
          Analyze RFQ
        </Button>
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Dialog open={responseOpen} onOpenChange={setResponseOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record supplier response</DialogTitle>
            <DialogDescription>Internal quotation entry only. No email or external API is used.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Supplier</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                {[...data.invitedSuppliers, ...data.suppliers.map((s) => ({ supplierId: s.supplierId, name: s.name, code: s.code }))].map(
                  (supplier) => (
                    <option key={supplier.supplierId} value={supplier.supplierId}>
                      {supplier.name} ({supplier.code})
                    </option>
                  )
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="mt-1" />
              </div>
              <div>
                <Label>Lead time (days)</Label>
                <Input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="mt-1" type="number" min="0" />
              </div>
            </div>
            <div>
              <Label>Quoted date</Label>
              <Input type="date" value={quotedAt} onChange={(e) => setQuotedAt(e.target.value)} className="mt-1" />
            </div>
            {lineItems.map((line, index) => {
              const item = data.items.find((row) => row.id === line.rfqItemId);
              return (
                <div key={line.rfqItemId} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{item?.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...lineItems];
                        next[index] = { ...line, quantity: Number(e.target.value) };
                        setLineItems(next);
                      }}
                    />
                    <Input
                      placeholder="Unit price"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const next = [...lineItems];
                        next[index] = { ...line, unitPrice: e.target.value };
                        setLineItems(next);
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div>
              <Label>Notes</Label>
              <Textarea value={responseNotes} onChange={(e) => setResponseNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setResponseOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void recordResponse()}>
              Save response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(awardTarget)} onOpenChange={(open) => !open && setAwardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Award this RFQ response?</DialogTitle>
            <DialogDescription>
              This records a procurement decision. No purchase order or supplier communication will be created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAwardTarget(null)}>
              Cancel
            </Button>
            <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void awardResponse()}>
              Confirm award
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
