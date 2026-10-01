import type { TimeRange } from "@/lib/ai/types";

export type AIToolName =
  | "get_business_summary"
  | "get_sales_performance"
  | "get_product_performance"
  | "get_customer_activity"
  | "get_rfq_analysis"
  | "get_regional_performance"
  | "get_attention_items"
  | "get_opportunities"
  | "get_daily_review"
  | "get_forecast"
  | "get_scenario"
  | "get_procurement_rfq"
  | "get_purchase_order"
  | "get_supplier_performance"
  | "get_report";

export type ToolPermission = "commercial.read" | "analytics.read";

export type ToolInput = {
  get_business_summary: { timeRange: TimeRange };
  get_sales_performance: { timeRange: TimeRange };
  get_product_performance: { product?: string; timeRange: TimeRange };
  get_customer_activity: { customer?: string; timeRange: TimeRange };
  get_rfq_analysis: { timeRange: TimeRange };
  get_regional_performance: { region?: string; timeRange: TimeRange };
  get_attention_items: Record<string, never>;
  get_opportunities: Record<string, never>;
  get_daily_review: Record<string, never>;
  get_forecast: Record<string, never>;
  get_scenario: Record<string, never>;
  get_procurement_rfq: Record<string, never>;
  get_purchase_order: Record<string, never>;
  get_supplier_performance: Record<string, never>;
  get_report: Record<string, never>;
};

export type SalesPointOutput = {
  label: string;
  revenue: number;
  orders: number;
  rfqs: number;
};

export type ToolOutput = {
  get_business_summary: {
    revenue: string;
    revenueTrend: string;
    orders: string;
    ordersTrend: string;
    rfqs: string;
    rfqsTrend: string;
    customers: string;
    customersTrend: string;
    demand: string;
    timeRange: TimeRange;
  };
  get_sales_performance: {
    timeRange: TimeRange;
    points: SalesPointOutput[];
  };
  get_product_performance: {
    product: string;
    form?: string;
    orders: string;
    demand: string;
    growth: string;
    trend: "up" | "down" | "flat";
    status: string;
  };
  get_customer_activity: {
    activeCustomers: string;
    inactiveHighValueCount: number;
    inactiveWindowDays: number;
    openRfqAccount?: string;
    overdueQuote?: string;
  };
  get_rfq_analysis: {
    count: string;
    trend: string;
    demandProduct?: string;
    demandGrowth?: string;
    growingRegion?: string;
    regionGrowth?: string;
  };
  get_regional_performance: {
    country: string;
    revenue: string;
    growth: string;
    activity: string;
  };
  get_attention_items: {
    id: string;
    severity: "High" | "Medium";
    title: string;
    detail: string;
    meta: string;
  };
  get_opportunities: {
    id: string;
    category: string;
    insight: string;
    action: string;
  };
  get_daily_review: {
    health: Array<{ domain: string; status: string; hint: string }>;
    attention: Array<{
      severity: string;
      domain: string;
      title: string;
      summary: string;
      reason: string;
    }>;
    metrics: {
      productionAtRisk: number;
      materialShortages: number;
      pendingRequisitions: number;
      supplierGaps: number;
      inventoryCritical: number;
      openAttention: number;
    };
  };
  get_forecast: {
    horizon: string;
    sales: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    rfq: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    production: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    materials: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    procurement: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    inventory: {
      currentValue: string;
      projectedValue: string | null;
      direction: string;
      growth: string;
      confidence: string;
      explanation: string;
    };
    risks: Array<{ domain: string; title: string; severity: string; reason: string }>;
  };
  get_scenario: import("@/lib/scenarios/types").CompactScenarioContext;
  get_procurement_rfq: {
    reference: string;
    title: string;
    status: string;
    items: Array<{ name: string; quantity: number; unit: string }>;
    suppliers: Array<{ name: string; preferred: boolean; leadTime: string; price: string }>;
    comparison: Array<{ supplier: string; total: string; leadTime: string; completeness: string; reasoning: string }>;
    evaluationSummary: string;
  };
  get_purchase_order: {
    poNumber: string;
    status: string;
    supplier: string;
    currency: string;
    subtotal: string;
    items: Array<{ description: string; quantity: number; unitPrice: string; lineTotal: string }>;
    rfqReference: string | null;
    notes: string | null;
  };
  get_supplier_performance: {
    supplierCount: number;
    suppliersWithHistory: number;
    topPerformers: Array<{ name: string; band: string; completionRate: string }>;
    attentionSuppliers: Array<{ name: string; reason: string }>;
    completionRate: string;
    discrepancyRate: string;
    openExposure: string;
    confidence: string;
    materialFilter: string | null;
  };
  get_report: {
    view: string;
    revenue: string;
    revenueGrowth: string;
    productionAtRisk: number;
    expiredQty: string;
    materialShortages: number;
    procurementOpen: string;
    supplierAttention: number;
    signals: Array<{ domain: string; issue: string; severity: string }>;
    limitedData: string[];
  };
};

export type AIToolDefinition<K extends AIToolName = AIToolName> = {
  name: K;
  description: string;
  permission: ToolPermission;
  /** Domain tools run in src/lib/server/ai-data.ts. No AI provider. */
  execution: "future" | "domain";
};

export const AI_TOOL_REGISTRY: { [K in AIToolName]: AIToolDefinition<K> } = {
  get_business_summary: {
    name: "get_business_summary",
    description: "Executive KPIs: revenue, orders, RFQs, customers, demand.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_sales_performance: {
    name: "get_sales_performance",
    description: "Sales series for a standard time range.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_product_performance: {
    name: "get_product_performance",
    description: "Product orders, demand, growth, and status.",
    permission: "commercial.read",
    execution: "domain",
  },
  get_customer_activity: {
    name: "get_customer_activity",
    description: "Active customers, inactivity, open RFQs, overdue quotes.",
    permission: "commercial.read",
    execution: "domain",
  },
  get_rfq_analysis: {
    name: "get_rfq_analysis",
    description: "RFQ volume, trend, and demand drivers.",
    permission: "commercial.read",
    execution: "domain",
  },
  get_regional_performance: {
    name: "get_regional_performance",
    description: "Revenue and activity by country / region.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_attention_items: {
    name: "get_attention_items",
    description: "Items that need commercial follow-up.",
    permission: "commercial.read",
    execution: "domain",
  },
  get_opportunities: {
    name: "get_opportunities",
    description: "Documented commercial opportunities.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_daily_review: {
    name: "get_daily_review",
    description: "Compact cross-domain daily attention and domain health.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_forecast: {
    name: "get_forecast",
    description: "Compact deterministic near-term forecast across sales, demand, operations, and supply.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_scenario: {
    name: "get_scenario",
    description: "Compact simulated what-if impact versus current baseline. Not actual business data.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_procurement_rfq: {
    name: "get_procurement_rfq",
    description: "Compact procurement RFQ summary, supplier comparison, and response fields for explain-only analysis.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_purchase_order: {
    name: "get_purchase_order",
    description: "Compact purchase order summary for explain-only analysis.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_supplier_performance: {
    name: "get_supplier_performance",
    description: "Compact deterministic supplier performance summary for explain-only analysis.",
    permission: "analytics.read",
    execution: "domain",
  },
  get_report: {
    name: "get_report",
    description: "Compact derived executive report context for explain-only analysis. No raw rows.",
    permission: "analytics.read",
    execution: "domain",
  },
};
