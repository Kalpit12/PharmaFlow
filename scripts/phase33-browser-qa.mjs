/**
 * Phase 33 browser QA — run: node scripts/phase33-browser-qa.mjs
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
  await page.goto(`${BASE}/batches`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Batch metrics"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaBatches(page, viewport) {
  await page.goto(`${BASE}/batches`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Batch metrics"]', { timeout: 120000 });
  record(viewport, "Batch metrics strip", (await page.locator('[aria-label="Batch metrics"]').count()) === 1);
  const table = await page.locator('[aria-label="Batch operations table"]').count();
  record(viewport, "Batch operations table", table === 1 || (await page.getByText("No batches to show").count()) > 0);
  const attention = page.locator('[aria-label="Batch quality attention"]');
  const attentionCount = await attention.count();
  record(viewport, "Quality attention signals", attentionCount === 1);
  if (attentionCount === 1) {
    const text = await attention.innerText();
    record(
      viewport,
      "Attention mentions hold or review",
      /quality hold|awaiting quality review|below planned output/i.test(text),
      text.split("\n").find((line) => /hold|review|planned output/i.test(line)) ?? ""
    );
  }
  await assertNoPageOverflow(page, viewport);
}

async function qaBatchSheet(page, viewport) {
  await page.goto(`${BASE}/batches`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const preferred = page.locator('button[aria-label="Inspect batch LAB-2026-003"]');
  const button = (await preferred.count()) > 0 ? preferred.first() : page.locator('button[aria-label^="Inspect batch"]').first();
  if ((await button.count()) === 0) {
    record(viewport, "Batch inspection sheet", true, "no batches — skipped");
    return;
  }
  await button.click();
  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 10000 });
  const sheet = page.locator('[data-slot="sheet-content"]').first();
  record(viewport, "Batch inspection sheet opens", await sheet.isVisible());
  for (const label of ["Identity", "Quantity", "Material trace", "Quality", "Timeline"]) {
    record(viewport, `Sheet section: ${label}`, (await sheet.getByText(label, { exact: false }).count()) > 0);
  }
  record(viewport, "Production vs quality visible", (await sheet.getByText(/Pending review|On hold|Released|Rejected/i).count()) > 0);
  const traceText = await sheet.innerText();
  record(
    viewport,
    "Material trace shows lot or NOT_RECORDED",
    /Lot \S+/.test(traceText),
    (traceText.match(/Lot \S+/) ?? ["missing lot line"])[0]
  );
}

async function qaRegression(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 31 operations planner", (await page.locator('[aria-label="Planning metrics"]').count()) === 1);
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 32 materials workspace", (await page.locator('[aria-label="Material metrics"]').count()) === 1);
  if (viewport === "1440x900") {
    await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 120000 });
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
    record("auth", "Login to /batches", true);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaBatches(page, vp.name);
      await qaBatchSheet(page, vp.name);
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
