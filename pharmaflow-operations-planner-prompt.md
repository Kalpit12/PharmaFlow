ROLE
You are a senior full-stack engineer working inside the PharmaFlow codebase (Next.js, deployed on Vercel, multi-tenant). Build a new module called "Operations Planner": a finite-capacity production scheduler for pharmaceutical plants, at feature parity with SkyPlanner APS and extended with GMP constraints. Before writing code, read the repo: find the existing data layer/ORM, auth and tenant scoping, the Materials/MRP, Procurement (RFQ, PO, Receiving), Batches, Quality, Traceability, Execution queue, Command Center and audit-trail modules. Reuse their models, components and conventions. Do not introduce a second database or a parallel auth system.

NON-NEGOTIABLE PHARMAFLOW PRINCIPLES
1. Tenant isolation: every new table carries tenant_id and every query is tenant-scoped.
2. Agents prepare, people decide: the scheduler PROPOSES plans. A person with the right role accepts a plan before it becomes the live schedule. Autopilot may generate proposals automatically but never publishes without approval, except inside rules a head planner has explicitly pre-approved (e.g. "auto-accept if no order becomes late and nothing in the frozen window moves").
3. Every write (accept plan, move job, lock, start/stop timer, release) goes to the existing append-only audit trail with who, what, when, before/after.
4. Zero model calls on ordinary page load. The scheduling engine is deterministic optimisation code, not an LLM. The optional "Explain" button may call the LLM once to explain why a job landed where it did, using engine output as facts.
5. KSh for any costs; Africa/Nairobi as default timezone; business and operations data only, no clinical claims.

PHASE 1 — RESOURCE AND PRODUCT MODEL
Create (or extend existing) entities, each with CRUD screens, CSV import and audit:
- Site, Department, Room/Area (shared capacity, e.g. dispensing booth, granulation suite).
- Workstation: one resource with its own queue (machine, line, room, person or subcontractor). Fields: name, code, department, room, type, workstation_group_id, efficiency_coefficient (default 1.0), qualification_status (qualified / due / expired), calibration_due_date, clean_status (clean / dirty) and clean_hold_expires_at, is_subcontractor, allowed_parallel_jobs (default 1).
- Workstation group: named set of workstations; process steps may target a group (alternative workstations).
- Shift templates: recurring weekly shifts per workstation (e.g. 06:00–14:00, 14:00–22:00) with assigned people/employee groups. Calendar exceptions: holidays, overtime, breakdown, planned maintenance, preventive maintenance applied to all. Capacity = shifts minus exceptions, multiplied by efficiency.
- Personnel: employees, employee groups, leave, overtime, and training/qualification records per process step. Only qualified operators can be rostered on a step.
- Tools/change parts/molds/punch sets: shared resources assigned to workstations and products, with maintenance windows and a "broken" flag. A tool cannot be used in two places at once.
- Process step (operation): name (Dispensing, Granulation, Drying, Blending, Compression, Coating, Encapsulation, Filling, Blister packing, Secondary packing, QC hold, Line clearance), allowed workstations or group, run time per unit or per batch, setup time, teardown time, min_degree_of_completion_to_start_next (0–100 %), max_hold_time_to_next_step (hours, hard constraint), requires_line_clearance (bool), is_qc_hold (bool: consumes elapsed time but no workstation capacity).
- Product routing: ordered process steps per product with dependencies (a DAG, not just a list), validated batch size(s), minimum production quantity, materials (BOM) per batch, tools, and properties (API, strength, colour, potency class, allergen flag, dosage form). Sub-products (e.g. granulate, coated cores, bulk solution) with their own routings feed the parent.
- Visual routing editor: cards for steps, arrows for dependencies, sub-product branches merging into the parent. Drawn by the user, reviewed before use.
- Cleaning/changeover matrix: per workstation (or group), time required between product A and product B (or between property values), with levels: none, minor clean, major clean. Also a max campaign length (batches or hours) before a forced major clean.

PHASE 2 — ORDERS, PROSPECTS, BATCHES
- Production orders with items (product, quantity, due date, customer, priority, earliest start / eligibility date, scheduling direction forward or backward (JIT)). Converting quantity to whole validated batches automatically; flag partial batches.
- Each batch expands into jobs (one per routing step, per sub-product) linked to the existing Batches module, so a scheduled batch number is the same batch QA later releases.
- Job prospects: a sales quote scheduled as a simulated order against the real plan to return a realistic delivery date; optional capacity reservation; one-click convert to a firm order. Distinct colour on the Gantt.
- Assembly / campaign jobs: combine batches from several orders of the same product into one campaign run to save cleans.
- Attachments on orders/batches (MBR, SOP, artwork) visible to the operator.
- Customers with default priority.

