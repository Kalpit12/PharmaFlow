import type { MaterialRequirement } from "@/lib/materials/types";
import { PRIORITY_RANK } from "@/lib/operations/schedule";

export type MaterialScheduleState = "READY" | "DELAYED" | "BLOCKED" | "UNKNOWN";

export type OrderMaterialConstraint = {
  orderId: string;
  state: MaterialScheduleState;
  readyAt: Date | null;
  blockedMaterials: string[];
  delayedMaterials: string[];
};

type MutableConstraint = {
  hasDemand: boolean;
  readyAt: Date;
  blockedMaterials: Set<string>;
  delayedMaterials: Set<string>;
};

/**
 * Allocates dated material supply to production orders deterministically.
 *
 * Higher-priority, earlier-due orders receive supply first. Undated incoming
 * receipts do not unlock a schedule because their availability date is not
 * known. This is a planning constraint only; it does not consume inventory.
 */
export function buildOrderMaterialConstraints(
  materials: MaterialRequirement[],
  orderIds: string[],
  now: Date
): Map<string, OrderMaterialConstraint> {
  const mutable = new Map<string, MutableConstraint>(
    orderIds.map((orderId) => [
      orderId,
      {
        hasDemand: false,
        readyAt: now,
        blockedMaterials: new Set<string>(),
        delayedMaterials: new Set<string>(),
      },
    ])
  );

  for (const material of materials) {
    const affected = material.affectedOrders.slice().sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() ||
        a.orderNumber.localeCompare(b.orderNumber)
    );
    const datedSupply = [
      { at: now, quantity: Math.max(0, material.onHand) },
      ...(material.incomingReceipts ?? [])
        .filter((receipt) => receipt.expectedAt)
        .map((receipt) => {
          const expectedAt = new Date(receipt.expectedAt!);
          return {
            at:
              Number.isNaN(expectedAt.getTime()) || expectedAt.getTime() < now.getTime()
                ? now
                : expectedAt,
            quantity: Math.max(0, receipt.quantity),
          };
        }),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    let allocated = 0;
    for (const order of affected) {
      allocated += Math.max(0, order.requiredQuantity);
      const constraint = mutable.get(order.id);
      if (!constraint) continue;
      constraint.hasDemand = true;

      let cumulative = 0;
      let availableAt: Date | null = null;
      for (const supply of datedSupply) {
        cumulative += supply.quantity;
        if (cumulative + 1e-9 >= allocated) {
          availableAt = supply.at;
          break;
        }
      }

      if (!availableAt) {
        constraint.blockedMaterials.add(material.name);
      } else if (availableAt.getTime() > now.getTime()) {
        constraint.delayedMaterials.add(material.name);
        if (availableAt.getTime() > constraint.readyAt.getTime()) constraint.readyAt = availableAt;
      }
    }
  }

  return new Map(
    [...mutable.entries()].map(([orderId, constraint]) => {
      const blockedMaterials = [...constraint.blockedMaterials].sort();
      const delayedMaterials = [...constraint.delayedMaterials].sort();
      const state: MaterialScheduleState =
        !constraint.hasDemand
          ? "UNKNOWN"
          : blockedMaterials.length > 0
            ? "BLOCKED"
            : delayedMaterials.length > 0
              ? "DELAYED"
              : "READY";
      return [
        orderId,
        {
          orderId,
          state,
          readyAt: state === "READY" || state === "DELAYED" ? constraint.readyAt : null,
          blockedMaterials,
          delayedMaterials,
        },
      ];
    })
  );
}
