import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import {
  forecastConfidence,
  parseForecastHorizon,
  periodComparison,
  projectRunRate,
} from "../src/lib/forecasting/engine";
import type { TenantContext } from "../src/lib/server/errors";
import { getForecastSnapshot, toCompactForecastContext } from "../src/lib/server/forecasting";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase20Verify(prisma: PrismaClient) {
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/forecast/page.tsx"), "utf8");
  const engineSource = readFileSync(join(process.cwd(), "src/lib/forecasting/engine.ts"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/forecasting.ts"), "utf8");
  const uiSource = readFileSync(join(process.cwd(), "src/components/forecast/ForecastWorkspace.tsx"), "utf8");

  assert(!/generateResponse|runProductionOrchestrator|chat\.completions|openaiAIProvider/i.test(pageSource + engineSource + serverSource), "Forecast engine has no OpenAI dependency");
  assert(!/tensorflow|scikit|openai/i.test(engineSource), "No ML libraries in forecast engine");
  assert(/Explain this forecast/.test(uiSource) && /\/api\/ai/.test(uiSource), "Explicit explanation uses existing /api/ai");
  assert(!/decideAction|createRequisitionDraft|plannedStart/.test(uiSource), "Forecast UI does not execute");

  assert(parseForecastHorizon("7") === 7 && parseForecastHorizon("14") === 14 && parseForecastHorizon("30") === 30, "7/14/30 day horizons");
  assert(periodComparison(10, 0).growth === "—", "Zero prior-period handling");
  assert(forecastConfidence({ dataPoints: 0, current: 0, prior: 0 }) === "INSUFFICIENT", "Insufficient historical data handling");
  assert(forecastConfidence({ dataPoints: 2, current: 0, prior: 0 }) === "LOW", "Observed zeros are low confidence, not fabricated");
  assert(projectRunRate(0, 0, "INSUFFICIENT") === null, "Unsafe forecast is null");
  assert(projectRunRate(100, 0, "LOW") === 100, "Zero prior uses run-rate only");
  const a = projectRunRate(100, 80, "MEDIUM");
  const b = projectRunRate(100, 80, "MEDIUM");
  assert(a === b, "Deterministic output");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const ordersBefore = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const productionBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const reqBefore = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });

  const seven = await getForecastSnapshot(manager, 7);
  const fourteen = await getForecastSnapshot(manager, 14);
  const thirty = await getForecastSnapshot(manager, 30);
  assert(seven.horizon === 7 && fourteen.horizon === 14 && thirty.horizon === 30, "Horizon snapshots");
  assert(seven.sales.metric === "Revenue outlook", "Forecast calculations present");
  assert(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"].includes(seven.sales.confidence), "Confidence enum");

  const emptyish = await getForecastSnapshot(other, 30);
  assert(emptyish.brand.length > 0, "Zero-data workspace returns a snapshot");
  assert(thirty.brand !== emptyish.brand, "Tenant isolation");
  if (emptyish.sales.confidence === "INSUFFICIENT") {
    assert(emptyish.sales.projectedValue === null, "Insufficient data does not fabricate a projection");
    assert(emptyish.sales.explanation === "Insufficient historical data", "Honest insufficient copy");
  }

  const compact = toCompactForecastContext(thirty);
  const compactJson = JSON.stringify(compact);
  assert(!compactJson.includes(tenant.id), "AI context contains no tenant UUID");
  assert(!compactJson.includes(tenantB.id), "AI context contains no isolation tenant UUID");
  assert(!/DATABASE_URL|postgres:\/\//i.test(compactJson), "AI context contains no credentials");
  assert(compact.risks.length <= 5, "Compact AI context");

  const intent = detectIntent("Explain this forecast for the next 14 days.");
  assert(intent.intent === "FORECAST", "Forecast intent detected");
  assert(INTENT_TOOLS.FORECAST[0] === "get_forecast", "Forecast uses get_forecast tool");

  const ordersAfter = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const productionAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const reqAfter = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "No mutation of orders");
  assert(lotsAfter === lotsBefore, "No mutation of inventory");
  assert(productionAfter === productionBefore, "No mutation of production schedules");
  assert(reqAfter === reqBefore, "No mutation of procurement");

  console.log("Phase 20 verification passed.");
}
