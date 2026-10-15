/**
 * Production configuration guards (no secret values logged).
 */
export function assertProductionAuthConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a long random value in production.");
  }

  const db = process.env.DATABASE_URL?.trim();
  if (!db) {
    throw new Error("DATABASE_URL must be set in production.");
  }
}

export function isOpenAiEnabled(): boolean {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim());
}
