import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not configured.");
  try {
    const url = new URL(raw);
    url.searchParams.set("connection_limit", "12");
    url.searchParams.set("pool_timeout", "30");
    return url.toString();
  } catch {
    const joiner = raw.includes("?") ? "&" : "?";
    return `${raw}${joiner}connection_limit=12&pool_timeout=30`;
  }
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl() } },
    });
  }

  return globalForPrisma.prisma;
}
