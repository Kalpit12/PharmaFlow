import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { WORKSPACE_HOME_PATH } from "@/lib/ux/workspace-home";

/** Login URL that returns the user to a workspace route after sign-in. */
export function workspaceLoginPath(returnPath = WORKSPACE_HOME_PATH): string {
  const callbackUrl = safeCallbackUrl(returnPath);
  return `/login?${new URLSearchParams({ callbackUrl }).toString()}`;
}
