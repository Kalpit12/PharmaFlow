# Pharmora — Architecture

## Current stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables (Phase 29 visual system 2.0) |
| Type | IBM Plex Sans + Geist Mono |
| Components | shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Package manager | npm |
| App root | `src/app` |
| Alias | `@/*` → `src/*` |
| ORM | Prisma 6 |
| Database | PostgreSQL |

No production auth, no AI provider, no ERP/WhatsApp. UI pages still use mock data (Phase 6 does not wire the frontend to Prisma).

## Directory map (target)

```
src/app/                 # routes (pages added from Phase 3+)
src/components/ui/       # shadcn primitives
src/components/ds/       # design-system patterns (Phase 2)
src/components/layout/   # AppShell, Sidebar, Topbar, PageHeader, … (Phase 3)
src/components/search/   # GlobalSearch, CommandPalette, SearchResults
src/lib/                 # cn(), tenant
src/lib/mock/            # chrome + search + dashboard + Phase 5A AI replies
src/lib/ai/              # Phase 5B intelligence contracts (no live provider)
src/lib/server/          # Prisma client, tenant context, domain services
prisma/                  # schema, migrations, seed
src/app/api/health/db    # minimal DB health read
src/types/               # shared types
docs/pharmora/           # source of truth
```

Feature folders (`dashboard`, `ai`, `products`, …) are created when that phase starts — not in advance as empty shells.

## Design tokens

All color and radius live in `src/app/globals.css`. Components consume Tailwind theme mappings / CSS variables. Demo tenant lives in `src/lib/tenant.ts`. UI reads `getTenant()` — do not hard-code Laboratory & Allied in components.

## Data

When pages exist: typed modules under `src/lib/mock/`. Components receive structured data; they do not own datasets.

## Session

Mock user/session object only when needed for chrome (name, role). Must not look like production authentication.

## Multi-tenancy (frontend)

`src/lib/tenant.ts` will hold demo tenant config (name, tagline, country, accent if any). UI reads tenant config. Do not hard-code Laboratory & Allied across the app.

## Constraints

- Do not add dependencies unless a phase requires them.  
- Prefer Server Components; mark `"use client"` only for interactive primitives.  
- Do not scan `node_modules` or build output when changing the product.  
- After each phase, update `PROGRESS.md` and treat it as the working memory.

## AI intelligence layer (Phase 5B contracts + Phase 8 provider)

Question → intent (`detectIntent`) → approved tools (`INTENT_TOOLS`) → `collectToolContext` (one dashboard fetch, tenant-scoped) → compact `BusinessContext` (no Prisma, no DATABASE_URL, no tenant UUID sent to the model) → `AIProvider` → validated `StructuredAIResponse` → `/ai` UI.

`POST /api/ai` authenticates with `getAuthenticatedTenantContext()`. The client must not send `tenantId`, `userId`, or `role`.

Providers: `openaiAIProvider` (production) and `demoAIProvider` (`AI_PROVIDER=mock`). `/ai` does not import the OpenAI SDK.

Tools execute through `src/lib/server/ai-data.ts` only. The model never queries the database. Phase 8 tools are read-only.

Unsupported / medical questions return a canned scope message without a model call.

Conversation history is bounded (6 turns, truncated). Not persisted.

Rate limit: in-memory 20 requests / 5 minutes per user (process-local). Production should use a shared store.

Token control: server aggregates metrics; the model receives compact JSON, not order rows.

Prompt injection: business text is labeled as context, not instructions.

`OPENAI_API_KEY` and `OPENAI_MODEL` are server-only. Never `NEXT_PUBLIC_`.

### Intent

`AIIntentName`: SALES_PERFORMANCE, PRODUCT_PERFORMANCE, RFQ_ANALYSIS, CUSTOMER_ACTIVITY, REGIONAL_PERFORMANCE, BUSINESS_SUMMARY, OPPORTUNITY_ANALYSIS, ATTENTION_ITEMS, GENERAL_BUSINESS_QUERY, UNSUPPORTED.

`AIIntent`: intent, confidence, entities, timeRange, requiredContext.

Entities: product, customer, region, rfq, order, timeRange.

Time range presets: 7D, 30D, 90D, 12M, CUSTOM (explicit dates later; no parser in this phase). Default for current demo data: 30D.

### Context

`BusinessContext` is a controlled object: tenant, dataMode (`demonstration` | `live`), timeRange, slice list, tool results. Never pass arbitrary React/app state to a model.

`INTENT_CONTEXT` / `INTENT_TOOLS` list the minimum slices and tools per intent.

### Tools (contracts)

Registry in `src/lib/ai/tools.ts`. Handlers in `src/lib/server/ai-data.ts` (`execution: "domain"`).

