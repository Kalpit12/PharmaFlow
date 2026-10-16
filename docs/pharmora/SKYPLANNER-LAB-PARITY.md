# SkyPlanner parity — Lab & Allied reference (PharmaFlow)

Layout and behaviour reference from a live SkyPlanner install. **Do not copy** customer names, staff, orders, or stock into demo or sales material.

## Priority (client value)

1. **§3 Workstation scheduling (roster)** — week grid, operators on shifts, exceptions.
2. **§5 All timelogs** — supervisor accept, faulty pcs, filters.
3. **§6 Job report** — planned vs logged, difference ratio colours.

## Live check (2026-10-16)

**Improved:** Nairobi time in planner, whole-hour ticks, ~36h default window, bar labels like `B-024 (1.5h) Paracetamol 500mg`, warning badges, changeover blocks, OEE hidden until timer data exists.

**Still open:**

| Area | Notes |
| --- | --- |
| §1–§2, §3, §5, §6 | Default shifts, roster, timelogs, job report screens not built. |
| Past-due pile | ~68 late jobs / red bars left of now — run **Reschedule all** + accept; seed may need longer step times. |
| Step durations | Routing/seed minutes too short vs real line times. |
| Batch / bar codes | Mixed `B-024`, `G-01`, `G-2026` (year leak from `PRP-GANTT-2026`) — target §4 `{orderNo}/{item} ({hours}h)`. |
| Shell | Top bar was UTC while planner EAT; two sidebars on Gantt — **fix in progress** (plant routes → EAT; hide app nav on Gantt). |
| Orders / plant | Timestamp order codes, duplicates, phase copy, empty site/dept/tool counts — seed + §4 list UX. |

### Workstation names (Lab reference photos, 17/~19)

Use for **fictional MediCrest** import only (names pattern, not customer ERP ids in sales demos). External IDs and CSV columns are in the analyst handoff; scroll photo needed for last ~2 rows.

| Name |
| --- |
| ACG Blister Tablet Packing |
| ACG Coating |
| Blender octagonal 1000kg |
| Blister Machine-BMAX |
| Blister Packing Alu/Alu Lablas |
| Bulk (counting) Packing |
| Capsule Filling Small Batch |
| Capsule Filling-ACG |
| Capsule Filling-Chinese |
| Capsule Line Packing |
| Capsules Line packing II |
| Dps Line 1 |
| DPS Line 2 |
| LabClav Blending 500kg |
| LabClav Compression |
| QC PROCESS |
| sFG QUARANTINE |

Import path: Operations → Data import → workstations CSV (see `PlannerDataImportWorkspace` templates).

**Tenant:** `lab-allied-demo` — SkyPlanner-layout plant (17 workstations, L&A shift pattern). MediCrest (`medicrest`) keeps the generic machine demo. Switch via sidebar **Workspaces** → *Laboratory & Allied (Demo)*, then open `/operations?view=gantt`.

**Seeding (not automatic on Vercel deploy):**

| Script | Target tenant | File |
| --- | --- | --- |
| `npm run db:seed:lab-allied` | `lab-allied-demo` only | `prisma/seed-lab-allied-demo.ts` |
| `npm run db:seed:lab-allied:verify` | seed + realign + precedence checks + workstation list | `scripts/verify-lab-allied-plant.ts` |
| `npm run db:seed:lab-allied:replan` | seed + **Reschedule all** + accept + realign + ORD011/12 timelines | `scripts/reseed-lab-allied-plan.ts` |

Requires `DATABASE_URL` + `AUTH_DEV_PASSWORD` in `.env`. Point `DATABASE_URL` at production, run locally once after deploy. MediCrest seed (`prisma/seed-gantt-demo.ts` via `db:seed`) is separate and still creates Dispensing/Granulation rows on `medicrest`.

**API check:** `GET /api/v1/workstations` uses an API key scoped to one tenant — create a key on `lab-allied-demo` in Administration, or use the verify script output.

