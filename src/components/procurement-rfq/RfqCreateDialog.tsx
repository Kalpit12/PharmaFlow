"use client";

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

type FormProduct = { id: string; name: string; sku: string; unit: string | null };
type FormSupplier = { id: string; name: string; code: string; status: string };

export function RfqCreateDialog({
  open,
  onOpenChange,
  busy,
  error,
  title,
  dueDate,
  notes,
  productId,
  quantity,
  supplierIds,
  formOptions,
  onTitleChange,
  onDueDateChange,
  onNotesChange,
  onProductIdChange,
  onQuantityChange,
  onToggleSupplier,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  title: string;
  dueDate: string;
  notes: string;
  productId: string;
  quantity: string;
  supplierIds: string[];
  formOptions: { products: FormProduct[]; suppliers: FormSupplier[] };
  onTitleChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onProductIdChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onToggleSupplier: (id: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New procurement RFQ</DialogTitle>
          <DialogDescription>Create an internal draft. No supplier communication is sent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="rfq-title">Title</Label>
            <Input id="rfq-title" value={title} onChange={(e) => onTitleChange(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="rfq-due">Due date</Label>
            <Input id="rfq-due" type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="rfq-material">Material</Label>
            <select
              id="rfq-material"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={productId}
              onChange={(e) => onProductIdChange(e.target.value)}
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
            <Input id="rfq-qty" type="number" min="0" value={quantity} onChange={(e) => onQuantityChange(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Suppliers (optional)</Label>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {formOptions.suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-8">
                    <input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={() => onToggleSupplier(supplier.id)} />
                    {supplier.name} <span className="text-muted-foreground">({supplier.code})</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Label htmlFor="rfq-notes">Notes</Label>
            <Textarea id="rfq-notes" value={notes} onChange={(e) => onNotesChange(e.target.value)} className="mt-1" rows={3} />
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={onSubmit}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