PHASE 3 — SCHEDULING ENGINE ("Planner engine")
Implement as a server-side service (TypeScript worker or a Python service using Google OR-Tools CP-SAT; pick one after inspecting the stack and justify it in a short ADR). Inputs: open jobs, workstations with capacity calendars, rooms, tools, operators, routing dependencies, changeover matrix, material availability timeline, locks, rules. Output: a proposed plan (start, end, workstation, operator, tool per job) plus a list of conflicts and late items with reasons.
Hard constraints:
- Finite capacity per workstation, room and tool; never overbook.
- Step dependencies, with min degree of completion before the next step may start and max hold time between steps.
- Setup, teardown and sequence-dependent cleaning times from the changeover matrix; campaign length limits.
- Workstation must be qualified, calibrated and within clean-hold at job start; otherwise insert the required clean or skip the station.
- Material availability: a job cannot start before its materials are projected available (on-hand minus reservations plus PO arrivals from Procurement). Allocate material lots FEFO; respect minimum remaining shelf life.
- QC hold steps consume elapsed time only; downstream steps wait for release when "Consider QC release" is on.
- Locked jobs, locked orders, jobs locked to a specific workstation, and the running time lock window (next N hours frozen) never move.
Soft objectives, each a 0–100 weight slider in Global Rules (multi-level priorities):
- Minimise lead time per order item.
- Jobs ordered by due date.
- Maximise number of items completed on time.
- Customer priority.
- Job / order priority.
- Start as close as possible to eligibility dates.
- Similar jobs in succession (group by a property per workstation, e.g. same API, same strength, same colour) to minimise cleaning time.
- Minimise total cleaning/changeover time.
Engine actions exposed in the UI and API:
- Reschedule all; reschedule one workstation; schedule only unscheduled jobs; unschedule one item or all.
- Fast Track: force one order to the front, then replan the rest.
- Split job across several workstations of the same group.
- Bulldozer: move unstarted jobs that slipped into the past to now.
- Autopilot: on meaningful events (new or changed order, timer completion, breakdown/exception, material delay, QC hold extended, PO date change) generate a new proposal; do nothing if nothing changed. Respect locks and the frozen window. Show the proposal for approval (or auto-accept only under pre-approved rules, logged).
- Duration learning: after enough time logs, suggest updated run/setup times per step and workstation (planner accepts them).
Performance target: a 3-month plan for 50 workstations and 500 batches in under 60 seconds; incremental replans in under 10 seconds. Run long solves as a background job with progress.

