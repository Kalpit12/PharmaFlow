import type { PrismaClient } from "@prisma/client";

/** Clears transactional rows that block tenant cascade (RESTRICT FKs on Product). */
export async function wipeTenantForReseed(prisma: PrismaClient, tenantId: string) {
  await prisma.orderItem.deleteMany({ where: { order: { tenantId } } });
  await prisma.order.deleteMany({ where: { tenantId } });
  await prisma.rfqItem.deleteMany({ where: { rfq: { tenantId } } });
  await prisma.rfq.deleteMany({ where: { tenantId } });

  await prisma.inventoryReceipt.deleteMany({ where: { tenantId } });
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId } } });
  await prisma.purchaseOrder.deleteMany({ where: { tenantId } });

  await prisma.procurementRfq.updateMany({ where: { tenantId }, data: { awardedResponseId: null } });
  await prisma.procurementRfqResponseItem.deleteMany({
    where: { rfqItem: { rfq: { tenantId } } },
  });
  await prisma.procurementRfqResponse.deleteMany({
    where: { rfqSupplier: { rfq: { tenantId } } },
  });
  await prisma.procurementRfqSupplier.deleteMany({ where: { rfq: { tenantId } } });
  await prisma.procurementRfqItem.deleteMany({ where: { rfq: { tenantId } } });
  await prisma.procurementRfq.deleteMany({ where: { tenantId } });

  await prisma.procurementRequisition.deleteMany({ where: { tenantId } });

  await prisma.productionBatchInputLot.deleteMany({ where: { tenantId } });
  await prisma.productionBatchQualityEvent.deleteMany({ where: { tenantId } });
  await prisma.productionBatch.deleteMany({ where: { tenantId } });
  await prisma.productionOrder.deleteMany({ where: { tenantId } });

  await prisma.qualityCorrectiveAction.deleteMany({ where: { tenantId } });
  await prisma.qualityExceptionEvent.deleteMany({ where: { tenantId } });
  await prisma.qualityException.deleteMany({ where: { tenantId } });

  await prisma.action.deleteMany({ where: { tenantId } });
  await prisma.workflow.deleteMany({ where: { tenantId } });
  await prisma.communicationDraft.deleteMany({ where: { tenantId } });
  await prisma.opportunity.deleteMany({ where: { tenantId } });
  await prisma.activity.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.inventorySnapshot.deleteMany({ where: { tenantId } });

  await prisma.tenant.delete({ where: { id: tenantId } });
}
