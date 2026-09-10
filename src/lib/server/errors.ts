export type TenantContext = {
  tenantId: string;
  userId: string | null;
  role: string | null;
};

export class ServerError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIG" | "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "INTERNAL" = "INTERNAL"
  ) {
    super(message);
    this.name = "ServerError";
  }
}

export function publicErrorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof ServerError) {
    return { code: error.code, message: error.message };
  }
  return { code: "INTERNAL", message: "Unable to complete the request." };
}
