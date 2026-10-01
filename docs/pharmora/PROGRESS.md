# Pharmora — Progress

## Completed

- **Phase 1:** Empty-repo inspection. Docs in `docs/pharmora/`. Cursor rule `.cursor/rules/pharmora.mdc`.
- **Phase 2:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui (radix-nova) + Lucide. CSS design tokens (light + `.dark`). Base primitives in `src/components/ui`. Patterns in `src/components/ds`. Demo tenant config in `src/lib/tenant.ts`. Temporary foundation preview at `/` (not a product page).

## Phase 3

Status: **COMPLETE**

### Components created

- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/SidebarNav.tsx`
- `src/components/layout/Topbar.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/layout/Breadcrumbs.tsx`
- `src/components/layout/WorkspaceSwitcher.tsx`
- `src/components/layout/UserMenu.tsx`
- `src/components/layout/NotificationPopover.tsx`
- `src/components/layout/shell-context.tsx`
- `src/components/search/GlobalSearch.tsx`
- `src/components/search/CommandPalette.tsx`
- `src/components/search/SearchResults.tsx`

### Mock data

- `src/lib/mock/session.ts`
- `src/lib/mock/navigation.ts`
- `src/lib/mock/search.ts`
- `src/lib/mock/commands.ts`
- `src/lib/mock/notifications.ts`
- Workspaces list in `src/lib/tenant.ts` (default remains demo tenant via `getTenant()`)

### Routes / previews

- `/` — Phase 2 design-system preview (unchanged)
- `/app-preview` — AppShell inspection (PageHeader demo, not a dashboard)
- Other nav hrefs — lightweight “coming soon” placeholders only (`src/app/(workspace)/[...slug]/page.tsx`)

### Interactions

- Persistent sidebar ≥1024px; icon rail 768–1023px; drawer &lt;768px
- Workspace switcher (mock orgs; LabAllied selected from tenant config)
- Global search trigger + categorized mock results
- Command palette (actions vs search modes)
- Ctrl/⌘ K opens/closes the palette
- User menu (sign out is toast-only)
- Notification popover
- Breadcrumbs in the topbar

### Known limitations

- Search and commands use static mock data only
- Nav destinations other than Overview are placeholders, not domain pages
- No real auth, APIs, or persistence
- Workspace switch is client mock state (not multi-tenant backend)
- Tablet (768px) is icon-rail navigation; labels are tooltip-only (pointer and keyboard focus)
- Administration uses a people icon; Settings uses a gear
- Mobile drawer includes close (X), overlay, Escape, and tenant/user footer

### Visual QA (14 Aug 2026)

Checked `/app-preview` at 1440, 1280, 1024, 768, 390 in light and dark. No horizontal overflow. Isolated fix: command palette focuses the input so “Amoxicillin” search works from the keyboard; Overview is active on `/app-preview`.

### Final QA fixes (14 Aug 2026)

- 768px: distinct Administration vs Settings icons; icon-rail tooltips on hover and keyboard focus
- 390px: drawer X close; existing tenant/user footer (`SidebarAccount`)

## Phase 4

Status: **COMPLETE**

Implemented:

- `/dashboard` executive intelligence dashboard
- Executive KPI strip
- Sales Performance (lightweight SVG chart, 7D / 30D / 90D / 12M)
- Pharmora Intelligence
- Product Intelligence (table → stacked rows on mobile)
- Regional Intelligence (ranked bars, no map)
- Needs Attention
- AI Opportunities
- Recent Activity

Components: `src/components/dashboard/`

Mock data: `src/lib/mock/dashboard.ts` (demonstration values only)

Overview nav now lands on `/dashboard`. `/` and `/app-preview` are unchanged. Phase 3 shell files were not modified.

Responsive QA: inspected 1440, 1280, 1024, 768, 390 in Light and Dark. No horizontal overflow. `/` and `/app-preview` still load. Phase 3 shell unchanged.

**Phase 4 is FROZEN.** Monday-morning executive scan: KPIs, sales trend, and Pharmora Intelligence make performance and follow-up clear within the first screen.

Known limitations:

- All figures are mock demonstration data
- Date range control in the header is visual/mock; chart ranges are interactive
- Chart is SVG, not a chart library
- Action links open Phase 3 placeholder routes, not domain pages
- No live AI

## Phase 5A

Status: **COMPLETE**

Implemented:

- Pharmora AI Assistant UX at `/ai`
- Mock conversational responses (`src/lib/mock/ai.ts`)
- Business-context insights aligned to dashboard demonstration data
- Recommended actions (placeholder routes)
- Contextual follow-ups
- Responsive AI workspace
- Light/dark support

Components: `src/components/ai/`

Data: Mock frontend data only.

Backend: Not implemented.

AI provider: Not implemented.

Overview remains `/dashboard`. `/`, `/app-preview`, and `/dashboard` are unchanged. Phase 3 shell and Phase 4 dashboard were not modified.

### Visual QA (14 Aug 2026)

Checked `/ai` at 1440, 1280, 1024, 768, 390 in Light and Dark.

Core flow verified for all six starter questions: Summary → Key signals → Recommended action → Follow-up. Unsupported “What is the weather today?” returns the business-data fallback and starter suggestions — no hallucinated answer.

390px: composer stays pinned and usable; insight cards sit in a compact three-column row; suggested questions wrap without horizontal overflow.

**Phase 5A is FROZEN.**

## Phase 5B

Status: **COMPLETE**

Implemented:

- AI intent architecture
- Business context model
- Entity model
- Tool registry contracts
- Structured AI response contract
- Insight model
- Action model
- Follow-up model
- Provider abstraction
- AI trust/safety rules
- Architecture documentation (`docs/pharmora/ARCHITECTURE.md`)

Types: `src/lib/ai/`

Demo-only orchestrator mapping (not wired to `/ai`): `src/lib/ai/mock-adapter.ts`

Not implemented:

- Real AI provider
- Backend
- Database
- RAG
- External integrations

Phase 5A `/ai` UX unchanged. Phase 3 shell and Phase 4 dashboard unchanged.

**Phase 5B is FROZEN.**

## Phase 6

Status: **COMPLETE**

Implemented:

- PostgreSQL architecture (Prisma 6, `DATABASE_URL`)
- Prisma schema (`prisma/schema.prisma`)
- Multi-tenant data model
- Core business entities and relationships
- Indexes
- Demo seed (`prisma/seed.ts`, tenant status DEMO)
- Server-side service boundaries (`src/lib/server/`)
- Tenant context architecture (`resolveDevTenantContext`)
- AI-to-domain-service boundary (`src/lib/server/ai-data.ts`)
- Minimal `GET /api/health/db`

Not implemented:

- Authentication
- Real AI provider
- RAG
- External integrations
- Production API / full CRUD
- Frontend database migration (UI still uses mock data)

Phase 3–5A UI unchanged. Prisma Client generates as part of `npm run build`. Apply migrations and seed when local PostgreSQL is available (`docker compose up -d`).

## Phase 7A

Status: **COMPLETE**

Implemented:

- Authentication foundation (Auth.js / NextAuth v5)
- Login (`/login`)
- Logout (existing user menu action)
- Protected routes (`/dashboard`, `/ai`, `/app-preview`)
- Authenticated sessions
- Tenant-aware session context
- Authenticated `TenantContext` (`getAuthenticatedTenantContext`)
- Development authentication seed fields (`passwordHash`, unique email)
- Server-side identity resolution

Not implemented:

- Live dashboard data
- Live AI provider
- Production SSO
- Advanced permissions
- External integrations

Database-dependent checks (migrate, seed, live login against Postgres) require local PostgreSQL. This machine did not have Docker/Postgres running.

**Phase 7A is FROZEN.**

## Phase 7B

Status: **COMPLETE**

Implemented:

- real dashboard data service (`src/lib/server/dashboard.ts`)
- PostgreSQL-backed dashboard metrics
- sales aggregation
- product aggregation
- regional aggregation
- customer metrics
- RFQ metrics
- attention item detection (deterministic, no model)
- opportunity detection (deterministic data signals)
- activity timeline from `Activity` records
- real AI tool data access (`runAITool` in `src/lib/server/ai-data.ts`)
- tenant-scoped queries
- empty-state handling
- database-backed demo seed (plus isolation tenant `tenant-b-isolation`)

Revenue rule: `SUM(Order.totalAmount)` for `CONFIRMED` and `FULFILLED` only. `CANCELLED` and `DRAFT` are excluded. Arithmetic uses `Prisma.Decimal` until display. Chart series convert to KSh millions only at the UI boundary. Aggregation windows are UTC (`src/lib/server/dates.ts`).

Demo tenant (`lab-allied`, status `DEMO`) shows **Demo workspace data**, not production figures.

Not implemented:

- real AI provider
- RAG
- external integrations
- advanced permissions
- production deployment

`/ai` UX is unchanged (Phase 5A mock conversation). Tools are database-ready only.

Live database checks (15 Aug 2026): Prisma migrations applied with `migrate deploy` (no reset). Seed and `npm run db:verify` passed against the configured PostgreSQL database. LabAllied trailing-30-day realized revenue formatted as `KSh 423K` (not Phase 4 mock `KSh 12.8M`). Isolation tenant `tenant-b-isolation` returned a different total (`KSh 100K`) with no Amoxicillin leak. `npm run build` passed. Browser viewport QA of `/dashboard` was not run in this pass.

**Phase 7B is FROZEN.**

## Phase 8

Status: **COMPLETE**

Implemented:

- production AI provider (OpenAI, `AIProvider` abstraction)
- authenticated AI endpoint (`POST /api/ai`)
- real tenant-scoped AI context
- real business-data tools (Phase 7B)
- structured AI responses
- server-side response validation
- bounded conversation context (not persisted)
- provider error handling
- token/cost controls (aggregated context only)
- prompt injection boundaries
- read-only AI actions
- real `/ai` integration

Not implemented:

- write actions
- autonomous agents
- conversation persistence
- WhatsApp
- email automation
- M-Pesa
- external integrations
- advanced RAG

**Phase 8 is FROZEN.**

## Phase 9

Status: **COMPLETE**

Implemented:

- ActionRegistry
- ActionProposal
- approval workflow
- Approval Center (`/approvals`)
- deterministic action execution
- tenant isolation
- authorization (ADMIN/MANAGER approve)
- audit trail
- idempotency
- Activity integration

Not implemented:

- WhatsApp
- email
- M-Pesa
- external integrations
- autonomous actions
- inventory mutation
- RFQ approval
- invoice/payment execution
- conversation persistence
- RAG

**Phase 9 is FROZEN.**

## Phase 10

Status: **COMPLETE**

Implemented:

- WorkflowRegistry
- RFQ_FOLLOW_UP
- CUSTOMER_REENGAGEMENT
- SALES_OPPORTUNITY_FOLLOW_UP
- workflow proposal
- workflow approval
- deterministic workflow execution
- Action integration
- Activity integration
- tenant isolation
- idempotency

Not implemented:

- autonomous workflows
- scheduled workflows
- cron
- queues
- WhatsApp
- email
- M-Pesa
- external integrations
- inventory automation
- invoice automation
- payment automation
- configurable workflow builder
- workflow templates marketplace

**Phase 10 is FROZEN.**

## Phase 11

Status: **VERIFIED & FROZEN**

Implemented:

- CommunicationDraft
- supported communication types
- AI draft generation
- structured validation
- tenant-safe target resolution
- Communication Center
- manual editing
- Activity integration

Not implemented:

- WhatsApp
- Email
- SMS
- external sending
- message queues
- scheduled communication
- autonomous communication
- communication analytics

**Phase 11 — Communication Intelligence + Drafts: VERIFIED & FROZEN.**

## Phase 12

Not started (WhatsApp / external sending remains deferred).

## Phase 12.5

Status: **COMPLETE**

Implemented:

- Operations Planner route
- production orders
- workstations
- deterministic scheduling
- capacity calculations
- conflict detection
- at-risk detection
- Gantt schedule
- UI refinement: operations command center (Gantt as the planning instrument, denser timeline, workstation state, zoom, now marker, focus/search, order sheet, capacity and attention as supporting layers)
- mobile planner
- tenant isolation
- demo data

Not implemented:

- AI optimization
- drag/drop scheduling
- production execution
- inventory integration
- shop-floor tracking
- ERP integration
- automatic replanning
- autonomous actions
- WhatsApp

**Phase 12.5 is FROZEN pending QA.** Do not start Phase 13.

## Phase 12.6

Status: **COMPLETE**

Implemented:

- `/reports` reporting intelligence workspace
- deterministic inventory, expiry, ageing, materials, finished goods, raw materials, packaging, and production views
- key findings and centralized risk rules
- drill-down lot details
- Operations Planner reuse for production reporting
- tenant-scoped inventory lots and warehouses
- suppliers, open inbound receipts, BOM requirements vs stock
- stored weekly inventory snapshots (demo tenant only; empty tenants stay “unavailable”)
- class reports (finished goods / raw materials / packaging) with ageing, expiry, and concentration
- sortable lot table, production status/line filters, clickable bars
- Export Excel (SpreadsheetML `.xls`) for offline review of the current report view
- Analyst Metric catalog — named plant measures with how/source/limitation (DAX alternative)

Not implemented:

- Power BI clone / DAX authoring / Power Query mashup
- fabricated time-travel of current lots
- OpenAI report explanations
- automated purchasing or inventory writes
- data warehouse / Redis / workers

**Reporting calculations do not require OpenAI.**

## Phase 13

Status: **FROZEN** (visual QA 17 Aug 2026)

Implemented:

- `/inventory` inventory intelligence workspace (overview, health, expiry, ageing, requirements)
- `/inventory/expiry` redirect to the expiry view
- item-level stock health from existing `Product` + `InventoryLot` + `InventoryReceipt` + BOM
- expiry and ageing from actual batch dates
- production order linkage in the item drawer when `productId` matches
- reporting health view and inventory KPI links into `/inventory`
- dashboard attention items for expired and low stock
- tenant-scoped queries via `getAuthenticatedTenantContext()`

Not implemented:

- InventoryItem / InventoryBatch duplicate tables (reused existing models)
- stock mutations, receiving, POs, MRP
- reserved quantity / not-shipped (no source data)
- manufacturing date (not on lots; received date is used for ageing)
- OpenAI inventory analysis
- Phase 14

**Inventory calculations do not require OpenAI.**

### Visual QA (17 Aug 2026)

Checked `/inventory` and `/inventory/expiry` (redirects to `?view=expiry`) at 390, 768, 1024, 1440. KPI strip scrolls below 1440; tables scroll horizontally; filters stay in a sheet until 1024px so 768px icon-rail does not crush selects; item drawer is a bottom sheet at 390px (`max-h-[85vh]`). No page-level horizontal overflow.

## Phase 14

Status: **FROZEN** (visual QA 17 Aug 2026)

Implemented:

- `/materials` Material Requirements Intelligence (requirements, shortages, procurement attention)
- deterministic engine in `src/lib/materials/` using existing `Product`, `InventoryLot`, `InventoryReceipt`, `BillOfMaterial`, and `ProductionOrder`
- gross / available / incoming / projected / net / shortage / risk — no invented lead times, prices, or reorder points
- Operations Planner shows **Material risk** on affected orders and links to `/materials?order=…` without changing the scheduler
- Reporting materials view extended with MRP totals, shortage concentration, and a link to `/materials`
- Dashboard **Material Risk** attention item
- tenant-scoped queries via `getAuthenticatedTenantContext()`
- `prisma/verify-phase14.ts` hooked into `npm run db:verify` — passed
- `npx next build` — passed (`/materials` route present)
- Responsive layout: compact KPI strip scrolls at 390px, table scrolls horizontally, filters remain usable, drawer fits viewport

### Visual QA (17 Aug 2026)

Checked `/materials` together with `/operations`, `/reports`, and `/dashboard` at 390, 768, 1024, 1440. Fixes: report view list is a select until 1024px; filters sheet until 1024px; detail drawers bottom-sheet at 390px; operations zoom chips scroll instead of wrapping the page; dashboard page `min-w-0` / overflow clip; product table stacks as cards below 1024px. No page-level horizontal overflow.

Not implemented (deferred):

- purchase orders, supplier management, automatic procurement
- inventory writes, stock reservations, MRP execution
- automatic rescheduling
- AI explanations, WhatsApp/email procurement
- Phase 15

**Material requirement calculations do not require OpenAI. Zero new infrastructure. No database schema changes. Database was not reset.**

## Phase 15

Status: **COMPLETE**

Implemented:

- `/procurement` Procurement Planning workspace (recommendations, requisition drafts, human review)
- deterministic procurement layer in `src/lib/procurement/` consuming Phase 14 `src/lib/materials/requirements.ts` — no duplicate MRP math
- `ProcurementRequisition` model (`DRAFT` → `REVIEWED` / `REJECTED`) — no purchase orders, suppliers, or execution
- separate lifecycle from Phase 9 `Action` execution (planning-only requisitions)
- Materials page links to `/procurement?material=…` for CRITICAL/HIGH/MEDIUM shortages
- Operations shows procurement risk link on affected orders
- Reports materials view extended with procurement attention metrics
- Dashboard **Procurement Attention** signal
- Approvals lists draft requisitions (not executable purchase actions)
- tenant-scoped via `getAuthenticatedTenantContext()`; review restricted to ADMIN/MANAGER (`canApprove`)
- idempotent draft creation (one DRAFT per tenant + material)
- `prisma/verify-phase15.ts` hooked into `npm run db:verify`
- Responsive layout follows frozen Phase 13/14 patterns (KPI strip scroll, filters sheet ≤1024px, bottom-sheet drawer at 390px)

Not implemented (deferred):

- suppliers, supplier pricing, lead times, MOQs, purchase orders, purchase execution
- supplier communication (email, WhatsApp, RFQ)
- automatic buying, inventory writes, scheduling changes
- OpenAI procurement analysis
- Phase 16

**Zero OpenAI calls. Zero new infrastructure. One migration (`20260818160000_procurement_requisitions`). Database was not reset.**

## Phase 16

Status: **COMPLETE**

Implemented:

- `/suppliers` Supplier Intelligence workspace
- deterministic supplier layer in `src/lib/suppliers/` and `src/lib/server/suppliers.ts`
- minimal schema extension: `Supplier.status` and `SupplierMaterial` relationship model
- procurement integration: supplier options and deterministic recommendation in requisition detail
- materials integration: direct “Compare suppliers” link for at-risk materials
- reporting integration: supplier coverage, preferred coverage, lead-time visibility, pricing visibility
- dashboard integration: compact **Supplier data gaps** attention signal
- tenant-scoped supplier/material lookups via `getAuthenticatedTenantContext()`
- supplier comparison fallback messaging when historical performance data is unavailable
- `prisma/verify-phase16.ts` hooked into `npm run db:verify`
- responsive patterns reused from frozen workspaces (filter sheet ≤1024px, bottom-sheet drawers at 390px, internal table scroll)

Not implemented (deferred):

- purchase orders, supplier execution, RFQ sending, supplier messaging
- delivery/quality scoring where no historical source data exists
- automatic supplier selection or buying
- external supplier APIs
- Phase 17

**Zero OpenAI calls. Zero new infrastructure. One migration (`20260819150000_supplier_intelligence`). Database was not reset.**

## Phase 17

Status: **COMPLETE**

Implemented:

- `/daily-review` Daily Business Review (executive operating console)
- deterministic cross-domain attention layer in `src/lib/daily-review/` + `src/lib/server/daily-review.ts`
- Business Health statuses + Priority Attention cards with navigation into existing domains
- explicit **Explain today's priorities** action (ONE OpenAI call via existing `/api/ai` orchestrator)
- page remains fully usable without OpenAI / when the provider fails
- AI intents: `DAILY_REVIEW`, `OPERATIONAL_PRIORITY`, `MATERIAL_RISK`, `PROCUREMENT_PRIORITY`, `SUPPLIER_COMPARISON`, `CROSS_DOMAIN_ANALYSIS`
- approved tool: `get_daily_review` (compact summaries only; no tenant UUID / credentials / Prisma rows in model packet)
- dashboard entry point + reports **Explain this report** deep-link into `/ai`
- nav, proxy, and command palette wired
- `prisma/verify-phase17.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- autonomous AI actions, automatic procurement / POs / supplier selection
- scheduled AI jobs, multi-agent architecture, new AI providers
- Phase 18

