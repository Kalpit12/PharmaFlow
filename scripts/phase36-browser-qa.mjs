/**
 * Phase 36 browser QA — run: node scripts/phase36-browser-qa.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.AUTH_DEV_EMAIL ?? "alex@laballied.demo";
const PASSWORD = process.env.AUTH_DEV_PASSWORD ?? "pharmora-demo-local";

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const results = [];

function record(viewport, check, pass, detail = "") {
  results.push({ viewport, check, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${viewport} · ${check}${detail ? ` — ${detail}` : ""}`);
}

async function login(page, context) {
  const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const authRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/governance`,
      json: "true",
    },
  });
  if (!authRes.ok()) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/governance`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Governance metrics"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaGovernance(page, viewport) {
  await page.goto(`${BASE}/governance`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Governance metrics"]', { timeout: 120000 });
  record(viewport, "Governance metrics strip", (await page.locator('[aria-label="Governance metrics"]').count()) === 1);
  record(viewport, "Governance users table", (await page.locator('[aria-label="Governance users table"]').count()) === 1);
  record(viewport, "Governance audit table", (await page.locator('[aria-label="Governance audit table"]').count()) === 1 || (await page.getByText("No audit records").count()) > 0);
  record(viewport, "Access section", (await page.getByText("Approval authority").count()) > 0);
  await assertNoPageOverflow(page, viewport);
}

async function qaRegression(page, viewport) {
  for (const [path, label] of [
    ["/command-center", "Phase 30 command-center"],
    ["/operations", "Phase 31 operations"],
    ["/procurement", "Phase 15 procurement"],
    ["/batches", "Phase 33 batches"],
    ["/quality", "Phase 35 quality"],
    ["/traceability", "Phase 34 traceability"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    record(viewport, `${label} loads`, page.url().includes(path));
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, context);
    record("auth", "Login to /governance", true);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaGovernance(page, vp.name);
      if (vp.name === "1440x900") await qaRegression(page, vp.name);
    }
    const failed = results.filter((r) => !r.pass);
    console.log(`\n--- Summary ---\nTotal: ${results.length} · Passed: ${results.length - failed.length} · Failed: ${failed.length}`);
    if (failed.length) {
      for (const f of failed) console.log(`  - [${f.viewport}] ${f.check}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("QA failed:", error);
    process.exit(1);
  } finally {
    await browser?.close();
  }
}

main();
