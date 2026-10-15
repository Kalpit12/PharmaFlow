# SkyPlanner Study & Operations Planner Build 

Oct 14, 2026 · @Kalpit Patel

## Summary

SkyPlanner is a finite-capacity scheduler: you model workstations, shifts, products and routings once, feed in orders, and an engine called Arcturus builds a live Gantt plan that respects capacity, materials, tools and weighted priorities. PharmaFlow already covers the inventory, materials, procurement, batch and quality side that SkyPlanner only touches lightly. What PharmaFlow lacks is the scheduling core: a resource model, a solver, a Gantt, and a shop-floor timer feeding actuals back.

The opportunity is sharper than a feature copy. SkyPlanner's Kenyan reference customer is Laboratory & Allied, Kenya's largest indigenous pharma manufacturer, and it runs SkyPlanner beside SAP Business One plus Power BI. PharmaFlow can offer the same scheduling inside one tenant, with GMP concepts SkyPlanner does not model: line clearance, cleaning changeovers, QC quarantine, batch release gates and expiry-aware materials.


## How SkyPlanner works end to end

SkyPlanner runs one loop: describe production once, keep orders flowing in, let the engine schedule, then let shop-floor logs correct the plan. Nothing is scheduled by hand unless the planner chooses to.

&#91;embedded content: SkyPlanner planning loop · 4 inputs, 1 engine, 3 stages\]

1. **Model production once.** Workstations (a machine, a person, a room or a subcontractor, each with its own queue), recurring shifts, people, products with ordered process steps, sub-products, materials and tools.
2. **Bring orders in.** Typed, imported from CSV, or pushed from an ERP through the REST API. An order needs only product, quantity and due date; the product's routing generates the jobs.
3. **Schedule.** Arcturus builds a finite-capacity plan inside shifts, setup times, materials, tools and step dependencies, steered by weighted Global Rules. Reported speed: a three-month plan for about 50 workstations in under 30 minutes from order entry at Laboratory & Allied.
4. **Review and steer.** The planner compares the new plan with the old one (ghost jobs), drags or locks jobs, freezes the next hours, and accepts.
5. **Execute.** Operators see their workstation queue on a phone or tablet and start, pause and complete jobs with quantities.
6. **Replan.** One click on Reschedule all, or Autopilot replans on every meaningful change while locks still hold. Logged hours also refine future step-duration estimates.

## Video catalogue

The video room holds 38 videos: one \~50-minute full demo, a 4-minute overview, and topic tutorials grouped into six stages of the planning journey.

**Full demo chapters (\~50 min)**

| Start | Chapter | What it covers |
| --- | --- | --- |
| 0:00 | About the Company | Skycode Oy (Vaasa, Finland, building SkyPlanner since 2018) and the APS problem |
| 10:30 | GANTT Timeline | The core of the demo (\~26 min): workstation rows, jobs, capacity, AI scheduling, Reschedule all |
| 36:39 | React for Changes | Replanning when rush orders, delays or breakdowns hit |
| 38:33 | Timer | Operator time logging on the shop floor |
| 43:10 | Pricing | Per-workstation pricing |
| 44:35 | Our Services | Assisted onboarding, customization, integration help |

**The six stages and their videos**

| Stage | Tutorials in the library |
| --- | --- |
| 1. ERP / MES data | Integrate to any ERP or MES (4:55); Using the CSV import tool (3:30) |
| 2. Orders and products | Create orders and send to scheduling (3:20); Add a new product and process steps (4:18); Subproducts explained (5:02); Adding subproducts and sub-items (3:40) |
| 3. Capacity and workstations | Workstations, capacities and maintenance (6:12); workstation groups; efficiencies; personnel, roles and default shifts; overtime; leave times |
| 4. AI rules and priorities | Customer priority with Dynamic Priorities (4:30); Fast Track urgent orders (2:30); Similar jobs in succession (\~5 min); job priorities; reduce lead time; prioritize completion dates; JIT |
| 5. Gantt scheduling | SkyPlanner: the basics (4:10); GANTT timeline basics (5:30); running timelock; bulldozer; unscheduling; split jobs; minimum degree of manufacturing; assembly jobs (4:22) |
| 6. Shop-floor feedback | Production Timer (3:50); ShopFloorApp and Timer; quick log mode; quick notes on a step |