**Zero OpenAI calls on page load. ONE model call only for explicit explanation. Zero new infrastructure. Zero schema changes. Database was not reset.**

## Phase 18

Status: **COMPLETE**

Implemented:

- `/execution` Execution Control Center (unified priority queue + review panel + history)
- deterministic aggregator in `src/lib/execution/` + `src/lib/server/execution.ts`
- surfaces existing Action, Workflow, ProcurementRequisition, and Communication draft records only
- approval/execution reuses Phase 9 `/api/actions`, Phase 10 `/api/workflows`, and procurement review APIs
- communication drafts are reviewable but never executable sends from Execution
- KPI strip, status/domain filters (sheet ≤1024px), bottom-sheet review panel at 390px
- nav, proxy, command palette, dashboard entry point
- `prisma/verify-phase18.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- automatic purchasing, supplier messaging, email/WhatsApp sending
- automatic production rescheduling, background agents, scheduled AI
- autonomous execution, new AI providers
- Phase 19

**Zero OpenAI calls. Zero new infrastructure. Zero schema changes. Database was not reset.**

## Phase 19

Status: **COMPLETE**

Implemented:

- `/command-center` Management Command Center (composition layer)
- server aggregation in `src/lib/command-center/` + `src/lib/server/command-center.ts`
- reuses Dashboard, Daily Review, Operations, Execution (and underlying materials/procurement/inventory/supplier facts via Daily Review)
- Business health strip, “What matters now” signals, management summary, action queue preview, ≤3 charts, risks, recent activity
- explicit **Explain today's situation** via existing `/api/ai` (ONE call); page load uses ZERO model calls
- read-only — no execution from Command Center
- nav, proxy, command palette, dashboard entry
- `prisma/verify-phase19.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- autonomous agents, automatic purchasing/rescheduling, messaging
- background/scheduled AI, new providers/infrastructure
- Phase 20

