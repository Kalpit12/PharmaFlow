import assert from "node:assert/strict";

import { buildMaterialDelaySignals, formatBatchMaterialDelayMessage } from "../src/lib/operations/planner-integrations";
import type { OrderMaterialConstraint } from "../src/lib/operations/material-constraints";
import { DEFAULT_INBOUND_LEAD_DAYS, incomingReceiptReference } from "../src/lib/server/supply-timeline";

const now = new Date("2026-10-15T08:00:00.000Z");
const constraints = new Map<string, OrderMaterialConstraint>([
  [
    "o1",
    {
      orderId: "o1",
      state: "DELAYED",
      readyAt: new Date("2026-10-18T08:00:00.000Z"),
      blockedMaterials: [],
      delayedMaterials: ["Blister foil"],
    },
  ],
]);

const signals = buildMaterialDelaySignals({
  orders: [
    {
      id: "o1",
      orderNumber: "PRO-104",
      batchNumber: "LAB-2026-031",
      plannedStart: "2026-10-15T08:00:00.000Z",
    },
  ],
  constraints,
  now,
});

assert.equal(signals.length, 1);
assert.match(signals[0]!.message, /LAB-2026-031 delayed 3 days/i);
assert.match(signals[0]!.message, /Blister foil/i);

const blockedMsg = formatBatchMaterialDelayMessage({
  batchNumber: "LAB-1",
  orderNumber: "PO-1",
  delayDays: 2,
  materialLabel: "API",
  state: "BLOCKED",
});
assert.match(blockedMsg, /blocked 2 days/i);

assert.equal(DEFAULT_INBOUND_LEAD_DAYS, 7);
assert.equal(incomingReceiptReference("PO-100", "item-1"), "INCOMING-PO-100-item-1");

console.log("verify-planner-integrations: OK");
