export const DAILY_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type DailySeverity = (typeof DAILY_SEVERITIES)[number];

export const DAILY_DOMAINS = [
  "production",
  "materials",
  "procurement",
  "inventory",
  "suppliers",
  "sales",
  "customers",
] as const;
export type DailyDomainId = (typeof DAILY_DOMAINS)[number];

export type DomainHealthStatus = "CRITICAL" | "ATTENTION" | "HEALTHY" | "LIMITED_DATA" | "OK";

export type DailyAttentionItem = {
  id: string;
  domain: DailyDomainId;
  severity: DailySeverity;
  title: string;
  summary: string;
  reason: string;
  targetType: string;
  targetId: string | null;
  href: string;
  actionLabel: string;
};

export type DomainHealth = {
  id: DailyDomainId;
  label: string;
  status: DomainHealthStatus;
  hint: string;
};

export type DailyReviewSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  health: DomainHealth[];
  attention: DailyAttentionItem[];
  context: {
    productionAtRisk: number;
    materialShortages: number;
    pendingRequisitions: number;
    supplierGaps: number;
    inventoryCritical: number;
    openAttention: number;
  };
  emptyReason: string | null;
  planningNote: string;
};

/** Compact packet for OpenAI — never includes tenant UUID or raw Prisma rows. */
export type CompactDailyReviewContext = {
  health: Array<{ domain: string; status: string; hint: string }>;
  attention: Array<{
    severity: string;
    domain: string;
    title: string;
    summary: string;
    reason: string;
  }>;
  metrics: DailyReviewSnapshot["context"];
};