The library filters by role (Planner, Operations, IT/ERP, Executive, Partner, Shop floor), stage, topic, format and length. That role-based learning path is itself worth copying for PharmaFlow onboarding.

## Feature reference

Every feature below appears in SkyPlanner's tutorials or help docs; grouped the way PharmaFlow would build them.

### 1. Resource and product model

| Entity | What it holds | Notes |
| --- | --- | --- |
| Workstation | One resource with its own job queue: machine, person, room or subcontractor | Shown as one Gantt row; pricing is per workstation |
| Workstation group | A named set of workstations | Grouped and collapsible on the Gantt; a step can target the group |
| Workstation efficiency | A pace coefficient per station, worker or shift | A faster line finishes the same job in less scheduled time |
| Workstation exception | A one-off change to capacity: breakdown, holiday, overtime | Also settable via API per workstation or person |
| Maintenance | Planned downtime per workstation; preventive maintenance for all at once | Blocks capacity |
| Default shifts | Recurring weekly shifts (e.g. morning, evening) | Exceptions on the calendar; people assigned per shift build rosters |
| Personnel registry and departments | Employees, departments, employee groups linked to workstations | Leave times and overtime affect capacity |
| Customer | Name plus default priority | Feeds the customer-priority rule |
| Process step | A named operation and the workstations allowed to run it | Setup and teardown times; duration per unit |
| Product | Ordered process steps, materials (BOM), tools, properties, min production quantity, price per unit | Usage-history chart per product |
| Sub-product | A component product with its own routing that feeds the parent | Nested hierarchies are scheduled bottom-up |
| Tool / mold | Shared resource assigned to workstations and products; has maintenance and a broken flag | Cannot be in two places at once |
| Property | Tag on a product (colour, material, tool, dimension) | Drives similar-jobs grouping per workstation |

A visual routing editor draws products and whole projects as cards (steps) joined by arrows (order), with sub-products merging into the parent.

### 2. Orders

- **Order and order items:** customer, due date, items with product and quantity; ordered quantity vs production quantity.
- **Job prospect (sales simulation):** a quote scheduled against real load to get a realistic delivery date; optional capacity reservation; converted to a firm order with one status change; shown in its own colour.
- **Assembly jobs (batch / nesting):** parts from several orders combined into one production run to save setups.
- **Attachments:** files on an order, visible to the operator in the Timer.
- **Archive and filter** orders; per-order task list (each step, its workstation, start, end, duration).

### 3. Scheduling engine and rules

**Global Rules** (head user only) hold the switches and the weighted priority sliders:

| Rule | What the engine does |
| --- | --- |
| Lead time | Minimises time from first step start to last step end for every item |
| Jobs ordered by completion date | Earliest due date first, even if others go late |
| Every job completed in time | Maximises the number of on-time items, may sacrifice one for many |
| Customer priorities | Avoids delaying high-priority customers |
| Job priorities | Avoids delaying jobs flagged important (right-click a step) |
| Close to start eligibility dates | Starts jobs as near as possible to their earliest-start date |
| Similar jobs in succession | Runs jobs sharing a property back to back to cut changeovers |

Each rule is a slider, not an on/off switch, so the planner tunes trade-offs. Other global switches: Consider the materials, Consider eligibility dates, Running time lock.

**Job rules** (per order or step): prohibit changes (lock), JIT for one order (schedule backward from the due date), order priority, split a job across several workstations, Fast Track (jump the queue), lock a step to a specific workstation.

**Workstation rules:** a running time lock per station, allow moving jobs to a more appropriate station (alternative workstations), and which property a station groups by.

**Scheduling mechanics:**

