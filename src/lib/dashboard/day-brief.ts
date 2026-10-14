import type { AttentionItem, DashboardMetric } from "@/lib/mock/dashboard";

export type DashboardDayBrief = {
  greeting: string;
  headline: string;
  summary: string;
  priorities: Array<{ id: string; label: string; href: string }>;
  commercialHint: string | null;
};

function timeGreeting(now = new Date()): string {
  const hour = now.getUTCHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(displayName?: string | null): string | null {
  if (!displayName?.trim()) return null;
  return displayName.trim().split(/\s+/)[0] ?? null;
}

export function buildDashboardDayBrief(input: {
  userName?: string | null;
  brand: string;
  metrics: DashboardMetric[];
  attention: AttentionItem[];
  now?: Date;
}): DashboardDayBrief {
  const name = firstName(input.userName);
  const greeting = name ? `${timeGreeting(input.now)}, ${name}.` : `${timeGreeting(input.now)}`;

  const rankedAttention = input.attention.filter((row) => row.id !== "forecast-outlook");
  const attentionForBrief = rankedAttention.length > 0 ? rankedAttention : input.attention;
  const attentionCount = attentionForBrief.length;
  const revenue = input.metrics.find((row) => row.id === "revenue");
  const orders = input.metrics.find((row) => row.id === "orders");
  const rfqs = input.metrics.find((row) => row.id === "rfqs");

  const headline =
    attentionCount > 0
      ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need your attention today`
      : "Your workspace looks steady today";

  const parts: string[] = [];
  if (attentionCount > 0) {
    const top = attentionForBrief.slice(0, 2).map((row) => row.title.toLowerCase());
    parts.push(`Start with ${top.join(" and ")}.`);
  } else {
    parts.push("No urgent commercial or supply exceptions are ranked right now.");
  }
  if (revenue) {
    parts.push(`Revenue is ${revenue.value} (${revenue.trend} vs prior 30 days).`);
  }
  if (orders && rfqs) {
    parts.push(`${orders.value} confirmed orders and ${rfqs.value} open RFQs in the current window.`);
  }

  const priorities = attentionForBrief.slice(0, 3).map((row) => ({
    id: row.id,
    label: row.title,
    href: row.href,
  }));

  const commercialHint =
    attentionCount === 0 && orders?.value === "0"
      ? "Commercial activity is quiet — use Reports or record an order when new business lands."
      : null;

  return {
    greeting,
    headline,
    summary: parts.join(" "),
    priorities,
    commercialHint,
  };
}
