/**
 * PharmaFlow AI functionality test suite
 * Run: node scripts/ai-functionality-test.mjs
 * Requires: dev server on QA_BASE_URL, database seeded
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.AUTH_DEV_EMAIL ?? "alex@medicrest.demo";
const PASSWORD = process.env.AUTH_DEV_PASSWORD ?? "pharmora-demo-local";

const results = [];

function record(category, name, pass, detail = "") {
  results.push({ category, name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`[${tag}] ${category} · ${name}${detail ? ` — ${detail}` : ""}`);
}

function assertStructuredResponse(response) {
  if (!response || typeof response !== "object") return "Missing response object";
  if (typeof response.summary !== "string" || !response.summary.trim()) return "Missing summary";
  if (!Array.isArray(response.keySignals)) return "Missing keySignals array";
  if (!Array.isArray(response.recommendedActions)) return "Missing recommendedActions array";
  if (!Array.isArray(response.followUps)) return "Missing followUps array";
  if (!response.metadata || typeof response.metadata.intent !== "string") return "Missing metadata.intent";
  return null;
}

function assertExplainShape(explanation, fields) {
  if (!explanation || typeof explanation !== "object") return "Missing explanation";
  if (typeof explanation.summary !== "string" || !explanation.summary.trim()) return "Missing summary";
  for (const field of fields) {
    if (!Array.isArray(explanation[field])) return `Missing ${field} array`;
  }
  if (typeof explanation.source !== "string") return "Missing source";
  return null;
}

async function login(context) {
  const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const authRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    },
    maxRedirects: 0,
    timeout: 60000,
  });
  if (![200, 302].includes(authRes.status())) {
    const body = await authRes.text();
    throw new Error(`Auth failed (${authRes.status()}): ${body.slice(0, 200)}`);
  }
}

async function postAi(context, question) {
  const res = await context.request.post(`${BASE}/api/ai`, {
    data: { question },
    timeout: 120000,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status(), payload };
}

async function postJson(context, path, body) {
  const res = await context.request.post(`${BASE}${path}`, {
    data: body,
    timeout: 120000,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status(), payload };
}

async function loadFixtures() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug: "medicrest" } });
    if (!tenant) throw new Error("Demo tenant medicrest not found — run db:seed");

    const revenueAgg = await prisma.order.aggregate({
      where: { tenantId: tenant.id, status: { in: ["CONFIRMED", "FULFILLED"] } },
      _sum: { totalAmount: true },
    });
    const revenueTotal = Number(revenueAgg._sum.totalAmount ?? 0);

    const rfq = await prisma.procurementRfq.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true },
    });
    const po = await prisma.purchaseOrder.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, poNumber: true },
    });

    return {
      tenantId: tenant.id,
      revenueTotal,
      rfqId: rfq?.id ?? null,
      rfqReference: rfq?.reference ?? null,
      poId: po?.id ?? null,
      poNumber: po?.poNumber ?? null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function revenueHint(total) {
  if (total >= 1_000_000) return `${Math.round(total / 1_000_000)}M`;
  if (total >= 1_000) return `${Math.round(total / 1_000)}K`;
  return String(Math.round(total));
}

async function main() {
  const { chromium } = await import("playwright");
  const fixtures = await loadFixtures();
  record("setup", "Demo fixtures loaded", true, `revenue≈KSh ${revenueHint(fixtures.revenueTotal)}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await login(context);

  // --- /api/ai orchestrator ---
  const aiCases = [
    { name: "Business summary", question: "Give me today's business summary.", expectedIntent: "BUSINESS_SUMMARY" },
    { name: "Revenue performance", question: "What is our revenue performance?", expectedIntent: "SALES_PERFORMANCE", accuracyHint: revenueHint(fixtures.revenueTotal) },
    { name: "RFQ analysis", question: "How are RFQs performing?", expectedIntent: "RFQ_ANALYSIS" },
    { name: "Customer attention", question: "Which customers need attention?", expectedIntent: "ATTENTION_ITEMS" },
    { name: "Product performance", question: "How is Amoxicillin performing?", expectedIntent: "PRODUCT_PERFORMANCE" },
    { name: "Regional performance", question: "How is Kenya performing?", expectedIntent: "REGIONAL_PERFORMANCE" },
    { name: "Daily review intent", question: "What needs my attention today?", expectedIntent: "DAILY_REVIEW" },
    { name: "Operational priority", question: "What is the biggest operational risk right now?", expectedIntent: "OPERATIONAL_PRIORITY" },
    { name: "Procurement priority", question: "Which procurement requisitions should I review first?", expectedIntent: "PROCUREMENT_PRIORITY" },
    { name: "Forecast explain", question: "Explain this forecast for the next 30 days.", expectedIntent: "FORECAST" },
    { name: "Supplier performance", question: "Explain supplier performance", expectedIntent: "SUPPLIER_PERFORMANCE" },
    { name: "Executive report", question: "Explain this report (executive).", expectedIntent: "EXECUTIVE_REPORT" },
    { name: "Cross-domain", question: "Give me a sales and operations cross-domain view.", expectedIntent: "CROSS_DOMAIN_ANALYSIS" },
    { name: "Draft follow-up", question: "Draft a follow-up message for customers who need attention.", expectedIntent: "ATTENTION_ITEMS" },
    { name: "Unsupported (weather)", question: "What is the weather today?", expectedIntent: "UNSUPPORTED" },
    { name: "Medical guardrail", question: "What dosage should a patient take for Amoxicillin?", expectedIntent: "UNSUPPORTED" },
  ];

  for (const test of aiCases) {
    const { status, payload } = await postAi(context, test.question);
    const ok = status === 200;
    record("/api/ai", `${test.name} — HTTP 200`, ok, ok ? "" : `status=${status} msg=${payload.message ?? "n/a"}`);
    if (!ok) continue;

    const shapeErr = assertStructuredResponse(payload.response);
    record("/api/ai", `${test.name} — response shape`, !shapeErr, shapeErr ?? "");
    if (shapeErr) continue;

    const intentMatch = payload.response.metadata.intent === test.expectedIntent;
    record("/api/ai", `${test.name} — intent ${test.expectedIntent}`, intentMatch, `got=${payload.response.metadata.intent}`);

    if (test.expectedIntent === "UNSUPPORTED") {
      const refuses =
        /business|operational|sales|pharmaflow|medical advice|business data/i.test(payload.response.summary);
      record("/api/ai", `${test.name} — refuses off-topic/medical`, refuses);
    }

    if (test.accuracyHint) {
      const blob = JSON.stringify(payload.response).toLowerCase();
      const grounded = blob.includes(test.accuracyHint.toLowerCase()) || blob.includes("ksh");
      record("/api/ai", `${test.name} — grounded in workspace revenue`, grounded, `hint=${test.accuracyHint}`);
    }

    if (test.name === "Forecast explain" || test.name === "Supplier performance" || test.name === "Executive report") {
      const noMutation =
        !payload.response.actionProposal &&
        !payload.response.workflowProposal &&
        !payload.response.communicationDraft;
      record("/api/ai", `${test.name} — explain-only (no drafts)`, noMutation);
    }
  }

  if (fixtures.rfqId) {
    const q = `Analyze RFQ procurement-rfq:${fixtures.rfqId}`;
    const { status, payload } = await postAi(context, q);
    record("/api/ai", "Procurement RFQ analyze — HTTP 200", status === 200, `rfq=${fixtures.rfqReference ?? fixtures.rfqId}`);
    if (status === 200) {
      record("/api/ai", "Procurement RFQ analyze — shape", !assertStructuredResponse(payload.response));
      record(
        "/api/ai",
        "Procurement RFQ analyze — intent",
        payload.response?.metadata?.intent === "PROCUREMENT_RFQ",
        `got=${payload.response?.metadata?.intent}`
      );
    }
  } else {
    record("/api/ai", "Procurement RFQ analyze", false, "No procurement RFQ in seed data");
  }

  if (fixtures.poId) {
    const q = `Explain this purchase order purchase-order:${fixtures.poId}`;
    const { status, payload } = await postAi(context, q);
    record("/api/ai", "Purchase order explain — HTTP 200", status === 200, `po=${fixtures.poNumber ?? fixtures.poId}`);
    if (status === 200) {
      record("/api/ai", "Purchase order explain — shape", !assertStructuredResponse(payload.response));
      record(
        "/api/ai",
        "Purchase order explain — intent",
        payload.response?.metadata?.intent === "PURCHASE_ORDER",
        `got=${payload.response?.metadata?.intent}`
      );
    }
  } else {
    record("/api/ai", "Purchase order explain", false, "No purchase order in seed data");
  }

  // --- Dedicated explain routes (Phase 37 / 38) ---
  const intel = await postJson(context, "/api/intelligence/explain", {
    question: "What should management look at?",
  });
  record("/api/intelligence/explain", "HTTP 200", intel.status === 200, intel.status !== 200 ? String(intel.payload.message ?? intel.status) : "");
  if (intel.status === 200) {
    const err = assertExplainShape(intel.payload.explanation, ["reasons", "impacts", "reviewItems", "limitations"]);
    record("/api/intelligence/explain", "Response shape", !err, err ?? `source=${intel.payload.explanation?.source}`);
    record(
      "/api/intelligence/explain",
      "No executable actions in text",
      !/\b(approve|reject|schedule|release|purchase|execute)\b/i.test(intel.payload.explanation?.summary ?? ""),
    );
  }

  const scenario = await postJson(context, "/api/scenarios/explain", {
    question: "Explain this scenario.",
    params: { demand: "20", horizon: "30" },
  });
  record("/api/scenarios/explain", "HTTP 200", scenario.status === 200, scenario.status !== 200 ? String(scenario.payload.message ?? scenario.status) : "");
  if (scenario.status === 200) {
    const err = assertExplainShape(scenario.payload.explanation, ["keyDrivers", "impact", "tradeOffs", "limitations"]);
    record("/api/scenarios/explain", "Response shape", !err, err ?? `source=${scenario.payload.explanation?.source}`);
    record(
      "/api/scenarios/explain",
      "Labels simulation",
      /simul|project|scenario|what-if|capacity|demand/i.test(
        `${scenario.payload.explanation?.summary ?? ""} ${(scenario.payload.explanation?.keyDrivers ?? []).join(" ")}`,
      ),
    );
    record("/api/scenarios/explain", "OpenAI call count ≤ 1", (scenario.payload.openaiCalls ?? 0) <= 1, `calls=${scenario.payload.openaiCalls ?? 0}`);
  }

  // --- Auth guard ---
  const anon = await fetch(`${BASE}/api/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Hello" }),
  });
  record("security", "Unauthenticated /api/ai rejected", anon.status === 401, `status=${anon.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== AI Test Summary ===`);
  console.log(`Total: ${results.length} · Passed: ${results.length - failed.length} · Failed: ${failed.length}`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - [${f.category}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("AI test suite failed:", error);
  process.exit(1);
});
