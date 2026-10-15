# ADR: Operations planner engine (Phase 3)

## Context

PharmaFlow needs a deterministic finite-capacity scheduler (SkyPlanner / Arcturus parity) with GMP hard constraints and weighted global rules. The stack is Next.js + TypeScript on Vercel with Prisma/Postgres.

## Decision

Keep the **TypeScript heuristic scheduler** in `src/lib/operations/routing.ts` plus a **local-search optimizer** in `schedule-optimizer.ts` (order permutations and alternate qualified resources). Do **not** introduce a separate Python OR-Tools service in Phase 3.

## Rationale

- Same runtime as existing APS APIs (`proposeRescheduleAll`, schedule plans, material constraints) — no extra deploy unit or cold-start latency on Vercel.
- Tenant isolation and audit stay in one codebase.
- Phase 3 acceptance targets **two weights** (due date, changeover) and **hard GMP checks** first; OR-Tools CP-SAT remains an option if solve time or scale outgrows the heuristic (500+ batches / 50 lines).

## Consequences

- Optimizer quality is heuristic, not globally optimal.
- Long solves should move to background jobs (already planned in spec) before Phase 4 Gantt at full plant scale.
- GMP rules (qualification, clean hold, max hold, QC elapsed hold, campaign length) are enforced in scheduling and post-validation, not by the solver alone.