**Zero OpenAI calls on normal usage. Zero new infrastructure. Zero schema changes. Database was not reset.**

## Phase 20

Status: **COMPLETE**

Implemented:

- `/forecast` Decision Intelligence workspace (7 / 14 / 30 day horizons)
- deterministic engine in `src/lib/forecasting/` + `src/lib/server/forecasting.ts`
- rolling recent-vs-prior windows, simple moving blend (70/30), explicit INSUFFICIENT/LOW/MEDIUM/HIGH confidence
- reuses analytics `periodTotals`, Operations planner, Phase 14 materials, inventory snapshot, Phase 15 procurement
- no ML, no forecast tables, no mutation
- explicit **Explain this forecast** via existing `/api/ai` (ONE call); page/horizon/filter = ZERO model calls
- compact `get_forecast` tool; packet excludes tenant UUID / credentials / Prisma rows
- nav, proxy, command palette; Command Center / Daily Review / Reports / Dashboard entry points
- `prisma/verify-phase20.ts` hooked into `npm run db:verify`

Verification (23 Aug 2026):

- `npx tsc --noEmit` passed
- `npm run build` passed (`/forecast` route present)
- `npm run db:verify` passed (Phases 10–20)

Responsive: reuses frozen workspace patterns (KPI strip `overflow-x-auto`, domain cards stack below `sm`, watch-next rows stack with `min-h-11` actions, page `overflow-x-hidden`). Live viewport inspection at 1440 / 1280 / 1024 / 768 / 390 was not available in this pass.

Not implemented (deferred):

- ML / statistical packages, autonomous actions, purchase orders, background jobs
- Phase 21

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure. Zero schema changes. Database was not reset.**

## Phase 21

Status: **COMPLETE**

Implemented:

- `/scenarios` Scenario Planning workspace (read-only what-if simulation)
- deterministic engine in `src/lib/scenarios/` + `src/lib/server/scenarios.ts`
- allowed assumption controls only (demand, capacity, delay, inventory, procurement, priority)
- deltas applied to a copy of current domain snapshots — no second MRP/scheduler
- comparison: Current vs Simulated vs Impact, labelled Simulation only
- presets populate controls only; Run applies request-scoped query state; nothing persisted
- explicit **Explain this scenario** via existing `/api/ai` (ONE call); load/run/presets/charts = ZERO model calls
- compact `get_scenario` tool; packet excludes tenant UUID / credentials / Prisma rows
- nav, proxy, command palette; Command Center / Forecast / Operations / Materials / Procurement links
- `prisma/verify-phase21.ts` hooked into `npm run db:verify`

Verification (23 Aug 2026):

- `npx tsc --noEmit` passed
- `npm run build` passed (`/scenarios` route present)
- `npx tsx prisma/verify-phase21.ts` passed
- `npm run db:verify` passed (Phases 10–21)

