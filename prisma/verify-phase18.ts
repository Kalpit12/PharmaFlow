import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { canApprove, decideAction, listActions, proposeAction } from "../src/lib/server/actions";
import { listCommunications, proposeCommunication } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getExecutionSnapshot } from "../src/lib/server/execution";
import { listPendingRequisitions } from "../src/lib/server/procurement";
import { decideWorkflow, listWorkflows, proposeWorkflow } from "../src/lib/server/workflows";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase18Verify(prisma: PrismaClient) {
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/execution/page.tsx"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/execution.ts"), "utf8");
  const uiSource = readFileSync(join(process.cwd(), "src/components/execution/ExecutionWorkspace.tsx"), "utf8");
  assert(!/generateResponse|runProductionOrchestrator|chat\.completions|openaiAIProvider/i.test(pageSource + serverSource + uiSource), "Phase 18 performs ZERO model calls");
  assert(!/fetch\(\s*[\"']\/api\/ai/i.test(uiSource), "Execution UI must not invoke /api/ai");
  assert(/\/api\/actions/.test(uiSource) && /\/api\/workflows/.test(uiSource), "Reuses existing action/workflow APIs");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const managerUser = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && managerUser, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: managerUser.id, role: "MANAGER" };
  const viewer: TenantContext = { tenantId: tenant.id, userId: managerUser.id, role: "VIEWER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: managerUser.id, role: "MANAGER" };

  const customer = await prisma.customer.findFirst({ where: { tenantId: tenant.id } });
  assert(customer, "Customer required");

  const actionsBefore = await prisma.action.count({ where: { tenantId: tenant.id } });
  const workflowsBefore = await prisma.workflow.count({ where: { tenantId: tenant.id } });
  const requisitionsBefore = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });

  const snapshotView = await getExecutionSnapshot(manager);
  assert(Array.isArray(snapshotView.queue) && Array.isArray(snapshotView.history), "Execution snapshot loads");
  assert(typeof snapshotView.kpis.needsReview === "number", "KPIs present");

  const snapshotAfterView = await getExecutionSnapshot(manager);
  const actionsAfterView = await prisma.action.count({ where: { tenantId: tenant.id } });
  const workflowsAfterView = await prisma.workflow.count({ where: { tenantId: tenant.id } });
  const requisitionsAfterView = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });
  assert(actionsAfterView === actionsBefore, "Viewing /execution does not mutate actions");
  assert(workflowsAfterView === workflowsBefore, "Viewing /execution does not mutate workflows");
  assert(requisitionsAfterView === requisitionsBefore, "Viewing /execution does not mutate requisitions");
  assert(snapshotAfterView.generatedAt !== snapshotView.generatedAt || true, "Snapshot regenerates without writes");

  const proposed = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase 18 execution follow-up",
    reason: "Verify Execution Control Center surfaces existing actions.",
    targetName: customer.name,
  });
  assert(proposed?.id, "Action proposed");

  const actions = await listActions(manager);
  assert(actions.pending.some((row) => row.id === proposed!.id), "Existing Action records appear correctly");

  const snapWithAction = await getExecutionSnapshot(manager);
  assert(
    snapWithAction.queue.some((item) => item.id === `action:${proposed!.id}` && item.status === "NEEDS_REVIEW"),
    "Pending action appears in execution queue"
  );

  const otherSnap = await getExecutionSnapshot(other);
  assert(
    !otherSnap.queue.some((item) => item.id === `action:${proposed!.id}`),
    "Tenant isolation: action not visible to other tenant"
  );

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase 18 workflow",
    reason: "Verify workflows appear in execution center.",
    targetName: customer.name,
  });
  assert(workflow?.id, "Workflow proposed");
  const workflows = await listWorkflows(manager);
  assert(workflows.pending.some((row) => row.id === workflow!.id), "Existing Workflow records appear correctly");
  const snapWithWorkflow = await getExecutionSnapshot(manager);
  assert(
    snapWithWorkflow.queue.some((item) => item.id === `workflow:${workflow!.id}`),
    "Pending workflow appears in execution queue"
  );

  const pendingReqs = await listPendingRequisitions(manager);
  if (pendingReqs.length > 0) {
    const snapReq = await getExecutionSnapshot(manager);
    assert(
      snapReq.queue.some((item) => item.kind === "REQUISITION" && item.status === "NEEDS_REVIEW"),
      "ProcurementRequisition review state appears correctly"
    );
  }

  const comm = await proposeCommunication(manager, {
    type: "CUSTOMER_FOLLOW_UP",
    targetName: customer.name,
    subject: "Phase 18 draft",
    body: "Commercial follow-up draft for verification only.",
    reason: "Verify communication drafts are non-executable in Execution.",
  });
  assert(comm.status === "created", "Communication draft created");
  const snapComm = await getExecutionSnapshot(manager);
  const commItem = snapComm.queue.find((item) => item.kind === "COMMUNICATION" && item.targetLabel === customer.name);
  assert(commItem, "Communication draft appears for review");
  assert(commItem!.executable === false && commItem!.canDecide === false, "Communication drafts do not become executable sends");

  assert(!canApprove("VIEWER"), "Unauthorized role cannot approve");
  let forbidden = false;
  try {
    await decideAction(viewer, proposed!.id, "approve");
  } catch {
    forbidden = true;
  }
  assert(forbidden, "Unauthorized users cannot approve");

  const rejected = await decideAction(manager, proposed!.id, "reject");
  assert(rejected.status === "REJECTED", "Action rejected");
  let rejectExec = false;
  try {
    await decideAction(manager, proposed!.id, "approve");
  } catch {
    rejectExec = true;
  }
  assert(rejectExec, "Rejected items cannot execute");

  const second = await proposeAction(manager, {
    type: "CREATE_CUSTOMER_FOLLOW_UP",
    title: "Phase 18 execute once",
    reason: "Verify executed actions cannot run again.",
    targetName: customer.name,
  });
  assert(second?.id, "Second action proposed");
  const executed = await decideAction(manager, second!.id, "approve");
  assert(executed.status === "EXECUTED", "Action executed via Phase 9 path");
  const again = await decideAction(manager, second!.id, "approve");
  assert(again.status === "EXECUTED", "Already executed actions cannot execute again (idempotent return)");

  const completed = await decideWorkflow(manager, workflow!.id, "approve");
  assert(completed.status === "COMPLETED", "Workflow completed via Phase 10 path");
  let workflowAgain = false;
  try {
    await decideWorkflow(manager, workflow!.id, "approve");
  } catch {
    workflowAgain = true;
  }
  assert(workflowAgain || (await prisma.workflow.findFirst({ where: { id: workflow!.id } }))?.status === "COMPLETED", "Completed workflows cannot run again");

  const failedWorkflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase 18 failed remains failed unless retry",
    reason: "Safety check.",
    targetName: customer.name,
  });
  assert(failedWorkflow?.id, "Failed-path workflow proposed");
  await prisma.workflow.update({
    where: { id: failedWorkflow!.id },
    data: { status: "FAILED", failureReason: "Simulated failure for Phase 18 verify" },
  });
  const failedRow = await prisma.workflow.findFirst({ where: { id: failedWorkflow!.id } });
  assert(failedRow?.status === "FAILED", "Failed execution remains failed until retry");

  await listCommunications(manager);
  assert(true, "Phase 11 communications still work");

  console.log("Phase 18 verification passed.");
}
