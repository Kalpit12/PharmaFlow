import type { OperationalFact, OperationalInsight } from "@/lib/intelligence/types";

function uniqueDomains(facts: OperationalFact[]) {
  return [...new Set(facts.flatMap((fact) => [fact.domain, ...fact.relatedDomains]))];
}

function sourceLabel(facts: OperationalFact[]): string {
  const types = [...new Set(facts.map((fact) => fact.type.replace(/_/g, " ").toLowerCase()))];
  return types.join(" · ");
}

export function buildOperationalInsights(facts: OperationalFact[]): OperationalInsight[] {
  const byKey = new Map<string, OperationalFact[]>();
  for (const fact of facts) {
    const key =
      fact.type === "MATERIAL_SHORTAGE" || fact.type === "MATERIAL_AT_RISK"
        ? `material:${fact.entityId ?? fact.id}`
        : fact.type === "QUALITY_EXCEPTION" || fact.type === "QUALITY_IMPACT"
          ? `quality:${fact.entityId ?? fact.id}`
          : fact.id;
    const list = byKey.get(key) ?? [];
    list.push(fact);
    byKey.set(key, list);
  }

  const insights: OperationalInsight[] = [];
  for (const group of byKey.values()) {
    const primary = [...group].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]!;
    const related = uniqueDomains(group);
    insights.push({
      id: `ins-${primary.id}`,
      factIds: group.map((fact) => fact.id),
      severity: primary.severity,
      confidence: group.some((fact) => fact.confidence === "INSUFFICIENT_DATA")
        ? "INSUFFICIENT_DATA"
        : group.every((fact) => fact.confidence === "KNOWN")
          ? "KNOWN"
          : "PARTIAL",
      domain: primary.domain,
      relatedDomains: related,
      what: primary.title,
      why: primary.reason,
      impact: buildImpact(group, primary),
      source: sourceLabel(group),
      href: primary.href,
    });
  }

  return insights.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.what.localeCompare(b.what));
}

function buildImpact(group: OperationalFact[], primary: OperationalFact): string {
  const materials = group.filter((fact) => fact.type === "MATERIAL_SHORTAGE" || fact.type === "MATERIAL_AT_RISK");
  if (primary.type === "PRODUCTION_RISK") {
    const material = primary.evidence.find((row) => row.label === "Materials")?.value;
    return material
      ? `Scheduled production of ${primary.evidence.find((row) => row.label === "Product")?.value ?? primary.entityLabel} depends on ${material}.`
      : `Order ${primary.entityLabel} remains exposed until schedule or material cover is resolved.`;
  }
  if (materials.length) {
    const orders = materials[0]?.evidence.find((row) => row.label === "Orders")?.value;
    const count = materials[0]?.evidence.find((row) => row.label === "Orders affected")?.value ?? "0";
    return orders
      ? `${count} production order${count === "1" ? "" : "s"} depend on this material (${orders}).`
      : `${count} production orders depend on this material.`;
  }
  if (primary.type === "QUALITY_IMPACT" || primary.type === "BATCH_HOLD") {
    return "Quality state can block batch release. Downstream customer allocation is not recorded at batch level.";
  }
  if (primary.type === "CUSTOMER_IMPACT" || primary.type === "TRACEABILITY_IMPACT") {
    return "Potential customer/order exposure is product-matched only — not confirmed batch genealogy.";
  }
  if (primary.type === "SUPPLIER_RISK") {
    return "Procurement exposure and inbound material cover remain tied to this supplier until receiving performance is reviewed.";
  }
  if (primary.type === "CAPACITY_RISK") {
    return "Orders on this line may miss due dates if additional work is scheduled without resequencing.";
  }
  if (primary.type === "DELIVERY_RISK") {
    return "Unreceived purchase quantity keeps inventory and MRP cover incomplete.";
  }
  return primary.reason;
}

function severityRank(severity: OperationalInsight["severity"]): number {
  if (severity === "CRITICAL") return 4;
  if (severity === "HIGH") return 3;
  if (severity === "MEDIUM") return 2;
  return 1;
}
