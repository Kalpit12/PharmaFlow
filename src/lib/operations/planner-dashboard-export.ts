import { formatPlantDateTime } from "@/lib/operations/plant-time";
import type { OperationsDashboardSnapshot } from "@/lib/server/operations-dashboard";

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(",");
}

function stamp(value: string | null | undefined): string {
  return formatPlantDateTime(value) || "";
}

export function buildPlannerDashboardCsv(data: OperationsDashboardSnapshot): string {
  const lines: string[] = [];
  lines.push("PharmaFlow planner dashboard export");
  lines.push(`Generated,${stamp(data.generatedAt)}`);
  lines.push(`Window,${stamp(data.window.start)},${stamp(data.window.end)}`);
  lines.push("");

  lines.push("KPIs");
  lines.push(csvLine(["Label", "Value", "Hint"]));
  for (const row of data.kpis) {
    lines.push(csvLine([row.label, row.value, row.hint]));
  }
  lines.push("");

  lines.push("Daily load factor");
  lines.push(csvLine(["Day", "Load %", "Hint"]));
  for (const row of data.dailyLoad) {
    lines.push(csvLine([row.label, row.value, row.hint ?? ""]));
  }
  lines.push("");

  lines.push("QC / quarantine queue");
  lines.push(csvLine(["Day", "Hours", "Hint"]));
  for (const row of data.qcDailyLoad) {
    lines.push(csvLine([row.label, row.value, row.hint ?? ""]));
  }
  lines.push("");

  lines.push("Job report");
  lines.push(csvLine(["Order", "Product", "Status", "Planned start", "Due", "Qty", "Workstation"]));
  for (const row of data.jobReport) {
    lines.push(
      csvLine([
        row.orderNumber,
        row.productName,
        row.status,
        stamp(row.plannedStart),
        stamp(row.dueDate),
        row.producedQuantity != null ? `${row.producedQuantity}/${row.quantity}` : row.quantity,
        row.workstationName,
      ])
    );
  }
  lines.push("");

  lines.push("Job report steps");
  lines.push(csvLine(["Order", "Step", "Workstation", "Planned min", "Logged min", "Difference"]));
  for (const row of data.jobReportSteps) {
    const diff = row.loggedMinutes > 0 ? row.loggedMinutes - row.plannedMinutes : "";
    lines.push(
      csvLine([
        row.orderNumber,
        `${row.stepCode} ${row.stepName}`,
        row.workstationName,
        row.plannedMinutes,
        row.loggedMinutes > 0 ? row.loggedMinutes : "",
        diff,
      ])
    );
  }
  lines.push("");

  lines.push("Timelogs");
  lines.push(csvLine(["When", "Event", "Order", "Step", "Workstation", "Detail"]));
  for (const row of data.timelogs) {
    lines.push(
      csvLine([
        stamp(row.recordedAt),
        row.eventType,
        row.orderNumber,
        row.operationCode,
        row.workstationName,
        row.actorName ?? row.reason,
      ])
    );
  }
  lines.push("");

  lines.push("Order items");
  lines.push(csvLine(["Order", "SKU", "Product", "Qty", "Due", "Status", "Workstation"]));
  for (const row of data.orderItems) {
    lines.push(
      csvLine([
        row.orderNumber,
        row.productSku,
        row.productName,
        row.quantity,
        stamp(row.dueDate),
        row.status,
        row.workstationName,
      ])
    );
  }

  return lines.join("\n");
}

export function buildPlannerDashboardPrintHtml(data: OperationsDashboardSnapshot, title: string): string {
  const kpiRows = data.kpis
    .map((row) => `<tr><td>${row.label}</td><td><strong>${row.value}</strong></td><td>${row.hint}</td></tr>`)
    .join("");
  const jobRows = data.jobReport
    .slice(0, 50)
    .map(
      (row) =>
        `<tr><td>${row.orderNumber}</td><td>${row.productName}</td><td>${row.status}</td><td>${stamp(row.plannedStart) || "—"}</td><td>${stamp(row.dueDate)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; } table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f4f4f4; } @media print { body { padding: 12px; } }
</style></head><body>
  <h1>${title}</h1>
  <p>Generated ${stamp(data.generatedAt)} · Window ${stamp(data.window.start)} – ${stamp(data.window.end)}</p>
  <h2>KPIs</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead><tbody>${kpiRows}</tbody></table>
  <h2>Job report (sample)</h2><table><thead><tr><th>Order</th><th>Product</th><th>Status</th><th>Start</th><th>Due</th></tr></thead><tbody>${jobRows}</tbody></table>
  <p style="font-size:11px;color:#666">Use browser Print → Save as PDF for a PDF copy. Times are East Africa Time.</p>
</body></html>`;
}

export function downloadPlannerDashboardCsv(data: OperationsDashboardSnapshot, filename: string): void {
  const blob = new Blob([buildPlannerDashboardCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openPlannerDashboardPdfPrint(data: OperationsDashboardSnapshot, title: string): void {
  const html = buildPlannerDashboardPrintHtml(data, title);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
