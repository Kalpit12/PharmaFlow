# Gantt — SkyPlanner-style visual language (PharmaFlow)

Dense APS planning workspace: grid-first, full-height, familiar to SkyPlanner users without copying trade dress. **Engine logic unchanged** — presentation and navigation only.

## Component tree

```
OperationsPage (full width, minimal page chrome)
└── OperationsPlannerShell [flex h-[calc(100vh-*nav*)] min-h-0]
    ├── PlannerIconRail [w-16 shrink-0]
    │   └── PlannerRailItem × 7 (icon + 10px label)
    └── PlannerMain [flex-1 flex flex-col min-w-0 min-h-0]
        ├── view !== gantt → existing *Workspace (plant, orders, …)
        └── view === gantt → OperationsGanttWorkspace
            ├── GanttToolbar [h-10 border-b]
            ├── GanttTimeline [flex-1 min-h-0 overflow-auto]
            │   ├── GanttTimeHeaderSticky [2 tiers: days + hours]
            │   ├── GanttGrid (vertical tick lines)
            │   ├── GanttGroupHeader [h-6]
            │   ├── GanttMachineRow [h-[34px] × N]
            │   │   ├── LabelCol [w-40]
            │   │   └── TrackCol (shift-green, maintenance hatch, freeze stripe, bars, now line)
            │   └── GanttFlowSvg (selected order only, red bezier)
            ├── GanttReschedulePill [fixed bottom-center z-50]
            └── GanttBottomOrderTable [default 30vh, resizable]
                ├── Tabs: Unscheduled · Scheduled · Late · Errors
                └── Dense table + action bar
```

**Global rules:** `PlannerGlobalRulesDrawer` opened from toolbar gear (not inline card).

## Measurements

| Token | Value |
| --- | --- |
| Icon rail width | 64px |
| Toolbar height | 40px |
| Group header | 24px |
| Machine row | 34px |
| Label column | 160px |
| Job bar height | 26px (4px vertical inset in row) |
| Bar radius | 3px |
| Now line | 1px `#D9142B` + 6px triangle in header only |
| Bottom table default | 30% viewport, min 120px |
| Floating pill | 12px vertical padding, 24px horizontal, shadow-md |

## Colour tokens (add to `globals.css`)

| CSS variable | Value | Use |
| --- | --- | --- |
| `--planner-slate` | `#4B5563` | Scheduled job fill |
| `--planner-slate-border` | `#374151` | Bar border |
| `--planner-shift-green` | `color-mix(in srgb, var(--success) 30%, transparent)` (~#C6F6C6 on light; teal-tinted on dark) | Shift availability band |
| `--planner-canvas` | `var(--pharmora-surface)` | Non-shift / canvas |
| `--planner-select-orange` | `#FF6A00` | Selected order highlight |
| `--planner-select-orange-border` | `#CC5500` | Selected bar border |
| `--planner-late-red` | `#D9142B` | Late jobs, flow arrows |
| `--planner-flow-red` | `#E11D48` | Bezier connectors |
| `--planner-grid-line` | `var(--pharmora-border-hairline)` | Vertical ticks |

Existing tokens reused: `--success` running green, prospect purple from chart-4, QC violet from chart-4 variant.

## Bar semantics

| State | Fill | Label |
| --- | --- | --- |
| Scheduled | `--planner-slate` | white 12px |
| Running | `#15803D` | white |
| Late | `--planner-late-red` | white |
| Selected (any step of order) | `--planner-select-orange` | white |
| QC hold | violet border + 15% fill | white |
| Changeover | 8–12px hatched block before bar | — |
| Ghost | dashed `--planner-slate` outline | — |

Label pattern: `{batchNo} ({duration}h) {product}` (truncate; tooltip full).

Warning badge: 6px red circle top-right when material short / late / hold risk (client flag from bar tone + material state passed on `GanttBar`).

## Interaction

- Click bar → `selectedOrderId`; all bars of order orange; red beziers between consecutive ops of that order only.
- Click track background → clear selection.
- Remove “Show flow” checkbox.
- Table row click → select order + scroll bar into view (`scrollIntoView` on track).

## Navigation rail

| Icon | View / href |
| --- | --- |
| Home | `/dashboard` |
| Resources | `?view=plant` |
| Orders | `?view=orders` |
| Warehouse | `/materials` |
| Production scheduling | `?view=gantt` (default) |
| Timer | `/execution/production` |
| Reporting | `?view=dashboard` |

Engine / import / API / integrations: under Resources submenu or `?view=settings` gear cluster (phase 2); MVP: keep `?view=engine|import|api|integrations|assistant` in rail overflow menu.

## Data (read-only extensions)

`OperationsGanttSnapshot` adds:

- `onShiftBlocks[]` — green shift windows (same shape as off-shift).
- `orderTableRows[]` — bottom tabs (from existing planner + unscheduled list).

No scheduler changes.

## Implementation status (2026-10-15)

- **Done:** `OperationsPlannerShell` (64px rail + overflow), full-bleed `/operations?view=gantt`, `GanttPlannerToolbar`, green `onShiftBlocks`, 34px rows / slate bars / orange selection / red flow beziers, two-tier header + red now line, `GanttReschedulePill`, resizable `GanttOrderBottomPanel`, global rules drawer, legend in `?` popover, capacity toggle.
- **Follow-up:** PNG export (camera stub), multi-select workstation filter, Autopilot dropdown wiring in pill, polish pill position when bottom panel resized.
