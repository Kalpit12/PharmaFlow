import { PrismaClient } from "@prisma/client";

import { parseModelCommunication, isCommunicationType } from "../src/lib/ai/communications";
import { proposeAction } from "../src/lib/server/actions";
import {
  getCommunication,
  listCommunications,
  proposeCommunication,
  updateCommunication,
} from "../src/lib/server/communications";
import { ServerError, type TenantContext } from "../src/lib/server/errors";
import { proposeWorkflow } from "../src/lib/server/workflows";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase11Verify(prisma: PrismaClient) {
  assert(isCommunicationType("RFQ_FOLLOW_UP"), "RFQ_FOLLOW_UP communication is supported");
  assert(!isCommunicationType("WHATSAPP"), "Unsupported communication types are rejected");
  assert(
    parseModelCommunication({
      type: "WHATSAPP",
      targetName: "ABC Pharmaceuticals",
      subject: "Hello",
      body: "Hello",
      reason: "Test",
    }) === null,
    "Unsupported type is rejected"
  );
  assert(
    parseModelCommunication({
      type: "RFQ_FOLLOW_UP",
      targetName: "ABC Pharmaceuticals",
      subject: "Dosage recommendation",
      body: "Take 500mg as medical advice for the patient.",
      reason: "Follow up",
    }) === null,
    "Medical claims are rejected by validation"
  );

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Demo tenant and user required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const anon: TenantContext = { tenantId: tenant.id, userId: null, role: null };
  const otherTenant: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const ids: string[] = [];
  const started = new Date();
  try {
    try {
      await proposeCommunication(anon, {
        type: "CUSTOMER_FOLLOW_UP",
        targetName: "ABC Pharmaceuticals",
        subject: "Follow-up",
        body: "Hello from MediCrest Pharmaceuticals.",
        reason: "Commercial follow-up.",
      });
      throw new Error("Unauthenticated user must not create a draft");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "UNAUTHORIZED", "Unauthenticated create is rejected");
    }

    const missing = await proposeCommunication(manager, {
      type: "CUSTOMER_FOLLOW_UP",
      targetName: "No Such Customer 999",
      subject: "Follow-up",
      body: "Hello from MediCrest Pharmaceuticals.",
      reason: "Commercial follow-up.",
    });
    assert(missing.status === "clarification", "Missing target does not guess");

    const foreign = await proposeCommunication(manager, {
      type: "CUSTOMER_FOLLOW_UP",
      targetName: "Isolation Pharmacy B",
      subject: "Follow-up",
      body: "Hello from MediCrest Pharmaceuticals.",
      reason: "Commercial follow-up.",
    });
    assert(foreign.status === "clarification", "Customer must belong to tenant");

    const skipped = await proposeCommunication(manager, {
      type: "WHATSAPP",
      targetName: "ABC Pharmaceuticals",
      subject: "Follow-up",
      body: "Hello from MediCrest Pharmaceuticals.",
      reason: "Commercial follow-up.",
    });
    assert(skipped.status === "skipped", "Unsupported type is skipped");

    const created = await proposeCommunication(manager, {
      type: "RFQ_FOLLOW_UP",
      targetName: "ABC Pharmaceuticals",
      subject: "Follow-up on your recent RFQ",
      body: "Hello,\n\nWe are following up on your recent RFQ with MediCrest Pharmaceuticals.\n\nKind regards",
      reason: "Recent RFQ activity requires follow-up.",
    });
    assert(created.status === "created", "Authenticated user can create a draft");
    ids.push(created.draft.id);
    assert(created.draft.customerName === "ABC Pharmaceuticals", "Target is resolved server-side");

    const duplicate = await proposeCommunication(manager, {
      type: "RFQ_FOLLOW_UP",
      targetName: "ABC Pharmaceuticals",
      subject: "Follow-up on your recent RFQ",
      body: "Hello,\n\nWe are following up on your recent RFQ with MediCrest Pharmaceuticals.\n\nKind regards",
      reason: "Recent RFQ activity requires follow-up.",
    });
    assert(duplicate.status === "created" && duplicate.draft.id === created.draft.id, "Duplicate draft is reused");

    try {
      await getCommunication(otherTenant, created.draft.id);
      throw new Error("Cross-tenant read must fail");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "NOT_FOUND", "Tenant isolation works");
    }

    const listed = await listCommunications(manager);
    assert(
      listed.needsReview.some((item) => item.id === created.draft.id),
      "Listing drafts is deterministic"
    );
    const viewed = await getCommunication(manager, created.draft.id);
    assert(viewed.subject === created.draft.subject, "Viewing drafts is deterministic");

    const edited = await updateCommunication(manager, created.draft.id, {
      subject: "Updated RFQ follow-up",
      body: "Hello,\n\nPlease let us know if you still need a quotation.\n\nKind regards",
    });
    assert(edited.subject === "Updated RFQ follow-up" && edited.status === "REVIEWED", "Manual edits save without OpenAI");

    const opportunity = await prisma.opportunity.findFirst({ where: { tenantId: tenantB.id } });
    const sales = await proposeCommunication(manager, {
      type: "SALES_OPPORTUNITY_FOLLOW_UP",
      targetName: "ABC Pharmaceuticals",
      subject: "Opportunity follow-up",
      body: "Hello,\n\nWe wanted to continue the commercial discussion.\n\nKind regards",
      reason: "Open opportunity follow-up.",
    });
    assert(sales.status === "created", "Opportunity follow-up draft creates");
    ids.push(sales.draft.id);
    const salesRow = await prisma.communicationDraft.findFirst({ where: { id: sales.draft.id } });
    if (opportunity && salesRow?.opportunityId) {
      assert(salesRow.opportunityId !== opportunity.id, "Opportunity must belong to tenant");
    }

    const action = await proposeAction(manager, {
      type: "CREATE_FOLLOW_UP_TASK",
      title: "Phase11 action still works",
      reason: "Phase 9 path remains available.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
    await prisma.action.delete({ where: { id: action.id } });

    const workflow = await proposeWorkflow(manager, {
      type: "CUSTOMER_REENGAGEMENT",
      title: "Phase11 workflow still works",
      reason: "Phase 10 path remains available.",
      targetName: "ABC Pharmaceuticals",
    });
    assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
    await prisma.workflow.delete({ where: { id: workflow.id } });
  } finally {
    await prisma.communicationDraft.deleteMany({ where: { id: { in: ids } } });
    await prisma.activity.deleteMany({
      where: { tenantId: tenant.id, createdAt: { gte: started }, title: "Communication draft created" },
    });
  }

  console.log("Phase 11 verification passed.");
}
