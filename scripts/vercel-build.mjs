import { execSync } from "node:child_process";

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

function directDatabaseEnv() {
  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  if (databaseUrl.includes("-pooler")) {
    databaseUrl = databaseUrl.replace("-pooler", "");
  }
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    /** Neon + concurrent seeds/replan can hold the migrate lock longer than 10s default. */
    PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT: process.env.PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT ?? "120000",
  };
}

function migrationsUpToDate(env) {
  try {
    const out = execSync("npx prisma migrate status", {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.includes("Database schema is up to date");
  } catch (error) {
    const combined = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (combined.includes("Database schema is up to date")) return true;
    if (/not yet been applied/i.test(combined)) return false;
    throw error;
  }
}

function migrateDeployWithRetries(maxAttempts = 6) {
  const env = directDatabaseEnv();
  if (!env) return false;

  if (migrationsUpToDate(env)) {
    console.log("[Pharmaflow] Database schema up to date — skipping prisma migrate deploy (avoids advisory lock).");
    return true;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execSync("npx prisma migrate deploy", { stdio: "inherit", env });
      return true;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      const waitMs = Math.min(attempt * 20_000, 120_000);
      console.warn(
        `[Pharmaflow] prisma migrate deploy failed (attempt ${attempt}/${maxAttempts}); retrying in ${waitMs}ms…`
      );
      execSync(`sleep ${Math.ceil(waitMs / 1000)}`, { stdio: "inherit", shell: true });
    }
  }
  return false;
}

run("prisma generate");

if (!process.env.DATABASE_URL?.trim()) {
  console.error(`
[Pharmaflow] Build stopped: DATABASE_URL is missing.

Git deployments do not use your local .env file. In Vercel:
  Project: pharmaflow → Settings → Environment Variables

Add at least (enable Production and Preview):
  DATABASE_URL   — same Neon/Postgres URL you use locally
  AUTH_SECRET    — long random string (match local or generate new)

Then Redeploy the latest commit from the Deployments tab.
`);
  process.exit(1);
}

migrateDeployWithRetries();
run("next build");
