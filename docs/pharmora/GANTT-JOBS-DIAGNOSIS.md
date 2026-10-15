# Gantt empty timeline — diagnosis (Oct 2026)

## What we found

1. **Workstation mismatch** — All scheduled `ProductionOperation` rows pointed at **legacy line codes** (`TLA`, `TLB`, `PLA`, `PLB`, `CLA`, `LLA`). Machine-level rows (`DISP`, `GRN-1`, `CMP-1`, …) had **zero** assignments, so the Gantt showed 0% load on every machine row.
2. **Display source** — Bars were built from the **forward-pass planner** (`buildOperationSchedule`), which recomputes times on each request. That often cleared or moved jobs outside the visible week even when the DB had valid `plannedStart` / `plannedEnd`. The Gantt now renders from **persisted operations** and uses proposals only for ghost overlays.

## Fix applied

- `prisma/migrate-gantt-workstations.ts` — remaps legacy workstation IDs to machines by operation code, updates routing resources, deactivates legacy lines.
- `prisma/seed-gantt-demo.ts` — machine groups, Mon–Sat two-shift calendar (06:00–14:00, 14:00–22:00 UTC), bulk demo orders, migration on every run.
- `getOperationsGanttSnapshot` — bars and capacity from DB operations.

## Local refresh

```bash
npx tsx scripts/run-gantt-seed.ts
```

Then in **Operations → Schedule (Gantt)** use **Reschedule all** (or accept an engine proposal) to align the engine with migrated data.