Responsive: reuses frozen workspace patterns (control panel left from 1024px, stacks below; KPI strip `overflow-x-auto`; impact table → stacked cards below `md`; `min-h-11` actions; page `overflow-x-hidden`). Live viewport inspection at 1440 / 1280 / 1024 / 768 / 390 was not available in this pass.

Not implemented (deferred):

- persistent scenario storage, ML, second ERP engine, autonomous recommendations

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure. Zero schema changes. Database was not reset.**

## Phase 22

Status: **COMPLETE**

Implemented:

- `/rfqs` RFQ Management workspace (internal procurement RFQ lifecycle)
- `ProcurementRfq*` schema (`procurement_rfqs`, items, suppliers, responses, response items) — separate from customer sales `Rfq`
- deterministic comparison in `src/lib/procurement-rfq/compare.ts` + server layer `src/lib/server/procurement-rfqs.ts`
- lifecycle: DRAFT → REVIEW → READY → RESPONSES → EVALUATION → AWARDED → CLOSED (+ CANCELLED)
- create draft RFQ; create from procurement recommendation; internal supplier response entry; manager award (no PO, no messaging)
- explicit **Analyze RFQ** via existing `/api/ai` (ONE call); list/filter/create/compare/award = ZERO model calls
- compact `get_procurement_rfq` tool; PROCUREMENT_RFQ intent; explain-only orchestrator boundary
- integrations: procurement Create RFQ, materials/suppliers links, Command Center / Daily Review signals, Execution history, Reports metrics
- `prisma/verify-phase22.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- purchase orders, supplier messaging, email/WhatsApp, automatic buying, payment, inventory receiving

**Zero OpenAI calls on calculations and normal usage. Zero new infrastructure beyond one Prisma migration. Database was not reset.**

## Phase 23

Status: **COMPLETE**

Implemented:

- `/purchase-orders` Purchase Order workspace (approval-driven internal procurement execution)
- `PurchaseOrder` + `PurchaseOrderItem` schema with lifecycle DRAFT → PENDING_APPROVAL → APPROVED (+ REJECTED, CANCELLED, CLOSED)
- create PO from AWARDED procurement RFQ with idempotency and server-side totals
- DRAFT editing, submit for approval, manager approve/reject (no external communication, no inventory)
- Execution queue + Approvals board integration (separate from Phase 9 Actions)
- Activity events via existing Activity model
- optional **Explain this purchase order** via existing `/api/ai` (ONE call); CRUD/approval = ZERO model calls
- `prisma/verify-phase23.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- supplier messaging, payments, inventory receiving, Phase 24

**Zero OpenAI calls on normal PO operations. Zero new infrastructure beyond one Prisma migration. Database was not reset.**

## Phase 24

Status: **COMPLETE**

Implemented:

- `/receiving` workspace and `/receiving/[id]` receive flow for APPROVED purchase orders
- partial and full receipt with server-side quantity validation (no over-receipt)
- `InventoryLot` creation and `InventoryReceipt` extension (status RECEIVED, PO linkage, idempotency key)
- `PurchaseOrderItem.receivedQuantity`; PO auto-closes to CLOSED when fully received
- deterministic discrepancy detection (short receipt, expired lot) without auto-resolution
- Prisma transaction for all receiving writes; Activity via existing model
- Execution / Daily Review / Command Center / Reports receiving signals
- `POST /api/purchase-orders/[id]/receive` with confirmation UI (“This will update inventory.”)
- `prisma/verify-phase24.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- supplier messaging, payments, accounting, Phase 25

**Zero OpenAI calls on receiving. Zero new infrastructure beyond one Prisma migration. Database was not reset.**

## Phase 25

Status: **COMPLETE**

Implemented:

- `/supplier-performance` workspace — deterministic supplier & procurement performance intelligence
- Scorecards from existing RFQ / PO / receiving / supplier-material data (read-only; no schema change)
- Performance bands: EXCELLENT · STRONG · WATCH · RISK · INSUFFICIENT_DATA with transparent weights
- Needs-attention signals, up-to-3 supplier comparison, material filter (`?material=`)
- Detail sheet with RFQ/PO/receiving history links into existing routes
- Reports / Daily Review / Command Center / Dashboard compact integrations
- Explicit **Explain supplier performance** via existing `/api/ai` (ONE call); page load/filters/scoring = ZERO
- `prisma/verify-phase25.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- supplier messaging, automatic supplier selection, payments, accounting, Phase 26

**Zero OpenAI calls on normal usage. Zero new infrastructure. Zero schema migrations. Database was not reset.**

## Phase 26

Status: **COMPLETE**

Implemented:

- `/reports` upgraded to Executive Reporting & Decision Intelligence (tabs: Executive, Sales, Operations, Inventory, Procurement, Suppliers)
- Composition layer over existing analytics, operations planner, inventory, MRP, procurement, receiving, Phase 25 supplier scorecards, Phase 20 forecast, Phase 21 scenario link
- Management Attention ranked from existing domain signals (not a new risk engine)
- Drilldowns into existing workspaces; “How calculated” notes; dense tables + mobile cards
- Explicit **Explain this report** via existing `/api/ai` (`get_report`, compact derived context only)
- Dashboard / Daily Review / Command Center compact links to `/reports`
- `prisma/verify-phase26.ts` hooked into `npm run db:verify`

Not implemented (deferred):

- Power BI / external BI, scheduled report emails, WhatsApp reports, autonomous reporting agents, Phase 27

**Zero OpenAI calls on normal reporting. Zero new infrastructure. Zero schema migrations. Database was not reset.**

## Phase 27

Status: **COMPLETE**

Implemented:

- Command UX + Premium Product Experience — visual/IA consolidation (no new engines)
- Navigation regrouped: Overview · Commercial · Operations · Procurement · Intelligence · Control · System
- Command Center elevated as primary operating surface (attention hierarchy, not KPI card wall)
- Shared Management Attention pattern + DomainTrail cross-workspace links
- Operational page language; procurement-chain breadcrumbs on RFQ/PO/Receiving detail
- Inspection sheets slightly denser; AI treatment restrained (Explain / Interpret only when requested)
- `docs/pharmora/PROGRESS.md` + `ARCHITECTURE.md` updated

Not implemented (deferred):

- new business modules, schema, AI agents, Phase 28

**Zero OpenAI calls for layout/navigation. Zero schema changes. Zero new infrastructure. Database was not reset.**

## Phase 29

Status: **COMPLETE**

Implemented: Premium Visual Redesign 2.0 — composition, not restyle.

- Visual system 2.0: graphite / paper / electric-blue accent, 3px radius, IBM Plex Sans
- Shared surfaces (`.work-surface`), metric strips, process trails, signature Management Attention
- App shell as a quiet control rail; topbar as contextual command bar
- Page headers: CONTEXT · title · operational statement
- Command Center recomposed as operating cockpit (asymmetric attention + pulse, uninterrupted workload)
- Dashboard, Reports, Operations, Inventory, Materials, Procurement, Execution, Daily Review inherit the language
- Login split: graphite identity rail + workspace sign-in
- Zero schema, zero APIs, zero AI features, zero new infrastructure

Not implemented (deferred):

- Phase 30
- live viewport QA at 1440 / 1280 / 1024 / 768 / 390 in this pass (layout tokens and mobile patterns preserved)

**Zero OpenAI calls for the redesign. Zero schema changes. Zero new infrastructure. Database was not reset.**

## Phase 29.2

Status: **COMPLETE**

Implemented: Premium Product Experience elevation against the Phase 29 command-system brief (post Phase 28–38 surfaces).

- Product positioning: `Pharmaceutical Operations Command System` (`src/lib/product.ts`, root metadata)
- Management Attention: explicit Evidence / Consequence labels; Command Center 6-block composition (state → attention → pulse → workload → procurement/commercial → activity)
- Dashboard: executive framing; AI Opportunities reframed as non-dominant “Follow-up opportunities”
- Dense production execution board: State · Product · Qty · Progress · Workstation · Risk · Action + progress meters
- Shared `InspectionSection` / `InspectionMetricGrid` for detail sheets; `.ops-table` / `.progress-track` utilities
- Shell density: tighter PageHeader / WorkspacePage / Topbar
- Phase 28 execution logic untouched

Not implemented:

- Full Playwright viewport matrix in this pass (run separately when the app is up)
- Replacing every legacy sheet with InspectionSection (execution production sheet done; others incremental)

**Zero OpenAI · zero schema · zero migrations · zero new dependencies.**

## Phase 29.1

Status: **COMPLETE**

Implemented: Pharmora Color System 2.0 — colour and design tokens only, no layout changes.

