# SkyPlanner parity — Lab & Allied reference (PharmaFlow)

Layout and behaviour reference from a live SkyPlanner install. **Do not copy** customer names, staff, orders, or stock into demo or sales material.

## Priority (client value)

1. **§3 Workstation scheduling (roster)** — week grid, operators on shifts, exceptions.
2. **§5 All timelogs** — supervisor accept, faulty pcs, filters.
3. **§6 Job report** — planned vs logged, difference ratio colours.

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

**UI:** CRUD table + colour swatch. Seed: Day 08:00–17:30 Mon–Fri, Night 18:00–06:00, Saturday 08:00–17:30, QC 24h.

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