## §0 Live bugs (in progress)

| Issue | Design | Implementation |
| --- | --- | --- |
| Past-due pile on today | Reschedule all runs **bulldozer** then finite-capacity forward from `now` across plant shift windows. | `proposeRescheduleAll` → `bulldoze: true`. |
| Today KPIs vs planner | Same **`getPlanSnapshot`** as Gantt/dashboard. | `daily-review.ts` context from plan snapshot + material delay signals. |
| Fake OEE | Hide OEE widget when **no shop-floor events** in horizon. | Dashboard snapshot flag + empty state. |
| Gantt hour ticks | Snap header ticks to **whole plant hours** (08:00, 10:00…), not `now−6h`. | `buildGanttHeaderTiers` + optional window align. |
| Shift band gaps | Each shift interval = separate green block; **2–4px canvas gap** between day/night. | Row renderer margin between `onShiftBlocks`. |
| Phase banners | Remove dev-phase copy from planner surfaces. | Plant model, engine headers. |
| Orders/plant seed | PRO-YYYY-NNNN, dedupe, NBO-PLT seed, feasible column | §4 + existing seed scripts (follow-up). |

## §1 Default shifts

**Route:** Resources → Default shifts (`?view=shifts`).

**Model:** `ShiftTemplate` — name, colour, begin/end (overnight), weekdays bitmask. Workstations link via `WorkstationDefaultShift`.

**UI:** CRUD table + colour swatch. Seed: Day **08:30–17:30** Mon–Fri, Night **19:00–06:00** (17:30–19:00 gap), Saturday day only, QC/quarantine 24h (`plant-shift-template.ts`).

## §2 Workstation settings modal

**Trigger:** Plant model row → settings.

**Fields:** name, externalId (ERP), department, group, quickLog, subcontract, efficiency, qualification/calibration/clean.

**Sections:** Default shifts (template + recurrence + assigned person), exceptions (maintenance/cleaning/breakdown/overtime).

**Actions:** Save, **Copy workstation**.

## §3 Workstation scheduling (roster)

**Route:** Resources → Scheduling (`?view=roster`).

**Grid:** rows = workstations, cols = Mon–Sun; cells = shift chips (time + operator). Create/edit, Ctrl+drag duplicate, week nav, Today.

**Exceptions:** workstation (maintenance) and personnel (leave) markers.

**Engine:** Roster constrains who is qualified; capacity from shift templates.

## §4 Orders list

**Columns:** Order ID, External ID, phasing icon, production status icon, order number, description/group, customer, start eligibility, delivery, planned finish, priority.

**UX:** Column chooser, CSV export, filters.

**Gantt label:** `{orderNo}/{item} ({hours}h)`.

## §5 All timelogs

**Route:** Reporting → All timelogs.

**Table:** Accepted (supervisor), statuses, work number, step, workstation, workstage, product, person, begin/end, completed/faulty pcs, note.

**Actions:** Filters, bulk accept, audit log.

## §6 Reports

- **Job report** — step-level planned vs logged, ratio colours (green ≤1.0, yellow ≤1.2, red >1.2).
- **Order item report** — same at order-item grain.
- **Predicted vs realized** — apply actual averages as new default durations (audited, head planner).

## §7 Dashboard

Filters: workstation, group, date range, shift, employee.

Tiles: capacity, load, load factor gauge, jobs started/completed, hours logged, logged/capacity, active jobs per WS.

Charts: capacity vs load by day; efficiency per employee (hide zero-log rows).

## §8 Warehouse view

Planner Warehouse tab: products/materials from existing modules — stock, alert, negative red, usage history link.

## §9 Demo data

Fictional only: tube filling, ampoule lines, sFG quarantine workstage; realistic machine names pattern (not Lab & Allied literals).

## §10 Shell

Top bar: **Add new +** (order, product, workstation, shift). Home help hub (docs, videos, support contact).
