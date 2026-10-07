import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedUser } from "@/lib/server/tenant-context";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof ServerError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      redirect("/login?callbackUrl=%2Fdashboard");
    }
    throw error;
  }

  return <AppShell user={user}>{children}</AppShell>;
}
