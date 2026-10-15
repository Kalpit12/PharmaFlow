import type { ProductionPriority } from "@prisma/client";

import { colIndex, parseCsvHeader, splitCsvLine, type CsvIssue } from "@/lib/operations/csv-parse-utils";

export type PlannerCsvKind =
  | "workstations"
  | "orders"
  | "customers"
  | "shifts"
  | "products"
  | "materials"
  | "routings"
  | "personnel"
  | "tools"
  | "exceptions"
  | "subassemblies";

export const PLANNER_CSV_TEMPLATES: Record<PlannerCsvKind, string> = {
  workstations: `code,name,kind,capacityHoursPerDay,siteCode,groupCode,active
GRN-01,Granulator 1,PRODUCTION_LINE,8,NBO-PLT,GRAN,true`,
  orders: `orderNumber,productSku,quantity,dueDate,priority
PRO-900,AMOX-500-TAB,50000,2026-12-01,NORMAL`,
  customers: `code,name,type,regionCode,defaultPriority
DIST-01,Nairobi Distributors,DISTRIBUTOR,KE-NBO,NORMAL`,
  shifts: `workstationCode,weekday,startHour,endHour
GRN-01,1,8,16`,
  products: `sku,name,unit,validatedBatchSize,safetyStock
AMOX-500-TAB,Amoxicillin 500mg tablets,tablets,100000,5000`,
  materials: `sku,name,unit,safetyStock
API-AMOX,Amoxicillin API,kg,500`,
  routings: `productSku,operationCode,sequence,durationMinutes,workstationCode,isQcHold
AMOX-500-TAB,GRAN,10,240,GRN-01,false`,
  personnel: `code,name,departmentCode,status,groupCode,skillCodes
OP-001,Jane Wanjiku,OSD,ACTIVE,SHIFT-A,GRAN;COMP`,
  tools: `code,name,broken,workstationCodes
PUNCH-22A,22mm round punch set,false,CMP-1;CMP-2`,
  exceptions: `workstationCode,date,reason,closed
CMP-2,2026-10-20,Preventive maintenance,true`,
  subassemblies: `parentSku,componentSku,quantityPerBatch,sequence
AMOX-500-TAB,GRAN-AMOX-BULK,1,10`,
};

export type ParsedProductionOrderCsvRow = {
  orderNumber: string;
  productSku: string;
  quantity: number;
  dueDate: string;
  priority: ProductionPriority;
};

export function parseProductionOrdersCsv(text: string): { rows: ParsedProductionOrderCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const skuIdx = colIndex(header, "productsku", "sku");
  const qtyIdx = colIndex(header, "quantity", "qty");
  const dueIdx = colIndex(header, "duedate", "due");
  const priIdx = colIndex(header, "priority");
  const numIdx = colIndex(header, "ordernumber", "order_number");
  if (skuIdx < 0 || qtyIdx < 0 || dueIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: productSku, quantity, dueDate." }] };
  }
  const rows: ParsedProductionOrderCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const productSku = cells[skuIdx] ?? "";
    const quantity = Number.parseInt(cells[qtyIdx] ?? "", 10);
    const dueDate = cells[dueIdx] ?? "";
    if (!productSku || !dueDate || !Number.isFinite(quantity) || quantity <= 0) {
      issues.push({ line: lineNo, message: "productSku, positive quantity, and dueDate are required." });
      continue;
    }
    const priorityRaw = (priIdx >= 0 ? cells[priIdx] : "NORMAL")?.toUpperCase() ?? "NORMAL";
    const priority = (["CRITICAL", "HIGH", "NORMAL", "LOW"].includes(priorityRaw)
      ? priorityRaw
      : "NORMAL") as ProductionPriority;
    rows.push({
      orderNumber: numIdx >= 0 ? cells[numIdx] || `CSV-${lineNo}` : `CSV-${lineNo}`,
      productSku,
      quantity,
      dueDate,
      priority,
    });
  }
  return { rows, issues };
}

