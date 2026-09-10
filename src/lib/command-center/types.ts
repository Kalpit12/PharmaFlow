import type { DailySeverity } from "@/lib/daily-review/types";
import type { DashboardRange, SalesPoint } from "@/lib/mock/dashboard";

export type CommandSeverity = DailySeverity;

export type CommandHealthMetric = {
  id: string;
  label: string;
  value: string;
  trend: string;
  severity: "CRITICAL" | "ATTENTION" | "HEALTHY" | "LIMITED" | "NEUTRAL";
  href: string;
};

export type CommandSignal = {
  id: string;
  severity: CommandSeverity;
  domain: string;
  title: string;
  explanation: string;
  entity: string;
  nextStep: string;
  href: string;
  sortDue: string;
};

export type CommandSummaryLine = {
  label: string;
  value: string;
  available: boolean;
};

export type CommandSummaryBlock = {
  id: "business" | "operations" | "supply";
  title: string;
  lines: CommandSummaryLine[];
  href: string;
};

export type CommandActionQueue = {
  needsReview: number;
  ready: number;
  recentlyExecuted: number;
  failedOrBlocked: number;
  preview: Array<{
    id: string;
    title: string;
    status: string;
    domain: string;
    href: string;
  }>;
};

export type CommandRisk = {
  id: string;
  category: string;
  level: CommandSeverity;
  explanation: string;
  domain: string;
  href: string;
};

export type CommandActivityItem = {
  id: string;
  title: string;
  entity: string;
  domain: string;
  at: string;
  href: string | null;
};

export type CommandChartSeries = {
  id: "sales" | "production" | "supply";
  title: string;
  question: string;
  kind: "sales" | "bars";
  sales?: SalesPoint[];
  bars?: Array<{ label: string; value: number }>;
  empty: boolean;
};

export type CommandCenterAnalytics = {
  revenueTrend: {
    points: Array<{ label: string; primary: number; secondary?: number }>;
    empty: boolean;
  };
  revenueByProduct: Array<{
    id: string;
    label: string;
    value: number;
    hint?: string;
    href?: string;
    tone?: "default" | "primary" | "intel" | "material" | "warning" | "danger" | "neutral";
  }>;
  productionPlannedVsActual: Array<{
    id: string;
    label: string;
    primary: number;
    secondary: number | null;
    href?: string;
  }>;
  productionNote: string;
  workstationCapacity: Array<{
    id: string;
    label: string;
    value: number;
    hint?: string;
    href?: string;
    tone?: "default" | "primary" | "intel" | "material" | "warning" | "danger" | "neutral";
  }>;
  inventoryHealth: Array<{
    id: string;
    label: string;
    value: number;
    tone: "default" | "primary" | "intel" | "material" | "warning" | "danger" | "neutral";
    href?: string;
  }>;
  procurementPipeline: Array<{ id: string; label: string; count: number; href?: string }>;
  errors: {
    revenue: string | null;
    operations: string | null;
    inventory: string | null;
  };
};

export type CommandCenterSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  contextLabel: string;
  health: CommandHealthMetric[];
  signals: CommandSignal[];
  summary: CommandSummaryBlock[];
  actionQueue: CommandActionQueue;
  charts: CommandChartSeries[];
  analytics: CommandCenterAnalytics;
  risks: CommandRisk[];
  activity: CommandActivityItem[];
  salesRanges: Record<DashboardRange, SalesPoint[]>;
  emptyReason: string | null;
  planningNote: string;
};

/** Compact packet for explicit AI explanation — no tenant UUID / Prisma. */
export type CompactCommandContext = {
  health: Array<{ label: string; value: string; severity: string }>;
  signals: Array<{ severity: string; domain: string; title: string; explanation: string }>;
  actionQueue: Omit<CommandActionQueue, "preview">;
  risks: Array<{ category: string; level: string; explanation: string }>;
};
