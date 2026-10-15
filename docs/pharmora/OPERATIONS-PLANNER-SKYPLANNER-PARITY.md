# Operations Planner — SkyPlanner full parity

Phases **1–10** delivered the PharmaFlow rebuild (GMP scheduler, propose→accept, integrations, dashboards, API, assistant drafts). **SkyPlanner feature parity** continues in **Phases 11–22** below. Nothing is deferred: every gap has a phase, acceptance criteria, and verify script target.

Sources: `SkyPlanner Study & Operations Planner Build Prompt.md`, `pharmaflow-operations-planner-prompt.md`.

## Status legend

| Mark | Meaning |
| --- | --- |
| ✅ | Shipped in Phases 1–10 |
| 🔲 | Planned (Phases 11–22) |
| ◐ | Partial (needs completion in named phase) |

---

## Parity matrix

| SkyPlanner area | PharmaFlow today | Phase |
| --- | --- | --- |
| Site / dept / room / workstation / group | ✅ Plant model + CSV | — |
| Shifts + calendar exceptions | ✅ `WorkstationShift`, exceptions | — |
| Personnel, groups, leave, roster on shifts | ◐ Schema + migration; UI/engine Phase 11 | **11** |
| Tools / molds, broken flag, maintenance | ◐ Schema + plant UI; engine capacity for tools | **11**, **12** |
| Process steps + QC hold + line clearance | ✅ | — |
| Routing DAG (dependencies) | ◐ DB + list UI; no visual editor | **11** |
| Sub-products with own routings | ◐ `ProductSubAssembly`; engine + UI Phase 11 | **11** |
| Visual routing editor (cards + arrows) | 🔲 | **11** |
| Changeover matrix + campaign limits | ✅ | — |
| Firm orders + prospects + batch sizing | ✅ | — |
| Assembly / campaign across orders | ◐ `ProductionCampaign` schema; engine grouping | **18** |
| Order attachments on shop floor | ◐ Schema; operator visibility | **16** |
| Global Rules — all weighted sliders | ✅ Extended weights + consider materials/eligibility toggles | — |
| Consider materials / eligibility / time lock | ✅ Policy toggles + freeze minutes | — |
| Job rules: lock, JIT, priority, split, Fast Track, lock-to-WS | ◐ Fast track flag; split → **13** | **13** |
| Workstation rules: time lock, alt WS, group-by property | 🔲 | **13** |
| Reschedule all / one WS / unschedule / unscheduled only | ✅ Engine tab + `/api/schedule-plans/actions` | — |
| Fast Track, Bulldozer, split job | ◐ Fast track + bulldozer; split → **13** | **13** |
| Autopilot + pre-approved auto-accept rules | ◐ Autopilot modes; no rule builder UI | **17** |
| Duration learning from timelogs | 🔲 | **15** |
| Gantt rows, colours, ghost compare | ✅ | — |
| Gantt drag → propose | ✅ `/api/schedule-plans/propose-move` | — |
| Dependency arrows, capacity graph, hour/quarter zoom | 🔲 | **14** |
| Room / tool Gantt rows | 🔲 | **14** |
| Right-click: lock, Fast Track, split, notes | 🔲 | **14** |
| Shop floor queue, pause, line clearance, TV board | ✅ | — |
| Quick log, offline sync, attachments at machine | 🔲 | **16** |
| Issue → WS exception + Quality | ◐ Partial via shop floor | **16** |
| Dashboard builder + fixed reports + export | ✅ | — |
| OEE widget from timer data | ◐ Widget catalog; needs timer-backed OEE calc | **15** |
| Roles (operator → head planner) | ✅ `plannerAccessRole` | — |
| CSV import (all onboarding entities) | ◐ 7 kinds; missing personnel, tools, exceptions bulk | **11** |
| REST v1 + webhooks | ✅ | — |
| Planner assistant (draft → accept) | ✅ deterministic | — |
| SAP B1 / ERP adapter depth | ◐ Webhook + connector stubs | **21** |

**Pharma extensions (beyond SkyPlanner)** — keep and harden in **12** (engine) / **19** (traceability): FEFO materials, clean-hold, qualification, hold-time, batch↔lot genealogy.

---

## Phase 11 — Resource & routing completeness

**Goal:** Model and UI for personnel, sub-products, visual DAG editor, CSV for remaining entities.

- Data: `PlantEmployee`, groups, leave; `ProductSubAssembly`; optional `WorkstationShiftAssignment`.
- Engine: expand jobs for sub-product bottom-up scheduling (read child routings).
- UI: Plant model tabs — **People**, **Sub-products**; **Routing editor** (React Flow or similar) on active routing.
- CSV: `personnel`, `tools`, `exceptions` kinds + templates.
- Verify: `npx tsx scripts/verify-planner-phase11.ts` (parsers + DAG layout); `npx tsx scripts/run-planner-phase11-verify.ts` (DB, after migrate + seed).

## Phase 12 — Engine mechanics (SkyPlanner “King button” suite)

- **Done (core):** extended `PlanningPolicy` weights; `considerMaterials` / `considerEligibility`; `ProductionOrder.fastTrack`; `proposeSchedule` modes; bulldozer, unscheduled-only, workstation scope, fast track + propose; unschedule order/all (audited writes); UI on Planner engine tab; API `POST /api/schedule-plans/actions`.
- **Remaining in 12.x:** split job across group; tool + room finite capacity in solver; 100-batch zero-violation load test.
- Verify: `npx tsx scripts/verify-planner-engine-phase12.ts`.

## Phase 13 — Job & workstation rules

- Persisted locks (order, operation, workstation assignment), per-job priority, JIT backward scheduling flag.
- Workstation `groupByProperty`, running time lock per station, allow alternative workstations.
- API + Gantt context menu hooks.

## Phase 14 — Gantt parity

- Dependency arrows, capacity load strip, zoom presets, search/filter.
- Optional rows: rooms, tools.
- Context menu wired to Phase 12/13 actions.

## Phase 15 — Duration learning & OEE

- Aggregate timelogs → suggested run/setup minutes (planner accepts).
- Dashboard OEE from availability × performance × quality.

## Phase 16 — Shop floor parity

- Quick log mode, block multi-job logging setting.
- Attachments + planner notes on station view.
- Offline queue + sync.
- Deviation/issue → calendar exception + Quality record.

## Phase 17 — Autopilot governance

- UI for pre-approved auto-accept rules (frozen window, no new lates, etc.).
- Execution queue surfacing auto-accept decisions.

## Phase 18 — Orders & campaigns

- Assembly jobs across orders (campaign optimizer).
- Order archive/filter, per-order task list panel on Gantt.

## Phase 19 — Traceability & genealogy closure

- Scheduled batch ↔ lots ↔ orders in planner UI and webhooks.

## Phase 20 — Warehouse planner surfaces (SkyPlanner §5)

- Cumulative stock, PO projected stock in planner context (reuse Materials; planner-native views where SkyPlanner shows them).

## Phase 21 — ERP depth

- SAP B1 connector hardening (orders in, schedule + timelogs out).

## Phase 22 — Assistant parity

- Optional LLM layer on top of deterministic drafts (29 languages out of scope unless requested); config help + multi-intent coverage matching SkyPlanner Agent scenarios.

---

## Delivery rules

1. One phase per PR slice; design note + migration + verify + seed update.
2. No schedule publish without accept (autopilot only via Phase **17** rules).
3. Update this file’s matrix (◐ → ✅) as each item ships.

**Next implementation start:** Phase **11** (personnel + sub-products + routing editor + CSV).
