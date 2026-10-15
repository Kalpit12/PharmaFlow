# Operations Planner rebuild (SkyPlanner-aligned)

Source specs: `SkyPlanner Study & Operations Planner Build Prompt.md`, `pharmaflow-operations-planner-prompt.md`.

## Principles

- Reuse Prisma, auth, audit, Materials, Procurement, Batches, Quality, Execution.
- **Propose → accept** for all schedule publishes.
- Deterministic engine (no LLM on load).
- Tenant-scoped writes with audit.

## Phase map

| Phase | Status | Notes |
| --- | --- | --- |
| **1 Resource & product model** | **Done** | Plant site/dept/room, workstation groups, GMP fields on workstations & routing steps, changeover levels, tools, setup UI + workstation CSV |
| **2 Orders, prospects, batches** | **Done** | Batch sizing, campaigns schema, firm + prospect orders, convert API, `/operations` orders tab |
| **3 Planner engine** | **Done** | GMP hard constraints, weighted objective, propose/accept tab |
| **4 Gantt + ghost compare** | **Done** | Live/ghost bars, diff, drag-to-propose, accept/reject, now line, shop-floor links |
| **5 Shop floor** | **Done** | Station queue, pause reasons, line clearance, one-active-job/line, TV board |
| **6 Integrations** | **Done** | Material delays → Command Center / Daily Review; integrations tab; PO → OPEN incoming receipts; receive/approve → debounced supply autopilot; schedule proposals in Execution queue |
| **7 Reports & dashboards** | **Done** | Per-user dashboards, drag-and-drop widgets, date range, CSV + print/PDF export, fixed reports |
| **8 Roles & permissions** | **Done** | Planner access roles, department-scoped workstations, global rules permission, operator shop-floor-only |
| **9 Data in/out** | **Done** | CSV import hub, tenant API keys, REST `/api/v1/*`, outbound webhooks |
| **10 Planner assistant** | **Done** | Deterministic chat → drafts → accept; audited writes |

**SkyPlanner full parity** (no deferrals): Phases **11–22** in [`OPERATIONS-PLANNER-SKYPLANNER-PARITY.md`](./OPERATIONS-PLANNER-SKYPLANNER-PARITY.md).

## Phase 1 data model (this slice)

**New tables:** `PlantSite`, `PlantDepartment`, `PlantRoom`, `WorkstationGroup`, `ProductionTool`, `ProductionToolWorkstation`.

**Extended:** `Workstation` (site, department, room, group, efficiency, qual/clean, parallel jobs), `RoutingOperation` (min completion %, max hold, line clearance, QC hold), `ChangeoverRule` (level, max campaign batches).

**Completed in Phases 1–10:** plant entities, routing deps in DB, partial CSV. **Remaining:** personnel, sub-products, visual DAG editor, extra CSV kinds → **Phase 11** (parity doc).

Migration: `20261014210000_operations_plant_model_phase1`.

## Phase 2 (orders & prospects)

Migration: `20261014220000_operations_phase2_orders`.

- `Product.validatedBatchSize`, `Customer.defaultPriority`
- `ProductionCampaign`, `ProductionOrderAttachment`
- Extended `ProductionOrder`: `orderKind` (FIRM | PROSPECT), `scheduleDirection`, batch sizing snapshot fields, customer/campaign links
- Server: `src/lib/server/production-orders-phase2.ts`, `src/lib/operations/batch-sizing.ts`
- UI: `ProductionOrdersWorkspace` + `OperationsWorkspace` tabs on `/operations`

## Phase 3 (planner engine)

ADR: `docs/pharmora/ADR-planner-engine.md`.

- GMP: workstation qualification/calibration/clean hold, QC elapsed hold (no capacity), min completion lag on dependencies, max hold validation, campaign batch limits → forced major clean.
- Weights: `PlanningPolicy` due date + changeover drive optimizer score (`schedule-optimizer.ts`).
- UI: **Planner engine** tab — global rules, reschedule all, accept/reject proposal (existing schedule plan APIs).

## Phase 7 (reports & dashboards)

