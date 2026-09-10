import type { ProcurementRfqComparisonRow, ProcurementRfqResponseView } from "@/lib/procurement-rfq/types";

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function responseCompleteness(response: ProcurementRfqResponseView): { label: string; complete: boolean } {
  if (response.items.length === 0) return { label: "No line items", complete: false };
  const priced = response.items.filter((row) => row.unitPrice !== null && row.quotedQuantity > 0).length;
  if (priced === response.items.length) return { label: "Complete", complete: true };
  return { label: `${priced}/${response.items.length} priced`, complete: priced > 0 };
}

export function compareProcurementRfqResponses(responses: ProcurementRfqResponseView[]): {
  rows: ProcurementRfqComparisonRow[];
  currencyComparable: boolean;
  evaluationSummary: string;
} {
  const submitted = responses.filter((row) => row.responseStatus === "SUBMITTED" || row.responseStatus === "AWARDED");
  if (submitted.length === 0) {
    return { rows: [], currencyComparable: false, evaluationSummary: "Supplier comparison incomplete" };
  }

  const currencies = new Set(submitted.map((row) => row.currency).filter((row): row is string => Boolean(row)));
  const currencyComparable = currencies.size <= 1;
  const comparableCurrency = currencies.size === 1 ? [...currencies][0] : null;

  const rows: ProcurementRfqComparisonRow[] = submitted.map((response) => {
    const completeness = responseCompleteness(response);
    const total = response.totalAmount ?? "—";
    const leadTime = response.leadTimeDays === null ? "Not available" : `${response.leadTimeDays} days`;
    const unitPrices = response.items.map((row) => row.unitPrice).filter((row): row is string => Boolean(row));
    const unitPrice = unitPrices.length > 0 ? unitPrices[0]! : "Not available";

    let severity: ProcurementRfqComparisonRow["severity"] = "LOW";
    let reasoning = "Response recorded for internal review.";
    if (!completeness.complete) {
      severity = "MEDIUM";
      reasoning = "Response is incomplete — missing quoted line items or prices.";
    } else if (response.supplierStatus !== "ACTIVE") {
      severity = "HIGH";
      reasoning = "Supplier is not active.";
    } else if (!currencyComparable) {
      severity = "MEDIUM";
      reasoning = "Currency comparison unavailable across responses.";
    } else if (completeness.complete && response.leadTimeDays !== null) {
      severity = "OK";
      reasoning = "Complete response with known lead time.";
    }

    return {
      id: response.id,
      supplierName: response.supplierName,
      responseId: response.id,
      quotedQuantity: response.items.map((row) => row.quotedQuantity).join(", ") || "—",
      unitPrice,
      total,
      currency: response.currency ?? "—",
      leadTime,
      responseStatus: response.responseStatus,
      completeness: completeness.label,
      severity,
      reasoning,
      comparable: currencyComparable && completeness.complete,
    };
  });

  rows.sort((a, b) => {
    const rank = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, OK: 1 };
    return rank[b.severity] - rank[a.severity] || a.supplierName.localeCompare(b.supplierName);
  });

  const best = rows.find((row) => row.comparable && row.severity === "OK");
  let evaluationSummary = "Supplier comparison incomplete";
  if (best) {
    evaluationSummary = `Strongest comparable response: ${best.supplierName}. ${best.reasoning}`;
  } else if (rows.some((row) => row.completeness.startsWith("Complete"))) {
    evaluationSummary = "Responses recorded, but price comparison may be limited by currency or missing fields.";
  }

  if (!currencyComparable && submitted.length > 1) {
    evaluationSummary = "Currency comparison unavailable";
  }

  if (comparableCurrency && rows.length > 1) {
    const totals = submitted
      .filter((row) => row.currency === comparableCurrency && row.totalAmount)
      .map((row) => ({ name: row.supplierName, amount: Number(row.totalAmount!.replace(/[^\d.-]/g, "")) }));
    if (totals.length >= 2) {
      const lowest = [...totals].sort((a, b) => a.amount - b.amount)[0];
      evaluationSummary = `Comparable ${comparableCurrency} responses. Lowest quoted total: ${lowest.name}.`;
    }
  }

  return { rows, currencyComparable, evaluationSummary };
}

export function formatResponseTotal(items: Array<{ unitPrice: string | null; quotedQuantity: number }>, currency: string | null): string | null {
  if (!currency) return null;
  let sum = 0;
  let priced = 0;
  for (const row of items) {
    if (!row.unitPrice) continue;
    const price = Number(row.unitPrice.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(price)) continue;
    sum += price * row.quotedQuantity;
    priced += 1;
  }
  if (priced === 0) return null;
  return formatMoney(sum, currency);
}
