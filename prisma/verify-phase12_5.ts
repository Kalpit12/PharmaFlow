import { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutes,
  buildSchedule,
  comparePlannerOrders,
  detectConflicts,
  utilizationPercent,
  type PlannerOrder,
} from "../src/lib/operations/schedule";
import { proposeAction } from "../src/lib/server/actions";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { proposeWorkflow } from "../src/lib/server/workflows";
import { ensureOperationsDemoData } from "./seed-operations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function order(partial: Partial<PlannerOrder> & Pick<PlannerOrder, "id" | "orderNumber">): PlannerOrder {
  return {
    productName: "Amoxicillin 500mg",
    workstationId: "ws-a",
    durationMinutes: 480,
    priority: "NORMAL",
    dueDate: new Date("2026-08-20T16:00:00.000Z"),
    createdAt: new Date("2026-08-10T08:00:00.000Z"),
    isLocked: false,
    plannedStart: null,
    plannedEnd: null,
    ...partial,
  };
}

export async function runPhase12_5Verify(prisma: PrismaClient) {
  const window = { start: new Date("2026-08-17T00:00:00.000Z"), end: new Date("2026-08-24T00:00:00.000Z") };
  const ws = [{ id: "ws-a", name: "Tablet Line A", code: "TLA", capacityHoursPerDay: 8 }];

  const ranked = [
    order({ id: "4", orderNumber: "D", priority: "LOW", dueDate: new Date("2026-08-18T00:00:00Z") }),
    order({ id: "1", orderNumber: "A", priority: "CRITICAL", dueDate: new Date("2026-08-22T00:00:00Z") }),
    order({ id: "3", orderNumber: "C", priority: "HIGH", dueDate: new Date("2026-08-21T00:00:00Z") }),
    order({ id: "2", orderNumber: "B", priority: "HIGH", dueDate: new Date("2026-08-19T00:00:00Z") }),
  ].sort(comparePlannerOrders);
  assert(ranked.map((row) => row.orderNumber).join("") === "ABCD", "Priority then due-date ordering");

  const lockedStart = new Date("2026-08-17T08:00:00.000Z");
  const lockedEnd = new Date("2026-08-17T16:00:00.000Z");
  const lockedPlan = buildSchedule(
    [
      order({
        id: "lock",
        orderNumber: "PO-LOCK",
        isLocked: true,
        plannedStart: lockedStart,
        plannedEnd: lockedEnd,
        priority: "LOW",
        dueDate: new Date("2026-08-30T00:00:00Z"),
      }),
      order({ id: "open", orderNumber: "PO-OPEN", durationMinutes: 120, priority: "CRITICAL" }),
    ],
    ws,
    window
  );
  const locked = lockedPlan.orders.find((row) => row.id === "lock");
  assert(locked?.plannedStart?.getTime() === lockedStart.getTime(), "Locked order preservation");

  assert(utilizationPercent(240, 480) === 50, "Utilization calculation");
  assert(addWorkingMinutes(new Date("2026-08-17T08:00:00Z"), 480, 8).getUTCHours() === 16, "Capacity / duration");

  const overlap = detectConflicts(
    [
      {
        ...order({ id: "o1", orderNumber: "PO-1", plannedStart: lockedStart, plannedEnd: lockedEnd }),
        displayStatus: "SCHEDULED",
      },
      {
        ...order({ id: "o2", orderNumber: "PO-2", plannedStart: new Date("2026-08-17T12:00:00Z"), plannedEnd: new Date("2026-08-17T18:00:00Z") }),
        displayStatus: "SCHEDULED",
      },
    ],
    ws,
    window
  );
  assert(overlap.some((row) => row.detail.includes("overlaps")), "Overlap detection");

  const late = detectConflicts(
    [
      {
        ...order({
          id: "late",
          orderNumber: "PO-104",
          dueDate: new Date("2026-08-18T00:00:00Z"),
          plannedStart: new Date("2026-08-17T08:00:00Z"),
          plannedEnd: new Date("2026-08-20T16:00:00Z"),
        }),
        displayStatus: "AT_RISK",
      },
    ],
    ws,
    window
  );
  assert(late.some((row) => row.title.includes("at risk")), "Due-date risk detection");

  const none = detectConflicts(
    [{ ...order({ id: "u1", orderNumber: "PO-U", plannedStart: null, plannedEnd: null, workstationId: null }), displayStatus: "UNSCHEDULED" }],
    ws,
    window
  );
  assert(none.some((row) => row.title.includes("unscheduled")), "Unscheduled order detection");

  const input = [order({ id: "s1", orderNumber: "PO-S1", durationMinutes: 240, priority: "HIGH" })];
  const a = buildSchedule(input, ws, window);
  const b = buildSchedule(input, ws, window);
  assert(JSON.stringify(a) === JSON.stringify(b), "Deterministic scheduling is stable");

  await ensureOperationsDemoData(prisma);
  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const planA = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  const planB = await getOperationsPlanner(other, resolvePlanningWindow({ weeks: "1" }));
  assert(!planA.orders.some((row) => row.orderNumber === "PO-B-1"), "Tenant isolation");
  assert(!planB.orders.some((row) => row.orderNumber === "PO-104"), "ProductionOrder tenant isolation");
  assert(planB.workstations.every((row) => row.code === "ISO-1"), "Workstation tenant isolation");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase12.5 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase12.5 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.needsReview) && Array.isArray(comms.recent), "Phase 11 communications still work");

  console.log("Phase 12.5 verification passed.");
}
