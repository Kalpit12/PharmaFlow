/**
 * One-day MediCrest showcase — UI clicks only (Playwright).
 * Run: npx dotenv-cli -e .env -- node scripts/medicrest-day-walkthrough.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.AUTH_DEV_EMAIL ?? "alex@medicrest.demo";
const PASSWORD = process.env.AUTH_DEV_PASSWORD ?? "pharmora-demo-local";

const log = (step, detail = "") => console.log(detail ? `[day-ui] ${step} — ${detail}` : `[day-ui] ${step}`);

async function login(context, page) {
  const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const authRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/dashboard`, json: "true" },
    maxRedirects: 0,
  });
  if (!authRes.ok()) throw new Error(`Auth failed: ${await authRes.text()}`);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  log("Signed in", EMAIL);
}

async function createProductionOrder(page, productIndex, quantity) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New production order" }).click({ timeout: 30000 });
  const dialog = page.getByRole("dialog");
  await dialog.locator("select").first().selectOption({ index: productIndex });
  await dialog.locator('input[inputmode="numeric"]').fill(String(quantity));
  await dialog.getByRole("button", { name: "Create order" }).click();
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(context, page);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Record customer order" }).click({ timeout: 20000 });
  const orderDialog = page.getByRole("dialog", { name: "Record customer order" });
  await orderDialog.waitFor({ state: "visible" });
  await orderDialog.locator("input").first().fill("120");
  await orderDialog.getByRole("button", { name: "Confirm order" }).click();
  await page.waitForTimeout(1000);
  log("Commercial", "Customer order recorded from dashboard");

  await createProductionOrder(page, 0, 18000);
  log("Planning", "Production order 1 created (UI)");
  await createProductionOrder(page, 1, 10000);
  log("Planning", "Production order 2 created (UI)");

  const scheduleButtons = page.getByRole("button", { name: "Schedule", exact: true });
  const scheduleCount = await scheduleButtons.count();
  for (let i = 0; i < scheduleCount; i++) {
    await scheduleButtons.nth(i).click();
    await page.waitForTimeout(600);
  }
  log("Planning", `Auto-scheduled ${scheduleCount} order(s)`);

  await page.goto(`${BASE}/procurement`, { waitUntil: "domcontentloaded" });
  const materialBtn = page.getByRole("button", { name: /Amoxicillin API|API/i }).first();
  if (await materialBtn.isVisible().catch(() => false)) {
    await materialBtn.click();
    const draft = page.getByRole("button", { name: "Create requisition draft" });
    if (await draft.isVisible().catch(() => false)) {
      await draft.click();
      await page.waitForTimeout(800);
      log("Procurement", "Requisition draft created (UI)");
    }
  } else {
    log("Procurement", "No API shortage row visible — skip requisition");
  }

  await page.goto(`${BASE}/execution/production`, { waitUntil: "domcontentloaded" });
  const release = page.getByRole("button", { name: /^Release$/i }).first();
  if (await release.isVisible().catch(() => false)) {
    await release.click();
    await page.waitForTimeout(500);
    const start = page.getByRole("button", { name: /^Start$/i }).first();
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      log("Shop floor", "Released and started (UI)");
    }
  }

  await page.goto(`${BASE}/quality`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Log exception" }).click({ timeout: 20000 });
  const qDialog = page.getByRole("dialog");
  await qDialog.locator('input').first().fill("In-process check — blend homogeneity");
  await qDialog.locator("textarea").fill("Shift sample flagged variation during capsule fill. Batch held pending QA review.");
  await qDialog.getByRole("button", { name: "Log exception" }).click();
  await page.waitForTimeout(1000);
  log("Quality", "Exception logged (UI)");

  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 90000 });
  log("Executive", "Command Center opened");

  await browser.close();
  console.log("\nMediCrest UI day walkthrough complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
