"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { DEMO_TENANT_BRAND } from "@/lib/demo-tenant";
import type { OrderFormOptions } from "@/lib/server/commercial-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const DEFAULT_UNIT_PRICES: Record<string, string> = {
  "AMOX-500-CAP": "1850.00",
  "PARA-500-TAB": "420.00",
  "FERRO-FOLIC-TAB": "920.00",
  "AZITH-500-TAB": "2400.00",
  "COUGH-SYR-100": "310.00",
};

export function RecordCustomerOrderDialog({ orderForm }: { orderForm: OrderFormOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(orderForm.customers[0]?.id ?? "");
  const [productId, setProductId] = useState(orderForm.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("120");
  const [unitPrice, setUnitPrice] = useState(
    DEFAULT_UNIT_PRICES[orderForm.products[0]?.sku ?? ""] ?? "1000.00"
  );

  if (!orderForm.canManage || orderForm.customers.length === 0 || orderForm.products.length === 0) {
    return null;
  }

  function onProductChange(nextId: string) {
    setProductId(nextId);
    const sku = orderForm.products.find((row) => row.id === nextId)?.sku;
    if (sku && DEFAULT_UNIT_PRICES[sku]) setUnitPrice(DEFAULT_UNIT_PRICES[sku]);
  }

  function submit() {
    const qty = Number.parseInt(quantity, 10);
    if (!customerId || !productId || !Number.isFinite(qty) || qty <= 0) {
      setError("Choose a customer, product, and valid quantity.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, productId, quantity: qty, unitPrice, status: "CONFIRMED" }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Unable to record order.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-8">
          Record customer order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record customer order</DialogTitle>
          <DialogDescription>
            Confirmed commercial order for {DEMO_TENANT_BRAND} — updates dashboard revenue and activity.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-2"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              {orderForm.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Product</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-2"
              value={productId}
              onChange={(event) => onProductChange(event.target.value)}
            >
              {orderForm.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Quantity (packs)</span>
            <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Unit price (KSh)</span>
            <Input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="decimal" />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Confirm order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
