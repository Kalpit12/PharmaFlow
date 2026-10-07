export const TRUST = [
  "Manufacturers",
  "Distributors",
  "Medical suppliers",
  "Kenya-first",
  "Human approval",
] as const;

export const MODULES = [
  "Command Center",
  "Daily Review",
  "Inventory",
  "Materials",
  "MRP",
  "Procurement",
  "RFQs",
  "Purchase orders",
  "Receiving",
  "Batches",
  "Quality",
  "Traceability",
  "Forecast",
  "Scenarios",
  "Execution",
  "Reports",
  "Suppliers",
] as const;

export const ROTATING = ["inventory", "materials", "procurement", "quality", "traceability"] as const;

export const QUOTES = [
  {
    quote: "Daily Review replaced the Monday scramble. We open with lots, shortages, and POs that need a person.",
    role: "Plant manager",
    city: "Nairobi",
  },
  {
    quote: "RFQs and purchase orders sit on the same trail as the shortage. Finance sees KSh committed without chasing threads.",
    role: "Procurement lead",
    city: "Mombasa",
  },
  {
    quote: "Expiry is a named lot, not a rumour. That is the difference for QA on a packing line.",
    role: "Quality operations",
    city: "Kisumu",
  },
] as const;

export const FAQ = [
  {
    q: "Does Pharmaflow replace our ERP?",
    a: "No. Pharmaflow is the operating picture across inventory, materials, procurement, and production. It sits beside your ERP — it does not pretend to replace it overnight.",
  },
  {
    q: "Will it send WhatsApp or buy from suppliers for us?",
    a: "No. Pharmaflow prepares recommendations, drafts, and trails. A person still approves every write. We do not auto-buy, send messages, or pay suppliers.",
  },
  {
    q: "When does AI run — and what does it cost?",
    a: "Ordinary screens load with zero model calls. Explain is an explicit action, one request at a time. There are no surprise AI invoices on page load.",
  },
  {
    q: "Who is it for?",
    a: "Pharmaceutical manufacturers, distributors, and medical suppliers in Kenya and East Africa who need one workspace for Command Center, inventory, materials, and the buy desk.",
  },
  {
    q: "How does implementation work?",
    a: "Book a call, walk the plant with us, then we scope a tenant workspace. List prices are on the pricing page; implementation is scoped after that walkthrough.",
  },
  {
    q: "How does pricing compare to SkyPlanner or Power BI?",
    a: "SkyPlanner publishes APS from about €199 per month (five workstations), plus €20 per extra workstation. Power BI Pro is about $14 per user per month for shared reports. Use the stack calculator on our pricing page — Pharmaflow list prices are set below that combined software spend because planning, inventory, materials, procurement, and governance ship in one tenant licence (not per dashboard seat).",
  },
  {
    q: "Is this medical advice?",
    a: "No. Pharmaflow analyzes business and operational data. It does not provide clinical or medical advice.",
  },
] as const;

export const OPS_EVENTS = [
  { t: "06:12", domain: "Materials", tone: "material", text: "Foil net-short vs packing plan" },
  { t: "06:14", domain: "Inventory", tone: "watch", text: "Amoxicillin lot in expiry window" },
  { t: "06:18", domain: "Procurement", tone: "info", text: "Two RFQs awaiting award" },
  { t: "06:21", domain: "Quality", tone: "high", text: "Batch LAB-2026-004 on hold" },
  { t: "06:27", domain: "Receiving", tone: "intel", text: "PO receipt ready for confirmation" },
  { t: "06:31", domain: "Traceability", tone: "info", text: "Partial downstream allocation on lot" },
] as const;

/** Public competitor list prices used for illustration only (VAT excl., Oct 2026). */
export const PRICING_BENCHMARK = {
  footnote:
    "Compared to published SkyPlanner APS (€199/mo incl. 5 workstations) and Microsoft Power BI Pro ($14/user/mo, paid yearly). FX rounded for Kenya; your stack and headcount may differ.",
  rows: [
    { label: "SkyPlanner APS (5 workstations)", amount: "~KSh 29,000 / mo", highlight: false },
    { label: "Power BI Pro (25 report users)", amount: "~KSh 46,000 / mo", highlight: false },
    { label: "Typical APS + BI stack", amount: "~KSh 75,000+ / mo", highlight: false },
    { label: "Pharmaflow Plant (operations + planning)", amount: "KSh 24,500 / mo", highlight: true },
  ],
} as const;

