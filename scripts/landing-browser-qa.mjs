/**
 * Public landing QA — run: node scripts/landing-browser-qa.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", ".tmp", "landing-qa");
const results = [];

function record(check, pass, detail = "") {
  results.push({ check, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${check}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const errors = [];

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

  const home = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  record("GET /", home?.ok() ?? false, `status ${home?.status()}`);
  record("title", /Pharmaflow/i.test(await page.title()), await page.title());

  const h1 = await page.locator("h1").innerText();
  record("hero h1", /operating system/i.test(h1), h1.replace(/\s+/g, " ").slice(0, 120));
  record("book a call CTA", (await page.locator('a[href="#contact"]').count()) >= 2);
  record("sign in", (await page.locator('a[href="/login"]').count()) >= 1);
  record("command center mock", (await page.getByText("Command Center · Nairobi plant").count()) >= 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  record("no page overflow 1440", !overflow);

  await page.locator('a[href="#product"]').first().click();
  await page.waitForTimeout(400);
  record("product section", await page.locator("#product").isVisible());

  await page.locator(".pf-workflow").scrollIntoViewIfNeeded();
  await page.locator(".pf-node").nth(2).click();
  record("workflow node click", /Award/i.test(await page.locator(".pf-workflow").innerText()));

  await page.getByText("Does Pharmaflow replace our ERP?").click();
  record("faq opens", await page.getByText("It sits beside your ERP", { exact: false }).isVisible());

  await page.locator('input[placeholder="Describe the pressure on your plant…"]').fill("Foil shortages on the packing line");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  const message = await page.locator("#contact-form textarea[name='message']").inputValue();
  record("hero prompt fills contact", message.includes("Foil shortages"));

  await page.locator("#contact-form input[name='name']").fill("Amina Otieno");
  await page.locator("#contact-form input[name='email']").fill("amina@example.co.ke");
  await page.locator("#contact-form input[name='phone']").fill("+254700000000");
  await page.locator("#contact-form select[name='role']").selectOption("operations");
  await page.locator("#contact-form input[name='company']").fill("Rift Valley Pharma");
  await page.locator("#contact-form select[name='companyType']").selectOption("manufacturer");
  await page.locator("#contact-form input[name='site']").fill("Nairobi");
  await page.locator("#contact-form select[name='sites']").selectOption("1");
  await page.locator("#contact-form select[name='pressure']").selectOption("materials");
  await page.getByRole("button", { name: "Request a call" }).click();
  record("form confirmation", await page.getByText("Received. We will follow up").isVisible());

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, "desktop-top.png") });
  await page.locator("#product").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, "desktop-product.png") });
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, "desktop-contact.png") });

  const pricing = await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  record("GET /pricing", pricing?.ok() ?? false, `status ${pricing?.status()}`);
  record("pricing h1", /Kenyan shillings/i.test(await page.locator("h1").innerText()));
  record("pricing plans", (await page.getByText("Network").count()) >= 1 && (await page.getByText("KSh 145,000").count()) >= 1);
  await page.screenshot({ path: join(outDir, "desktop-pricing.png") });

  const about = await page.goto(`${BASE}/about`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  record("GET /about", about?.ok() ?? false, `status ${about?.status()}`);
  const aboutH1 = await page.locator("h1").innerText();
  record("about NExora Digital", /NExora Digital/i.test(aboutH1), aboutH1.replace(/\s+/g, " ").slice(0, 140));
  await page.screenshot({ path: join(outDir, "desktop-about.png") });

  await page.locator('a[href="/login"]').first().click();
  await page.waitForURL(/\/login/);
  record("sign in route", page.url().includes("/login"));

  const redirected = await page.goto(`${BASE}/pharmaflow`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  const path = new URL(page.url()).pathname;
  record("/pharmaflow redirect", path === "/" && /operating system/i.test(await page.locator("h1").innerText()), `status ${redirected?.status()} path ${path}`);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE, { waitUntil: "networkidle" });
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  record("no page overflow 390", !mobileOverflow);
  await mobilePage.getByLabel("Open menu").click();
  record("mobile menu", await mobilePage.locator("header a[href='/pricing']").last().isVisible());
  await mobilePage.screenshot({ path: join(outDir, "mobile-menu.png") });

  record("no page errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(`screenshots: ${outDir}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
