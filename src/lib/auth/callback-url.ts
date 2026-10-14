import { WORKSPACE_HOME_PATH } from "@/lib/ux/workspace-home";

export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return WORKSPACE_HOME_PATH;
  }
  if (value.startsWith("/login") || value.startsWith("/api") || value === "/app-preview" || value.startsWith("/app-preview/")) {
    return WORKSPACE_HOME_PATH;
  }
  return value;
}