- Centralized `--pharmora-*` tokens in `src/app/globals.css`; every shadcn/Tailwind token maps onto them
- Dark graphite is now the default identity (`#0B0D0F` canvas, `#111418` surface, `#171B20` elevated, `#1D2228` subtle)
- Refined intelligence blue `#5B8CFF` replaces the saturated electric blue; teal `#39C6B0` added for operational intelligence
- Muted amber `#D6A85F` as the pharmaceutical/material signal; enterprise-grade semantics (`#43C59E` / `#E4B95A` / `#E06A6A` / `#6EA8FF`)
- Deliberate 6-step chart palette; series also differ by stroke weight and dash pattern
- `StatusTone` gained `intel` and `material`; inventory, operations, procurement, receiving, execution and reports remapped to meaningful tones
- Focus rings reduced to 2px, overlay blur removed, last two raw `amber-*` classes replaced
- Fixed a duplicate React key in Command Center: derived procurement signals were restating daily-attention ids
- `docs/pharmora/DESIGN-SYSTEM.md` gained a "Pharmora Color System 2.0" section

## Phase 30

Status: **COMPLETE**

Implemented: Analytical Visualization & BI Layer — deterministic charts from existing Prisma/services data.

- Reusable SVG chart layer in `src/components/charts/*` (no new chart library dependency)
- Server aggregation in `src/lib/server/command-center-analytics.ts` and shared `src/lib/analytics/production.ts`
- Command Center analytical grid: revenue trend, revenue by product, planned vs actual, workstation capacity, inventory health, procurement pipeline
- Dashboard `SalesPerformance` and Reports executive/sales/operations/procurement/suppliers/materials views use shared chart components
- Chart palette inherits Phase 29.1 tokens (`chart-1`…`chart-6`); click-through to existing workspace routes
- Zero OpenAI on render, zero schema changes, zero new infrastructure

## Phase 30.1

Status: **COMPLETE**

Implemented: Deterministic analytics layer expansion + operational surface wiring (post Phase 28–29.2).

- `src/lib/analytics/*` focused helpers: production, inventory, materials, procurement, sales (+ index)
- Planned vs actual uses `producedQuantity` only; planned never substitutes for actual
- Command Center analytics refactored onto shared helpers
- Inventory health → `StackedPercentBar` + category `HorizontalBarChart`
- Operations capacity view → utilization + planned-vs-actual charts (Gantt/scheduling logic unchanged)
- Materials → requirement vs available `GroupedBarChart` beside shortage horizon
- Operations orders expose `productId` / `producedQuantity` for analytics only
- Architecture + PROGRESS updated

**Zero OpenAI · zero migrations · zero new chart libraries · zero fake metrics.**

## Phase 31

Status: **COMPLETE + VERIFIED**

**Phase 31 — Production Planning 2.0: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, production build, and Playwright browser QA completed successfully. Browser QA covered 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 with 89/89 checks passing. Two QA defects were identified and fixed: deterministic date formatting hydration mismatch and Gantt conflict-indicator pointer interception. Phase 30 analytical surfaces were regression-tested with no issues.

Implemented: Production Planning 2.0 — deepens the existing `/operations` planner without a second scheduling engine.

- Planning layer in `src/lib/operations/planning.ts`; conflict detection extended in `src/lib/operations/schedule.ts` (overlap, over-capacity, delivery risk, missing info, invalid duration, inactive workstation)
- `getOperationsPlanner` enriched with material readiness (from existing MRP), capacity state (85%/95% thresholds via `utilizationTone`), planning attention counts, and order-level conflict metadata
- Authenticated schedule mutations: `PATCH /api/production-orders/[id]/schedule`, `POST …/resequence`, `POST …/auto-schedule` (tenant-scoped; no optimistic writes)
- Gantt remains primary surface; inspection sheet shows identity, schedule, capacity conflicts, material readiness, and planning actions (move earlier/later, auto-schedule, workstation assign)
- Mobile fallback list preserved; filters for material risk and planning conflicts
- Repeatable browser regression: `scripts/phase31-browser-qa.mjs` (Playwright; requires dev server on port 3000)
- Zero schema changes, zero OpenAI, zero new infrastructure
- Resequence writes `PRODUCTION_ORDER_RESEQUENCED` through the existing AuditLog (schedule updates already audited)

## Phase 32

Status: **COMPLETE + VERIFIED**

**Phase 32 — Advanced Materials & MRP 2.0: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 31 regression (`npm run qa:phase31`) still passes 89/89. Phase 32 browser QA (`npm run qa:phase32`) passes 67/67 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844.

Implemented: Advanced Materials & MRP 2.0 — extends the existing MRP/material-readiness architecture (does not replace it).

- **Multi-level BOM explosion** — `src/lib/materials/mrp.ts` recursively resolves demand through nested `BillOfMaterial` lines (cycle-safe, max depth 16); single-level behaviour preserved for regression
- **Canonical MRP enrichment** — `computeMaterialRequirements` now exposes on hand, allocated (open production demand), free available, incoming, projected, net requirement, shortage status, and deterministic MRP breakdown text in the inspection sheet
- **Shortage timing** — `src/lib/materials/shortages.ts` computes `NO_SHORTAGE` / `AT_RISK` / `SHORTAGE` / `UNKNOWN`, earliest shortage date from scheduled demand, and shortage horizon bars
- **Production impact** — affected production orders per material; production-impact summary with links to `/operations`
- **Material priority** — deterministic `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` with human-readable reasons
- **Procurement linkage** — batched counts of open requisitions, procurement RFQs, and purchase orders per material with links to existing workflows (no auto-creation)
- **`/materials` workspace upgrade** — metric strip (at risk, shortages, critical, orders affected, incoming quantity), risk/shortage table, horizon chart, expanded inspection sheet (BOM paths, demand sources, MRP transparency)
- **Tests** — `prisma/verify-phase32.ts` hooked into `npm run db:verify` (multi-level BOM, cycle protection, Phase 14 + Phase 31 regression, tenant isolation)
- **Browser QA** — `scripts/phase32-browser-qa.mjs` + `npm run qa:phase32`

**Files added/changed:** `src/lib/materials/mrp.ts`, `src/lib/materials/shortages.ts`, `src/lib/materials/requirements.ts`, `src/lib/materials/types.ts`, `src/lib/server/materials.ts`, `src/components/materials/MaterialsWorkspace.tsx`, `src/app/(workspace)/materials/page.tsx`, `prisma/verify-phase32.ts`, `prisma/verify.ts`, `scripts/phase32-browser-qa.mjs`, `package.json`, `docs/pharmora/PROGRESS.md`

**Limitations:**

- Demo seed BOM for AMOX-500-CAP remains single-level; multi-level explosion activates when nested BOM rows exist in tenant data
- No reservation transaction system — allocated equals gross open production demand; free available = on hand − allocated
- Net requirement is max(gross − on hand − incoming, 0). It is not gross − projected, because allocated already equals gross demand
- Circular BOMs abort explosion for that order and are listed on the materials snapshot (`bomCycles`); demand is not invented
- Lead time, purchase price, and reorder point remain `Not available` until supplier/pricing data is authoritative in a later phase
- Shortage horizon chart renders only when at-risk or shortage materials exist

**Zero OpenAI calls. Zero schema changes. Zero new infrastructure. Zero new dependencies. Database was not reset.**

## Phase 33

Status: **COMPLETE + VERIFIED**

**Phase 33 — Pharmaceutical Batch & Quality Operations: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 31 regression (`npm run qa:phase31`) passes 89/89. Phase 32 regression (`npm run qa:phase32`) passes 67/67. Phase 33 browser QA (`npm run qa:phase33`) passes 62/62 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844.

Implemented: Pharmaceutical batch & quality operations — a pharma-native batch/quality layer on the existing production architecture (manufacturing status separate from quality status).

