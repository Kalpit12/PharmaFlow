/**
 * DEMO UI DATA for Phase 5A / previews. Live dashboard uses src/lib/server/dashboard.ts.
 * Do not treat these figures as database totals.
 */

export type DashboardRange = "7D" | "30D" | "90D" | "12M";

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  period: string;
  icon: "revenue" | "orders" | "rfqs" | "customers" | "demand";
};

export type SalesPoint = {
  label: string;
  revenue: number;
  orders: number;
  rfqs: number;
};

export type IntelligenceSignal = {
  id: string;
  category: string;
  title: string;
  impact: string;
  recommendation: string;
  actionLabel: string;
  href: string;
};

export type ProductPerformanceRow = {
  id: string;
  product: string;
  form: string;
  orders: string;
  demand: string;
  growth: string;
  growthUp: boolean;
  status: "High" | "Stable" | "Watch";
};

export type RegionalRow = {
  id: string;
  country: string;
  revenue: string;
  revenueValue: number;
  growth: string;
  activity: "High" | "Growing" | "Stable";
};

export type AttentionItem = {
  id: string;
  severity: "High" | "Medium";
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  href: string;
};

export type Opportunity = {
  id: string;
  index: string;
  category: string;
  insight: string;
  action: string;
  href: string;
};

export type ActivityItem = {
  id: string;
  time: string;
  title: string;
  detail: string;
};

export const dashboardMetrics: DashboardMetric[] = [
  {
    id: "revenue",
    label: "Revenue",
    value: "KSh 12.8M",
    trend: "+8.4%",
    trendUp: true,
    period: "vs previous 30 days",
    icon: "revenue",
  },
  {
    id: "orders",
    label: "Orders",
    value: "284",
    trend: "+12.1%",
    trendUp: true,
    period: "vs previous 30 days",
    icon: "orders",
  },
  {
    id: "rfqs",
    label: "RFQs",
    value: "146",
    trend: "+18.6%",
    trendUp: true,
    period: "vs previous 30 days",
    icon: "rfqs",
  },
  {
    id: "customers",
    label: "Active Customers",
    value: "1,284",
    trend: "+6.3%",
    trendUp: true,
    period: "vs previous 30 days",
    icon: "customers",
  },
  {
    id: "demand",
    label: "Product Demand",
    value: "+14.8%",
    trend: "+2.1 pts",
    trendUp: true,
    period: "vs previous 30 days",
    icon: "demand",
  },
];

const salesByRange: Record<DashboardRange, SalesPoint[]> = {
  "7D": [
    { label: "Sat", revenue: 1.4, orders: 32, rfqs: 18 },
    { label: "Sun", revenue: 1.1, orders: 24, rfqs: 14 },
    { label: "Mon", revenue: 1.8, orders: 41, rfqs: 22 },
    { label: "Tue", revenue: 2.0, orders: 46, rfqs: 25 },
    { label: "Wed", revenue: 1.9, orders: 44, rfqs: 21 },
    { label: "Thu", revenue: 2.2, orders: 51, rfqs: 28 },
    { label: "Fri", revenue: 2.4, orders: 46, rfqs: 18 },
  ],
  "30D": [
    { label: "W1", revenue: 2.4, orders: 58, rfqs: 28 },
    { label: "W2", revenue: 2.7, orders: 62, rfqs: 31 },
    { label: "W3", revenue: 3.1, orders: 71, rfqs: 38 },
    { label: "W4", revenue: 2.9, orders: 66, rfqs: 34 },
    { label: "W5", revenue: 3.4, orders: 77, rfqs: 41 },
  ],
  "90D": [
    { label: "Jun", revenue: 9.1, orders: 210, rfqs: 98 },
    { label: "Jul", revenue: 10.4, orders: 238, rfqs: 112 },
    { label: "Aug", revenue: 12.8, orders: 284, rfqs: 146 },
  ],
  "12M": [
    { label: "Sep", revenue: 8.2, orders: 190, rfqs: 88 },
    { label: "Oct", revenue: 8.6, orders: 198, rfqs: 91 },
    { label: "Nov", revenue: 9.0, orders: 206, rfqs: 97 },
    { label: "Dec", revenue: 7.8, orders: 174, rfqs: 82 },
    { label: "Jan", revenue: 8.9, orders: 201, rfqs: 94 },
    { label: "Feb", revenue: 9.4, orders: 214, rfqs: 101 },
    { label: "Mar", revenue: 10.1, orders: 228, rfqs: 108 },
    { label: "Apr", revenue: 10.8, orders: 241, rfqs: 118 },
    { label: "May", revenue: 11.2, orders: 252, rfqs: 124 },
    { label: "Jun", revenue: 9.1, orders: 210, rfqs: 98 },
    { label: "Jul", revenue: 10.4, orders: 238, rfqs: 112 },
    { label: "Aug", revenue: 12.8, orders: 284, rfqs: 146 },
  ],
};

export const salesPerformance = salesByRange;

