# Pharmora — Design system

## Intent

Premium, calm, precise pharmaceutical operations UI. A purpose-built control room — not a generic SaaS dashboard, admin template, or analytics clone.

Inspiration for craft only (Aura-style premium composition, editorial type, restrained surfaces). Do not copy templates, branding, layouts, or identity.

## Visual system 2.0 (Phase 29)

Position: **Pharmaceutical Operations Command System** — industrial control room density, premium enterprise craft, Bloomberg-like information hierarchy, pharmaceutical precision. Not generic SaaS, CRM chrome, Power BI clone, or marketing glass.

- **Graphite** foundation and navigation (`#0B0D0F`)
- Cool neutral workspace surfaces (`#111418` / `#171B20` / `#1D2228`)
- Accent for active state, selection, intelligence, and interaction — never decoration (`#5B8CFF`)
- Hairline borders, controlled contrast, minimal radius (`--radius` 3px)
- Shared surfaces (`.work-surface`, `.ops-table`, metric strips) instead of card grids
- Strong typography hierarchy (IBM Plex Sans); dense, readable data; tabular metrics
- Management Attention signature: **Signal → Evidence → Consequence → Inspect**
- Detail sheets: **Identity · Status · Key metrics · Context · History · Actions** via `InspectionSection`

Avoid: oversized rounded cards, pills, gradients, glassmorphism, glow, decorative illustration, “Good morning” copy, AI sparkle panels.

## Pharmora Color System 2.0 (Phase 29.1)

Direction: **premium pharmaceutical intelligence**. Graphite → cool surfaces → white typography → blue intelligence → teal operations → amber material risk → restrained red exceptions.

Dark graphite is the primary identity (`defaultTheme="dark"`). The light "paper" theme is kept for analytical readability and mirrors the same roles with contrast-safe accent values.

### Palette (dark, canonical)

| Token | Value | Role |
| --- | --- | --- |
| `--pharmora-background` | `#0B0D0F` | App canvas, navigation rail |
| `--pharmora-surface` | `#111418` | Primary workspace surfaces, inputs |
| `--pharmora-surface-elevated` | `#171B20` | Panels, popovers, inspection surfaces, hover |
| `--pharmora-surface-subtle` | `#1D2228` | Selected/secondary wells — used sparingly |
| `--pharmora-text` | `#F5F7FA` | Primary text and metric values |
| `--pharmora-text-secondary` | `#A7AFB8` | Supporting text |
| `--pharmora-text-muted` | `#727B86` | Labels, metadata, placeholders |
| `--pharmora-border` | `#272D34` | Structure |
| `--pharmora-border-hairline` | `#20262C` | Nav / low-contrast separation |
| `--pharmora-primary` | `#5B8CFF` | Intelligence blue — interaction only |
| `--pharmora-secondary` | `#39C6B0` | Operational intelligence teal |
| `--pharmora-material` | `#D6A85F` | Pharmaceutical material signal (amber) |

Light theme paper surfaces: `#F4F5F2` canvas, `#E9ECE8` subtle, `#15191D` text.

### Semantic roles

| Token | Dark value | Use |
| --- | --- | --- |
| `--success` | `#43C59E` | Completion, healthy state |
| `--warning` | `#E4B95A` | Capacity / process warnings |
| `--danger` | `#E06A6A` | Risk, exceptions, destructive |
| `--info` | `#6EA8FF` | Informational status |

Tailwind exposes `intel` (teal) and `material` (amber) as first-class colour utilities alongside the shadcn tokens. `StatusTone` gained matching `"intel"` and `"material"` members.

Domain mapping: inventory healthy → intel, low/expiring → material, critical → danger. Operations planned → neutral, active → blue, on-schedule/completed → intel, at-risk → danger. Procurement draft/review → neutral, RFQ/responses → info, evaluation → primary, awarded/receiving → intel, discrepancy → material.

### Chart palette

`--chart-1` `#5B8CFF` primary · `--chart-2` `#39C6B0` secondary · `--chart-3` `#D6A85F` material/procurement · `--chart-4` `#A78BFA` analytical comparison · `--chart-5` `#E06A6A` risk · `--chart-6` `#8D99A6` neutral reference.

Series are also differentiated by stroke weight and dash pattern, never colour alone. Do not use a colour per dataset simply because datasets exist.

### Usage rules

- Accent should stay roughly 5–10% of any screen. If blue dominates, remove blue — do not add another colour.
- Colour is for risk, status, interaction, selected state, and important change. Everything else is neutral.
- Navigation: transparent by default, `#171B20` hover/active, thin `#5B8CFF` active marker — never a fully blue nav item.
- Tables: neutral rows, `#171B20` hover, faint blue-tinted selection, semantic colour only in status cells. Never colour a whole row.
- Metric strips: neutral by default; `primary`/`success`/`material`/`danger` tones only when the number itself carries the signal.
- Attention: LOW neutral, INFO blue, WATCH/MEDIUM amber, HIGH danger, CRITICAL danger with a thicker indicator. The information stays dominant.