| Tool | Output (structured) |
| --- | --- |
| get_business_summary | revenue, orders, RFQs, customers, demand + trends |
| get_sales_performance | timeRange + series points |
| get_product_performance | product, orders, demand, growth, trend, status |
| get_customer_activity | active count, inactivity, open RFQ, overdue quote |
| get_rfq_analysis | count, trend, demand product/region |
| get_regional_performance | country, revenue, growth, activity |
| get_attention_items | severity, title, detail |
| get_opportunities | category, insight, action |

Permissions: `commercial.read` | `analytics.read`.

### Response contract

`StructuredAIResponse`: summary, keySignals[], recommendedActions[], followUps[], insights[], actions[], metadata (intent, dataMode, timeRange, toolsUsed, sources).

Insights: category (DEMAND_SIGNAL, SALES_SIGNAL, CUSTOMER_SIGNAL, REGIONAL_SIGNAL, RFQ_SIGNAL, OPPORTUNITY, RISK, ATTENTION), title, metric, trend, severity, entity, recommendedAction.

Actions: VIEW_PRODUCT, VIEW_CUSTOMER, VIEW_REGION, VIEW_RFQ, VIEW_SALES, REVIEW_ATTENTION, INVESTIGATE_OPPORTUNITY + href for a future module.

Follow-ups: `{ question, intent? }`.

Providers return this object. The UI must not parse free-form markdown as the primary contract.

### Provider

`AIProvider.generateResponse({ question, context, history? })`. Production: `openai`. Mock adapter remains for development (`AI_PROVIDER=mock`).

### Prompt layers (future)

Separate, not one hardcoded blob:

1. System — Pharmora identity, business-analyst role, factuality, no hallucination, structured output, action-oriented, data boundaries  
2. Business context — `BusinessContext` only  
3. User question  
4. Tool results  
5. Response format — `StructuredAIResponse`

### Trust / safety

`TRUST_RULES` in `src/lib/ai/provider.ts`: no invented figures, customers, products, or orders; no fake completed actions; label demonstration vs live; say when data is missing; no medical/clinical claims; no unauthorized tenant data.

## Database (Phase 6)

PostgreSQL via Prisma. Connection string: `DATABASE_URL` only (see `.env.example`). Local Postgres: `docker compose up -d`.

### Tenant model

`Tenant` is the isolation root. Demo tenant slug `lab-allied` (Laboratory & Allied Limited), `status = DEMO`. Frontend `src/lib/tenant.ts` remains the UI demo config until a later integration phase.

Every business row that belongs to a company has `tenantId` and a foreign key to `Tenant`.

### Core entities

Tenant → Users, Products, Customers, Regions, Orders, Rfqs, Opportunities, Activities.

Customer → Region (optional), Orders, Rfqs.  
Order → OrderItems → Product.  
Rfq → RfqItem → Product.

Money: `Decimal(18,2)` plus `currency` (demo `KES`). No JS floats for totals. Timestamps: `timestamptz` (UTC).

### Indexes

`tenantId`; `tenantId + status`; `tenantId + createdAt`; `tenantId + customerId`; unique `User.email`; unique `(tenantId, sku|reference|code)`.

### Service layer

`src/lib/server/db.ts` — Prisma singleton.  
`src/lib/server/tenant-context.ts` — `getAuthenticatedTenantContext()` (session → database). `resolveDevTenantContext()` remains a temporary, explicitly deprecated fallback.  
`src/lib/server/services/*` — all queries take `TenantContext`. Never accept a client-supplied tenant id as proof of access.

### Tenant isolation

Server code must filter by `ctx.tenantId`. The client must not choose which tenant’s rows to read. `tenantId`, `userId`, and `role` are derived from the authenticated session and re-loaded from the database — never from request bodies or query strings.

### AI → services

`src/lib/server/ai-data.ts` maps Phase 5B tool names onto `getDashboardData` / domain analytics. Do not query Prisma from `src/lib/ai/` or from the browser.

### API boundary

Now: `GET /api/health/db`, `/api/auth/*`, authenticated `POST /api/ai`, `GET /api/actions`, `POST /api/actions/[id]`. Errors return `{ message }` without SQL, stack traces, or API keys.

Request validation: none installed. Validate at the route boundary in a later phase before writes.

### Seed

`prisma/seed.ts` — small DEMO dataset. Dashboard uses live aggregations (Phase 7B). `/ai` uses the production orchestrator (Phase 8) against the same tenant data.

Re-seed deletes the `lab-allied` tenant (cascade) only — do not run against an unknown production database.

```bash
cp .env.example .env   # Unix
copy .env.example .env # Windows
docker compose up -d
npx prisma migrate dev
npm run db:seed
npm run db:verify
```

