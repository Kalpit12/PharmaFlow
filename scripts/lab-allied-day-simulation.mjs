/**
 * MediCrest — one operating day via real APIs (Neon + Auth session).
 * Run: npx dotenv-cli -e .env -- node scripts/medicrest-day-simulation.mjs
 * Fresh master data first: npx dotenv-cli -e .env -- npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = (process.env.AUTH_DEV_EMAIL ?? "alex@medicrest.demo").trim().toLowerCase();
const PASSWORD = process.env.AUTH_DEV_PASSWORD ?? "pharmora-demo-local";

const log = (step, detail = "") => console.log(detail ? `[demo-day] ${step} — ${detail}` : `[demo-day] ${step}`);

function dueInDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function windowStartIso() {
  const d = new Date();
  d.setUTCHours(6, 0, 0, 0);
  return d.toISOString();
}

async function createSessionCookie() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const merge = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  merge(csrfRes);
  if (!csrfRes.ok) throw new Error(`CSRF failed: ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();

  const authRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
  });
  merge(authRes);
  if (authRes.status !== 302 && authRes.status !== 200 && !authRes.ok) {
    throw new Error(`Sign-in failed: ${authRes.status} ${await authRes.text()}`);
  }
  const header = cookieHeader();
  if (!header.includes("authjs.session-token")) {
    throw new Error("Sign-in did not return a session cookie.");
  }
  return header;
}

async function apiPost(path, cookie, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${json.message ?? text}`);
  }
  return json;
}

async function loadIds(prisma) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) throw new Error("Tenant medicrest not seeded. Run: npx dotenv-cli -e .env -- npx prisma db seed");

  const products = await prisma.product.findMany({
    where: {
      tenantId: tenant.id,
      sku: { in: ["AMOX-500-CAP", "PARA-500-TAB", "AMOX-API-KG"] },
    },
    select: { id: true, sku: true, name: true },
  });
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

  const customer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, name: "ABC Pharmaceuticals" },
    select: { id: true, name: true },
  });
  if (!customer) throw new Error("Customer ABC Pharmaceuticals missing from seed.");

  for (const sku of ["AMOX-500-CAP", "PARA-500-TAB", "AMOX-API-KG"]) {
    if (!bySku[sku]) throw new Error(`Product ${sku} missing from seed.`);
  }

  return { tenant, customer, products: bySku };
}

async function main() {
  const prisma = new PrismaClient();
  const { customer, products } = await loadIds(prisma);
  await prisma.$disconnect();

  log("Auth", `Signing in as ${EMAIL}…`);
  const cookie = await createSessionCookie();
  log("Auth", "Session OK");

  const commercial = await apiPost("/api/orders", cookie, {
    customerId: customer.id,
    productId: products["AMOX-500-CAP"].id,
    quantity: 120,
    unitPrice: "850",
    status: "CONFIRMED",
  });
  log("Commercial", `Order for ${customer.name} — ${commercial.order?.id ?? "created"}`);

  const po1 = await apiPost("/api/production-orders", cookie, {
    productId: products["AMOX-500-CAP"].id,
    quantity: 18000,
    priority: "HIGH",
    dueDate: dueInDays(5),
    durationMinutes: 480,
  });
  const po2 = await apiPost("/api/production-orders", cookie, {
    productId: products["PARA-500-TAB"].id,
    quantity: 10000,
    priority: "NORMAL",
    dueDate: dueInDays(7),
    durationMinutes: 360,
  });
  log("Production planner", `Amoxicillin order ${po1.order?.id ?? ""}`);
  log("Production planner", `Paracetamol order ${po2.order?.id ?? ""}`);

  const start = windowStartIso();
  await apiPost(`/api/production-orders/${po1.order.id}/auto-schedule`, cookie, { windowStart: start });
  await apiPost(`/api/production-orders/${po2.order.id}/auto-schedule`, cookie, { windowStart: start });
  log("Production planner", "Both orders auto-scheduled on Line A window");

  try {
    await apiPost("/api/procurement/requisitions", cookie, { productId: products["AMOX-API-KG"].id });
    log("Procurement", "Amoxicillin API requisition draft created");
  } catch (error) {
    log("Procurement", `Skipped requisition — ${error.message}`);
  }

  await apiPost(`/api/production-orders/${po1.order.id}/release`, cookie, { reason: "Demo day — release to floor" });
  await apiPost(`/api/production-orders/${po1.order.id}/start`, cookie, {});
  log("Shop floor", "Amoxicillin run released and started");

  await apiPost("/api/quality/exceptions", cookie, {
    title: "In-process check — blend homogeneity",
    description:
      "Shift sample flagged variation during capsule fill. Batch held pending QA review before continuing the demo run.",
    type: "DEVIATION",
    severity: "MEDIUM",
    productionOrderId: po1.order.id,
  });
  log("Quality", "Exception logged against amoxicillin production order");

  console.log("\n--- MediCrest demo day (live data) ---");
  console.log(`Open: ${BASE}/login`);
  console.log(`  Email: ${EMAIL}`);
  console.log(`  Password: (AUTH_DEV_PASSWORD in .env)`);
  console.log("\nClick-through tour:");
  console.log(`  1. Dashboard     ${BASE}/dashboard`);
  console.log(`  2. Operations    ${BASE}/operations   (planner + scheduled orders)`);
  console.log(`  3. Procurement   ${BASE}/procurement`);
  console.log(`  4. Production    ${BASE}/execution/production`);
  console.log(`  5. Quality       ${BASE}/quality`);
  console.log(`  6. Command ctr   ${BASE}/command-center`);
  console.log("\nSimulation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
