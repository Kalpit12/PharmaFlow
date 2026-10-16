import { execSync } from "node:child_process";

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

function migrateDeployWithRetries(maxAttempts = 3) {
  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return false;

  if (databaseUrl.includes("-pooler")) {
    databaseUrl = databaseUrl.replace("-pooler", "");
  }

  const env = { ...process.env, DATABASE_URL: databaseUrl };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execSync("npx prisma migrate deploy", { stdio: "inherit", env });
      return true;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      const waitMs = attempt * 5_000;
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
