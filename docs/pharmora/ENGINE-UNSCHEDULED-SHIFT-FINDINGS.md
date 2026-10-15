# Engine findings — unscheduled jobs & shift calendar (pre-fix)

## 1. Unscheduled jobs (18 × "Routing / capacity issue")

### Root cause (primary)

Gantt demo **`productionOperation` rows are created without `routingOperationId`**, and product **`ProductRouting` from `seed-aps.ts` is only created when missing** — so many SKUs still have **short legacy routes** (e.g. Paracetamol: BLEND → COMPRESS → PACK only).

The finite-capacity pass in `getOperationsPlanner` builds each op’s `resources` **only** from `routingOperation.resources`. When that array is **empty**, `buildOperationSchedule` emits **`NO_QUALIFIED_RESOURCE`** even if `workstationId` is set on the row. Capacity is irrelevant; the UI message is wrong because `unscheduledReason()` maps any `issueCount > 0` to **"Routing / capacity issue"**.

### Step code vs machine code

Demo ops use codes **GRAN, COMP, PACK, COMPOUND, FILL, QC** while machines are **GRN-1/2, CMP-*, BLST-A/B, LIQ-FILL, QC-HOLD**. Migration `migrate-gantt-workstations.ts` maps codes for **legacy workstation remaps**, not for **scheduler qualification**. Qualification is DB **`routingOperationResource`**, not string matching.

### COMPOUND

**COMPOUND-1** (dedicated compounding vessel) was never seeded; syrup compounding was incorrectly tied to **LIQ-FILL** only in bulk templates.

### Material (BT-DEMO-003 / BT-DEMO-007)

Integrations material-delay signals use **`buildOrderMaterialConstraints`**. Blocked orders should surface **`MATERIAL_UNAVAILABLE`** in the engine, but unscheduled copy did not read material state per operation.

### Standard routings

Not applied to active routings because **`ensureApsDemoData` skips existing active routings**; bulk Gantt orders bypass routing entirely.

---

## 2. Jobs on Sunday / night grey bands

### Root cause

**Demo seed writes `plannedStart` / `plannedEnd` with `daysFromNow()`** — fixed UTC wall times, **not** `alignToCalendar` / `addWorkingMinutesOnCalendar`. Shading uses **`buildOffShiftBlocks`** from the same **`WorkCalendar`** as the engine (Mon–Sat 06–14 & 14–22 UTC per machine shift seed). **Bars reflect DB timestamps; grey reflects shifts** → Sunday/night bars with correct-looking grey.

The **scheduler** respects shifts when replanning; **persisted demo data** does not until realigned or accepted from a proposal.

### QC-HOLD shading

Row is **`elapsedOnly`** — off-shift blocks are skipped for that workstation in `getOperationsGanttSnapshot`. If shading still appears, verify `QC-HOLD` row flag.

---

## Fixes applied (code + seed)

See: `routing-resources.ts` (fallback qualification), `unscheduled-reasons.ts`, updated `seed-aps.ts` / `sync-demo-routings.ts`, `realign-demo-schedule-to-shifts.ts`, calendar verify script, Gantt UX carry-over.
