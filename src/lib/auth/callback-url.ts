export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }
  if (value.startsWith("/login") || value.startsWith("/api") || value === "/app-preview" || value.startsWith("/app-preview/")) {
    return "/dashboard";
  }
  return value;
}
