/**
 * Analyst Metric Catalog — deterministic measure definitions.
 * Replaces ad-hoc DAX with transparent, reusable plant facts.
 */

export type MetricCatalogEntry = {
  id: string;
  label: string;
  domain: "Sales" | "Inventory" | "Materials" | "Production" | "Procurement" | "Suppliers" | "Quality";
  how: string;
  source: string;
  limitation: string;
  href: string;
};

export const METRIC_CATALOG: MetricCatalogEntry[] = [
  {
    id: "revenue",
    label: "Revenue",
    domain: "Sales",
    how: "Sum of confirmed + fulfilled order totals in the reporting window.",
    source: "Order (realized statuses)",
    limitation: "Draft and cancelled orders are excluded.",
    href: "/reports?view=sales",
  },
  {
    id: "expired-qty",
    label: "Expired quantity",
    domain: "Inventory",
    how: "Sum of lot quantities where expiry date is before today (UTC).",
    source: "InventoryLot.expiryDate",
    limitation: "Uses recorded expiry dates only — no estimated shelf life.",
    href: "/reports?view=expiry",
  },
  {
    id: "ageing-bucket",
    label: "Ageing bucket",
    domain: "Inventory",
    how: "Days since receivedAt mapped into fixed ageing bands.",
    source: "InventoryLot.receivedAt",
    limitation: "Manufacturing date is not stored; received date is the ageing base.",
    href: "/reports?view=ageing",
  },
  {
    id: "safety-stock",
    label: "Stock vs safety stock",
    domain: "Inventory",
    how: "On-hand quantity compared to Product.safetyStock thresholds.",
    source: "InventoryLot + Product.safetyStock",
    limitation: "Does not reserve quantity for open sales orders.",
    href: "/reports?view=health",
  },
  {
    id: "mrp-net",
    label: "Material net requirement",
    domain: "Materials",
    how: "Gross BOM demand − available stock − open inbound.",
    source: "BillOfMaterial × open ProductionOrder + InventoryLot + InventoryReceipt OPEN",
    limitation: "Lead times and reorder points are not invented.",
    href: "/reports?view=materials",
  },
  {
    id: "inbound",
    label: "Open inbound",
    domain: "Procurement",
    how: "Quantity on InventoryReceipt rows with status OPEN.",
    source: "InventoryReceipt",
    limitation: "Expected quantity — not yet on hand.",
    href: "/reports?view=procurement",
  },
  {
    id: "production-at-risk",
    label: "Production at risk",
    domain: "Production",
    how: "Planner displayStatus AT_RISK (past due when planned) within the operations window.",
    source: "ProductionOrder via Operations Planner",
    limitation: "Uses the same engine as /operations — not a second schedule.",
    href: "/reports?view=operations",
  },
  {
    id: "planned-vs-actual",
    label: "Production planned vs actual",
    domain: "Production",
    how: "Planned quantity from open/scheduled orders; actual from COMPLETED order quantities.",
    source: "ProductionOrder.status + quantity",
    limitation: "Actual output uses completed orders; batch producedQuantity when present elsewhere.",
    href: "/reports?view=operations",
  },
  {
    id: "supplier-completion",
    label: "Supplier completion rate",
    domain: "Suppliers",
    how: "Received quantity ÷ ordered quantity across PO/receipt history.",
    source: "PurchaseOrderItem + InventoryReceipt",
    limitation: "Suppliers without enough history show insufficient data.",
    href: "/reports?view=suppliers",
  },
  {
    id: "inventory-history",
    label: "Inventory weekly trend",
    domain: "Inventory",
    how: "Sum of stored InventorySnapshot quantity by capturedOn week.",
    source: "InventorySnapshot",
    limitation: "Not a time-travel of current lots. Date range also scopes lots by receivedAt.",
    href: "/reports?view=inventory",
  },
];

export function metricCatalogByDomain(): Array<{ domain: MetricCatalogEntry["domain"]; metrics: MetricCatalogEntry[] }> {
  const domains: MetricCatalogEntry["domain"][] = [
    "Sales",
    "Inventory",
    "Materials",
    "Production",
    "Procurement",
    "Suppliers",
    "Quality",
  ];
  return domains
    .map((domain) => ({ domain, metrics: METRIC_CATALOG.filter((row) => row.domain === domain) }))
    .filter((group) => group.metrics.length > 0);
}