- **Schema** — `ProductionBatch` (1:1 with `ProductionOrder`, unique batch number per tenant), `ProductionBatchInputLot` (optional lot consumption), `ProductionBatchQualityEvent` (audit trail); enums `BatchQualityStatus` (PENDING_REVIEW, ON_HOLD, RELEASED, REJECTED) and `BatchQualityAction` (HOLD, RELEASE, REJECT). Migration: `20260910183000_production_batches`
- **Domain service** — `src/lib/batches/service.ts`: state transitions, quantity math (`NOT_RECORDED` when produced quantity unavailable), material lot trace (`NOT_RECORDED` when not recorded), hold reason validation, management attention
- **Server + API** — `getBatchesSnapshot`, hold/release/reject mutations via `POST /api/batches/[id]/hold|release|reject`; tenant-scoped via `getAuthenticatedTenantContext()` only
- **`/batches` workspace** — metric strip, quality views, batch table, inspection sheet (identity, quantity, material trace, quality, timeline) with controlled hold/release/reject actions
- **Integrations** — batch attention merged into Operations planning attention, Reports management attention, Execution queue (awaiting review + on hold)
- **Seed** — `prisma/seed-batches.ts` (5 demo batches LAB-2026-001…005 in varied quality states)
- **Tests** — `prisma/verify-phase33.ts` hooked into `npm run db:verify` (transitions, tenant isolation, Phase 31/32 regression)
- **Browser QA** — `scripts/phase33-browser-qa.mjs` + `npm run qa:phase33`

**Files added/changed:** `prisma/schema.prisma`, `prisma/migrations/20260910183000_production_batches/`, `prisma/seed-batches.ts`, `prisma/seed.ts`, `prisma/verify-phase33.ts`, `prisma/verify.ts`, `src/lib/batches/*`, `src/lib/server/batches.ts`, `src/lib/server/operations.ts`, `src/lib/server/reports.ts`, `src/lib/server/execution.ts`, `src/components/batches/BatchesWorkspace.tsx`, `src/app/(workspace)/batches/page.tsx`, API hold/release/reject routes, `scripts/phase33-browser-qa.mjs`, `package.json`, `src/lib/mock/navigation.ts`, `src/lib/ux/domain-links.ts`, `docs/pharmora/PROGRESS.md`

**Limitations:**

- Not a full QMS — no regulatory claims, no auto release/reject, no inventory posting on quality decisions
- Produced quantity nullable → `NOT_RECORDED` in UI; lot consumption shows `NOT_RECORDED` when unavailable
- Multiple recorded input lots for one material are listed together; quantity used is summed only when every lot has a recorded quantity
- Awaiting-review attention covers one batch or any count of two or more (previously two completed batches raised nothing)
- Full `npm run db:seed` may fail on tenant delete FK conflicts (pre-existing); batch demo data applied via `ensureBatchDemoData`
- After schema migration, restart dev server and run `npm run db:generate` if Prisma client is stale (Windows EPERM if engine DLL is locked)

**Zero OpenAI calls. One additive migration. Zero new infrastructure. Database was not reset.**

## Phase 34

Status: **COMPLETE + VERIFIED**

**Phase 34 — Traceability & Recall Intelligence: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 34 browser QA (`npm run qa:phase34`) passes 59/59 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 (includes Phase 31/32/33 workspace regression on each viewport).

Implemented: Traceability & Recall Intelligence — deterministic forward/backward investigation from recorded relational data only (read-only; not a regulatory recall system).

- **Traceability graph** — `src/lib/traceability/service.ts` builds tenant-scoped indexes from `InventoryLot`, `ProductionBatchInputLot`, `ProductionBatch`, `BillOfMaterial`, `Order` / `OrderItem`, and `Customer`
- **Forward trace** — material lot → production batch → finished product → sales orders → customers (where relationships exist)
- **Reverse trace** — customer / sales order → finished batch → production batch → input lots → supplier
- **Coverage honesty** — each link labelled `TRACEABLE`, `PARTIAL`, or `NOT_RECORDED`; batch-to-order allocation explicitly **not recorded** in schema (product match only — never fabricated)
- **Recall impact analysis** — potential impact summary with scope (`NO_KNOWN_IMPACT` / `LIMITED_IMPACT` / `SIGNIFICANT_IMPACT` / `UNKNOWN`) and confidence (`COMPLETE` / `PARTIAL` / `INSUFFICIENT_DATA`)
- **Exceptions** — missing input-lot linkage, idle lots, incomplete downstream allocation surfaced in workspace + Management Attention (Operations, Reports)
- **`/traceability` workspace** — entity selector, search, metrics, trace path, impact summary, coverage table, affected entities, inspection sheet
- **Tests** — `prisma/verify-phase34.ts` hooked into `npm run db:verify` (forward/reverse trace, tenant isolation, partial data, impact scope, Phase 31/32/33 regression)
- **Browser QA** — `scripts/phase34-browser-qa.mjs` + `npm run qa:phase34`

**Files added/changed:** `src/lib/traceability/types.ts`, `src/lib/traceability/service.ts`, `src/lib/traceability/impact.ts`, `src/lib/server/traceability.ts`, `src/components/traceability/TraceabilityWorkspace.tsx`, `src/app/(workspace)/traceability/page.tsx`, `src/lib/server/operations.ts`, `src/lib/server/reports.ts`, `src/lib/mock/navigation.ts`, `src/lib/ux/domain-links.ts`, `prisma/verify-phase34.ts`, `prisma/verify.ts`, `scripts/phase34-browser-qa.mjs`, `package.json`, `docs/pharmora/PROGRESS.md`

**Limitations:**

- No batch-to-order allocation in schema — customer exposure is product-matched only and always labelled partial
- Lot consumption depends on Phase 33 `ProductionBatchInputLot` records — shows consumption not recorded when absent; recorded `quantityUsed` is summed onto the path, and a row with no inventory lot stays `NOT_RECORDED` even when another lot on the same batch is linked
- Not a validated recall-management or QMS system — no quarantine, notifications, or automated recall execution
- No dedicated sales-order or customer detail pages — traceability links into existing workspaces where available

**Zero OpenAI calls. Zero schema changes. Zero new infrastructure. Database was not reset.**

## Phase 35

Status: **COMPLETE + VERIFIED**

**Phase 35 — Quality Management & Exceptions: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 35 browser QA (`npm run qa:phase35`) passes 77/77 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 (includes Phase 31/32/33/34 workspace regression on each viewport).

Implemented: operational quality-exception layer connected to Production → Batch → Traceability → Management Attention (not a full validated QMS).

- **Quality exception model** — `QualityException`, `QualityCorrectiveAction`, `QualityExceptionEvent` with tenant-scoped nullable FKs to `ProductionBatch`, `ProductionOrder`, `InventoryLot`, `Product`, `Order`, `Customer`, and `User` (owner)
- **Lifecycle** — `OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVED → CLOSED` with controlled shortcuts (`OPEN → RESOLVED`, `INVESTIGATING → RESOLVED`); invalid transitions rejected; closed exceptions cannot reopen
- **Ownership & due dates** — owner assignment, deterministic due-state (`ON_TRACK` / `DUE_SOON` / `OVERDUE` / `NO_DUE_DATE`), age calculation; unassigned surfaced in metrics and Management Attention
- **Investigation** — description, investigation notes, findings, resolution notes on the exception record
- **Corrective actions** — lightweight CAPA rows (`OPEN` / `IN_PROGRESS` / `COMPLETED`) with owner and due date
- **Batch / traceability context** — batch-linked exceptions load Phase 34 impact analysis in the inspection sheet only (no duplicate genealogy engine); material-lot linkage uses existing traceability services
- **Phase 33 hold integration** — ON_HOLD batch context shown when linked; no automatic hold/release on exception create/resolve
- **Management Attention** — critical/high severity, overdue, and unassigned exceptions merged into Operations and Reports attention feeds
- **`/quality` workspace** — metrics strip, filters, exception table, inspection sheet (identity, ownership, affected entity, investigation, traceability, corrective actions, timeline, status transitions)
- **Tests** — `prisma/verify-phase35.ts` hooked into `npm run db:verify` (create, tenant isolation, lifecycle, ownership, due dates, investigation, corrective actions, batch/lot linkage, traceability integration, Phase 31/32/33/34 regression)
- **Browser QA** — `scripts/phase35-browser-qa.mjs` + `npm run qa:phase35`
- **Seed** — `prisma/seed-quality.ts` (3 demo exceptions for lab-allied; idempotent)

**Schema changes:** migration `20260911193000_quality_exceptions` — enums `QualityExceptionType`, `QualityExceptionSeverity`, `QualityExceptionStatus`, `QualityCorrectiveActionStatus`; models above with indexes on tenant + status/severity.