- Finite capacity: a station is never overbooked.
- Step dependencies, with a minimum degree of manufacture (the next step may start when the previous one is, say, 10% done).
- Setup and teardown times, sequence-optimised.
- Forward from today or backward from the due date.
- Material-aware: projected stock from stock, POs, reservations and consumption; a late delivery pushes the job to when material arrives.
- Subcontractors scheduled as workstations.
- **Reschedule all** ("the King button"), reschedule one workstation, unschedule one item or everything.
- **Autopilot:** replans automatically on meaningful changes (new orders, completed work, capacity breaks, material delays); does nothing when nothing changed; locks always hold.
- **Running time lock:** freezes the next N hours so the floor is not disrupted.
- **Bulldozer:** pushes unstarted work that slipped into the past forward to now.
- **Ghost jobs / schedule comparison:** the previous plan shown in white behind the proposed plan in blue, awaiting acceptance.
- **Duration prediction:** step times learned from logged history.
- The engine is not trained on customer data.

### 4. Gantt timeline

- One row per workstation, grouped; hide or show single stations or groups.
- Job bars colour-coded: scheduled (dark blue), selected (orange), late (red), running (configurable), prospect (configurable).
- Dependency arrows show job flow across stations; a current-time line; zoom; search.
- Capacity graph per workstation, with separate red and blue capacity states documented; overlapping capacities can be combined or split.
- Drag-and-drop to move a job or change its station; edit job details; quick notes on a step for operators; show the person on running jobs.
- Workstation queue as a list.

### 5. Warehouse, materials and purchasing

- Products and materials with cumulative stock, alert thresholds, negative balances highlighted red.
- Inventory transactions, each typed and marked with an icon.
- Purchase orders and items with suppliers and expected dates; these feed projected stock.
- Materials edited per order; activate or deactivate items.

### 6. Shop floor (Timer / Time Logs)

- Per-operator work queue for their stations in scheduled order, on phone, tablet or a shared screen.
- One-tap start, pause, stop; confirm produced quantity; adjust logged time.
- Quick log mode for minimal-input logging; option to disallow logging on several jobs at once.
- Attachments and quick notes visible at the machine.
- Every log updates progress and the schedule in real time.

### 7. Reports and dashboards

- Drag-and-drop widget dashboards, one or many per user, any date range; can run on a shop-floor TV.
- Widgets include capacity and load hours, load factor, jobs started and completed, logged vs capacity, active jobs, late jobs, planned vs actual efficiency, delivery reliability, OEE, quality.
- Fixed reports: job report, all timelogs report, order item report.

### 8. Users and roles

| Role | Access |
| --- | --- |
| User | Timer only: their jobs, shifts and own reports |
| Admin | Most features, but not Global, Job or Workstation rules |
| Head user | Everything |

Machine views can be limited so each user sees only their department's equipment.

### 9. Integrations

- Works standalone; CSV import for orders, products and materials.
- Open REST API (orders, order items, products and materials, scheduled step timings and workstations, timelogs, workstation and person exceptions) and webhooks out.
- Data in: orders, products and structures, materials and stock, customers and due dates. Data out: planned start and end, timelogs, progress, schedule updates.

### 10. SkyPlanner Agent (beta)

A chat assistant that performs tasks on request (create an order, check status, schedule unscheduled jobs), reports exactly what it changed, explains features and helps with configuration, in the user's language. 29 interface languages overall.

## Pricing and the Kenyan pharma customer

SkyPlanner starts at 199 EUR a month with 5 workstations included, priced per extra workstation; a 30-day trial covers self-onboarding up to 20 workstations, larger setups go through paid assisted onboarding. Your own pricing page already benchmarks against this (about KSh 29,000 a month for 5 workstations).

**Laboratory & Allied, Nairobi** is the case that matters most for PharmaFlow:

| Item | Detail |
| --- | --- |
| Company | Kenya's largest indigenous pharma manufacturer, founded 1968, \~1,000 staff (\~800 in production), WHO-GMP plant, \~300 registered products |
| Dosage forms | Tablets, capsules, sterile injectables, syrups, creams, inhalers |
| Before | Excel plus planners' intuition; sales had to ask production for dates; jobs ran out of priority order; stock built up |
| Alternative rejected | An SAP add-on, because ERP extensions are not built for scheduling |
| Stack | SkyPlanner + SAP Business One on HANA + Power BI, integrated largely by their own IT |
| Setup | Machine views limited per department |
| Reported results | +90% production efficiency, +50% on-time delivery and customer reporting, a three-month plan across all workstations in under 30 minutes |
| What sales gained | Each order tracked through blending, production and quarantine to expected delivery, without calling production |

