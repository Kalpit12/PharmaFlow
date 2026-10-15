/**
 * Neon pooler URLs can hang `prisma migrate deploy`. Use the direct host once, then `prisma generate`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  try {
    const raw = readFileSync(envPath, "utf8");
    const match = raw.match(/^DATABASE_URL="([^"]+)"/m);
    databaseUrl = match?.[1];
  } catch {
    // ignore
  }
}
if (!databaseUrl) {
  console.error("DATABASE_URL not set and not found in .env");
  process.exit(1);
}

const direct = databaseUrl.replace("-pooler", "");
process.env.DATABASE_URL = direct;

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