**Files added/changed:** `src/lib/quality/types.ts`, `src/lib/quality/service.ts`, `src/lib/server/quality.ts`, `src/components/quality/QualityWorkspace.tsx`, `src/app/(workspace)/quality/page.tsx`, `src/app/api/quality/**`, `src/lib/server/operations.ts`, `src/lib/server/reports.ts`, `src/lib/mock/navigation.ts`, `src/lib/ux/domain-links.ts`, `prisma/schema.prisma`, `prisma/migrations/20260911193000_quality_exceptions/migration.sql`, `prisma/seed-quality.ts`, `prisma/seed.ts`, `prisma/verify-phase35.ts`, `prisma/verify.ts`, `scripts/phase35-browser-qa.mjs`, `package.json`, `docs/pharmora/PROGRESS.md`

**Limitations:**

- Operational exception tracking only — not a validated QMS, CAPA system, or regulatory certification
- No automated batch hold/release, quarantine, recall execution, or customer/supplier notifications
- Corrective actions are lightweight records — no Phase 36 governance, permissions granularity, or audit trail beyond exception events
- Traceability impact loaded for selected exception in sheet only — list view does not N+1 query impact per row
- Batch-to-order allocation remains partial (Phase 34 honesty carries through)

**Zero OpenAI calls. One additive migration. Zero new infrastructure. Database was not reset.**

## Phase 36

Status: **COMPLETE + VERIFIED**

**Phase 36 — Enterprise Governance & Permissions: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 36 browser QA (`npm run qa:phase36`) passes 32/32 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 (includes workspace regression at 1440×900).

Implemented: operational governance layer — not enterprise IAM, SSO, or regulatory certification.

- **Role model** — extended `UserRole` with `OPERATIONS`, `PROCUREMENT`, `QUALITY`, `SALES`; legacy `OPERATOR` maps to `OPERATIONS` permissions
- **Central permission map** — `src/lib/auth/permissions.ts` with explicit role → permission matrix; `src/lib/auth/authorization.ts` with `hasPermission()`, `requirePermission()`, `canApprove()`, `canProcurementApprove()`
- **Protected mutations** — server-enforced permissions on production scheduling, procurement create/approve, receiving, batch hold/release/reject, quality exception lifecycle, action approve/reject
- **Approval authority** — explicit separation: `actions.approve` (Manager/Admin) vs `procurement.approve` (Manager/Admin) vs `quality.manage` / `batches.quality_action` (Quality + Manager/Admin)
- **Audit trail** — append-only `AuditLog` model with actor, action, entity, old/new values, reason; recorded for role changes, batch quality actions, quality transitions, PO approval/rejection, action approval
- **Tenant isolation** — all reads/mutations remain scoped via `getAuthenticatedTenantContext()`; cross-tenant mutations fail safely
- **`/governance` workspace** — access summary, permission list, approval authority, tenant users (role change for Admin), audit table with search
- **UI authorization** — nav filtered by permission; batch/quality mutation controls hidden when unauthorized (server remains authoritative)
- **Tests** — `prisma/verify-phase36.ts` hooked into `npm run db:verify` (roles, permissions, unauthorized mutations, tenant isolation, audit creation, Phase 35 regression)
- **Browser QA** — `scripts/phase36-browser-qa.mjs` + `npm run qa:phase36`

**Schema changes:** migration `20260914220000_governance_audit` — extended `UserRole` enum; new `audit_logs` table.

**Files added/changed:** `src/lib/auth/permissions.ts`, `src/lib/auth/authorization.ts`, `src/lib/server/audit.ts`, `src/lib/server/governance.ts`, `src/lib/governance/types.ts`, `src/components/governance/GovernanceWorkspace.tsx`, `src/app/(workspace)/governance/page.tsx`, `src/app/api/governance/users/[id]/route.ts`, `src/lib/server/batches.ts`, `src/lib/server/quality.ts`, `src/lib/server/operations.ts`, `src/lib/server/procurement.ts`, `src/lib/server/procurement-rfqs.ts`, `src/lib/server/purchase-orders.ts`, `src/lib/server/receiving.ts`, `src/lib/server/actions.ts`, `src/lib/auth/identity.ts`, `src/auth.ts`, `src/components/layout/SidebarNav.tsx`, `src/lib/mock/navigation.ts`, `src/proxy.ts`, `prisma/schema.prisma`, `prisma/verify-phase36.ts`, `prisma/verify.ts`, `scripts/phase36-browser-qa.mjs`, `package.json`, `docs/pharmora/PROGRESS.md`

**Limitations:**

- Operational governance only — not SSO, SCIM, MFA, external IAM, or regulatory validation
- No automated approvals, permission inheritance trees, or approval monetary thresholds
- Audit trail is append-only application records — not a validated electronic records system
- Admin role changes require `users.manage`; demo seed user remains Manager unless promoted
- Viewer role is read-only for workspace data — no governance/audit/user admin access

**Zero OpenAI calls. One additive migration. Zero new infrastructure. Database was not reset.**

## Phase 37

Status: **COMPLETE + VERIFIED**

**Phase 37 — Operational Intelligence 2.0: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 37 browser QA (`npm run qa:phase37`) passes 51/51 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 (includes workspace regression at 1440×900).

Implemented: deterministic operational intelligence as the source of truth, with OpenAI used only when a user explicitly clicks Explain.

- **Architecture** — Database facts → existing domain services (Phases 30–36) → compact `OperationalFact` / `OperationalInsight` / `OperationalPriority` → optional one-shot AI explanation → human decision. AI never ranks, never invents KPIs, and never mutates records.
- **Deterministic layer** — `src/lib/intelligence/` (`types.ts`, `facts.ts`, `insights.ts`, `priorities.ts`) plus `src/lib/server/intelligence.ts`. Reuses operations planner, MRP/materials, procurement counts, supplier performance, batches, quality exceptions, and traceability attention. No second MRP, traceability, or scoring engine.
- **Cross-domain facts** — production risk, material shortage/at-risk, procurement/delivery risk, supplier risk, quality exception/impact, batch hold, capacity, traceability/customer impact. Evidence and related-domain chains are attached to every fact.
- **Priority engine** — transparent score from severity, production/quality/material impact, overdue state, and partial customer exposure. Bands: CRITICAL / HIGH / MEDIUM / LOW (`Watch` groups medium+low on Daily Review). Score reasons are exposed.
- **Confidence** — KNOWN / PARTIAL / INSUFFICIENT_DATA. MRP shortages are KNOWN. Customer/order impact is PARTIAL (product-matched; batch-level allocation is not recorded). Empty audit trail returns “Change history is insufficient.”
- **Command Center** — Operational Intelligence surface after Management Attention. View + Explain. Existing visual hierarchy retained. Command Center reuses Daily Review’s intelligence snapshot (no second intelligence load).
- **Daily Review** — “Today’s operational priorities” grouped Critical / High / Watch.
- **Reports** — executive view exposes “Cross-domain operational risk”. Other report views do not run the intelligence snapshot.
- **AI explanation pathway** — `POST /api/intelligence/explain` only. Compact permission-aware context (`toCompactIntelligenceContext`). One OpenAI `chat.completions.create` call when `OPENAI_API_KEY` is set; otherwise deterministic fallback. Response contract: summary, reasons, impacts, reviewItems, limitations. No executable actions. Failure falls back to ranked facts — nothing is fabricated.
- **Permissions** — domain loaders gated by Phase 36 `production.read`, `materials.read`, `procurement.read`, `suppliers.read`, `batches.read`, `quality.read`, `traceability.read`, `sales.read`. Excluded domains are omitted from AI context. Tenant from `getAuthenticatedTenantContext()` only.
- **Zero AI on load** — Command Center, Daily Review, and Reports perform zero OpenAI calls during SSR and navigation. QA recorded zero `/api/intelligence/explain` and zero `/api/ai` until Explain; exactly one explain POST after the button.
- **Phase 17/19 explain** — Daily Review / Command Center no longer call the mutating `/api/ai` orchestrator. Explicit explain is the dedicated intelligence route.

**Files added/changed:** `src/lib/intelligence/types.ts`, `src/lib/intelligence/facts.ts`, `src/lib/intelligence/insights.ts`, `src/lib/intelligence/priorities.ts`, `src/lib/server/intelligence.ts`, `src/lib/ai/intelligence-explain.ts`, `src/app/api/intelligence/explain/route.ts`, `src/components/intelligence/IntelligenceSurface.tsx`, `src/lib/server/command-center.ts`, `src/lib/command-center/types.ts`, `src/components/command-center/CommandCenterWorkspace.tsx`, `src/lib/server/daily-review.ts`, `src/lib/daily-review/types.ts`, `src/components/daily-review/DailyReviewWorkspace.tsx`, `src/lib/server/reports.ts`, `src/lib/reports/types.ts`, `src/components/reports/ReportingWorkspace.tsx`, `src/lib/auth/permissions.ts`, `prisma/verify-phase37.ts`, `prisma/verify.ts`, `prisma/verify-phase17.ts`, `prisma/verify-phase19.ts`, `scripts/phase37-browser-qa.mjs`, `package.json`, `docs/pharmora/PROGRESS.md`

