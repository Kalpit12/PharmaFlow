import type { ReportingSnapshot, ReportViewId } from "@/lib/reports/types";
import { METRIC_CATALOG } from "@/lib/reports/metric-catalog";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return `<Cell><Data ss:Type="String"></Data></Cell>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

function row(values: Array<string | number | null | undefined>): string {
  return `<Row>${values.map(cell).join("")}</Row>`;
}

function sheet(name: string, header: string[], body: Array<Array<string | number | null | undefined>>): string {
  const safeName = name.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31);
  const rows = [row(header), ...body.map((line) => row(line))];
  return `<Worksheet ss:Name="${xmlEscape(safeName)}"><Table>${rows.join("")}</Table></Worksheet>`;
}

function lotsSheet(data: ReportingSnapshot) {
  return sheet(
    "Lots",
    ["Batch", "Product", "SKU", "Category", "Warehouse", "Supplier", "Class", "Qty", "Value", "Received", "Expiry", "Age days", "Days remaining", "Risk"],
    data.lots.map((lot) => [
      lot.batchCode,
      lot.productName,
      lot.sku,
      lot.category,
      lot.warehouseName,
      lot.supplierName ?? "Internal",
      lot.classId,
      lot.quantity,
      lot.valueAmount,
      lot.receivedAt,
      lot.expiryDate,
      lot.ageDays,
      lot.daysRemaining,
      lot.expiryRisk ?? lot.ageingRisk,
    ])
  );
}

function materialsSheet(data: ReportingSnapshot) {
  return sheet(
    "Materials",
    ["Material", "Class", "Stock", "Incoming", "Requirement", "Available", "Projected", "Net", "Status", "MRP risk", "Suppliers", "Orders affected"],
    data.materials.map((row) => [
      row.title,
      row.classId,
      row.stock,
      row.incoming,
      row.hasBom ? row.requirement : null,
      row.available,
      row.hasBom ? row.projected : null,
      row.hasBom ? row.netRequirement : null,
      row.status,
      row.mrpRisk,
      row.suppliers.join("; "),
      row.affectedOrders,
    ])
  );
}

function productionSheet(data: ReportingSnapshot) {
  return sheet(
    "Production",
    ["Order", "Product", "Qty", "Workstation", "Status", "Priority", "Due", "Planned start", "Planned end"],
    data.production.orders.map((order) => [
      order.orderNumber,
      order.productName,
      order.quantity,
      order.workstationName,
      order.displayStatus,
      order.priority,
      order.dueDate,
      order.plannedStart,
      order.plannedEnd,
    ])
  );
}

function inboundSheet(data: ReportingSnapshot) {
  return sheet(
    "Inbound",
    ["Reference", "Product", "SKU", "Qty", "Supplier", "Expected", "PO"],
    data.inboundReceipts.map((row) => [
      row.reference,
      row.productName,
      row.sku,
      row.quantity,
      row.supplierName,
      row.expectedAt,
      row.purchaseOrderNumber,
    ])
  );
}

function findingsSheet(data: ReportingSnapshot) {
  return sheet(
    "Findings",
    ["Finding"],
    data.findings.map((item) => [item])
  );
}

function metricsSheet() {
  return sheet(
    "Metric catalog",
    ["ID", "Label", "Domain", "How calculated", "Source", "Limitation"],
    METRIC_CATALOG.map((row) => [row.id, row.label, row.domain, row.how, row.source, row.limitation])
  );
}

function sheetsForView(data: ReportingSnapshot): string[] {
  const sheets = [findingsSheet(data), metricsSheet()];
  switch (data.view) {
    case "materials":
      sheets.unshift(materialsSheet(data));
      break;
    case "production":
    case "operations":
      sheets.unshift(productionSheet(data));
      break;
    case "procurement":
      sheets.unshift(inboundSheet(data), materialsSheet(data));
      break;
    case "sales":
      sheets.unshift(
        sheet(
          "Sales products",
          ["Product", "Revenue", "Units"],
          data.sales.products.map((row) => [row.name, row.revenue, row.units])
        ),
        sheet(
          "Sales customers",
          ["Customer", "Revenue", "Share"],
          data.sales.customers.map((row) => [row.name, row.revenue, row.share])
        )
      );
      break;
    case "suppliers":
      sheets.unshift(
        sheet(
          "Supplier attention",
          ["Supplier", "Band", "Evidence"],
          data.supplierAttention.map((row) => [row.name, row.band, row.reason])
        )
      );
      break;
    default:
      sheets.unshift(lotsSheet(data));
      if (data.inboundReceipts.length > 0) sheets.splice(1, 0, inboundSheet(data));
      if (data.view === "executive" || data.view === "inventory" || data.view === "overview") {
        sheets.splice(1, 0, materialsSheet(data));
      }
      break;
  }
  return sheets;
}

/** SpreadsheetML workbook Excel opens natively — no export library required. */
export function buildReportsExcelXml(data: ReportingSnapshot): string {
  const body = sheetsForView(data).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${body}
</Workbook>`;
}

export function reportsExportFilename(view: ReportViewId, generatedAt: string): string {
  const day = generatedAt.slice(0, 10);
  return `pharmora-reports-${view}-${day}.xls`;
}

export function downloadReportsExcel(data: ReportingSnapshot): void {
  const xml = buildReportsExcelXml(data);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportsExportFilename(data.view, data.generatedAt);
  anchor.click();
  URL.revokeObjectURL(url);
}