export type ParsedCustomerCsvRow = {
  code: string;
  name: string;
  type: string;
  regionCode: string | null;
  defaultPriority: ProductionPriority;
};

export function parseCustomersCsv(text: string): { rows: ParsedCustomerCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const codeIdx = colIndex(header, "code");
  const nameIdx = colIndex(header, "name");
  if (codeIdx < 0 || nameIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: code, name." }] };
  }
  const typeIdx = colIndex(header, "type");
  const regionIdx = colIndex(header, "regioncode", "region");
  const priIdx = colIndex(header, "defaultpriority", "priority");
  const rows: ParsedCustomerCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const code = cells[codeIdx] ?? "";
    const name = cells[nameIdx] ?? "";
    if (!code || !name) {
      issues.push({ line: lineNo, message: "code and name are required." });
      continue;
    }
    const priorityRaw = (priIdx >= 0 ? cells[priIdx] : "NORMAL")?.toUpperCase() ?? "NORMAL";
    rows.push({
      code,
      name,
      type: typeIdx >= 0 ? cells[typeIdx] || "OTHER" : "OTHER",
      regionCode: regionIdx >= 0 ? cells[regionIdx] || null : null,
      defaultPriority: (["CRITICAL", "HIGH", "NORMAL", "LOW"].includes(priorityRaw)
        ? priorityRaw
        : "NORMAL") as ProductionPriority,
    });
  }
  return { rows, issues };
}

export type ParsedShiftCsvRow = {
  workstationCode: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export function parseShiftsCsv(text: string): { rows: ParsedShiftCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const wsIdx = colIndex(header, "workstationcode", "workstation");
  const dayIdx = colIndex(header, "weekday", "day");
  const startIdx = colIndex(header, "starthour", "start_minute", "startminute");
  const endIdx = colIndex(header, "endhour", "end_minute", "endminute");
  if (wsIdx < 0 || dayIdx < 0 || startIdx < 0 || endIdx < 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: "Required: workstationCode, weekday, startHour, endHour." }],
    };
  }
  const rows: ParsedShiftCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const workstationCode = cells[wsIdx] ?? "";
    const weekday = Number.parseInt(cells[dayIdx] ?? "", 10);
    const startHour = Number.parseInt(cells[startIdx] ?? "", 10);
    const endHour = Number.parseInt(cells[endIdx] ?? "", 10);
    if (!workstationCode || weekday < 0 || weekday > 6 || startHour < 0 || endHour <= startHour) {
      issues.push({ line: lineNo, message: "Invalid shift row." });
      continue;
    }
    rows.push({
      workstationCode,
      weekday,
      startMinute: startHour * 60,
      endMinute: endHour * 60,
    });
  }
  return { rows, issues };
}

export type ParsedProductCsvRow = {
  sku: string;
  name: string;
  unit: string | null;
  validatedBatchSize: number | null;
  safetyStock: number | null;
};

export function parseProductsCsv(text: string): { rows: ParsedProductCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const skuIdx = colIndex(header, "sku");
  const nameIdx = colIndex(header, "name");
  if (skuIdx < 0 || nameIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: sku, name." }] };
  }
  const unitIdx = colIndex(header, "unit");
  const batchIdx = colIndex(header, "validatedbatchsize", "batchsize");
  const safetyIdx = colIndex(header, "safetystock", "safety_stock");
  const rows: ParsedProductCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const sku = cells[skuIdx] ?? "";
    const name = cells[nameIdx] ?? "";
    if (!sku || !name) {
      issues.push({ line: lineNo, message: "sku and name are required." });
      continue;
    }
    const validatedBatchSize =
      batchIdx >= 0 && cells[batchIdx] ? Number.parseInt(cells[batchIdx], 10) : null;
    const safetyStock = safetyIdx >= 0 && cells[safetyIdx] ? Number.parseInt(cells[safetyIdx], 10) : null;
    rows.push({
      sku,
      name,
      unit: unitIdx >= 0 ? cells[unitIdx] || null : null,
      validatedBatchSize: validatedBatchSize != null && Number.isFinite(validatedBatchSize) ? validatedBatchSize : null,
      safetyStock: safetyStock != null && Number.isFinite(safetyStock) ? safetyStock : null,
    });
  }
  return { rows, issues };
}