PHASE 4 — GANTT AND PLAN REVIEW (the planner's main screen)
- Rows = workstations (grouped, collapsible, hide/show), plus optional rows for rooms and tools.
- Bars = jobs, labelled with batch number, product, step. Colours: scheduled, running, done, late (red), selected, prospect, QC hold, cleaning/changeover blocks (hatched), maintenance and exceptions (grey).
- Dependency arrows showing job flow; current-time line; zoom from hour to quarter; search by batch, order, product, customer.
- Capacity graph per workstation under its row (load vs capacity, overload in red).
- Drag a job to another time or allowed workstation; the UI validates constraints live and explains violations. Right-click: lock, set job priority, Fast Track, split, add quick note for operators, show task list for the order.
- Plan comparison ("ghost jobs"): the proposed plan over the current plan, with a diff panel listing moved jobs, newly late items, items that became on time, cleaning time saved. Buttons: Accept (role-gated, audited), Reject, Edit.
- Workstation queue as a list view; order task list (each step, station, start, end, duration).

PHASE 5 — SHOP FLOOR APP (mobile-first, tablet and shared screen)
- Operator login (or badge/PIN on a shared tablet) shows only their workstations' queue in scheduled order.
- One-tap Start, Pause (with reason: breakdown, material missing, waiting QA, break), Complete with produced quantity and rejects. Quick log mode for minimal input. Setting to block logging on several jobs at once.
- Line clearance checklist step with signature before the batch can start.
- See attachments (MBR, SOP) and planner notes; raise an issue (breakdown, deviation) that creates a workstation exception and, if quality-related, a record in the Quality module.
- Every log updates job progress live, feeds actual durations, and triggers Autopilot.
- Offline tolerance: queue logs locally and sync when connection returns.
- Shop-floor TV mode: read-only live board per department.

PHASE 6 — INTEGRATION WITH EXISTING PHARMAFLOW MODULES
- Materials/MRP: the planner consumes the net-requirement timeline; material shortages that delay a scheduled batch appear as a ranked item in Command Center and Daily Review ("Batch LAB-2026-031 delayed 3 days: foil net short").
- Procurement: PO expected dates are material arrival events; a slipped PO date triggers an Autopilot proposal. From a shortage, the planner can draft an RFQ (existing flow, human-approved).
- Batches/Quality: scheduled batches are the same records QA disposes; QC hold length and release status feed back into the plan; a rejected batch frees downstream capacity and flags affected orders.
- Traceability: scheduled batch ↔ lots consumed ↔ orders served, closing the "allocation not recorded" gap.
- Execution queue: plan acceptance, Fast Track, and auto-accept rules appear as approval items.
- Command Center widgets: capacity load next 14 days, late items, bottleneck workstation, on-time delivery %, schedule adherence.

PHASE 7 — REPORTS AND DASHBOARDS
Drag-and-drop dashboard builder (per user, multiple dashboards, any date range) with widgets: capacity vs load hours, load factor by day, jobs started/completed, logged vs planned time, efficiency planned vs actual, late jobs, on-time delivery (OTIF), OEE per workstation (availability × performance × quality from timer data), cleaning/changeover hours, utilisation by workstation, schedule adherence. Fixed reports: job report, all time logs, order item report, workstation utilisation for investment decisions. Export CSV/PDF.

PHASE 8 — ROLES AND PERMISSIONS
- Operator: shop floor app only (own queue, own logs, own shifts).
- Supervisor: shop floor plus department Gantt view, can reassign within department.
- Planner: full planner, can run engine and propose; cannot change Global Rules.
- Head planner: Global Rules, workstation and job rules, accept plans, define auto-accept rules.
- QA: release/hold batches, view plan, approve line clearance templates.
- Sales: prospects and delivery-date quotes, read-only Gantt.
- Viewer/Executive: dashboards.
Department-scoped visibility: users see only workstations of their departments unless granted more.

PHASE 9 — DATA IN AND OUT
- CSV import with templates and validation preview for: workstations, shifts, products, routings, materials, orders, customers. This is the onboarding path; build it before the API.
- REST API (tenant API keys): create/update orders and items, products and materials, read scheduled step timings and workstations, post/read time logs, post workstation/person exceptions.
- Webhooks out: plan accepted, job started/completed, order late, batch delayed by material.
- ERP sync adapters later (SAP Business One first, as it is common in Kenyan pharma).

PHASE 10 — PLANNER ASSISTANT (optional, last)
A chat panel that can draft actions ("create an order for 20 batches of Amoxicillin 500 for customer X due in 3 weeks", "what happens if Compression 2 is down tomorrow?", "schedule unscheduled jobs"). It produces a proposal or a what-if plan, shows exactly what would change, and waits for the user to accept. It never writes without confirmation and every accepted action is audited.

DELIVERY ORDER AND ACCEPTANCE
Ship in this order, each behind a feature flag, each with seed data for a demo tenant (Nairobi plant: dispensing, 2 granulators, FBD, blender, 3 compression machines, coater, encapsulator, 2 blister lines, liquid filling, QC hold) and automated tests:
1. Phase 1 + CSV import. Acceptance: a planner models the demo plant in under 1 hour.
2. Phase 2 + Phase 3 engine with hard constraints and two weights (due date, cleaning). Acceptance: 100 batches scheduled with zero capacity or hold-time violations; changeover matrix respected.
3. Phase 4 Gantt with comparison and approval. Acceptance: drag/lock/accept round-trip audited; ghost diff correct.
4. Phase 5 shop floor app. Acceptance: start/pause/complete on a phone updates the Gantt within 5 seconds.
5. Phase 6 integrations, then full priority sliders, Autopilot, Fast Track, Bulldozer, split, prospects.
6. Phases 7–10.
For each phase: write a short design note first (data model diff, API, screens), then implement, then run tests and update the demo seed. Ask me before any destructive migration.