- `PlannerDashboard` / `PlannerDashboardWidget` — per-user layouts persisted in Postgres.
- `PlannerDashboardBuilder` — drag-and-drop widget order, add/remove widgets, date range, multiple dashboards.
- Export: client CSV, print/PDF via HTML; server `/api/planner-dashboards/[id]/export?format=csv|html`.
- Snapshot: `getOperationsDashboardSnapshot` + widget catalog in `planner-widgets.ts`.
- Verify: `npx tsx scripts/verify-operations-dashboard.ts`.

## Phase 10 (planner assistant)

- Deterministic intent parser (`planner-assistant-intents.ts`) — no LLM on page load.
- Drafts persisted in `PlannerAssistantDraft`; accept/reject via `/api/planner-assistant`.
- Intents: firm/prospect orders, reschedule-all proposal, workstation downtime what-if, at-risk summary.
- UI: `/operations` → **Assistant** tab.
- Verify: `npx tsx scripts/verify-planner-assistant.ts`.

## Phase 9 (data in/out)

- CSV: `/api/planner-import/[kind]` with dry-run preview (`workstations`, `orders`, `customers`, `shifts`, `products`, `materials`, `routings`).
- UI: `/operations` → **Data import** tab with templates (`planner-csv-parsers.ts`).
- API keys: `TenantApiKey` + `/api/planner-api-keys` (head planner); REST v1 under `/api/v1/*` with Bearer `pf_live_…`.
- Outbound webhooks: `PlannerWebhookSubscription`, `emitPlannerWebhook` on plan accept and job start/complete.
- Verify: `npx tsx scripts/verify-planner-phase9.ts`.

## Phase 8 (roles & permissions)

- `User.plannerAccessRole`, `User.plantDepartmentId` — department-scoped operator/supervisor views.
- `production.global_rules` permission (head planner / manager); planners may propose schedules but not edit global rules.
- `OPERATOR` role permissions trimmed to shop floor + read (no schedule).
- Gantt, dashboard, and production execution filter by department workstations when scoped.
- Verify: `npx tsx scripts/verify-planner-access.ts`.

## Phase 6 (integrations)

- `buildMaterialDelaySignals` — ranked batch messages from MRP constraints (`planner-integrations.ts`).
- Command Center + Daily Review ingest delay signals.
- `/operations` → **Integrations** tab; `maybeTriggerSupplyTimelineReplan` when autopilot on (debounced).
- `syncIncomingReceiptsForPurchaseOrder` — approved PO lines create/update OPEN `InventoryReceipt` rows (default +7d lead) for Materials MRP; receiving reconciles quantities.
- Execution queue lists PROPOSED schedule plans (accept/reject via existing schedule-plan APIs).
- Verify: `npx tsx scripts/verify-planner-integrations.ts`.

## Phase 5 (shop floor)

- Station queue when `?workstation=` — sorted (active → paused → released → waiting, then planned start).
- `ShopFloorStationQueue` — large Release / line clearance / Start / Pause (with reason) / Resume / Complete.
- GMP: `PRODUCTION_LINE_CLEARANCE` audit before start when routing requires it; only one `IN_PROGRESS` job per workstation.
- TV board: `/execution/production/board` (read-only, 30s revalidate).
- Verify: `npx tsx scripts/verify-shop-floor.ts`.

## Phase 4 (Gantt)

- `getOperationsGanttSnapshot` — live operation bars + ghost bars from active `SchedulePlanOperation`.
- `OperationsGanttWorkspace` — workstation rows, SkyPlanner-style colors, proposal diff table.
- Accept/reject on **Planner engine**; drag on Gantt calls **propose-move** (ghost diff). Dependency arrows, capacity graph, context menu → **Phase 14**.

## UI

- `/operations` — **Schedule (Gantt)** default tab, plus plant model, orders, planner engine.
- Workstation CSV: `code,name,kind,capacityHoursPerDay,siteCode,groupCode,active`.

## Demo seed

`ensurePlantModelDemoData` — Nairobi site, departments, rooms, groups; links MediCrest workstations when present.