export type ParsedRoutingCsvRow = {
  productSku: string;
  operationCode: string;
  sequence: number;
  durationMinutes: number;
  workstationCode: string | null;
  isQcHold: boolean;
};

export function parseRoutingsCsv(text: string): { rows: ParsedRoutingCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const skuIdx = colIndex(header, "productsku", "sku");
  const codeIdx = colIndex(header, "operationcode", "code");
  const seqIdx = colIndex(header, "sequence", "seq");
  const durIdx = colIndex(header, "durationminutes", "duration");
  const wsIdx = colIndex(header, "workstationcode", "workstation");
  const qcIdx = colIndex(header, "isqchold", "qc_hold");
  if (skuIdx < 0 || codeIdx < 0 || seqIdx < 0 || durIdx < 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: "Required: productSku, operationCode, sequence, durationMinutes." }],
    };
  }
  const rows: ParsedRoutingCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const sequence = Number.parseInt(cells[seqIdx] ?? "", 10);
    const durationMinutes = Number.parseInt(cells[durIdx] ?? "", 10);
    if (!cells[skuIdx] || !cells[codeIdx] || !Number.isFinite(sequence) || !Number.isFinite(durationMinutes)) {
      issues.push({ line: lineNo, message: "Invalid routing row." });
      continue;
    }
    const qcRaw = qcIdx >= 0 ? (cells[qcIdx] ?? "false").toLowerCase() : "false";
    rows.push({
      productSku: cells[skuIdx],
      operationCode: cells[codeIdx],
      sequence,
      durationMinutes,
      workstationCode: wsIdx >= 0 ? cells[wsIdx] || null : null,
      isQcHold: qcRaw === "true" || qcRaw === "1" || qcRaw === "yes",
    });
  }
  return { rows, issues };
}

/** Materials CSV reuses product shape (raw/packaging SKUs). */
export const parseMaterialsCsv = parseProductsCsv;

export type ParsedPersonnelCsvRow = {
  code: string;
  name: string;
  departmentCode: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  groupCode: string | null;
  skillCodes: string[];
};

export function parsePersonnelCsv(text: string): { rows: ParsedPersonnelCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const codeIdx = colIndex(header, "code");
  const nameIdx = colIndex(header, "name");
  if (codeIdx < 0 || nameIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: code, name." }] };
  }
  const deptIdx = colIndex(header, "departmentcode", "department");
  const statusIdx = colIndex(header, "status");
  const groupIdx = colIndex(header, "groupcode", "group");
  const skillsIdx = colIndex(header, "skillcodes", "skills");
  const rows: ParsedPersonnelCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const code = cells[codeIdx] ?? "";
    const name = cells[nameIdx] ?? "";
    if (!code || !name) {
      issues.push({ line: lineNo, message: "code and name are required." });
      continue;
    }
    const statusRaw = (statusIdx >= 0 ? cells[statusIdx] : "ACTIVE")?.toUpperCase() ?? "ACTIVE";
    const status = (["ACTIVE", "INACTIVE", "ON_LEAVE"].includes(statusRaw) ? statusRaw : "ACTIVE") as ParsedPersonnelCsvRow["status"];
    const skillsRaw = skillsIdx >= 0 ? cells[skillsIdx] : "";
    const skillCodes = skillsRaw
      ? skillsRaw
          .split(/[;|]/)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    rows.push({
      code,
      name,
      departmentCode: deptIdx >= 0 ? cells[deptIdx]?.trim() || null : null,
      status,
      groupCode: groupIdx >= 0 ? cells[groupIdx]?.trim() || null : null,
      skillCodes,
    });
  }
  return { rows, issues };
}

export type ParsedToolCsvRow = {
  code: string;
  name: string;
  broken: boolean;
  workstationCodes: string[];
};