**Schema changes:** none. No AI explanation storage. Database was not reset.

**Infrastructure / dependencies:** none added (no Redis, queues, workers, cron, new AI framework, or new chart library). Reuses existing `openai` package.

**Tests:** `prisma/verify-phase37.ts` hooked into `npm run db:verify` (facts, insights, ranking, insufficient data, tenant isolation, permission-aware context sanitization, AI schema/fallback, zero OpenAI on page-load sources, Phases 31–36 regressions). `npx tsc --noEmit` passed. `npm run db:verify` passed through Phase 37.

**Browser QA:** `scripts/phase37-browser-qa.mjs` + `npm run qa:phase37`.

**Limitations:**

- Customer/order impact is product-matched, not confirmed batch genealogy
- Change detection uses existing `AuditLog` rows only — no manufactured historical deltas
- Intelligence composition is request-time (no background jobs); Command Center / Daily Review / executive Reports are heavier because they reuse live domain snapshots
- OpenAI explains ranked facts; it cannot approve, schedule, release, purchase, or communicate
- Manager permission chips previously listed `audit.read` / `governance.read` twice (already granted via read permissions); deduped for unique React keys

**Zero OpenAI calls on page load. At most one OpenAI call per explicit Explain. Zero schema changes. Zero new infrastructure. Database was not reset.**

## Phase 38

Status: **COMPLETE + VERIFIED**

**Phase 38 — Executive Planning, Simulation & Decision Workspaces: COMPLETE + VERIFIED**

Implementation, TypeScript, database verification, and Playwright browser QA completed successfully. Phase 38 browser QA (`npm run qa:phase38`) passes 59/59 at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 (includes Phase 31–37 workspace regression at 1440×900).

Implemented: flagship planning & simulation workspace — Sugar-inspired enterprise UX clarity with PharmaFlow operational depth (not a Power BI clone or literal Sugar copy).

- **Scenario architecture** — reuses Phase 21 deterministic engine (`src/lib/scenarios/engine.ts`) + enriched snapshot in `src/lib/server/scenarios.ts`. Baseline facts from operations planner, MRP, procurement, batches, quality, traceability, and commercial signals. No second MRP/scheduler. Scenarios are in-memory projections only — nothing persisted, nothing mutates live data.
- **Operational journey** — `src/lib/scenarios/journey.ts` builds a reusable dependency map (Demand → Materials → Production → Batches → Quality → Delivery → Customer) with status, metric, reason, baseline/scenario/delta, confidence, and workspace links. Not decorative — each stage is inspectable.
- **Impact chain** — deterministic consequence links from assumption change through material shortage, production exposure, batch/quality risk, and delivery/customer impact where data supports it.
- **Baseline vs scenario** — comparison table (Current | Scenario | Variance) with FACT / PROJECTED / VARIANCE labelling; assumption rows show Current / Scenario / Change for every supported control.
- **Decision workspace** — `src/lib/scenarios/decision.ts` produces headline, why, trade-offs, data limitations, and review links. No “Execute scenario” — human decision only.
- **`/scenarios` flagship UI** — three-column decision canvas (assumptions | comparison + journey + impact chain | decision panel). Header: PLANNING & SIMULATION. Full-width workspace surface. Responsive: stacked surfaces on tablet/mobile; decision-first on 390×844.
- **Role behavior** — Phase 36 permissions filter journey/comparison/impact domains via `permittedScenarioDomains()`; one engine, permission-aware presentation (Executive/Manager cross-domain; Operations production/materials; Procurement supplier/material exposure; Quality batch/quality; Viewer read-only).
- **Command Center integration** — compact **Planning outlook** section (current state, top risk, scenario opportunity, projected impact, link to `/scenarios`).
- **Reports integration** — executive view exposes **Scenario Planning** comparison slice (+20% demand vs baseline) via shared `getScenarioPlanningSlice` — no duplicate engine.
- **AI explanation** — dedicated `POST /api/scenarios/explain` + `src/lib/ai/scenario-explain.ts`. Zero OpenAI on load/run/presets. Explicit **Explain** uses at most ONE OpenAI call with compact sanitized context; deterministic fallback on failure. AI cannot modify scenario data, approve, or execute decisions.

**Schema changes:** none. Scenarios computed in memory from existing domain snapshots. Database was not reset.

**Infrastructure / dependencies:** none added (no Redis, queues, workers, cron, new chart library, or simulation framework). Reuses existing `openai` package.

**Tests:** `prisma/verify-phase38.ts` hooked into `npm run db:verify` (baseline scenario, demand/capacity/inventory/supplier assumptions, projected production/material/capacity impact, impact chain, variance, unsupported assumptions, insufficient data, scenario isolation, tenant isolation, permission filtering, zero AI on calculation, one AI max on Explain, Phases 31–37 regressions). `npx tsc --noEmit` passed. Isolated Phase 38 verify passed.

**Browser QA:** `scripts/phase38-browser-qa.mjs` + `npm run qa:phase38`.

**Limitations:**

- Workforce availability adjustment not supported — surfaced in data limitations when absent
- Customer/order impact remains product-matched (Phase 34 honesty) — not confirmed batch genealogy
- Planning outlook and Reports slice use a fixed +20% demand comparison for executive context (full controls remain on `/scenarios`)
- Scenario composition is request-time (no background jobs); heavy pages may load two snapshots for outlook/comparison
- No Scenario B comparison or persistent scenario storage (by design for this phase)

**Zero OpenAI calls on scenario calculation and normal usage. At most one OpenAI call per explicit Explain. Zero schema changes. Zero new infrastructure. Database was not reset.**

## Phase 28

Status: **COMPLETE**

### Production Execution & Shop-Floor Intelligence

`/execution/production` is the shop-floor control surface on existing `ProductionOrder` / `ProductionBatch` / `AuditLog`. Phase 18 `/execution` remains the approvals/action queue.

**Lifecycle (planning status preserved):**

- DB `ProductionOrderStatus` unchanged: `UNSCHEDULED | SCHEDULED | AT_RISK | IN_PROGRESS | COMPLETED`
- Execution overlay: `WAITING → RELEASED → IN_PROGRESS ⇄ PAUSED → COMPLETED`
- `RELEASED` / `PAUSED` are AuditLog-derived (no schema change)
- `START` sets `IN_PROGRESS` + `batch.productionStartedAt` when a batch exists
- `COMPLETE` sets `COMPLETED` + produced quantity / `productionCompletedAt` when a batch exists
- Release locks the order (`isLocked`) so planning cannot corrupt execution

**Actions:** Release, Start, Pause, Resume, Complete — human-controlled; no inventory consumption, lot creation, quality release, or notifications.

**Intelligence:** Deterministic progress (`produced/planned`), planned-vs-actual duration/quantity, risk with evidence, Management Attention reuse.

**Permissions:** `production.read` (view), `production.execute` (mutations). Unauthorized → 403. Audit via existing `AuditLog`.

**Integrations:** Command Center signals, Reports KPIs, Operations / Execution cross-links. 0 OpenAI. 0 schema. 0 infrastructure.

**Tests:** `prisma/verify-phase28.ts` in `npm run db:verify`. Browser QA: `npm run qa:phase28`.

## Current

- Phase 28 complete (Production Execution). Phases 29–38 remain as previously verified.
- Shop-floor path: Operations (plan) → `/execution/production` (execute) → Reports / Batches.

## Next

- Phase 39 — Integrations (when explicitly requested).

## Stack

Unchanged from Phase 2, plus `cmdk`, Prisma 6, and `@prisma/client`. PostgreSQL for persistence.

## Commands

```bash
npm run dev
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:verify
npm run db:studio
npm run qa:phase28
npm run qa:phase31
npm run qa:phase32
npm run qa:phase33
npm run qa:phase34
npm run qa:phase35
npm run qa:phase36
npm run qa:phase37
npm run qa:phase38
```

Inspect: [http://localhost:3000](http://localhost:3000) → [http://localhost:3000/login](http://localhost:3000/login) → [http://localhost:3000/dashboard](http://localhost:3000/dashboard)  
DB health (after migrate + seed): [http://localhost:3000/api/health/db](http://localhost:3000/api/health/db)