Local Postgres is expected via Docker (`docker compose up -d`). This machine did not have Docker or `psql` available, so migrate/seed were not executed here. Apply with `npx prisma migrate deploy` then `npm run db:seed` and `npm run db:verify` once Postgres is running.

### Audit (future)

`createdAt` / `updatedAt` on mutable entities. `Activity` is the first timeline. Full audit log is out of scope.

Future authentication events to audit: login, logout, failed login, password change, role change, tenant membership change.

## Authentication (Phase 7A)

Auth.js (NextAuth v5) with a credentials provider. JWT sessions. Passwords hashed with bcrypt (`passwordHash` on `User`). No SSO.

Flow: `/login` → session cookie → `auth()` → `getAuthenticatedUser()` / `getAuthenticatedTenantContext()` → domain services.

Protected routes (via `src/proxy.ts`): `/dashboard`, `/ai`, `/app-preview`, `/approvals`, `/communications`, `/operations`, `/reports`, `/inventory`, `/materials`, and later workspace routes. `POST /api/ai` and `/api/actions*` authenticate in the route handler. Public: `/login`, `/api/health/db`. `/` redirects to `/login` or `/dashboard` based on session. `/app-preview` redirects to `/dashboard`.

Development seed user: email from `AUTH_DEV_EMAIL` (default `alex@laballied.demo`), password from `AUTH_DEV_PASSWORD`. Role `MANAGER` displayed as Operations Manager. Tenant comes from the User → Tenant relation, not a hardcoded id.

`AUTH_SECRET` is required. Do not commit `.env`.

Dashboard uses PostgreSQL (Phase 7B). `/ai` uses the authenticated AI endpoint (Phase 8). `/approvals` is the Phase 9 approval center.

## Presentation (Phase 29)

Visual / UX recomposition only. Tokens and composition live in `src/app/globals.css` and `src/components/{layout,ds}`. No schema, API, or AI provider changes. Command Center remains the primary operating surface.

## Analytical layer (Phase 30)

Deterministic BI visualizations — no new chart dependency, no OpenAI on render.

```
PostgreSQL → existing server services / aggregations
           → src/lib/analytics/* (pure deterministic helpers)
           → typed snapshots (CommandCenterSnapshot, ReportingSnapshot, DashboardData)
           → src/components/charts/*
           → optional client navigation to existing routes
```

Principles:

- Tenant context from `getAuthenticatedTenantContext()` only
- Unknown ≠ zero — omit segments or set actual to `null` when source data is missing
- Planned quantity is never substituted for actual (`producedQuantity` only)
- Reuse canonical inventory / MRP / procurement / supplier calculations — do not duplicate engines

Modules:

- `src/lib/analytics/production.ts` — planned vs actual
- `src/lib/analytics/inventory.ts` — health segments
- `src/lib/analytics/procurement.ts` — pipeline stages
- `src/lib/analytics/materials.ts` — requirement vs available
- `src/lib/analytics/sales.ts` — revenue bar mapping
- `src/lib/server/command-center-analytics.ts` — Command Center chart payload
- `src/components/charts/*` — token-based SVG primitives

Surfaces: Command Center, Dashboard, Reports, Operations capacity, Inventory health, Materials.

Tenant context remains `getAuthenticatedTenantContext()` only. Zero schema changes.

## Actions, approval, audit (Phase 9)

Read-only AI may attach a compact `action` draft (`CREATE_FOLLOW_UP_TASK` | `CREATE_SALES_OPPORTUNITY` | `CREATE_CUSTOMER_FOLLOW_UP` | `NONE`). The server resolves the customer **by name** in the tenant, stores `Action` as `PENDING_APPROVAL`, and never trusts model IDs.

Approve/reject is `POST /api/actions/[id]` with `{ decision }`. **No OpenAI call.** ADMIN/MANAGER may approve. Execution is a Prisma transaction (idempotent on `PENDING_APPROVAL`). Follow-up types write `Activity`; sales opportunity writes `Opportunity` + `Activity`. `audit` JSON records proposed/executed/rejected/failed.

Tenant isolation: all queries use `getAuthenticatedTenantContext()`.

## Workflows (Phase 10)

`WorkflowRegistry` defines three types only: `RFQ_FOLLOW_UP`, `CUSTOMER_REENGAGEMENT`, `SALES_OPPORTUNITY_FOLLOW_UP`. Each maps to deterministic Phase 9 `ActionType` steps. There is no workflow engine, queue, cron, or extra OpenAI call.

