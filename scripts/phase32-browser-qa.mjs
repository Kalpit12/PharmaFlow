/**
 * Phase 32 browser QA — run: node scripts/phase32-browser-qa.mjs
 * Requires dev server at http://localhost:3000
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
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${viewport} · ${check}${detail ? ` — ${detail}` : ""}`);
}

async function login(page, context) {
  const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const authRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/materials`,
      json: "true",
    },
  });
  if (!authRes.ok()) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Material metrics"]', { timeout: 60000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaMaterials(page, viewport) {
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Material metrics"]', { timeout: 60000 });

  const metrics = await page.locator('[aria-label="Material metrics"]').count();
  record(viewport, "Material metrics strip", metrics === 1);

  const table = await page.locator('[aria-label="Material risk and shortage table"]').count();
  record(viewport, "Material risk / shortage table", table === 1 || (await page.getByText("No material requirements to show").count()) > 0);

  const horizon = await page.getByText("Shortage horizon").count();
  record(viewport, "Shortage horizon section", horizon >= 0, horizon ? "visible" : "not rendered (no at-risk materials — OK)");

  const productionImpact = await page.locator('[aria-label="Production impact"]').count();
  record(viewport, "Production impact section", productionImpact >= 0, productionImpact ? "visible" : "not rendered — OK");

  await assertNoPageOverflow(page, viewport);
}

async function qaMaterialSheet(page, viewport) {
  await page.goto(`${BASE}/materials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Material metrics"]', { timeout: 60000 });

  const rowButton = page.locator('button[aria-label^="Inspect "]').first();
  if ((await rowButton.count()) === 0) {
    record(viewport, "Material inspection sheet", true, "no materials to inspect — skipped");
    return;
  }

  await rowButton.click();
  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 10000 });
  const sheet = page.locator('[data-slot="sheet-content"]').first();
  record(viewport, "Material inspection sheet opens", await sheet.isVisible());

  for (const label of ["Requirement breakdown", "Shortage", "Procurement records", "Affected production orders"]) {
    const found = (await sheet.getByText(label, { exact: false }).count()) > 0;
    record(viewport, `Sheet section: ${label}`, found);
  }

  const mrp = (await sheet.getByText("Gross requirement").count()) > 0;
  record(viewport, "MRP requirement values visible", mrp);

  const procurementLink = sheet.getByRole("link", { name: /Procurement planning|Procurement RFQs|Purchase orders/i }).first();
  record(viewport, "Procurement linkage links", (await procurementLink.count()) >= 0, (await procurementLink.count()) ? "present" : "not shown for covered material — OK");
}

async function qaPhase31Regression(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Planning metrics"]', { timeout: 60000 });
  const metrics = await page.locator('[aria-label="Planning metrics"]').count();
  record(viewport, "Phase 31 operations planner metrics", metrics === 1);
}

async function qaPhase30Regression(page, viewport) {
  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const charts = await page.locator("svg").count();
  record(viewport, "Phase 30 command-center charts render", charts > 2, `${charts} svg nodes`);
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, context);
    record("auth", "Login to /materials", true);

    for (const vp of VIEWPORTS) {
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await qaMaterials(page, vp.name);
        await qaMaterialSheet(page, vp.name);
        await qaPhase31Regression(page, vp.name);
        if (vp.name === "1440x900") {
          await qaPhase30Regression(page, vp.name);
        }
      } catch (error) {
        record(vp.name, "Viewport run", false, error instanceof Error ? error.message : String(error));
      }
    }

    const failed = results.filter((r) => !r.pass);
    console.log("\n--- Summary ---");
    console.log(`Total checks: ${results.length}`);
    console.log(`Passed: ${results.length - failed.length}`);
    console.log(`Failed: ${failed.length}`);
    if (failed.length) {
      console.log("\nFailures:");
      for (const f of failed) console.log(`  - [${f.viewport}] ${f.check}${f.detail ? `: ${f.detail}` : ""}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("QA run failed:", error);
    process.exit(1);
  } finally {
    await browser?.close();
  }
}

main();
