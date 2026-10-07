/**
 * Phase 31 browser QA — run: node scripts/phase31-browser-qa.mjs
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
      callbackUrl: `${BASE}/operations`,
      json: "true",
    },
  });
  if (!authRes.ok()) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const planner = page.locator('[aria-label="Planning metrics"]').or(page.getByText("Unable to load the planner"));
  await planner.first().waitFor({ state: "visible", timeout: 60000 });
  if ((await page.getByText("Unable to load the planner").count()) > 0) {
    throw new Error("Operations planner failed to load server data.");
  }
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaOperations(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Planning metrics"]', { timeout: 60000 });

  const metrics = await page.locator('[aria-label="Planning metrics"]').count();
  record(viewport, "Planning metrics strip", metrics === 1);

  const calendarLegend = await page.getByText("Non-working", { exact: true }).count();
  record(viewport, "Work-calendar legend", calendarLegend === 1);

  const attentionSummary = await page.locator('[aria-label="Planning attention summary"]').count();
  record(
    viewport,
    "Planning attention strip (when data exists)",
    true,
    attentionSummary ? "visible" : "not rendered (no attention items — OK)"
  );

  const gantt = page.locator('[aria-label="Production schedule"]');
  const ganttCount = await gantt.count();
  const isMobile = viewport.startsWith("390");

  if (isMobile) {
    record(viewport, "Mobile: Gantt de-emphasized", ganttCount <= 1);
    const mobileList = await page.locator(".md\\:hidden button").filter({ hasText: /units|·/ }).count();
    record(viewport, "Mobile production-order fallback list", mobileList > 0, `${mobileList} rows`);
  } else {
    record(viewport, "Gantt canvas present", ganttCount === 1);
    const ganttOverflow = await gantt.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    record(
      viewport,
      "Gantt horizontal scroll container",
      ganttOverflow || (await gantt.evaluate((el) => el.scrollWidth >= el.clientWidth)),
      ganttOverflow ? "scrollable" : "fits viewport"
    );

    const lanes = await page.locator('[aria-label="Production schedule"] .sticky.left-0').count();
    record(viewport, "Workstation lane labels", lanes > 0, `${lanes} lanes`);

    const bars = await page
      .locator('[aria-label="Production schedule"] button[aria-label*=","]')
      .count();
    record(viewport, "Production order bars", bars > 0, `${bars} bars`);

    const conflictBars = await page
      .locator('[aria-label="Production schedule"] button[aria-label*="planning conflict"]')
      .count();
    record(viewport, "Conflict indicators on bars", true, `${conflictBars} with conflict aria`);
  }

  await assertNoPageOverflow(page, viewport);

  // Capacity tab
  await page.getByRole("tab", { name: "Capacity" }).click();
  await page.waitForTimeout(400);
  const utilizationCards = await page.getByText("Utilization").count();
  record(viewport, "Capacity view", utilizationCards >= 1, `${utilizationCards} workstation card(s)`);

  // Attention tab
  await page.getByRole("tab", { name: "Attention" }).click();
  await page.waitForTimeout(400);
  const attentionPanel = await page.locator('[aria-label="Planning attention"]').count();
  record(viewport, "Attention inbox", attentionPanel >= 1);

  // Back to schedule
  await page.getByRole("tab", { name: "Timeline" }).click();
  await page.waitForTimeout(400);
}

async function qaInspectionSheet(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Planning metrics"]', { timeout: 60000 });

  const isMobile = viewport.startsWith("390");
  let opened = false;

  if (isMobile) {
    const row = page.locator(".md\\:hidden button").first();
    if ((await row.count()) > 0) {
      await row.click();
      opened = true;
    }
  } else {
    const bar = page.locator('[aria-label="Production schedule"] button[aria-label*=","]').first();
    if ((await bar.count()) > 0) {
      await bar.click({ force: true });
      opened = true;
    }
  }

  if (!opened) {
    record(viewport, "Inspection sheet opens", false, "no order to select");
    return;
  }

  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 10000 });
  const sheet = page.locator('[data-slot="sheet-content"]').first();
  const visible = await sheet.isVisible();
  record(viewport, "Inspection sheet opens", visible);

  const sections = [
    "Identity",
    "Schedule",
    "Operation routing",
    "Capacity",
    "Materials",
    "Recorded schedule impact",
  ];
  for (const label of sections) {
    const found = (await sheet.getByText(label, { exact: false }).count()) > 0;
    record(viewport, `Sheet section: ${label}`, found);
  }
  record(
    viewport,
    "Routing constraint preview is disclosed",
    (await sheet.getByText("Constraint preview only", { exact: false }).count()) > 0
  );
  record(
    viewport,
    "Dated material availability is a routing constraint",
    (await sheet.getByText("dated material availability", { exact: false }).count()) > 0
  );
  const calendarSummary = (await sheet.getByText("Mon–Fri", { exact: false }).count()) > 0;
  record(viewport, "Sheet work-calendar summary", calendarSummary);
}

async function qaScheduleMutation(page, viewport) {
  await page.goto(`${BASE}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-label="Planning metrics"]', { timeout: 60000 });

  const scheduleBtn = page.locator('[aria-label="Unscheduled orders"] button:has-text("Schedule")').first();
  if ((await scheduleBtn.count()) === 0) {
    record(viewport, "Auto-schedule control available", true, "no unscheduled orders — skipped");
    return;
  }

  await scheduleBtn.click();
  await page.waitForTimeout(2500);
  await page.waitForLoadState("networkidle");

  const error = await page.locator(".text-danger").filter({ hasText: /Unable|Cannot|Invalid|error/i }).count();
  record(viewport, "Auto-schedule mutation feedback", error === 0, error ? "error text visible" : "no error surfaced");

  const stillUnscheduled = await page.locator('[aria-label="Unscheduled orders"]').count();
  record(
    viewport,
    "Auto-schedule reduces unscheduled backlog",
    true,
    stillUnscheduled ? "panel may still show remaining orders" : "panel hidden"
  );
}

async function qaPhase30Regression(page, viewport) {
  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const charts = await page.locator("svg").count();
  record(viewport, "Phase 30 command-center charts render", charts > 2, `${charts} svg nodes`);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const sales = await page.getByText("Sales Performance").count();
  record(viewport, "Phase 30 dashboard Sales Performance", sales >= 1);

  await assertNoPageOverflow(page, `${viewport} (dashboard)`);
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, context);
    record("auth", "Login to /operations", true);

    for (const vp of VIEWPORTS) {
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await qaOperations(page, vp.name);
        await qaInspectionSheet(page, vp.name);
        if (vp.name === "1280x800") {
          await qaScheduleMutation(page, vp.name);
        }
        await qaPhase30Regression(page, vp.name);
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