**Proposal.** The model may return a compact `workflow` draft (`type`, `title`, `reason`, `targetName`). Unsupported types and `NONE` are dropped. The server resolves the customer (and an in-tenant opportunity when required) and stores `Workflow` as `PENDING_APPROVAL`. Model IDs, tenant IDs, and steps are ignored.

**Approval.** `POST /api/workflows/[id]` with `{ decision }`. **No OpenAI call.** ADMIN/MANAGER may approve (same as Phase 9). Other roles cannot approve.

**Execution.** Approve locks `PENDING_APPROVAL` or `FAILED` → `RUNNING`, then runs registry steps through `writeActionEffects` (the Phase 9 action writer) inside a Prisma transaction. Child `Action` rows are recorded as `EXECUTED` and linked by `workflowId`. A completion `Activity` is written. Required writes succeed together or the workflow is `FAILED` (never `COMPLETED`).

**Idempotency.** `COMPLETED` is a no-op. `RUNNING` does not start another execution. Failed workflows may be retried after targets are revalidated.

**Isolation.** Workflow and target lookups always include `tenantId` from `getAuthenticatedTenantContext()`. Cross-tenant access returns not found.

## Communication drafts (Phase 11)

`CommunicationDraft` stores AI-prepared business messages. Types: `CUSTOMER_FOLLOW_UP`, `RFQ_FOLLOW_UP`, `SALES_OPPORTUNITY_FOLLOW_UP`, `CUSTOMER_REENGAGEMENT`. Status: `DRAFT` | `REVIEWED` | `APPROVED` | `ARCHIVED`. There is no `SENT` status and no external sending.

**Generation.** The model may return a compact `communication` object. One OpenAI call (the existing Phase 8 completion). The server validates type/subject/body/reason, rejects medical-advice language, and resolves `targetName` to a tenant customer. Zero matches or multiple matches return a clarification — the server does not guess IDs.

**Review.** Humans edit subject/body via `PATCH /api/communications/[id]`. **No OpenAI call.** Save may move `DRAFT` → `REVIEWED`. Activity records draft creation only, not keystrokes.

**Workflows.** Phase 10 execution is unchanged. Drafts are not created automatically for every workflow. `workflowId` is optional and unused unless a later phase links them.

**Isolation.** All queries use `getAuthenticatedTenantContext()`. Customer and optional opportunity must belong to the current tenant.

## Operations Planner (Phase 12.5 → Phase 31)

`/operations` loads tenant-scoped `Workstation` and `ProductionOrder` rows, then runs a **deterministic** finite-capacity planner in `src/lib/operations/schedule.ts` via `getOperationsPlanner` (`src/lib/server/operations.ts`).

Orders → priority / due date / createdAt sort → working-hour placement on finite-capacity lines → capacity % (canonical 85% warning / 95% danger via `utilizationTone`) → deterministic conflicts (overlap, over-capacity, delivery risk, unscheduled, missing planning data, invalid duration, inactive workstation) → CSS Gantt.

Locked orders keep stored start/end. Unscheduled unlocked orders may be placed in memory for display when not persisted. Phase 31 adds **authenticated planning mutations** (tenant-scoped only):

- `PATCH /api/production-orders/[id]/schedule` — update planned start/end and/or workstation
- `POST /api/production-orders/[id]/resequence` — swap schedule with adjacent order on the same line
- `POST /api/production-orders/[id]/auto-schedule` — append to line using existing working-minute rules

Material readiness on each order consumes existing MRP output from `getMaterialsSnapshot` (READY / AT_RISK / SHORTAGE / UNKNOWN). Planning attention aggregates deterministic counts with links to planner, capacity, or `/materials`.

**No OpenAI calls.** No second scheduler or MRP engine. Tenant ID comes only from `getAuthenticatedTenantContext()`.

## Reporting Intelligence (Phase 12.6)

Read-only `/reports` loads tenant-scoped `Warehouse`, `InventoryLot`, `Supplier`, `InventoryReceipt`, `BillOfMaterial`, and `InventorySnapshot` rows plus the existing Operations Planner snapshot.

Lots → expiry/ageing buckets → deterministic risk → key findings → CSS charts and paginated tables. Materials compare on-hand + open inbound to BOM-exploded production requirements. Inventory trend uses stored weekly snapshots only; current lots are never time-travelled. Production numbers reuse `getOperationsPlanner`; they do not reimplement the scheduler.

**Reporting calculations do not require OpenAI.** There is no warehouse, Redis, worker, or extra analytics provider.

Tenant ID comes only from `getAuthenticatedTenantContext()`. Filters are query parameters on `/reports`. There is no dedicated reporting write API.

## Inventory Intelligence (Phase 13)

Read-only `/inventory` aggregates tenant-scoped `Product`, `InventoryLot`, open `InventoryReceipt` (in transit), `BillOfMaterial` requirements, and matching `ProductionOrder` rows.

