import { PrismaClient } from "@prisma/client";

import { canApprove, decideAction, proposeAction } from "../src/lib/server/actions";
import { parseModelWorkflow, WORKFLOW_REGISTRY, isWorkflowType } from "../src/lib/ai/workflows";
import { decideWorkflow, proposeWorkflow } from "../src/lib/server/workflows";
import { ServerError, type TenantContext } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function approveWithRetry(ctx: TenantContext, workflowId: string) {
  try {
    return await decideWorkflow(ctx, workflowId, "approve");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("workflow")) throw error;
    return decideWorkflow(ctx, workflowId, "approve");
  }
}

export async function runPhase10Verify(prisma: PrismaClient) {
  assert(isWorkflowType("RFQ_FOLLOW_UP"), "RFQ_FOLLOW_UP must be supported");
  assert(!isWorkflowType("WHATSAPP"), "Unsupported workflow types must be rejected");
  assert(parseModelWorkflow({ type: "WHATSAPP", title: "x", reason: "y", targetName: "z" }) === null, "Unsupported workflow draft rejected");
  assert(
    parseModelWorkflow({
      type: "RFQ_FOLLOW_UP",
      title: "Follow up",
      reason: "RFQ activity increased.",
      targetName: "ABC Pharmaceuticals",
    })?.type === "RFQ_FOLLOW_UP",
    "Supported workflow draft accepted"
  );
  assert(WORKFLOW_REGISTRY.RFQ_FOLLOW_UP.steps.length === 2, "RFQ_FOLLOW_UP has two steps");
  assert(WORKFLOW_REGISTRY.CUSTOMER_REENGAGEMENT.steps.length === 1, "CUSTOMER_REENGAGEMENT has one step");
  assert(WORKFLOW_REGISTRY.SALES_OPPORTUNITY_FOLLOW_UP.steps.length === 1, "SALES_OPPORTUNITY_FOLLOW_UP has one step");
  assert(canApprove("MANAGER") && canApprove("ADMIN") && !canApprove("VIEWER") && !canApprove("OPERATOR"), "Approval roles match Phase 9");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Demo tenant, isolation tenant, and user required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const admin: TenantContext = { tenantId: tenant.id, userId: user.id, role: "ADMIN" };
  const viewer: TenantContext = { tenantId: tenant.id, userId: user.id, role: "VIEWER" };
  const otherTenant: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const ids: string[] = [];
  const started = new Date();
  try {
    assert((await proposeWorkflow(manager, { type: "EMAIL_BLAST", title: "x", reason: "y", targetName: "ABC Pharmaceuticals" })) === null, "Unsupported type not stored");
    assert((await proposeWorkflow(manager, { type: "RFQ_FOLLOW_UP", title: "x", reason: "y", targetName: "No Such Customer 999" })) === null, "Invalid target fails safely");

    const rejected = await proposeWorkflow(manager, {
      type: "CUSTOMER_REENGAGEMENT",
      title: "Phase10 reject test",
      reason: "Customer needs attention.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(rejected?.status === "PENDING_APPROVAL", "Workflow requires approval");
    ids.push(rejected.id);
    try {
      await decideWorkflow(viewer, rejected.id, "approve");
      throw new Error("VIEWER must not approve");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "FORBIDDEN", "Unauthorized role cannot approve");
    }
    const afterReject = await decideWorkflow(manager, rejected.id, "reject");
    assert(afterReject.status === "REJECTED", "Reject works");

    const rfq = await proposeWorkflow(manager, {
      type: "RFQ_FOLLOW_UP",
      title: "Phase10 RFQ follow-up",
      reason: "RFQ activity increased in the current period.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(rfq?.status === "PENDING_APPROVAL", "RFQ workflow proposed");
    ids.push(rfq.id);
    try {
      await decideWorkflow(otherTenant, rfq.id, "approve");
      throw new Error("Cross-tenant approve must fail");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "NOT_FOUND", "Tenant isolation works");
    }

    const completed = await approveWithRetry(manager, rfq.id);
    assert(completed.status === "COMPLETED", "MANAGER can approve and complete");
    const actions = await prisma.action.findMany({ where: { workflowId: rfq.id, tenantId: tenant.id } });
    assert(actions.length === 2 && actions.every((row) => row.status === "EXECUTED"), "Workflow creates expected Action records");
    const activity = await prisma.activity.findFirst({
      where: { tenantId: tenant.id, description: { contains: "RFQ follow-up workflow completed" } },
    });
    assert(activity, "Workflow creates Activity");

    const again = await decideWorkflow(manager, rfq.id, "approve");
    assert(again.status === "COMPLETED", "Completed workflow cannot execute twice");

    await prisma.workflow.update({ where: { id: rfq.id }, data: { status: "RUNNING" } });
    try {
      await decideWorkflow(manager, rfq.id, "approve");
      throw new Error("Running workflow must not execute twice");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "FORBIDDEN", "Running workflow cannot execute twice");
    }
    await prisma.workflow.update({ where: { id: rfq.id }, data: { status: "COMPLETED" } });

    const failed = await proposeWorkflow(admin, {
      type: "CUSTOMER_REENGAGEMENT",
      title: "Phase10 fail test",
      reason: "Customer needs attention.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(failed, "ADMIN can propose");
    ids.push(failed.id);
    await prisma.workflow.update({
      where: { id: failed.id },
      data: {
        context: {
          targetKind: "CUSTOMER",
          targetId: "00000000-0000-0000-0000-000000000000",
          targetLabel: "Missing",
          reason: "Customer needs attention.",
        },
      },
    });
    try {
      await decideWorkflow(admin, failed.id, "approve");
      throw new Error("Invalid target should fail execution");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "NOT_FOUND", "Invalid target fails safely at execute");
    }
    const failedRow = await prisma.workflow.findFirst({ where: { id: failed.id } });
    assert(failedRow?.status === "FAILED" && failedRow.completedAt === null, "Failed workflow is not COMPLETED");

    const opportunity = await proposeWorkflow(manager, {
      type: "SALES_OPPORTUNITY_FOLLOW_UP",
      title: "Phase10 opportunity follow-up",
      reason: "Open opportunity needs follow-up.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(opportunity?.status === "PENDING_APPROVAL", "Opportunity workflow proposed");
    ids.push(opportunity.id);
    const opportunityDone = await approveWithRetry(admin, opportunity.id);
    assert(opportunityDone.status === "COMPLETED", "ADMIN can approve");

    const action = await proposeAction(manager, {
      type: "CREATE_FOLLOW_UP_TASK",
      title: "Phase10 action still works",
      reason: "Phase 9 path remains available.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(action?.status === "PENDING_APPROVAL", "Phase 9 propose still works");
    const executed = await decideAction(manager, action.id, "approve");
    assert(executed.status === "EXECUTED", "Phase 9 execute still works");
    await prisma.action.delete({ where: { id: action.id } });
  } finally {
    await prisma.action.deleteMany({ where: { workflowId: { in: ids } } });
    await prisma.workflow.deleteMany({ where: { id: { in: ids } } });
    await prisma.opportunity.deleteMany({
      where: { tenantId: tenant.id, title: { startsWith: "Phase10" }, createdAt: { gte: started } },
    });
    await prisma.activity.deleteMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: started },
        OR: [{ description: { contains: "Phase10" } }, { title: { endsWith: "completed" } }],
      },
    });
  }

  console.log("Phase 10 verification passed.");
}
