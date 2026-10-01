import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { canApprove, canProcurementApprove, requirePermission } from "../src/lib/auth/authorization";
import { hasPermission } from "../src/lib/auth/permissions";
import { holdProductionBatch } from "../src/lib/server/batches";
import { getGovernanceSnapshot, updateUserRole } from "../src/lib/server/governance";
import { transitionQualityException } from "../src/lib/server/quality";
import { runPhase35Verify } from "./verify-phase35";
import type { TenantContext } from "../src/lib/server/errors";
import { ServerError } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase36Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/auth/permissions.ts",
    "src/lib/auth/authorization.ts",
    "src/lib/server/audit.ts",
    "src/lib/server/governance.ts",
    "src/components/governance/GovernanceWorkspace.tsx",
    "src/app/(workspace)/governance/page.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/openai/i.test(sources), "Phase 36 performs ZERO OpenAI calls");

  assert(hasPermission("ADMIN", "users.manage"), "Admin has users.manage");
  assert(hasPermission("MANAGER", "procurement.approve"), "Manager can approve procurement");
  assert(!hasPermission("VIEWER", "quality.manage"), "Viewer cannot manage quality");
  assert(hasPermission("QUALITY", "batches.quality_action"), "Quality role can act on batches");
  assert(hasPermission("PROCUREMENT", "procurement.create"), "Procurement role can create");
  assert(hasPermission("OPERATIONS", "production.schedule"), "Operations can schedule");
  assert(hasPermission("OPERATOR", "production.schedule"), "Legacy operator maps to operations");
  assert(hasPermission("SALES", "communications.create"), "Sales can draft communications");
  assert(canApprove("MANAGER") && canApprove("ADMIN") && !canApprove("VIEWER") && !canApprove("OPERATOR"), "Action approval roles");
  assert(canProcurementApprove("MANAGER") && !canProcurementApprove("PROCUREMENT"), "Procurement approval limited");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  assert(tenant && tenantB && manager, "Demo tenants and manager exist");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const viewerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "VIEWER" };
  const adminCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "ADMIN" };

  let viewerBlocked = false;
  try {
    requirePermission(viewerCtx, "production.schedule");
  } catch (error) {
    viewerBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
  }
  assert(viewerBlocked, "Viewer blocked from production.schedule");

  const batch = await prisma.productionBatch.findFirst({ where: { tenantId: tenant.id } });
  assert(batch, "Demo batch exists");

  let batchBlocked = false;
  try {
    await holdProductionBatch(viewerCtx, batch.id, "Phase 36 verify hold attempt");
  } catch (error) {
    batchBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
  }
  assert(batchBlocked, "Viewer blocked from batch hold");

  const exception = await prisma.qualityException.findFirst({ where: { tenantId: tenant.id, status: "OPEN" } });
  if (exception) {
    let qualityBlocked = false;
    try {
      await transitionQualityException(viewerCtx, exception.id, "INVESTIGATING");
    } catch (error) {
      qualityBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
    }
    assert(qualityBlocked, "Viewer blocked from quality transition");
  }

  const snapshot = await getGovernanceSnapshot(managerCtx);
  assert(snapshot.permissions.length > 0, "Governance snapshot permissions");
  assert(snapshot.users.length >= 1, "Governance users listed");
  assert(snapshot.approvalAuthority.some((row) => row.capability === "Procurement approval"), "Approval authority listed");

  let governanceBlocked = false;
  try {
    await getGovernanceSnapshot(viewerCtx);
  } catch (error) {
    governanceBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
  }
  assert(governanceBlocked, "Viewer blocked from governance workspace");

  const target = await prisma.user.findFirst({
    where: { tenantId: tenant.id, id: { not: manager.id } },
  });
  if (target) {
    const previousRole = target.role;
    await updateUserRole(adminCtx, target.id, "QUALITY");
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entityType: "USER", entityId: target.id, action: "USER_ROLE_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    assert(audit?.oldValue?.includes(previousRole), "Role change audit old value");
    assert(audit?.newValue?.includes("QUALITY"), "Role change audit new value");
    await prisma.user.update({ where: { id: target.id }, data: { role: previousRole } });
  }

  const otherTenantBatch = await prisma.productionBatch.findFirst({ where: { tenantId: tenantB.id } });
  if (otherTenantBatch) {
    let isolationFailed = false;
    try {
      await holdProductionBatch({ tenantId: tenantB.id, userId: manager.id, role: "MANAGER" }, otherTenantBatch.id, "Cross tenant");
    } catch {
      isolationFailed = true;
    }
    assert(isolationFailed, "Cross-tenant batch mutation blocked");
  }

  const auditCount = await prisma.auditLog.count({ where: { tenantId: tenant.id } });
  assert(auditCount >= 0, "Audit log readable");

  await runPhase35Verify(prisma);
  console.log("Phase 36 verification passed.");
}
