import type { PlannerCsvKind } from "@/lib/operations/planner-csv-parsers";
import {
  parseCustomersCsv,
  parseExceptionsCsv,
  parseMaterialsCsv,
  parsePersonnelCsv,
  parseProductionOrdersCsv,
  parseProductsCsv,
  parseRoutingsCsv,
  parseShiftsCsv,
  parseSubAssembliesCsv,
  parseToolsCsv,
} from "@/lib/operations/planner-csv-parsers";
import { parseWorkstationCsv } from "@/lib/operations/workstation-csv";
import { requirePermission } from "@/lib/auth/authorization";
import { importProductionOrders } from "@/lib/server/aps-plan";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type CsvImportPreview = {
  ok: boolean;
  kind: PlannerCsvKind;
  rowCount: number;
  issues: Array<{ line: number; message: string }>;
  preview?: string[];
  message?: string;
};

export async function previewPlannerCsvImport(
  ctx: TenantContext,
  kind: PlannerCsvKind,
  csv: string
): Promise<CsvImportPreview> {
  requirePermission(ctx, "production.schedule");
  const text = csv.trim();
  if (!text) return { ok: false, kind, rowCount: 0, issues: [{ line: 0, message: "CSV is empty." }] };

  if (kind === "workstations") {
    const { rows, issues } = parseWorkstationCsv(text);
    return {
      ok: issues.length === 0,
      kind,
      rowCount: rows.length,
      issues,
      preview: rows.slice(0, 8).map((row) => row.code),
    };
  }
  if (kind === "orders") {
    const { rows, issues } = parseProductionOrdersCsv(text);
    return { ok: issues.length === 0, kind, rowCount: rows.length, issues, preview: rows.slice(0, 8).map((r) => r.orderNumber) };
  }
  if (kind === "customers") {
    const { rows, issues } = parseCustomersCsv(text);
    return { ok: issues.length === 0, kind, rowCount: rows.length, issues, preview: rows.slice(0, 8).map((r) => r.code) };
  }
  if (kind === "shifts") {
    const { rows, issues } = parseShiftsCsv(text);
    return {
      ok: issues.length === 0,
      kind,
      rowCount: rows.length,
      issues,
      preview: rows.slice(0, 8).map((r) => `${r.workstationCode} d${r.weekday}`),
    };
  }
  if (kind === "products" || kind === "materials") {
    const { rows, issues } = parseProductsCsv(text);
    return { ok: issues.length === 0, kind, rowCount: rows.length, issues, preview: rows.slice(0, 8).map((r) => r.sku) };
  }
  if (kind === "routings") {
    const { rows, issues } = parseRoutingsCsv(text);
    const prisma = getPrisma();
    const skus = [...new Set(rows.map((r) => r.productSku))];
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, sku: { in: skus } },
      select: { sku: true },
    });
    const known = new Set(products.map((p) => p.sku));
    const extra = rows.filter((r) => !known.has(r.productSku)).map((r) => ({ line: 0, message: `Unknown product SKU ${r.productSku}` }));
    return {
      ok: issues.length === 0 && extra.length === 0,
      kind,
      rowCount: rows.length,
      issues: [...issues, ...extra],
      preview: rows.slice(0, 8).map((r) => `${r.productSku}/${r.operationCode}`),
    };
  }
  if (kind === "personnel") {
    const { rows, issues } = parsePersonnelCsv(text);
    return { ok: issues.length === 0, kind, rowCount: rows.length, issues, preview: rows.slice(0, 8).map((r) => r.code) };
  }
  if (kind === "tools") {
    const { rows, issues } = parseToolsCsv(text);
    return { ok: issues.length === 0, kind, rowCount: rows.length, issues, preview: rows.slice(0, 8).map((r) => r.code) };
  }
  if (kind === "exceptions") {
    const { rows, issues } = parseExceptionsCsv(text);
    return {
      ok: issues.length === 0,
      kind,
      rowCount: rows.length,
      issues,
      preview: rows.slice(0, 8).map((r) => `${r.workstationCode}@${r.date}`),
    };
  }
  if (kind === "subassemblies") {
    const { rows, issues } = parseSubAssembliesCsv(text);
    const prisma = getPrisma();
    const skus = [...new Set(rows.flatMap((r) => [r.parentSku, r.componentSku]))];
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, sku: { in: skus } },
      select: { sku: true },
    });
    const known = new Set(products.map((p) => p.sku));
    const extra = rows
      .filter((r) => !known.has(r.parentSku) || !known.has(r.componentSku))
      .map((r) => ({ line: 0, message: `Unknown SKU in ${r.parentSku} → ${r.componentSku}` }));
    return {
      ok: issues.length === 0 && extra.length === 0,
      kind,
      rowCount: rows.length,
      issues: [...issues, ...extra],
      preview: rows.slice(0, 8).map((r) => `${r.parentSku}→${r.componentSku}`),
    };
  }
  throw new ServerError("Unknown import kind.", "INTERNAL");
}

