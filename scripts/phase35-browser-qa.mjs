/**
 * Phase 35 browser QA — run: node scripts/phase35-browser-qa.mjs
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
      callbackUrl: `${BASE}/operations`,
      json: "true",
    },
  });
  if (!authRes.ok()) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Planning metrics"]', { timeout: 120000 });
  await page.goto(`${BASE}/quality`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Quality metrics"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaQuality(page, viewport) {
  await page.goto(`${BASE}/quality`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Quality metrics"]', { timeout: 120000 });
  record(viewport, "Quality metrics strip", (await page.locator('[aria-label="Quality metrics"]').count()) === 1);
  record(viewport, "Quality exceptions table", (await page.locator('[aria-label="Quality exceptions table"]').count()) === 1 || (await page.getByText("No quality exceptions to show").count()) > 0);
  record(viewport, "Search control", (await page.locator('[aria-label="Search quality exceptions"]').count()) === 1);
  await assertNoPageOverflow(page, viewport);
}

async function qaSheet(page, viewport) {
  await page.goto(`${BASE}/quality`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const button = page.locator('button[aria-label^="Inspect exception"]').first();
  if ((await button.count()) === 0) {
    record(viewport, "Quality inspection sheet", true, "no exceptions — skipped");
    return;
  }
  await button.click();
  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 10000 });
  const sheet = page.locator('[data-slot="sheet-content"]').first();
  record(viewport, "Quality inspection sheet opens", await sheet.isVisible());
  for (const label of ["Identity", "Ownership", "Affected entity", "Investigation", "Timeline"]) {
    record(viewport, `Sheet section: ${label}`, (await sheet.getByText(label, { exact: false }).count()) > 0);
  }
  record(viewport, "Batch or traceability context", (await sheet.getByText(/Open batch|Trace batch|Trace lot|UNASSIGNED/i).count()) > 0);
}

async function qaRegression(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 31 operations planner", (await page.locator('[aria-label="Planning metrics"]').count()) === 1);
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 32 materials workspace", (await page.locator('[aria-label="Material metrics"]').count()) === 1);
  await page.goto(`${BASE}/batches`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 33 batches workspace", (await page.locator('[aria-label="Batch metrics"]').count()) === 1);
  await page.goto(`${BASE}/traceability`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 34 traceability workspace", (await page.locator('[aria-label="Traceability metrics"]').count()) === 1);
  if (viewport === "1440x900") {
    await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);
    record(viewport, "Phase 30 command-center charts", (await page.locator("svg").count()) > 2);
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, context);
    record("auth", "Login to /quality", true);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaQuality(page, vp.name);
      await qaSheet(page, vp.name);
      await qaRegression(page, vp.name);
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
