import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit", env: process.env });
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

run("prisma migrate deploy");
run("next build");