export async function applyPlannerCsvImport(
  ctx: TenantContext,
  kind: PlannerCsvKind,
  csv: string
): Promise<{ imported: number }> {
  const preview = await previewPlannerCsvImport(ctx, kind, csv);
  if (!preview.ok) {
    throw new ServerError("CSV validation failed.", "INTERNAL");
  }
  const prisma = getPrisma();
  const text = csv.trim();

  if (kind === "workstations") {
    const { rows } = parseWorkstationCsv(text);
    const [sites, groups] = await Promise.all([
      prisma.plantSite.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
      prisma.workstationGroup.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
    ]);
    const siteByCode = new Map(sites.map((row) => [row.code.toUpperCase(), row.id]));
    const groupByCode = new Map(groups.map((row) => [row.code.toUpperCase(), row.id]));
    let imported = 0;
    for (const row of rows) {
      await prisma.workstation.upsert({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: row.code } },
        create: {
          tenantId: ctx.tenantId,
          code: row.code,
          name: row.name,
          kind: row.kind,
          capacityHoursPerDay: row.capacityHoursPerDay,
          active: row.active,
          siteId: row.siteCode ? siteByCode.get(row.siteCode.toUpperCase()) ?? null : null,
          groupId: row.groupCode ? groupByCode.get(row.groupCode.toUpperCase()) ?? null : null,
        },
        update: {
          name: row.name,
          kind: row.kind,
          capacityHoursPerDay: row.capacityHoursPerDay,
          active: row.active,
          siteId: row.siteCode ? siteByCode.get(row.siteCode.toUpperCase()) ?? null : null,
          groupId: row.groupCode ? groupByCode.get(row.groupCode.toUpperCase()) ?? null : null,
        },
      });
      imported += 1;
    }
    await writeAuditLog(ctx, { action: "PLANNER_CSV_IMPORT", entityType: "Workstation", newValue: `${imported} workstations` });
    return { imported };
  }

  if (kind === "orders") {
    const { rows } = parseProductionOrdersCsv(text);
    const result = await importProductionOrders(
      ctx,
      rows.map((row) => ({
        orderNumber: row.orderNumber,
        sku: row.productSku,
        quantity: row.quantity,
        dueDate: row.dueDate,
        priority: row.priority,
      })),
      { idempotencyKey: `csv:${Date.now()}` }
    );
    return { imported: result.imported };
  }

  if (kind === "customers") {
    const { rows } = parseCustomersCsv(text);
    let imported = 0;
    for (const row of rows) {
      let regionId: string | null = null;
      if (row.regionCode) {
        const region = await prisma.region.findFirst({
          where: { tenantId: ctx.tenantId, code: row.regionCode },
          select: { id: true },
        });
        regionId = region?.id ?? null;
      }
      const type =
        row.type === "PHARMACY" ||
        row.type === "HOSPITAL" ||
        row.type === "WHOLESALER" ||
        row.type === "DISTRIBUTOR"
          ? row.type
          : "OTHER";
      const existing = await prisma.customer.findFirst({
        where: { tenantId: ctx.tenantId, name: row.name },
        select: { id: true },
      });
      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { defaultPriority: row.defaultPriority, regionId, type },
        });
      } else {
        await prisma.customer.create({
          data: {
            tenantId: ctx.tenantId,
            name: `${row.name} (${row.code})`,
            type,
            status: "ACTIVE",
            regionId,
            defaultPriority: row.defaultPriority,
          },
        });
      }
      imported += 1;
    }
    return { imported };
  }

  if (kind === "shifts") {
    const { rows } = parseShiftsCsv(text);
    let imported = 0;
    for (const row of rows) {
      const ws = await prisma.workstation.findFirst({
        where: { tenantId: ctx.tenantId, code: row.workstationCode },
        select: { id: true },
      });
      if (!ws) continue;
      await prisma.workstationShift.upsert({
        where: {
          workstationId_weekday_startMinute: {
            workstationId: ws.id,
            weekday: row.weekday,
            startMinute: row.startMinute,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          workstationId: ws.id,
          weekday: row.weekday,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        },
        update: { endMinute: row.endMinute },
      });
      imported += 1;
    }
    return { imported };
  }

  if (kind === "products" || kind === "materials") {
    const { rows } = parseMaterialsCsv(text);
    let imported = 0;
    for (const row of rows) {
      const category = kind === "materials" ? "Raw material" : "Finished good";
      const existing = await prisma.product.findFirst({
        where: { tenantId: ctx.tenantId, sku: row.sku },
        select: { id: true },
      });
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            unit: row.unit ?? undefined,
            validatedBatchSize: row.validatedBatchSize ?? undefined,
            safetyStock: row.safetyStock ?? undefined,
          },
        });
      } else {
        await prisma.product.create({
          data: {
            tenantId: ctx.tenantId,
            sku: row.sku,
            name: row.name,
            category,
            status: "ACTIVE",
            unit: row.unit,
            validatedBatchSize: row.validatedBatchSize,
            safetyStock: row.safetyStock ?? 0,
          },
        });
      }
      imported += 1;
    }
    return { imported };
  }

  if (kind === "personnel") {
    const { rows } = parsePersonnelCsv(text);
    let imported = 0;
    for (const row of rows) {
      let departmentId: string | null = null;
      if (row.departmentCode) {
        const dept = await prisma.plantDepartment.findFirst({
          where: { tenantId: ctx.tenantId, code: row.departmentCode },
          select: { id: true },
        });
        departmentId = dept?.id ?? null;
      }
      const employee = await prisma.plantEmployee.upsert({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: row.code } },
        create: {
          tenantId: ctx.tenantId,
          code: row.code,
          name: row.name,
          departmentId,
          status: row.status,
        },
        update: { name: row.name, departmentId, status: row.status },
      });
      if (row.groupCode) {
        const group = await prisma.plantEmployeeGroup.upsert({
          where: { tenantId_code: { tenantId: ctx.tenantId, code: row.groupCode } },
          create: { tenantId: ctx.tenantId, code: row.groupCode, name: row.groupCode },
          update: {},
        });
        await prisma.plantEmployeeGroupMember.upsert({
          where: { groupId_employeeId: { groupId: group.id, employeeId: employee.id } },
          create: { tenantId: ctx.tenantId, groupId: group.id, employeeId: employee.id },
          update: {},
        });
      }
      await prisma.plantEmployeeOperationSkill.deleteMany({ where: { employeeId: employee.id } });
      for (const operationCode of row.skillCodes) {
        await prisma.plantEmployeeOperationSkill.create({
          data: { tenantId: ctx.tenantId, employeeId: employee.id, operationCode },
        });
      }
      imported += 1;
    }
    await writeAuditLog(ctx, { action: "PLANNER_CSV_IMPORT", entityType: "PlantEmployee", newValue: `${imported} personnel` });
    return { imported };
  }

  if (kind === "tools") {
    const { rows } = parseToolsCsv(text);
    let imported = 0;
    for (const row of rows) {
      const tool = await prisma.productionTool.upsert({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: row.code } },
        create: { tenantId: ctx.tenantId, code: row.code, name: row.name, broken: row.broken },
        update: { name: row.name, broken: row.broken },
      });
      await prisma.productionToolWorkstation.deleteMany({ where: { toolId: tool.id } });
      for (const wsCode of row.workstationCodes) {
        const ws = await prisma.workstation.findFirst({
          where: { tenantId: ctx.tenantId, code: wsCode },
          select: { id: true },
        });
        if (!ws) continue;
        await prisma.productionToolWorkstation.create({
          data: { tenantId: ctx.tenantId, toolId: tool.id, workstationId: ws.id },
        });
      }
      imported += 1;
    }
    await writeAuditLog(ctx, { action: "PLANNER_CSV_IMPORT", entityType: "ProductionTool", newValue: `${imported} tools` });
    return { imported };
  }

  if (kind === "exceptions") {
    const { rows } = parseExceptionsCsv(text);
    let imported = 0;
    for (const row of rows) {
      const ws = await prisma.workstation.findFirst({
        where: { tenantId: ctx.tenantId, code: row.workstationCode },
        select: { id: true },
      });
      if (!ws) continue;
      const date = new Date(`${row.date}T00:00:00.000Z`);
      await prisma.workstationCalendarException.upsert({
        where: { workstationId_date: { workstationId: ws.id, date } },
        create: {
          tenantId: ctx.tenantId,
          workstationId: ws.id,
          date,
          reason: row.reason,
          closed: row.closed,
        },
        update: { reason: row.reason, closed: row.closed },
      });
      imported += 1;
    }
    await writeAuditLog(ctx, {
      action: "PLANNER_CSV_IMPORT",
      entityType: "WorkstationCalendarException",
      newValue: `${imported} exceptions`,
    });
    return { imported };
  }

  if (kind === "subassemblies") {
    const { rows } = parseSubAssembliesCsv(text);
    let imported = 0;
    for (const row of rows) {
      const [parent, component] = await Promise.all([
        prisma.product.findFirst({ where: { tenantId: ctx.tenantId, sku: row.parentSku }, select: { id: true } }),
        prisma.product.findFirst({ where: { tenantId: ctx.tenantId, sku: row.componentSku }, select: { id: true } }),
      ]);
      if (!parent || !component) continue;
      await prisma.productSubAssembly.upsert({
        where: {
          parentProductId_componentProductId: { parentProductId: parent.id, componentProductId: component.id },
        },
        create: {
          tenantId: ctx.tenantId,
          parentProductId: parent.id,
          componentProductId: component.id,
          quantityPerBatch: row.quantityPerBatch,
          sequence: row.sequence,
        },
        update: { quantityPerBatch: row.quantityPerBatch, sequence: row.sequence },
      });
      imported += 1;
    }
    await writeAuditLog(ctx, { action: "PLANNER_CSV_IMPORT", entityType: "ProductSubAssembly", newValue: `${imported} links` });
    return { imported };
  }

  if (kind === "routings") {
    const { rows } = parseRoutingsCsv(text);
    let imported = 0;
    for (const row of rows) {
      const product = await prisma.product.findFirst({
        where: { tenantId: ctx.tenantId, sku: row.productSku },
        select: { id: true },
      });
      if (!product) continue;
      const routing = await prisma.productRouting.findFirst({
        where: { tenantId: ctx.tenantId, productId: product.id, active: true },
        select: { id: true },
      });
      if (!routing) continue;
      const op = await prisma.routingOperation.findFirst({
        where: { tenantId: ctx.tenantId, routingId: routing.id, sequence: row.sequence },
      });
      if (!op) continue;
      let workstationId: string | null = null;
      if (row.workstationCode) {
        const ws = await prisma.workstation.findFirst({
          where: { tenantId: ctx.tenantId, code: row.workstationCode },
          select: { id: true },
        });
        workstationId = ws?.id ?? null;
      }
      await prisma.routingOperation.update({
        where: { id: op.id },
        data: {
          runMinutesPerBatch: row.durationMinutes,
          isQcHold: row.isQcHold,
        },
      });
      if (workstationId) {
        await prisma.routingOperationResource.deleteMany({ where: { routingOperationId: op.id } });
        await prisma.routingOperationResource.create({
          data: { tenantId: ctx.tenantId, routingOperationId: op.id, workstationId },
        });
      }
      imported += 1;
    }
    return { imported };
  }

  throw new ServerError("Unknown import kind.", "INTERNAL");
}