### Accessibility

- Body and secondary text meet ≥4.5:1 on their surfaces; muted metadata is reserved for non-essential text at ≥3:1.
- Never rely on colour alone — every severity, status, and risk state also carries a text label, badge, or indicator.
- Focus is a 2px `--ring` outline, no glow.

### Forbidden

Purple/blue gradients, neon, glowing borders, glassmorphism, AI sparkle effects, raw Tailwind palette classes (`blue-500`, `green-600`, …), and hex values inside components. All colour flows through the `--pharmora-*` tokens in `src/app/globals.css`.

## Charts (Phase 30)

Deterministic SVG visualizations in `src/components/charts/*` — no third-party chart library.

| Component | Use |
| --- | --- |
| `LineComboChart` | Revenue + orders time series (primary analytical surface) |
| `HorizontalBarChart` | Product/region/capacity comparisons |
| `GroupedBarChart` | Production planned vs actual |
| `StackedPercentBar` | Inventory health composition |
| `FunnelChart` | Procurement pipeline stage counts |

**Palette:** `--chart-1` primary · `--chart-2` teal · `--chart-3` material · `--chart-4` comparison · `--chart-5` risk · `--chart-6` reference. Series also use stroke weight/dash — never colour alone.

**Data flow:** Prisma/services aggregate on the server (`command-center-analytics.ts`, `analytics.ts`, `reports.ts`) → typed snapshot → chart component. No mock chart data. Chart clicks navigate to existing workspace routes only.

**Hierarchy:** one dominant chart, supporting charts, detail tables. Command Center = management decision canvas, not a chart gallery.

## Typography

- **UI sans:** IBM Plex Sans — industrial, compact, clinical.
- **Mono:** Geist Mono — reserved for code-like strings if needed; metrics use `tabular-nums` on the UI sans.
- **Context labels:** 10px, wide tracking, uppercase (`.label-context`)
- **Page titles:** ~22–24px, medium weight, tight tracking — not marketing display
- **Metrics:** large tabular numbers (`.metric-value`)
- **Tables:** 13px body, 10px uppercase headers, compact rows

## Surfaces

- `.work-surface` — hairline panel, not a floating card
- `.gantt-canvas` — uninterrupted planning instrument (Phase 31: conflict rings, material readiness cues, canonical capacity tones)
- Metric strips (`.border-y`) instead of identical KPI boxes; planning strip uses tabular counts (scheduled, at risk, utilization, material shortage, over-capacity, planned quantity)
- Inspection: right-side sheet on desktop, bottom sheet on mobile

## Command UX

- Command Center is the primary daily operating surface.
- Management Attention: domain → severity → issue → evidence → destination (`AttentionItem`).
- Cross-domain trails and process trails (Need → RFQ → PO → Receiving).
- AI is explain/interpret only — never decorative.

## App chrome

- Sidebar: quiet control rail, section labels, electric-blue active mark
- Topbar: tenant / domain context, search, operational UTC stamp, session
- Page headers: CONTEXT · title · one-line operational statement · actions

## Elevation

Hairline borders first. Shadows only for overlays (dropdown, dialog, command). No glassmorphism stacks, no neon.

## Component layers

1. **Primitives (`src/components/ui`)** — shadcn/ui: button, input, select, dialog, etc.
2. **Patterns (`src/components/ds`)** — AttentionItem, MetricStrip, ProcessTrail, StatusBadge, EmptyState, Work surfaces.
3. **Layout (`src/components/layout`)** — AppShell, Sidebar, Topbar, PageHeader, WorkspacePage.
4. **Search (`src/components/search`)** — GlobalSearch, CommandPalette, SearchResults.

## Motion

Panel/drawer transitions, hover emphasis, active nav, small state changes. No bouncing, parallax, floating cards, or constant motion.

## Responsive

Test at 1440 / 1280 / 1024 / 768 / 390. Persistent sidebar ≥1024px; icon rail 768–1023px; drawer &lt;768px. Touch targets ≥44px on small screens. Tables transform or scroll. Sheets become bottom sheets. No page-level horizontal overflow.

## Accessibility

Semantic controls, visible focus rings (`--ring`), contrast on both themes, headings in order, ARIA only when native semantics are insufficient.

## Do not

Hard-code colors in components, add animation libraries, ship generic admin-template chrome, or wrap every metric in its own card.