export function parseToolsCsv(text: string): { rows: ParsedToolCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const codeIdx = colIndex(header, "code");
  const nameIdx = colIndex(header, "name");
  if (codeIdx < 0 || nameIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: code, name." }] };
  }
  const brokenIdx = colIndex(header, "broken");
  const wsIdx = colIndex(header, "workstationcodes", "workstations");
  const rows: ParsedToolCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const code = cells[codeIdx] ?? "";
    const name = cells[nameIdx] ?? "";
    if (!code || !name) {
      issues.push({ line: lineNo, message: "code and name are required." });
      continue;
    }
    const brokenRaw = (brokenIdx >= 0 ? cells[brokenIdx] : "false")?.toLowerCase() ?? "false";
    const wsRaw = wsIdx >= 0 ? cells[wsIdx] : "";
    rows.push({
      code,
      name,
      broken: brokenRaw === "true" || brokenRaw === "1" || brokenRaw === "yes",
      workstationCodes: wsRaw
        ? wsRaw
            .split(/[;|]/)
            .map((part) => part.trim())
            .filter(Boolean)
        : [],
    });
  }
  return { rows, issues };
}

export type ParsedExceptionCsvRow = {
  workstationCode: string;
  date: string;
  reason: string;
  closed: boolean;
};

export function parseExceptionsCsv(text: string): { rows: ParsedExceptionCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const wsIdx = colIndex(header, "workstationcode", "workstation");
  const dateIdx = colIndex(header, "date");
  const reasonIdx = colIndex(header, "reason");
  const closedIdx = colIndex(header, "closed");
  if (wsIdx < 0 || dateIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required columns: workstationCode, date." }] };
  }
  const rows: ParsedExceptionCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const workstationCode = cells[wsIdx] ?? "";
    const date = cells[dateIdx] ?? "";
    if (!workstationCode || !date) {
      issues.push({ line: lineNo, message: "workstationCode and date are required." });
      continue;
    }
    const closedRaw = (closedIdx >= 0 ? cells[closedIdx] : "true")?.toLowerCase() ?? "true";
    rows.push({
      workstationCode,
      date,
      reason: reasonIdx >= 0 ? cells[reasonIdx] || "Calendar exception" : "Calendar exception",
      closed: closedRaw !== "false" && closedRaw !== "0" && closedRaw !== "no",
    });
  }
  return { rows, issues };
}

export type ParsedSubAssemblyCsvRow = {
  parentSku: string;
  componentSku: string;
  quantityPerBatch: number;
  sequence: number;
};

export function parseSubAssembliesCsv(text: string): { rows: ParsedSubAssemblyCsvRow[]; issues: CsvIssue[] } {
  const { header, lines, issues } = parseCsvHeader(text);
  if (issues.length) return { rows: [], issues };
  const parentIdx = colIndex(header, "parentsku", "parent");
  const compIdx = colIndex(header, "componentsku", "component");
  const qtyIdx = colIndex(header, "quantityperbatch", "quantity");
  const seqIdx = colIndex(header, "sequence", "seq");
  if (parentIdx < 0 || compIdx < 0 || qtyIdx < 0) {
    return { rows: [], issues: [{ line: 1, message: "Required: parentSku, componentSku, quantityPerBatch." }] };
  }
  const rows: ParsedSubAssemblyCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const parentSku = cells[parentIdx] ?? "";
    const componentSku = cells[compIdx] ?? "";
    const quantityPerBatch = Number.parseFloat(cells[qtyIdx] ?? "");
    const sequence = seqIdx >= 0 ? Number.parseInt(cells[seqIdx] ?? "0", 10) : 0;
    if (!parentSku || !componentSku || !Number.isFinite(quantityPerBatch) || quantityPerBatch <= 0) {
      issues.push({ line: lineNo, message: "Invalid sub-assembly row." });
      continue;
    }
    rows.push({
      parentSku,
      componentSku,
      quantityPerBatch,
      sequence: Number.isFinite(sequence) ? sequence : 0,
    });
  }
  return { rows, issues };
}