Items → on-hand + inbound → deterministic health (healthy / low / critical / out of stock) → expiry and ageing from batch dates → shortfall vs safety stock or production need.

No duplicate inventory tables. **Inventory calculations do not require OpenAI.** No warehouse, Redis, workers, or extra provider.

Tenant ID comes only from `getAuthenticatedTenantContext()`. Filters are query parameters on `/inventory`. There is no inventory write API.

## Material Requirements Intelligence (Phase 14)

Read-only `/materials` loads tenant-scoped `Product`, `InventoryLot`, open `InventoryReceipt`, `BillOfMaterial`, and open `ProductionOrder` rows (every status except `COMPLETED`).

Demand → BOM `quantityPer` × order quantity → aggregate by component → usable on-hand (non-expired lots) + open inbound → projected available, net requirement, shortage, and risk.

Risk is deterministic: CRITICAL (shortage + HIGH/CRITICAL priority + due within 7 days), HIGH (other shortages), MEDIUM (inbound covers a current gap), LOW (projected buffer under 10% of gross), OK (covered). Lead time, purchase price, and reorder point are displayed as **Not available** when the schema has no field.

The Operations Planner does not reschedule. Affected orders show **Material risk** and link to `/materials`. Reporting reuses the same engine. **Zero OpenAI calls. Zero new infrastructure. No schema change. No database reset.**

Tenant ID comes only from `getAuthenticatedTenantContext()`. There is no materials write API.

## Procurement Planning & Requisition Intelligence (Phase 15)

Read-only `/procurement` consumes the Phase 14 material requirements engine (`getMaterialsSnapshot` / `buildProcurementRecommendations`). For each CRITICAL, HIGH, or MEDIUM shortage with net requirement &gt; 0, Pharmora surfaces a procurement recommendation with suggested quantity equal to the Phase 14 net requirement. LOW materials appear as **Monitor** only — no automatic requisition draft.

Managers can save a **requisition draft** (`ProcurementRequisition`, status `DRAFT`) with a deterministic reason, material snapshot, and affected production orders. Authorized roles (ADMIN/MANAGER via `canApprove`) may mark a draft **REVIEWED** or **REJECTED**. There is no purchase execution, supplier selection, or external communication. This lifecycle is intentionally separate from Phase 9 `Action` approval/execution.

Idempotency: one active `DRAFT` per tenant + material. Tenant ID, reviewer identity, and status transitions are enforced server-side only.

Integrations: `/materials` and Operations link in; Reports and Dashboard surface procurement attention; `/approvals` lists draft requisitions for review (not mixed with executable actions).

**Zero OpenAI calls. Zero new infrastructure.** Schema: `ProcurementRequisition` + `ProcurementRequisitionStatus` enum. Migration `20260818160000_procurement_requisitions`. No database reset.

## Supplier Intelligence & Sourcing (Phase 16)

Read-only `/suppliers` provides tenant-scoped supplier visibility and material coverage using `Supplier` and `SupplierMaterial`. It reuses existing materials/procurement context and does not create a separate execution subsystem.

Supplier comparison is deterministic and transparent:

- candidates come from `SupplierMaterial` rows for a material
- ranking uses only available fields (`isPreferred`, known lead time, known unit price, active status)
- delivery and quality performance are shown only when real source data exists; otherwise **Not available**
- recommendation falls back to **Supplier recommendation unavailable** when comparative data is insufficient

Procurement integration is informational only: requisition detail includes supplier options and “Compare suppliers” links. No supplier is auto-selected, no purchase order is created, and no communication is sent.

Reporting and dashboard reuse existing architecture:

- reports expose supplier coverage and data completeness metrics
- dashboard adds one compact **Supplier data gaps** signal when materials lack supplier intelligence

Security mirrors previous phases: tenant identity comes only from `getAuthenticatedTenantContext()`, all supplier queries are tenant-filtered server-side, and the browser never supplies tenant authority.

**Zero OpenAI calls. Zero new infrastructure.** Schema additions: `SupplierStatus` enum, `Supplier.status`, and `SupplierMaterial`. Migration `20260819150000_supplier_intelligence`. No database reset.

## Daily Business Review + Operations & Procurement Copilot (Phase 17)

Pharmora calculates facts; AI interprets and prioritizes; humans decide; Phase 9/10 remain the only execution boundary.

`/daily-review` is a deterministic operating console assembled from existing services (operations, materials, procurement, inventory, suppliers, dashboard commercial attention). It does **not** call OpenAI on load.

