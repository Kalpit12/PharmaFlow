import type { OrderMaterialConstraint } from "@/lib/operations/material-constraints";

export type MaterialDelaySignal = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  orderId: string;
  orderNumber: string;
  batchNumber: string | null;
  delayDays: number;
  materialLabel: string;
  message: string;
  href: string;
  materialsHref: string;
  procurementHref: string;
};

const DAY_MS = 86_400_000;

export function formatBatchMaterialDelayMessage(input: {
  batchNumber: string | null;
  orderNumber: string;
  delayDays: number;
  materialLabel: string;
  state: "BLOCKED" | "DELAYED";
}): string {
  const batch = input.batchNumber ?? input.orderNumber;
  const dayLabel = input.delayDays === 1 ? "1 day" : `${input.delayDays} days`;
  const verb = input.state === "BLOCKED" ? "blocked" : "delayed";
  return `Batch ${batch} ${verb} ${dayLabel}: ${input.materialLabel} net short.`;
}

export function buildMaterialDelaySignals(input: {
  orders: Array<{
    id: string;
    orderNumber: string;
    batchNumber: string | null;
    plannedStart: string | null;
  }>;
  constraints: Map<string, OrderMaterialConstraint>;
  now?: Date;
}): MaterialDelaySignal[] {
  const now = input.now ?? new Date();
  const signals: MaterialDelaySignal[] = [];

  for (const order of input.orders) {
    const constraint = input.constraints.get(order.id);
    if (!constraint || constraint.state === "READY" || constraint.state === "UNKNOWN") continue;

    const names =
      constraint.state === "BLOCKED"
        ? constraint.blockedMaterials
        : constraint.delayedMaterials.length > 0
          ? constraint.delayedMaterials
          : constraint.blockedMaterials;
    if (names.length === 0) continue;

    const materialLabel = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
    const readyAt = constraint.readyAt?.getTime() ?? now.getTime();
    const plannedStart = order.plannedStart ? new Date(order.plannedStart).getTime() : now.getTime();
    const delayMs = Math.max(0, readyAt - plannedStart);
    const delayDays = Math.max(1, Math.ceil(delayMs / DAY_MS));
    const severity: MaterialDelaySignal["severity"] =
      constraint.state === "BLOCKED" ? "CRITICAL" : delayDays >= 3 ? "HIGH" : "MEDIUM";

    signals.push({
      id: `mat-delay-${order.id}`,
      severity,
      orderId: order.id,
      orderNumber: order.orderNumber,
      batchNumber: order.batchNumber,
      delayDays,
      materialLabel,
      message: formatBatchMaterialDelayMessage({
        batchNumber: order.batchNumber,
        orderNumber: order.orderNumber,
        delayDays,
        materialLabel,
        state: constraint.state === "BLOCKED" ? "BLOCKED" : "DELAYED",
      }),
      href: `/operations?order=${order.id}`,
      materialsHref: `/materials?view=shortages&q=${encodeURIComponent(names[0] ?? "")}`,
      procurementHref: "/procurement?view=needs-review",
    });
  }

  return signals.sort(
    (a, b) =>
      (a.severity === "CRITICAL" ? 3 : a.severity === "HIGH" ? 2 : 1) -
        (b.severity === "CRITICAL" ? 3 : b.severity === "HIGH" ? 2 : 1) ||
      b.delayDays - a.delayDays ||
      a.orderNumber.localeCompare(b.orderNumber)
  );
}
