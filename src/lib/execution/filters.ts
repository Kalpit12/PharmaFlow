import {
  EXECUTION_DOMAINS,
  EXECUTION_FILTERS,
  type ExecutionDomain,
  type ExecutionFilterId,
  type ExecutionItem,
} from "@/lib/execution/types";

function matchesFilter(item: ExecutionItem, filter: ExecutionFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "needs-review") return item.status === "NEEDS_REVIEW";
  if (filter === "ready") return item.status === "READY";
  if (filter === "executed") return item.status === "EXECUTED";
  if (filter === "rejected") return item.status === "REJECTED";
  if (filter === "failed") return item.status === "FAILED" || item.status === "BLOCKED";
  return true;
}

export function resolveExecutionFilters(input: {
  view?: string;
  domain?: string;
}): { view: ExecutionFilterId; domain: ExecutionDomain | "all" } {
  const view = (EXECUTION_FILTERS as readonly string[]).includes(input.view ?? "")
    ? (input.view as ExecutionFilterId)
    : "all";
  const domain = (EXECUTION_DOMAINS as readonly string[]).includes(input.domain ?? "")
    ? (input.domain as ExecutionDomain)
    : "all";
  return { view, domain };
}

export function filterExecutionItems(
  items: ExecutionItem[],
  filters: { view: ExecutionFilterId; domain: ExecutionDomain | "all" }
): ExecutionItem[] {
  return items.filter((item) => {
    if (!matchesFilter(item, filters.view)) return false;
    if (filters.domain !== "all" && item.domain !== filters.domain) return false;
    return true;
  });
}