Explicit **Explain today's priorities** uses the existing AI path (`detectIntent` → `get_daily_review` → compact `BusinessContext` → one `AIProvider.generateResponse` call). Context sent to the model excludes tenant UUID, database credentials, and raw Prisma objects. If the provider fails, the deterministic attention list remains usable.

Copilot (`/ai`) gains cross-domain intents (`DAILY_REVIEW`, `OPERATIONAL_PRIORITY`, `MATERIAL_RISK`, `PROCUREMENT_PRIORITY`, `SUPPLIER_COMPARISON`, `CROSS_DOMAIN_ANALYSIS`) that reuse the same compact tool. Dashboard and Reports add small entry points only — no redesign.

**Zero new infrastructure. Zero schema changes. No database reset.**

## Execution Control Center (Phase 18)

`/execution` is a deterministic operating console that unifies existing executable recommendations into one controlled queue:

Signal → Recommendation → Review → Approval → Execute → Activity

It aggregates tenant-scoped Action, Workflow, ProcurementRequisition, and Communication draft records. It does **not** invent recommendations or create a second execution engine.

Approval and execution call the existing Phase 9 action and Phase 10 workflow server paths (plus procurement requisition review). Communication drafts remain non-sendable from Execution. Tenant identity and authorization come only from `getAuthenticatedTenantContext()` and existing `canApprove` rules.

**Zero OpenAI calls. Zero new infrastructure. Zero schema changes. No database reset.**

## Production Execution (Phase 28)

`/execution/production` is the shop-floor execution surface. It does not replace Phase 18 `/execution` (approvals queue) or Phase 12.5/31 `/operations` (planning).

**Planning vs execution:**

- Planning continues to use `ProductionOrderStatus` and schedule fields.
- Execution state is layered: `WAITING → RELEASED → IN_PROGRESS ⇄ PAUSED → COMPLETED`.
- `RELEASED` and `PAUSED` are derived from existing `AuditLog` actions (`PRODUCTION_RELEASE`, `PRODUCTION_PAUSE`, `PRODUCTION_RESUME`) — no enum/schema change.
- `START` / `COMPLETE` persist `IN_PROGRESS` / `COMPLETED` on `ProductionOrder` and timestamps/quantity on `ProductionBatch` when present.

**Mutations** (`production.execute`, tenant from `getAuthenticatedTenantContext()` only):

- `POST /api/production-orders/[id]/release|start|pause|resume|complete`
- Release locks the order (`isLocked`) so schedule mutations cannot corrupt released work.
- Complete validates produced quantity ≤ planned; does not consume materials, create lots, release quality, or notify anyone.
- Every transition writes the existing `AuditLog`.

**UI:** dense execution board, metric strip, planned-vs-actual, Management Attention, inspection Sheet. Mobile shows decision-critical fields first (state, product, progress, workstation, risk, action).

Command Center and Reports surface compact production-execution signals/KPIs linking to `/execution/production`.

**Zero OpenAI calls. Zero new infrastructure. Zero schema changes. No database reset.**

## Management Command Center (Phase 19)

`/command-center` is a read-only composition layer over existing Pharmora services (Dashboard, Daily Review, Operations, Execution). It does not introduce a parallel analytics, risk, reporting, or execution engine.

Managers see business health, cross-domain signals (deterministically ranked), summary blocks, an execution-queue preview linking to `/execution`, up to three charts reused from existing patterns/data, top risks, and recent activity. Explicit **Explain today's situation** reuses `/api/ai` with one model call and a compact packet (no tenant UUID, credentials, or Prisma rows). Normal page usage performs **zero** OpenAI calls.

Tenant identity comes only from `getAuthenticatedTenantContext()`. Viewing Command Center does not mutate records.

**Zero OpenAI calls on normal usage. Zero new infrastructure. Zero schema changes. No database reset.**

## Decision Intelligence & Forecasting (Phase 20)

`/forecast` is a read-only, deterministic near-term outlook layer. It does not introduce ML, forecast tables, or a second planning engine.

Methods:

- Sales / RFQ: UTC rolling windows of 7, 14, or 30 days versus the immediately prior window of the same length (`periodTotals`, realized CONFIRMED/FULFILLED revenue only)
- Projection: if confidence is INSUFFICIENT → `null`; if prior volume is 0 → current run-rate only and growth = "—"; otherwise a 70/30 blend of recent and prior
- Production / materials / inventory / procurement: existing Operations, Phase 14 material engine, inventory snapshot, and Phase 15 recommendations — no duplicate MRP or buying

Confidence is HIGH / MEDIUM / LOW / INSUFFICIENT from data-point count and prior-period volume. Insufficient history is shown honestly instead of a fabricated percentage.

Explicit **Explain this forecast** reuses `/api/ai` with one `get_forecast` call and a compact packet (no tenant UUID, credentials, or Prisma rows). Normal page usage, horizon changes, and charts perform **zero** OpenAI calls.

