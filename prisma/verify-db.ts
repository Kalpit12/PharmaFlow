import { PrismaClient } from "@prisma/client";

/**
 * Prisma client for long-running verification scripts.
 * Uses a modest pool and longer timeouts than the app default.
 */
export function createVerifyPrisma(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not configured.");

  let url = raw;
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set("connection_limit", "5");
    parsed.searchParams.set("pool_timeout", "60");
    parsed.searchParams.set("connect_timeout", "30");
    url = parsed.toString();
  } catch {
    const joiner = raw.includes("?") ? "&" : "?";
    url = `${raw}${joiner}connection_limit=5&pool_timeout=60&connect_timeout=30`;
  }

  return new PrismaClient({
    datasources: { db: { url } },
  });
}
