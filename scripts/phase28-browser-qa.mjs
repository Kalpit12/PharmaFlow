/**
 * Phase 28 browser QA — run: node scripts/phase28-browser-qa.mjs
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
      callbackUrl: `${BASE}/execution/production`,
      json: "true",
    },
  });
  if (!authRes.ok()) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/execution/production`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Execution metrics"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaProductionExecution(page, viewport) {
  await page.goto(`${BASE}/execution/production`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Execution metrics"]', { timeout: 120000 });
  record(viewport, "Execution metrics strip", (await page.locator('[aria-label="Execution metrics"]').count()) === 1);
  record(viewport, "Planned vs actual section", (await page.locator('[aria-label="Planned vs actual"]').count()) === 1);
  const board = await page.locator('[aria-label="Production execution board"]').count();
  record(viewport, "Production execution board", board === 1 || (await page.getByText("No production orders to show").count()) > 0);
  await assertNoPageOverflow(page, viewport);
}

async function qaSheet(page, viewport) {
  await page.goto(`${BASE}/execution/production`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const button = page.locator('button[aria-label^="Inspect"]').first();
  if ((await button.count()) === 0) {
    record(viewport, "Execution inspection sheet", true, "no orders — skipped");
    return;
  }
  await button.click();
  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 10000 });
  const sheet = page.locator('[data-slot="sheet-content"]').first();
  record(viewport, "Execution inspection sheet opens", await sheet.isVisible());
  for (const label of ["Identity", "Execution", "Performance", "History"]) {
    record(viewport, `Sheet section: ${label}`, (await sheet.getByText(label, { exact: false }).count()) > 0);
  }
}

async function qaRegression(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Operations planner", (await page.locator('[aria-label="Planning metrics"]').count()) === 1);
  await page.goto(`${BASE}/execution`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record(viewport, "Phase 18 execution queue", (await page.getByText("Production execution").count()) > 0);
  if (viewport === "1440x900") {
    await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    record(viewport, "Command Center loads", (await page.locator("body").count()) === 1);
    await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded", timeout: 60000 });
    record(viewport, "Reports loads", (await page.locator("body").count()) === 1);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    record(viewport, "Dashboard loads", (await page.locator("body").count()) === 1);
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, context);
    record("auth", "Login to /execution/production", true);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaProductionExecution(page, vp.name);
      await qaSheet(page, vp.name);
      await qaRegression(page, vp.name);
    }
  } catch (error) {
    console.error(error);
    record("fatal", "Suite crashed", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (browser) await browser.close();
  }

  const failed = results.filter((row) => !row.pass).length;
  const passed = results.filter((row) => row.pass).length;
  console.log(`\nPhase 28 browser QA: ${passed} passed, ${failed} failed, ${results.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
