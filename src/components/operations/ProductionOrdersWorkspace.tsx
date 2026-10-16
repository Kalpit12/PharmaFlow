"use client";

import { useMemo, useState, useTransition } from "react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProductionOrdersSnapshot } from "@/lib/server/production-orders-phase2";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function priorityTone(priority: string): "danger" | "warning" | "intel" | "neutral" {
  if (priority === "CRITICAL") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "NORMAL") return "intel";
  return "neutral";
}

type OrderFormState = {
  productId: string;
  quantity: string;
  dueDate: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  customerId: string;
  scheduleDirection: "FORWARD" | "JIT";
  reserveCapacity: boolean;
  simulateProspect: boolean;
};

const defaultForm = (products: ProductionOrdersSnapshot["products"]): OrderFormState => ({
  productId: products[0]?.id ?? "",
  quantity: "10000",
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  priority: "NORMAL",
  customerId: "",
  scheduleDirection: "FORWARD",
  reserveCapacity: false,
  simulateProspect: true,
});

export function ProductionOrdersWorkspace({ data }: { data: ProductionOrdersSnapshot }) {
  const [form, setForm] = useState<OrderFormState>(() => defaultForm(data.products));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const firmOrders = useMemo(() => data.orders.filter((row) => row.orderKind === "FIRM"), [data.orders]);
  const prospects = useMemo(() => data.orders.filter((row) => row.orderKind === "PROSPECT"), [data.orders]);

  const selectedProduct = data.products.find((row) => row.id === form.productId);

  const submitFirm = () => {
    startTransition(async () => {
      setMessage(null);
      const quantity = Number.parseInt(form.quantity, 10);
      const response = await fetch("/api/production-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId,
          quantity,
          dueDate: form.dueDate,
          priority: form.priority,
          customerId: form.customerId || undefined,
          scheduleDirection: form.scheduleDirection,
          reserveCapacity: form.reserveCapacity,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; orderNumber?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to create order.");
        return;
      }
      setMessage(`Firm order ${payload.orderNumber ?? ""} created. Refresh to see it in the list.`);
    });
  };

  const submitProspect = () => {
    startTransition(async () => {
      setMessage(null);
      const quantity = Number.parseInt(form.quantity, 10);
      const response = await fetch("/api/production-orders/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId,
          quantity,
          dueDate: form.dueDate,
          priority: form.priority,
          customerId: form.customerId || undefined,
          scheduleDirection: form.scheduleDirection,
          reserveCapacity: form.reserveCapacity,
          simulate: form.simulateProspect,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        orderNumber?: string;
        simulation?: { feasibleEnd?: string | null; message?: string };
      };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to create prospect.");
        return;
      }
      const sim = payload.simulation?.feasibleEnd
        ? ` Simulated finish ${formatDate(payload.simulation.feasibleEnd)}.`
        : "";
      setMessage(`Prospect ${payload.orderNumber ?? ""} created.${sim} Refresh to update the table.`);
    });
  };

  const convertProspect = (orderId: string) => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(`/api/production-orders/${orderId}/convert-prospect`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Conversion failed.");
        return;
      }
      setMessage("Prospect converted to firm order. Refresh to see updates.");
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <p className="text-sm text-muted-foreground">
          Firm orders and job prospects with batch sizing, customer priority, forward or JIT scheduling, and optional capacity
          reservation. Prospects can run a delivery simulation before conversion.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge tone="intel">{firmOrders.length} firm</StatusBadge>
          <StatusBadge tone={prospects.length > 0 ? "warning" : "neutral"}>{data.prospects} prospects</StatusBadge>
          <StatusBadge tone="neutral">{data.campaigns.length} campaigns</StatusBadge>
        </div>
      </section>

      <Tabs defaultValue="orders" className="min-w-0">
        <TabsList>
          <TabsTrigger value="orders">Orders & prospects</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4 min-w-0">
          <div className="work-surface overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty / batch</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Feasible</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-muted-foreground">
                      No production orders yet. Create a firm order or prospect.
                    </td>
                  </tr>
                ) : (
                  data.orders.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-3 py-2 font-mono text-xs">{row.orderNumber}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={row.orderKind === "PROSPECT" ? "warning" : "intel"}>{row.orderKind}</StatusBadge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.productName}</div>
                        <div className="text-xs text-muted-foreground">{row.customerName ?? row.productSku}</div>
                      </td>
                      <td className="px-3 py-2">
                        {row.quantity.toLocaleString()}
                        {row.isPartialBatch ? (
                          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">partial</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-2">{formatDate(row.feasibleEndAt)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={priorityTone(row.priority)}>{row.priority}</StatusBadge>
                        <span className="ml-2 text-xs text-muted-foreground">{row.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.orderKind === "PROSPECT" ? (
                          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => convertProspect(row.id)}>
                            Convert
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="create" className="mt-4">
          <div className="work-surface grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="po-product">Product</Label>
              <select
                id="po-product"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.productId}
                onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value }))}
              >
                {data.products.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.sku})
                    {row.validatedBatchSize ? ` · batch ${row.validatedBatchSize.toLocaleString()}` : ""}
                  </option>
                ))}
              </select>
              {selectedProduct?.validatedBatchSize ? (
                <p className="text-xs text-muted-foreground">
                  Validated batch size {selectedProduct.validatedBatchSize.toLocaleString()} units.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-qty">Quantity</Label>
              <Input
                id="po-qty"
                inputMode="numeric"
                value={form.quantity}
                onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-due">Due date</Label>
              <Input
                id="po-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-customer">Customer (optional)</Label>
              <select
                id="po-customer"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.customerId}
                onChange={(event) => setForm((prev) => ({ ...prev, customerId: event.target.value }))}
              >
                <option value="">—</option>
                {data.customers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} (default {row.defaultPriority})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-priority">Priority</Label>
              <select
                id="po-priority"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.priority}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priority: event.target.value as OrderFormState["priority"] }))
                }
              >
                {(["CRITICAL", "HIGH", "NORMAL", "LOW"] as const).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-direction">Schedule direction</Label>
              <select
                id="po-direction"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.scheduleDirection}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduleDirection: event.target.value as OrderFormState["scheduleDirection"],
                  }))
                }
              >
                <option value="FORWARD">Forward from earliest start</option>
                <option value="JIT">Just-in-time to due date</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.reserveCapacity}
                  onChange={(event) => setForm((prev) => ({ ...prev, reserveCapacity: event.target.checked }))}
                />
                Reserve capacity when scheduled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.simulateProspect}
                  onChange={(event) => setForm((prev) => ({ ...prev, simulateProspect: event.target.checked }))}
                />
                Run delivery simulation for new prospects
              </label>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={pending || !form.productId} onClick={submitFirm}>
                Create firm order
              </Button>
              <Button type="button" variant="secondary" disabled={pending || !form.productId} onClick={submitProspect}>
                Create prospect
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <div className="work-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-muted-foreground">
                      No campaigns yet. Campaign authoring UI is planned for a later slice.
                    </td>
                  </tr>
                ) : (
                  data.campaigns.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.productName}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{row.orderCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {message ? (
        <p className={cn("text-sm", message.includes("Unable") || message.includes("failed") ? "text-destructive" : "text-muted-foreground")}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
