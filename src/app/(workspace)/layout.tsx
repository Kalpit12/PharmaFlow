import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { workspaceLoginPath } from "@/lib/auth/login-redirect";
import { DEMO_TENANT_SLUG_COOKIE, isSwitchableDemoTenantSlug } from "@/lib/demo-workspaces";
import { demoTenant } from "@/lib/tenant";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedUser } from "@/lib/server/tenant-context";
import { headers } from "next/headers";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof ServerError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      const returnPath = (await headers()).get("x-workspace-return") ?? "/daily-review";
      redirect(workspaceLoginPath(returnPath));
    }
    throw error;
  }

  const jar = await cookies();
  const cookieSlug = jar.get(DEMO_TENANT_SLUG_COOKIE)?.value?.trim();
  const initialWorkspaceId =
    cookieSlug && isSwitchableDemoTenantSlug(cookieSlug) ? cookieSlug : demoTenant.id;

  return (
    <AppShell user={user} initialWorkspaceId={initialWorkspaceId}>
      {children}
    </AppShell>
  );
}
