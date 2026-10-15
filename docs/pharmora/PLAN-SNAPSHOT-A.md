# Section A — Plan snapshot findings (before seed/data changes)

Single source of truth target: `getPlanSnapshot(tenantId, window, planVersion?)` in `src/lib/server/plan-snapshot.ts`.

## Why surfaces disagree today

| Symptom | Root cause |
|--------|------------|
| Gantt review bar **41 jobs moved** vs Planner engine **0 moved** | Gantt `diffSummary.jobsMoved = max(order-level diff rows with `changeMinutes !== 0`, bars with ghost)`. Engine shows **`summary.movedOrders`** from `summarizeProposal`, which **excludes any order with `isLocked` true** and counts **orders**, not operations. Stale plan summary in DB can also diverge from live `schedulePlanOperation` rows. |
| **CMP-2 ~42.9h load, no bars** | Row load uses **all DB ops** clipped to the Gantt window (`scheduledOperationMinutesInWindow`). Bars are the same source but **scoped to planner access**, clipped to window, and drawn on **proposed** workstation when a ghost exists. Ops on inactive/legacy workstation IDs, or ops only partially in window, can inflate load while bars look empty. Changeover minutes on ops use **`setupMinutes` in the Gantt path**, not always `changeoverMinutes` from the engine pass. |
| Dashboard **4 started / 0 late** vs Gantt **no running, several late** | Dashboard **started** = orders with `status === IN_PROGRESS` **or** `plannedStart` in dashboard window (`operations-dashboard.ts`) — not operation timers. **Late** = order `displayStatus === AT_RISK` from **finite forward pass** in `getOperationsPlanner`, not Gantt `toneForOperation` (no **open START timelog**). Gantt **late** = planned start &lt; now and op not IN_PROGRESS, or planned end &gt; due. |
| Integrations **2 material-delayed** vs engine **0 material-blocked / 0 at-risk** | Integrations: `buildMaterialDelaySignals` (material constraints vs planned start). Engine proposal: **`materialState === "BLOCKED"`** on order snapshot only; **at-risk** in integrations uses **`displayStatus === AT_RISK`**, engine **`lateOrders`** uses **proposed finish &gt; due** on proposal. Different thresholds. |
| Capacity **7% vs 38%** | **Different windows** (Gantt default week vs planner **2 weeks**), **Gantt shift calendars** vs planner **`utilizationPercent` on simulated `operationPlan`**, and **average vs single line** (CMP-2 vs avg capacity KPI). |

## Status rules (canonical — Section A implementation)

Apply **`resolveJobPlanStatus`** everywhere (Gantt tone, dashboard counts, snapshot KPIs):

1. **Running** — open production timelog (`ProductionOperationEvent` START without later STOP on same op) **or** op status IN_PROGRESS/PAUSED.
2. **Late (job)** — planned start &lt; now, not running, not completed.
3. **At-risk (order)** — order planned finish (last op end) &gt; due date; jobs inherit at-risk for display when order qualifies.
4. **Completed / QC hold / prospect** — unchanged semantics from routing flags and order kind.

## Changeover

Engine applies matrix in `buildOperationSchedule` / optimizer (`changeoverMinutes` on scheduled ops). Gantt currently shows **`setupMinutes`** on live bars and proposal **`changeoverMinutes`** on ghosts only; dashboard changeover sums **`operationPlan.operations.changeoverMinutes`**. Snapshot should sum **engine changeover minutes on ops intersecting the window** (DB + active proposal).

## Locks — why “13 orders locked”

`operationIsCommitted` (correct per op): manual **`order.isLocked` / `operation.isLocked`**, IN_PROGRESS/PAUSED/COMPLETED, or **`isOperationFrozen`** (op `plannedStart` &lt; `freezeUntil`).

**Proposal rollup bug:** `buildProposedOrderChanges` sets **`isLocked: order.isLocked \|\| frozen`** where **`frozen`** uses **order-level `previousStart` &lt; freezeUntil** — that marks the **whole order** frozen when **any** early start is inside the running-time lock, even if later ops could move. `summarizeProposal.lockedOrders` counts orders with that flag → often **~13** on demo data with default freeze window.

**Intended (A.4):** only operations whose **own** planned start falls inside the running-time lock window are frozen; manual order lock remains explicit.

## Ghost overlay vs “moved” count

Ghost when **`schedulePlanOperation`** proposed times/ws differ from DB. **`jobsMoved`** must equal **count of ops with ghost**, not order-level diff alone. Order-level `changeMinutes` can be 0 while ops move (or vice versa).

## Consumers to wire to `getPlanSnapshot`

- `getOperationsGanttSnapshot` — load, diff summary, statuses, proposal metrics  
- `getOperationsDashboardSnapshot` — started / late / changeover / utilization  
- `getPlannerIntegrationSnapshot` — at-risk, capacity, material-blocked count aligned with snapshot  
- `getPlannerEngineSnapshot` — proposal summary from live recompute  
- `getCommandCenterSnapshot` — via operations KPIs from snapshot  

No demo seed or order renumbering in Section A (sections C/E).
