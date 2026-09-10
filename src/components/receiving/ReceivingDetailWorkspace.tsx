"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { ReceivingDetail } from "@/lib/receiving/types";
import type { StatusTone } from "@/types/status";

const statusTone: Record<string, StatusTone> = {
  APPROVED: "intel",
  CLOSED: "neutral",
};

type LineState = {
  purchaseOrderItemId: string;
  quantityReceived: string;
  batchCode: string;
  expiryDate: string;
  warehouseId: string;
  notes: string;
};

export function ReceivingDetailWorkspace({ data }: { data: ReceivingDetail }) {
  const router = useRouter();
  const compact = useCompactLayout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [lines, setLines] = useState<LineState[]>(
    data.items.map((item) => ({
      purchaseOrderItemId: item.id,
      quantityReceived: item.remainingQuantity > 0 ? String(item.remainingQuantity) : "0",
      batchCode: "",
      expiryDate: "",
      warehouseId: item.warehouses[0]?.id ?? "",
      notes: "",
    }))
  );

  const receiveSummary = useMemo(() => {
    const active = lines
      .map((line, index) => ({ line, item: data.items[index] }))
      .filter(({ line }) => Number(line.quantityReceived) > 0);
    const totalQty = active.reduce((sum, row) => sum + Number(row.line.quantityReceived), 0);
    return { active, totalQty, lineCount: active.length };
  }, [lines, data.items]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = idempotencyKey ?? crypto.randomUUID();
      const payload = {
        idempotencyKey: key,
        lines: receiveSummary.active.map(({ line }) => ({
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantityReceived: Number(line.quantityReceived),
          batchCode: line.batchCode.trim(),
          expiryDate: line.expiryDate || null,
          warehouseId: line.warehouseId,
          notes: line.notes.trim() || null,
        })),
      };
      const result = await fetch(`/api/purchase-orders/${data.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await result.json()) as { message?: string; result?: { discrepancies?: string[] } };
      if (!result.ok) {
        setError(body.message ?? "Unable to receive goods.");
        return;
      }
      setConfirmOpen(false);
      if (body.result?.discrepancies?.length) {
        setError(`Received with discrepancies: ${body.result.discrepancies.join("; ")}`);
      }
      router.refresh();
    } catch {
      setError("Unable to receive goods.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="min-h-11 w-fit px-0 sm:min-h-8">
        <Link href="/receiving">
          <ArrowLeft data-icon="inline-start" />
          Receiving
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
            <dt className="text-[11px] uppercase text-muted-foreground">Ordered</dt>
            <dd className="tabular-nums">{data.orderedQuantity.toLocaleString("en-KE")}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Received</dt>
            <dd className="tabular-nums">{data.receivedQuantity.toLocaleString("en-KE")}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Remaining</dt>
            <dd className="tabular-nums">{data.remainingQuantity.toLocaleString("en-KE")}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">RFQ</dt>
            <dd>{data.rfqHref ? <Link href={data.rfqHref} className="hover:underline">{data.rfqReference}</Link> : "—"}</dd>
          </div>
        </dl>
      </header>

      {data.canReceive ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Receive lines</h2>
          <div className="space-y-3">
            {data.items.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-border/80 p-4">
                <p className="font-medium">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  Ordered {item.orderedQuantity} · Received {item.receivedQuantity} · Remaining {item.remainingQuantity}
                </p>
                {item.remainingQuantity > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`qty-${item.id}`}>Quantity received now</Label>
                      <Input
                        id={`qty-${item.id}`}
                        type="number"
                        min={0}
                        max={item.remainingQuantity}
                        className="mt-1 min-h-11"
                        value={lines[index]?.quantityReceived ?? "0"}
                        onChange={(e) => {
                          const next = [...lines];
                          next[index] = { ...next[index]!, quantityReceived: e.target.value };
                          setLines(next);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`batch-${item.id}`}>Batch / lot</Label>
                      <Input
                        id={`batch-${item.id}`}
                        className="mt-1 min-h-11"
                        value={lines[index]?.batchCode ?? ""}
                        onChange={(e) => {
                          const next = [...lines];
                          next[index] = { ...next[index]!, batchCode: e.target.value };
                          setLines(next);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`expiry-${item.id}`}>Expiry (optional)</Label>
                      <Input
                        id={`expiry-${item.id}`}
                        type="date"
                        className="mt-1 min-h-11"
                        value={lines[index]?.expiryDate ?? ""}
                        onChange={(e) => {
                          const next = [...lines];
                          next[index] = { ...next[index]!, expiryDate: e.target.value };
                          setLines(next);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`wh-${item.id}`}>Warehouse</Label>
                      <select
                        id={`wh-${item.id}`}
                        className="mt-1 flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={lines[index]?.warehouseId ?? ""}
                        onChange={(e) => {
                          const next = [...lines];
                          next[index] = { ...next[index]!, warehouseId: e.target.value };
                          setLines(next);
                        }}
                      >
                        {item.warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} ({wh.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Fully received.</p>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto sm:min-h-9"
            disabled={busy || receiveSummary.totalQty <= 0}
            onClick={() => {
              setIdempotencyKey(crypto.randomUUID());
              setConfirmOpen(true);
            }}
          >
            Receive goods
          </Button>
        </section>
      ) : data.fullyReceived ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          This purchase order is fully received and closed.
        </p>
      ) : (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Receiving is only available for approved purchase orders with remaining quantity.
        </p>
      )}

      {data.receipts.length > 0 ? (
        <section className="rounded-xl border border-border/80">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">Receipt history</h2>
          </div>
          <ul className="divide-y divide-border/60">
            {data.receipts.map((receipt) => (
              <li key={receipt.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="font-medium">{receipt.reference}</p>
                <p className="text-muted-foreground">
                  {receipt.quantity.toLocaleString("en-KE")} units · {receipt.batchCode ?? "—"} · {receipt.receivedByName ?? "—"}
                </p>
                {receipt.discrepancyReason ? (
                  <p className="mt-1 text-xs text-material">Discrepancy: {receipt.discrepancyReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side={compact ? "bottom" : "right"} className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Confirm receiving</SheetTitle>
            <SheetDescription>This will update inventory.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6 text-sm">
            <p>
              <span className="text-muted-foreground">PO:</span> {data.poNumber}
            </p>
            <p>
              <span className="text-muted-foreground">Supplier:</span> {data.supplierName}
            </p>
            <p>
              <span className="text-muted-foreground">Lines:</span> {receiveSummary.lineCount}
            </p>
            <p>
              <span className="text-muted-foreground">Total quantity:</span> {receiveSummary.totalQty.toLocaleString("en-KE")}
            </p>
            <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Confirm receive
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