export const PRICING_SCOPE_ROWS = [
  {
    capability: "Finite-capacity production planning",
    sky: "Core product",
    powerBi: "Custom build",
    pharmaflow: "Included",
  },
  {
    capability: "Material-aware scheduling",
    sky: "Included",
    powerBi: "Via ERP + reports",
    pharmaflow: "Included",
  },
  {
    capability: "Inventory & expiry visibility",
    sky: "Warehouse balances",
    powerBi: "Dashboards you build",
    pharmaflow: "Included",
  },
  {
    capability: "RFQs, POs, receiving",
    sky: "Not included",
    powerBi: "Not included",
    pharmaflow: "Network plan",
  },
  {
    capability: "Batches, quality, traceability",
    sky: "Not included",
    powerBi: "Not included",
    pharmaflow: "Included",
  },
  {
    capability: "Pricing model",
    sky: "Per workstation",
    powerBi: "Per report user",
    pharmaflow: "Per site licence",
  },
] as const;

export const PLANS = [
  {
    id: "plant",
    name: "Plant",
    price: "KSh 24,500",
    period: " / mo",
    body: "One manufacturing site. Command Center, Daily Review, inventory, materials, finite-capacity operations, explain-on-request AI.",
    items: ["Up to 25 operators", "Tenant-scoped workspace", "Human approval on every write"],
    savings: "List price below SkyPlanner APS alone — full pharma workspace, not scheduling-only.",
    featured: false,
  },
  {
    id: "network",
    name: "Network",
    price: "KSh 52,000",
    period: " / mo",
    body: "The buy desk on the same picture: RFQs, POs, receiving, suppliers, forecast, scenarios.",
    items: ["Everything in Plant", "Up to 80 operators", "Execution queue and supplier scorecards"],
    savings: "Typically ~30% less than APS + Power BI Pro for 25 seats — one licence, not per-user BI tax.",
    featured: true,
  },
  {
    id: "group",
    name: "Group",
    price: "From KSh 94,000",
    period: " / mo",
    body: "Several sites, board reporting, path to a distributor portal. Scoped to how the group actually runs.",
    items: ["Everything in Network", "Multi-site isolation review", "Executive reporting in KSh"],
    savings: "Multi-site command without stacking APS, BI, and integration quotes per plant.",
    featured: false,
  },
] as const;

export const NEXORA = {
  name: "NExora Digital",
  city: "Nairobi, Kenya",
  founded: "2025",
  email: "info@nexoradigital.com",
  phone: "+254 795 091 955",
  siteLabel: "nexora-gilt.vercel.app",
  site: "https://nexora-gilt.vercel.app",
  blurb:
    "A Nairobi studio that designs high-performance websites, AI systems, and custom software for businesses that need more than a template.",
} as const;

export const NEXORA_CAPABILITIES = [
  {
    title: "Websites & digital experiences",
    body: "Fast, conversion-minded sites and applications — web, e-commerce, landing pages, and performance work that turns attention into enquiries.",
  },
  {
    title: "AI & automation",
    body: "Assistants, workflow automation, and integrations that cut repetitive work. Pharmaflow’s explain-on-request AI follows the same rule: a person still decides.",
  },
  {
    title: "SEO & growth",
    body: "Technical and local search, content direction, and measurement so Kenyan businesses can be found by the customers they actually want.",
  },
  {
    title: "Custom digital products",
    body: "SaaS platforms, dashboards, portals, and internal tools shaped around how the company already operates — including Pharmaflow for pharmaceutical operations.",
  },
] as const;

export const NEXORA_WORK = [
  { name: "Kyra Platinum Imports", field: "Automotive", note: "Dealership experience with live inventory and booking flows." },
  { name: "Akatsuki Studio", field: "Creative", note: "Brand site built to earn attention and project inquiries in Nairobi." },
  { name: "Akshar Jobs", field: "Recruitment", note: "Multi-role job marketplace connecting talent and employers across Kenya." },
  { name: "Axar Events", field: "Events", note: "Discovery and booking for tourism and live experiences." },
] as const;

export const WORKFLOW = [
  { id: "shortage", label: "Shortage", detail: "Net vs plan", tone: "material" },
  { id: "rfq", label: "RFQ", detail: "3 suppliers", tone: "info" },
  { id: "award", label: "Award", detail: "Manager signs", tone: "signal" },
  { id: "receive", label: "Receive", detail: "Lot into stock", tone: "intel" },
  { id: "quality", label: "Quality", detail: "Hold / release", tone: "aqua" },
] as const;
