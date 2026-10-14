import { spawnSync } from "node:child_process";

const scripts = [
  { id: "typescript", cmd: "npx", args: ["tsc", "--noEmit"] },
  { id: "verify:operations-routing", cmd: "npm", args: ["run", "verify:operations-routing"] },
  { id: "verify:operations-partial", cmd: "npm", args: ["run", "verify:operations-partial"] },
  { id: "verify:operations-plan", cmd: "npm", args: ["run", "verify:operations-plan"] },
  { id: "verify:operations-delivery", cmd: "npm", args: ["run", "verify:operations-delivery"] },
  { id: "verify:operations-optimizer", cmd: "npm", args: ["run", "verify:operations-optimizer"] },
  { id: "verify:operations-integration", cmd: "npm", args: ["run", "verify:operations-integration"] },
  { id: "verify:operations-gantt-move", cmd: "npm", args: ["run", "verify:operations-gantt-move"] },
  { id: "verify:operations-shop-floor-replan", cmd: "npm", args: ["run", "verify:operations-shop-floor-replan"] },
  { id: "verify:operations-webhooks", cmd: "npm", args: ["run", "verify:operations-webhooks"] },
  { id: "verify:aps-control", cmd: "npm", args: ["run", "verify:aps-control"] },
];

const results = [];
let failed = 0;

console.log("# Operations verification report\n");
console.log(`Generated: ${new Date().toISOString()}\n`);
console.log("| Check | Status | Notes |");
console.log("|-------|--------|-------|");

for (const script of scripts) {
  const run = spawnSync(script.cmd, script.args, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const ok = run.status === 0;
  if (!ok) failed += 1;
  const tail = (run.stdout || run.stderr || "").trim().split("\n").slice(-2).join(" ").slice(0, 120);
  results.push({ id: script.id, ok, tail });
  console.log(`| ${script.id} | ${ok ? "PASS" : "FAIL"} | ${tail.replace(/\|/g, "/") || "—"} |`);
}

console.log(`\n**Summary:** ${results.length - failed}/${results.length} passed`);
if (failed > 0) {
  console.log("\nFailed checks:");
  for (const row of results.filter((entry) => !entry.ok)) {
    console.log(`- ${row.id}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nAll operations verification checks passed.");
}
