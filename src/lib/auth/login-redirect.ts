import { safeCallbackUrl } from "@/lib/auth/callback-url";

/** Login URL that returns the user to a workspace route after sign-in. */
export function workspaceLoginPath(returnPath = "/dashboard"): string {
  const callbackUrl = safeCallbackUrl(returnPath);
  return `/login?${new URLSearchParams({ callbackUrl }).toString()}`;
}