Two lessons for PharmaFlow. First, a Kenyan pharma buyer needed three products (ERP, APS, BI) to get this picture, which is exactly the stack PharmaFlow's one-licence pitch targets. Second, the stages they track (blending, production, quarantine) show that pharma routings need QC hold steps, which a generic APS treats as ordinary jobs.

Sources: [SkyPlanner videos](https://skyplanner.ai/videos/) · [Features](https://skyplanner.ai/features/) · [Docs](https://skyplanner.ai/docs/) · [Video Guides](https://skyplanner.ai/docs-category/video-tutorials/) · [Dynamic priorities](https://skyplanner.ai/docs/dynamic-priorities/) · [Ghost jobs](https://skyplanner.ai/docs/what-are-ghost-jobs/) · [User roles](https://skyplanner.ai/docs/type-of-user-roles/) · [Laboratory & Allied story](https://skyplanner.ai/customers/laboratory-allied/) · [PharmaFlow](https://pharmaflow-sage.vercel.app/)

## Gap analysis vs PharmaFlow

PharmaFlow should build the scheduling core and the shop-floor loop, reuse what it already has for materials and quality, and add the GMP constraints SkyPlanner leaves generic. This is based on PharmaFlow's public site; the live app behind sign-in was not reviewed.

| SkyPlanner capability | PharmaFlow today (public site) | Operations Planner action |
| --- | --- | --- |
| Workstations, groups, shifts, exceptions, maintenance | Not shown | Build |
| Products with routings, sub-products, setup times | Batches and materials exist; no routing shown | Build routings on top of existing products |
| Finite-capacity engine with weighted priorities | Not shown | Build (core) |
| Gantt with drag, lock, compare | Not shown | Build (core) |
| Reschedule all / Autopilot | Not shown | Build as "propose, then a person approves" |
| Material-aware scheduling | Materials MRP, net vs plan already exists | Reuse: feed projected availability into the engine |
| Purchase orders feeding projected stock | RFQ, PO, receiving exist | Reuse: PO expected dates become material arrival events |
| Shop-floor timer and quick log | Execution queue for approvals only | Build operator view |
| Sales prospects / delivery-date quotes | Not shown | Build |
| Dashboards and reports | Command Center, Daily Review, reports | Extend with capacity, load, OEE, on-time |
| Roles | Tenant-scoped, human approval | Map to planner, supervisor, operator, QA |
| REST API, webhooks, CSV import | Not shown publicly | Build CSV first, API second |
| AI agent that acts | Explain-on-request AI that never acts | Keep the principle: agent drafts, person approves |

**Pharma-specific additions SkyPlanner does not model** (the differentiators):

- **Cleaning and changeover matrix.** Sequence-dependent cleaning time between products on the same equipment (minor clean within a campaign, major clean between APIs, extra for potent or allergenic products). This is the pharma version of similar-jobs-in-succession.
- **Campaign scheduling.** Group batches of the same product or strength into a campaign before a major clean, with a max campaign length.
- **Line clearance as a step.** A scheduled, signed step before each new batch starts on a line.
- **QC hold and release.** Quarantine as a timed step with no workstation load; downstream packing or dispatch waits for the release decision in PharmaFlow Quality.
- **Hold-time limits.** Maximum time allowed between steps (e.g. granulation to compression, bulk to filling), treated as hard constraints.
- **Fixed batch sizes.** Order quantity converted into whole batches at the validated batch size; partial batches flagged.
- **Equipment status.** Equipment must be qualified, calibrated and cleaned (clean-hold expiry) to be schedulable.
- **Operator qualification.** Only trained operators can be rostered on a step.
- **Room and area constraints.** Shared rooms or suites (e.g. a dispensing booth) as capacity resources.
- **Expiry-aware materials.** FEFO allocation of material lots to batches, with shelf-life left at release checked against customer requirements.
- **Batch genealogy.** Each scheduled batch links to lots consumed and orders served, completing PharmaFlow's partial traceability.
```
