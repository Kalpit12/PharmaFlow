#!/usr/bin/env node
/**
 * Save / restore a Neon branch named demo-golden so demo day does not need a 30-minute reseed.
 *
 * Requires:
 *   NEON_API_KEY
 *   NEON_PROJECT_ID
 * Optional:
 *   NEON_PARENT_BRANCH  (default: the project's default branch)
 *   NEON_BRANCH_NAME    (default: demo-golden)
 *
 * Install once: npm i -g neonctl
 *
 * Usage:
 *   npm run demo:snapshot
 *   npm run demo:restore
 */

import { spawnSync } from "node:child_process";

const action = process.argv[2] === "restore" ? "restore" : "snapshot";
const branchName = process.env.NEON_BRANCH_NAME || "demo-golden";
const projectId = process.env.NEON_PROJECT_ID;
const apiKey = process.env.NEON_API_KEY;

function fail(message) {
  console.error(message);
  console.error(`
Neon branch workflow (about one minute, not a reseed):

1. Open the Neon console for this project.
2. Snapshot (once data looks right):
     Branches → Create branch → name "${branchName}" from the current demo branch.
3. Restore before a meeting:
     Reset the demo branch from "${branchName}", or point DATABASE_URL at the golden branch.

CLI equivalent (needs neonctl + NEON_API_KEY + NEON_PROJECT_ID):

  neonctl branches create --name ${branchName} --project-id <id>
  neonctl branches reset <demo-branch> --parent ${branchName} --project-id <id>
`);
  process.exit(1);
}

if (!apiKey || !projectId) {
  fail("NEON_API_KEY and NEON_PROJECT_ID are not set.");
}

const neonctl = spawnSync("neonctl", ["--version"], { encoding: "utf8" });
if (neonctl.status !== 0) {
  fail("neonctl is not installed. Run: npm i -g neonctl");
}

const env = { ...process.env, NEON_API_KEY: apiKey };

if (action === "snapshot") {
  const existing = spawnSync(
    "neonctl",
    ["branches", "list", "--project-id", projectId, "--output", "json"],
    { encoding: "utf8", env }
  );
  if (existing.status !== 0) {
    fail(existing.stderr || existing.stdout || "Unable to list Neon branches.");
  }
  let branches = [];
  try {
    branches = JSON.parse(existing.stdout || "[]");
  } catch {
    branches = [];
  }
  const found = Array.isArray(branches)
    ? branches.find((row) => row.name === branchName || row.branch?.name === branchName)
    : null;
  if (found) {
    console.log(`Branch ${branchName} already exists. Delete it in the Neon console if you need a fresh snapshot, then re-run.`);
    process.exit(0);
  }
  const created = spawnSync(
    "neonctl",
    ["branches", "create", "--name", branchName, "--project-id", projectId],
    { encoding: "utf8", env, stdio: "inherit" }
  );
  if (created.status !== 0) process.exit(created.status ?? 1);
  console.log(`Created Neon branch ${branchName}. Restore with: npm run demo:restore`);
  process.exit(0);
}

const parent = process.env.NEON_PARENT_BRANCH;
if (!parent) {
  fail("Set NEON_PARENT_BRANCH to the live demo branch name to reset from demo-golden.");
}
const reset = spawnSync(
  "neonctl",
  ["branches", "reset", parent, "--parent", branchName, "--project-id", projectId],
  { encoding: "utf8", env, stdio: "inherit" }
);
if (reset.status !== 0) process.exit(reset.status ?? 1);
console.log(`Reset ${parent} from ${branchName}.`);
