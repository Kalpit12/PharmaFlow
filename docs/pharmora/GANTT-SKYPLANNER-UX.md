# Gantt — SkyPlanner planning view (UX design)

## Goal

Match SkyPlanner’s primary **planning timeline**: sticky time scale, dense job bars, capacity load per line, ghost comparison in the **same lane**, and planner actions without leaving the Gantt.

## Data & window

- **Zoom presets** (`8h`, `day`, `week`, `month`, `quarter`) map to `[windowStart, windowEnd]` via `resolveGanttWindow` (URL: `?ganttZoom=week&ganttStart=YYYY-MM-DD`). Default **`week`**.
- **Capacity load** = sum of scheduled operation minutes on a workstation in the window ÷ **shift-available minutes** (shifts minus calendar exceptions), not order-level rollup.
- **Bars** = one `ProductionOperation` with batch label (`ProductionBatch.batchNumber` or order number), product, step code.
- **Late** = `plannedStart < now` and operation not `IN_PROGRESS`/`PAUSED`/`COMPLETED`. **Running** = active timer / in-progress operation.
- **Ghost** = when a PROPOSED plan exists, for each changed operation render **current** plan as faint outline **behind** the **proposed** solid bar (same row, same vertical slot).
- **Flow arrows** = client SVG between consecutive steps of the same order (toggle).
- **Blocks** = hatched changeover interval before a job; grey maintenance from `WorkstationCalendarException`.

## Interactions

- **Drag** any operation bar → `POST /api/schedule-plans/propose-move` with `operationId` (server validates WS, lock, freeze, qualified resources, then `proposeRescheduleAll`).
- **Bulldozer** → existing `POST /api/schedule-plans/actions` `{ action: "BULLDOZER" }`.
- **Context menu** → lock/unlock (order), priority, fast track, split (stub), note (localStorage stub), task list (scroll to diff / orders tab).
- **Accept/Reject** disabled unless proposal status `PROPOSED` and diff non-empty; Accept is primary.

## Layout

- Rows grouped by `WorkstationGroup` (collapsible); department label on group header.
- Shop floor link → icon on row hover (not permanent text).
- Sticky left column (labels) + sticky top time header; horizontal scroll for timeline.

## Global rules (Gantt)

- Collapsible **Global rules** panel on the Schedule tab (`PlannerGlobalRulesPanel`, compact variant): five primary weight sliders, **running time lock** (freeze minutes + amber band on the timeline), and **Autopilot** mode select. Saves via `PATCH /api/planning-policy` (requires `production.global_rules`). Full weight set remains on **Planner engine** tab.

## Demo seed

`prisma/seed-gantt-demo.ts` → `ensureGanttSkyPlannerDemoSeed` (wired from `ensure-verify-prerequisites.ts`). Machine codes: DISP, GRN-1/2, FBD, BLND, CMP-1..3, COAT, ENC, BLST-A/B, LIQ-FILL, QC-HOLD. Showcase orders `GANTT-SHOW-001` (multi-step, running compress, QC hold step, changeover) and `GANTT-LATE-002` (late pack on BLST-B). Prospects remain from `seed-operations` phase-2. Local run: `npx tsx scripts/run-gantt-seed.ts`.