Tenant identity comes only from `getAuthenticatedTenantContext()`. Viewing `/forecast` does not mutate orders, inventory, production, or procurement.

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure. Zero schema changes. No database reset.**

## Scenario Planning (Phase 21)

`/scenarios` is a read-only, ephemeral what-if layer. It does not introduce a second MRP, scheduler, inventory engine, or scenario table.

Managers adjust a small allowlisted set of assumptions (demand, production capacity, production delay, inventory availability, procurement availability, critical-first priority) and compare **current reality** vs **simulated scenario** vs **impact**. Results are labelled Simulation only and are never written back.

Methods: scale existing snapshot values (forecast/run-rate, utilization, material projected availability, inventory on-hand, procurement attention, execution review count). Production delay flags orders whose remaining days are less than the delay. Insufficient history shows “Insufficient data for simulation” instead of a fabricated number. Zero baselines do not produce misleading percentages.

Explicit **Explain this scenario** reuses `/api/ai` with one `get_scenario` call and a compact packet (no tenant UUID, credentials, or Prisma rows). Page load, control changes, presets, run, reset, and charts perform **zero** OpenAI calls. The SCENARIO intent does not create actions, workflows, or communications.

Tenant identity comes only from `getAuthenticatedTenantContext()`. Running a scenario does not mutate orders, inventory, production, procurement, actions, or workflows.

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure. Zero schema changes. No database reset.**

## RFQ & Procurement Intelligence (Phase 22)

`/rfqs` is an internal procurement workspace connecting material requirements → procurement recommendations → supplier comparison → RFQ → supplier responses → comparison → human award. It is **not** the customer sales RFQ module (`Rfq` / `RfqItem`).

New Prisma models use the `ProcurementRfq*` prefix with tables `procurement_rfqs`, `procurement_rfq_items`, `procurement_rfq_suppliers`, `procurement_rfq_responses`, and `procurement_rfq_response_items`. Lifecycle statuses: DRAFT, REVIEW, READY, RESPONSES, EVALUATION, AWARDED, CLOSED, CANCELLED.

Supplier responses are recorded internally only (no email, WhatsApp, or external APIs). Deterministic comparison uses response completeness, active/preferred supplier flags, comparable currency totals, and known lead times — no invented weighted scores. Currency mismatch shows “Currency comparison unavailable” (no FX conversion).

**Award** is an internal manager/admin decision (`canApprove`). It does not create purchase orders, actions, workflows, communications, or inventory mutations.

Explicit **Analyze RFQ** reuses `/api/ai` with one `get_procurement_rfq` call and a compact packet via `toCompactProcurementRfqContext` (no tenant UUID, credentials, or Prisma rows). Page load, filters, create, response entry, compare, and award perform **zero** OpenAI calls. The PROCUREMENT_RFQ intent is explain-only in the orchestrator.

Tenant identity comes only from `getAuthenticatedTenantContext()` for all RFQ queries and mutations.

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure beyond one Prisma migration. No database reset.**

## Procurement Execution & Purchase Orders (Phase 23)

`/purchase-orders` turns an awarded procurement RFQ into an internal purchase order with manager approval. Models: `PurchaseOrder`, `PurchaseOrderItem` (tables `purchase_orders`, `purchase_order_items`). Lifecycle: DRAFT → PENDING_APPROVAL → APPROVED (+ REJECTED, CANCELLED, CLOSED).

PO numbers are server-generated (`PO-YYYY-####`). Creation from an AWARDED RFQ copies the awarded response commercial snapshot; one PO per RFQ (idempotent return if active PO exists). DRAFT POs allow quantity/unit price/notes edits with server-recalculated subtotals. Approval uses `canApprove` (ADMIN/MANAGER) — not routed through Phase 9 Actions.

**Approved** means approved for purchasing only — no supplier contact, transmission, payment, or inventory receipt. Activity events use the existing `Activity` model with `entityType: PURCHASE_ORDER`.

Explicit **Explain this purchase order** reuses `/api/ai` with one `get_purchase_order` call. All CRUD, filters, submit, approve, and reject perform **zero** OpenAI calls. PURCHASE_ORDER intent is explain-only in the orchestrator.

Tenant identity comes only from `getAuthenticatedTenantContext()`.

**Zero OpenAI calls on normal PO operations. Zero new infrastructure beyond one Prisma migration. No database reset.**

## Inventory Receiving & PO Fulfillment (Phase 24)

`/receiving` closes the procurement loop: APPROVED PO → receive shipment → create `InventoryLot` → record `InventoryReceipt` (RECEIVED) → Activity → CLOSED when fully received.

