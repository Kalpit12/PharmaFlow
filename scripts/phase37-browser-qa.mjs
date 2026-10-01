/**
 * Phase 37 browser QA — run: node scripts/phase37-browser-qa.mjs
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

function isExplainApi(url) {
  return url.includes("/api/intelligence/explain");
}

function isMutatingAiApi(url) {
  return /\/api\/ai(?:\?|$)/.test(url);
}

async function login(page, context) {
  const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const authRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/command-center`,
      json: "true",
    },
    maxRedirects: 0,
    timeout: 60000,
  });
  if (![200, 302].includes(authRes.status())) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Business state"]', { timeout: 120000 });
}

async function assertNoPageOverflow(page, viewport) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(viewport, "No page-level horizontal overflow", overflow <= 2, overflow > 2 ? `${overflow}px overflow` : "");
}

async function qaIntelligence(page, viewport) {
  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Operational intelligence"]', { timeout: 120000 });
  record(viewport, "Command Center intelligence", (await page.locator('[aria-label="Operational intelligence"]').count()) === 1);
  record(viewport, "Command Center priorities or empty", (await page.getByText(/No operational priorities|Operational Intelligence/i).count()) > 0);
  await assertNoPageOverflow(page, viewport);

  await page.goto(`${BASE}/daily-review`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Operational intelligence"]', { timeout: 120000 });
  record(viewport, "Daily Review operational priorities", (await page.getByText("Today's operational priorities").count()) > 0);
  await assertNoPageOverflow(page, `${viewport} daily-review`);

  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Operational intelligence"]', { timeout: 120000 });
  record(viewport, "Reports intelligence", (await page.getByText("Cross-domain operational risk").count()) > 0);
  await assertNoPageOverflow(page, `${viewport} reports`);
}

async function qaExplain(page, viewport, counters) {
  if (viewport !== "1440x900") return;
  await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[aria-label="Operational intelligence"]', { timeout: 120000 });
  const explain = page.getByRole("button", { name: "Explain operational priorities" });
  record(viewport, "Explain control present", (await explain.count()) === 1);
  record(viewport, "Zero intelligence API calls before Explain", counters.explain === 0 && counters.ai === 0, `explain=${counters.explain} ai=${counters.ai}`);
  await explain.click();
  await page.waitForSelector("[data-intelligence-explanation]", { timeout: 60000 });
  record(viewport, "Explain returns deterministic or AI text", (await page.locator("[data-intelligence-explanation]").count()) === 1);
  record(viewport, "Exactly one explain API call", counters.explain === 1, `calls=${counters.explain}`);
  record(viewport, "No mutating /api/ai call from Explain", counters.ai === 0);
  record(
    viewport,
    "Explanation is not executable",
    (await page.locator("[data-intelligence-explanation]").textContent())?.toLowerCase().includes("release batch") !== true
  );
}

async function qaRegression(page, viewport) {
  if (viewport !== "1440x900") return;
  for (const [path, label, selector] of [
    ["/operations", "Phase 31 operations", '[aria-label="Planning metrics"]'],
    ["/materials", "Phase 32 materials", '[aria-label="Material metrics"]'],
    ["/batches", "Phase 33 batches", '[aria-label="Batch metrics"]'],
    ["/quality", "Phase 35 quality", '[aria-label="Quality metrics"]'],
    ["/traceability", "Phase 34 traceability", '[aria-label="Traceability metrics"]'],
    ["/procurement", "Phase 15 procurement", "h1"],
    ["/governance", "Phase 36 governance", '[aria-label="Governance metrics"]'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    record(viewport, `${label} loads`, (await page.locator(selector).count()) > 0);
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const counters = { explain: 0, ai: 0 };
    page.on("request", (req) => {
      const url = req.url();
      if (isExplainApi(url) && req.method() === "POST") counters.explain += 1;
      if (isMutatingAiApi(url) && req.method() === "POST") counters.ai += 1;
    });
    await login(page, context);
    record("auth", "Login to command center", true);
    const afterLoginExplain = counters.explain;
    const afterLoginAi = counters.ai;
    record("auth", "Zero AI calls on command-center load", afterLoginExplain === 0 && afterLoginAi === 0, `explain=${afterLoginExplain} ai=${afterLoginAi}`);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await qaIntelligence(page, vp.name);
      await qaExplain(page, vp.name, counters);
      await qaRegression(page, vp.name);
    }
    record("console", "No console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
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