export const intelligenceSignals: IntelligenceSignal[] = [
  {
    id: "demand",
    category: "Demand signal",
    title: "Amoxicillin demand has increased 18% over the last 30 days.",
    impact: "Higher enquiry volume across active customers and distributors.",
    recommendation: "Review inventory cover and distributor demand before the next production cycle.",
    actionLabel: "Investigate",
    href: "/products",
  },
  {
    id: "customer",
    category: "Customer signal",
    title: "3 high-value customers have not placed an order in the last 45 days.",
    impact: "Order frequency is below their trailing-quarter baseline.",
    recommendation: "Prioritize targeted commercial follow-up this week.",
    actionLabel: "Review customers",
    href: "/customers",
  },
];

export const productPerformance: ProductPerformanceRow[] = [
  { id: "amox", product: "Amoxicillin 500mg", form: "Capsule", orders: "8,420", demand: "Strong", growth: "+18%", growthUp: true, status: "High" },
  { id: "ferro", product: "Ferrous-Folic", form: "Tablet", orders: "6,210", demand: "Rising", growth: "+12%", growthUp: true, status: "High" },
  { id: "azith", product: "Azithromycin 500mg", form: "Tablet", orders: "4,830", demand: "Steady", growth: "+7%", growthUp: true, status: "Stable" },
  { id: "para", product: "Paracetamol 500mg", form: "Tablet", orders: "3,920", demand: "Soft", growth: "−3%", growthUp: false, status: "Watch" },
  { id: "metro", product: "Metronidazole 400mg", form: "Tablet", orders: "3,140", demand: "Steady", growth: "+4%", growthUp: true, status: "Stable" },
];

export const regionalPerformance: RegionalRow[] = [
  { id: "ke", country: "Kenya", revenue: "KSh 7.4M", revenueValue: 7.4, growth: "+9.2%", activity: "High" },
  { id: "ug", country: "Uganda", revenue: "KSh 2.1M", revenueValue: 2.1, growth: "+14.8%", activity: "Growing" },
  { id: "tz", country: "Tanzania", revenue: "KSh 1.6M", revenueValue: 1.6, growth: "+6.3%", activity: "Stable" },
  { id: "rw", country: "Rwanda", revenue: "KSh 820K", revenueValue: 0.82, growth: "+11.4%", activity: "Growing" },
  { id: "zm", country: "Zambia", revenue: "KSh 540K", revenueValue: 0.54, growth: "+4.8%", activity: "Stable" },
  { id: "mw", country: "Malawi", revenue: "KSh 310K", revenueValue: 0.31, growth: "+7.1%", activity: "Growing" },
];

export const attentionItems: AttentionItem[] = [
  {
    id: "rfq",
    severity: "High",
    title: "ABC Pharmaceuticals",
    detail: "RFQ for 2,000 units of Amoxicillin",
    meta: "Received 18 minutes ago",
    actionLabel: "Review RFQ",
    href: "/rfqs",
  },
  {
    id: "quote",
    severity: "High",
    title: "Quotation QT-1842",
    detail: "Awaiting follow-up after customer view",
    meta: "2 days overdue",
    actionLabel: "Review quotation",
    href: "/quotes",
  },
  {
    id: "docs",
    severity: "Medium",
    title: "Product documentation",
    detail: "3 approved packs require commercial review",
    meta: "Documents",
    actionLabel: "Review documents",
    href: "/documents",
  },
  {
    id: "follow",
    severity: "Medium",
    title: "Customer follow-up",
    detail: "3 high-value accounts inactive for 45+ days",
    meta: "Commercial",
    actionLabel: "Review customers",
    href: "/customers",
  },
];

export const aiOpportunities: Opportunity[] = [
  {
    id: "op1",
    index: "01",
    category: "Demand",
    insight: "Maternal-health product demand increased 21% in the current period.",
    action: "Review inventory and distributor demand.",
    href: "/products",
  },
  {
    id: "op2",
    index: "02",
    category: "Retention",
    insight: "Three high-value customers have declining order frequency.",
    action: "Launch targeted follow-up this week.",
    href: "/customers",
  },
  {
    id: "op3",
    index: "03",
    category: "Region",
    insight: "Uganda distributor activity is growing faster than the regional average.",
    action: "Review the regional sales opportunity.",
    href: "/analytics",
  },
];

export const recentActivity: ActivityItem[] = [
  { id: "a1", time: "10:42", title: "New RFQ received", detail: "ABC Pharmaceuticals" },
  { id: "a2", time: "09:58", title: "Quotation accepted", detail: "XYZ Healthcare" },
  { id: "a3", time: "09:31", title: "Product document updated", detail: "Amoxicillin 500mg" },
  { id: "a4", time: "08:46", title: "New distributor enquiry", detail: "Uganda" },
  { id: "a5", time: "08:12", title: "Order confirmed", detail: "XYZ Healthcare" },
];

export const dashboardDisclaimer = "Demonstration values only — not live commercial figures.";
