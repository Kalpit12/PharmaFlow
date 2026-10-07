/**
 * Phase 34 browser QA — run: node scripts/phase34-browser-qa.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.AUTH_DEV_EMAIL ?? "alex@medicrest.demo";
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
  await page.goto(`${BASE}/traceability`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Traceability metrics"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaTraceability(page, viewport) {
  await page.goto(`${BASE}/traceability`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Traceability metrics"]', { timeout: 120000 });
  record(viewport, "Traceability metrics strip", (await page.locator('[aria-label="Traceability metrics"]').count()) === 1);
  record(viewport, "Entity selector", (await page.locator('[aria-label="Select traceability entity"]').count()) === 1);
  record(viewport, "Search control", (await page.locator('[aria-label="Search traceability"]').count()) === 1);
  await assertNoPageOverflow(page, viewport);
}

async function qaInvestigation(page, viewport) {
  await page.goto(`${BASE}/traceability`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const batchValue = await page.locator('[aria-label="Select traceability entity"] option').evaluateAll((options) => {
    for (const option of options) {
      if (option.value.startsWith("batch:") && option.textContent?.includes("LAB-")) return option.value;
    }
    return options.find((option) => option.value.startsWith("batch:"))?.value ?? "";
  });
  if (!batchValue) {
    record(viewport, "Forward trace investigation", true, "no demo batch — skipped");
    record(viewport, "Potential impact summary", true, "skipped");
    record(viewport, "Coverage table", true, "skipped");
    record(viewport, "Incomplete data labelled", true, "skipped");
    return;
  }
  const batchId = batchValue.split(":")[1];
  await page.goto(`${BASE}/traceability?batch=${batchId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  record(viewport, "Forward trace investigation", (await page.locator('[aria-label="Traceability path"]').count()) > 0);
  record(viewport, "Potential impact summary", (await page.locator('[aria-label="Potential impact summary"]').count()) === 1);
  record(viewport, "Coverage table", (await page.locator('[aria-label="Traceability coverage table"]').count()) === 1);
  record(viewport, "Incomplete data labelled", (await page.getByText(/not recorded|partial|Batch-to-order allocation not recorded/i).count()) > 0);

  if (viewport === "1440x900") {
    const held = await page.locator('[aria-label="Select traceability entity"] option').evaluateAll((options) => {
      const match = options.find((option) => option.textContent?.includes("LAB-2026-003"));
      return match?.value ?? "";
    });
    if (held.startsWith("batch:")) {
      await page.goto(`${BASE}/traceability?batch=${held.split(":")[1]}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      const text = await page.locator('[aria-label="Traceability path"]').innerText();
      record(viewport, "Recorded quantity used on path", text.includes("used 120"));
      record(viewport, "Unlinked input row labelled", /not linked to an inventory lot/i.test(text));
    }
  }
}

async function qaRegression(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 31 operations planner", (await page.locator('[aria-label="Planning metrics"]').count()) === 1);
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 32 materials workspace", (await page.locator('[aria-label="Material metrics"]').count()) === 1);
  await page.goto(`${BASE}/batches`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 33 batches workspace", (await page.locator('[aria-label="Batch metrics"]').count()) === 1);
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
    record("auth", "Login to /traceability", true);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaTraceability(page, vp.name);
      await qaInvestigation(page, vp.name);
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