`PurchaseOrderItem.receivedQuantity` tracks partial receipts. Server rejects over-receipt and non-APPROVED POs. Receiving runs in a Prisma transaction with idempotency via `InventoryReceipt.idempotencyKey` (`{clientKey}:{lineId}`). Discrepancies (short receipt, expired lot) are flagged on the receipt record — not auto-resolved, no supplier communication.

Inventory class is inferred from existing lots or product category/BOM. Batch codes must be unique per tenant. Explicit confirmation required before inventory mutation.

**Zero OpenAI calls on receiving. Zero new infrastructure beyond one Prisma migration. No database reset.**

## Supplier & Procurement Performance Intelligence (Phase 25)

`/supplier-performance` derives deterministic supplier scorecards from existing `Supplier`, `SupplierMaterial`, procurement RFQs/responses, purchase orders, and inventory receipts. No performance snapshot tables — metrics are calculated on read.

Bands: EXCELLENT / STRONG / WATCH / RISK / INSUFFICIENT_DATA using documented weights (response reliability, award conversion, receiving completion, discrepancy performance, commercial visibility). Timing/on-time rates are **not** invented when delivery baselines are missing (“Timing data unavailable”). No FX conversion across currencies.

Explicit **Explain supplier performance** reuses `/api/ai` with one `get_supplier_performance` tool call and a compact derived packet. Normal page load, filters, sorting, and scoring perform **zero** OpenAI calls. No automatic supplier selection, messaging, or purchasing.

Tenant identity comes only from `getAuthenticatedTenantContext()`.

**Zero OpenAI calls on normal usage. Zero new infrastructure. Zero schema migrations. No database reset.**

## Executive Reporting & Decision Intelligence (Phase 26)

`/reports` is the management intelligence workspace. It does **not** introduce a second analytics, MRP, forecast, or supplier-scoring engine. The server composes existing tenant-scoped services:

- Sales / revenue: `loadAnalytics` + `REALIZED_ORDER_STATUSES` (CONFIRMED + FULFILLED only; DRAFT/CANCELLED excluded). Prior-period zero growth is `"—"`.
- Operations: `getOperationsPlanner` (same production slice as Phase 12.6).
- Inventory / expiry / ageing: existing reporting lots.
- Materials: Phase 14 MRP (`gross − available − incoming`).
- Procurement: requisitions + RFQ + PO + receiving metrics as independent counts (no implied lifecycle transition).
- Suppliers: Phase 25 `getSupplierPerformanceReportMetrics` bands and attention.
- Forecast: Phase 20 `getForecastSnapshot` compact outlook + 7D/14D/30D links to `/forecast`.
- Scenarios: link to `/scenarios` only (no execution or persistence).

**Management Attention** ranks existing signals (operations at-risk, material shortage, expired inventory, open PO exposure, supplier Watch/Risk, forecast risk). Each item includes domain, issue, evidence, impact, and an existing workspace href.

**Drilldown model:** chart/table rows link to existing routes (`/operations`, `/inventory`, `/materials`, `/procurement`, `/rfqs`, `/purchase-orders`, `/receiving`, `/supplier-performance`, `/customers`, `/forecast`). No duplicate record-detail pages.

**AI:** page load, filters, charts, calculations, and drilldowns perform **zero** OpenAI calls. Explicit **Explain this report** uses `/api/ai` once with `get_report` and `toCompactReportContext` (no raw Prisma rows, no tenant UUID, no credentials). The model must not invent numbers or execute actions.

Tenant identity comes only from `getAuthenticatedTenantContext()`.

**Zero OpenAI calls on normal reporting. Zero new infrastructure. Zero schema migrations. No database reset.**

## Command UX + Premium Product Experience (Phase 27)

Phase 27 consolidates the existing product into one operating-system experience. No new domain engines, schema, AI calls for navigation, or infrastructure.

**Navigation** is regrouped: Overview (Command Center first) · Commercial · Operations · Procurement · Intelligence · Control · System. Only real routes. Nested paths resolve for breadcrumbs.

**Command Center** is the primary daily surface: compact business state → Management Attention (signal → evidence → consequence → destination) → operational strips → restrained charts → activity. Not a KPI card wall.

**Cross-domain context** uses `DomainTrail` related links and procurement-chain breadcrumbs on RFQ / PO / Receiving detail pages.

**Shared patterns:** `AttentionItem` / `AttentionList`, denser `PageHeader` with operational copy, inspection-oriented sheets (bottom on mobile).

AI remains explicit-only (Explain / Interpret). Blue accent stays interactive, not decorative.

**Zero OpenAI calls for visual navigation. Zero schema migrations. Zero new infrastructure. No database reset.**

