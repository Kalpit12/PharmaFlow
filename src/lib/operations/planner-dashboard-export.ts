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

export function buildPlannerDashboardCsv(data: OperationsDashboardSnapshot): string {
  const lines: string[] = [];
  lines.push("PharmaFlow planner dashboard export");
  lines.push(`Generated,${data.generatedAt}`);
  lines.push(`Window,${data.window.start},${data.window.end}`);
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

  lines.push("Job report");
  lines.push(csvLine(["Order", "Product", "Status", "Planned start", "Due", "Qty"]));
  for (const row of data.jobReport) {
    lines.push(
      csvLine([
        row.orderNumber,
        row.productName,
        row.status,
        row.plannedStart,
        row.dueDate,
        row.producedQuantity != null ? `${row.producedQuantity}/${row.quantity}` : row.quantity,
      ])
    );
  }
  lines.push("");

  lines.push("Timelogs");
  lines.push(csvLine(["When", "Event", "Order", "Step", "Workstation", "Detail"]));
  for (const row of data.timelogs) {
    lines.push(
      csvLine([
        row.recordedAt,
        row.eventType,
        row.orderNumber,
        row.operationCode,
        row.workstationName,
        row.reason ?? row.actorName,
      ])
    );
  }
  lines.push("");

  lines.push("Order items");
  lines.push(csvLine(["Order", "SKU", "Product", "Qty", "Due", "Status", "Workstation"]));
  for (const row of data.orderItems) {
    lines.push(
      csvLine([row.orderNumber, row.productSku, row.productName, row.quantity, row.dueDate, row.status, row.workstationName])
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
        `<tr><td>${row.orderNumber}</td><td>${row.productName}</td><td>${row.status}</td><td>${row.plannedStart ?? "—"}</td><td>${row.dueDate}</td></tr>`
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
  <p>Generated ${data.generatedAt} · Window ${data.window.start.slice(0, 10)} – ${data.window.end.slice(0, 10)}</p>
  <h2>KPIs</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead><tbody>${kpiRows}</tbody></table>
  <h2>Job report (sample)</h2><table><thead><tr><th>Order</th><th>Product</th><th>Status</th><th>Start</th><th>Due</th></tr></thead><tbody>${jobRows}</tbody></table>
  <p style="font-size:11px;color:#666">Use browser Print → Save as PDF for a PDF copy.</p>
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
