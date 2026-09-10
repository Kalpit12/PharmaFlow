import { redirect } from "next/navigation";

import { ApprovalsBoard } from "@/components/approvals/ApprovalsBoard";
import { PageHeader } from "@/components/layout/PageHeader";
import { listActions } from "@/lib/server/actions";
import { ServerError } from "@/lib/server/errors";
import { listPendingPurchaseOrders } from "@/lib/server/purchase-orders";
import { listPendingRequisitions } from "@/lib/server/procurement";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { listWorkflows } from "@/lib/server/workflows";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const [actions, workflows, requisitions, purchaseOrders] = await Promise.all([
      listActions(ctx),
      listWorkflows(ctx),
      listPendingRequisitions(ctx),
      listPendingPurchaseOrders(ctx),
    ]);
    data = { actions, workflows, requisitions, purchaseOrders };
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader context="Control" title="Approvals" description="Review recommended actions before they run." />
        <p className="text-sm text-muted-foreground">Unable to load approvals. Try again later.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        context="Control"
        title="Approvals"
        description="AI can recommend an action or workflow. A person must approve it before Pharmaflow executes it."
      />
      <ApprovalsBoard
        pending={data.actions.pending}
        history={data.actions.history}
        workflowsPending={data.workflows.pending}
        workflowsHistory={data.workflows.history}
        requisitions={data.requisitions}
        purchaseOrders={data.purchaseOrders}
      />
    </div>
  );
}
