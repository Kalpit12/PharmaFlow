import { redirect } from "next/navigation";

import { CommunicationDraftCard } from "@/components/communications/CommunicationDraftCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServerError } from "@/lib/server/errors";
import { listCommunications } from "@/lib/server/communications";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await listCommunications(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader context="Control" title="Communication Center" description="Review and manage AI-prepared business communications." />
        <p className="text-sm text-muted-foreground">Unable to load communications. Try again later.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        context="Control"
        title="Communication Center"
        description="Review and manage AI-prepared business communications. Drafts are not sent."
      />
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Needs review</h2>
        {data.needsReview.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No drafts waiting for review.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.needsReview.map((draft) => (
              <li key={draft.id}>
                <CommunicationDraftCard draft={draft} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Recent drafts</h2>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reviewed drafts yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.recent.map((draft) => (
              <li key={draft.id}>
                <CommunicationDraftCard draft={draft} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
