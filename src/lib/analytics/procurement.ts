export type ProcurementPipelineStage = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export type ProcurementPipelineInput = {
  pendingReviewCount: number;
  rfqTotal: number;
  rfqAwaitingResponse: number;
  rfqAwarded: number;
  poDraft: number;
  poPendingApproval: number;
  poApproved: number;
  receivingAwaiting: number;
  receivingPartial: number;
};

/**
 * Independent stage counts — not a forced sequential funnel.
 * Stages with zero count remain visible so empty pipeline states are honest.
 */
export function buildProcurementPipelineStages(input: ProcurementPipelineInput): ProcurementPipelineStage[] {
  return [
    {
      id: "need",
      label: "Needs review",
      count: input.pendingReviewCount,
      href: "/procurement?view=needs-review",
    },
    {
      id: "rfq",
      label: "RFQs",
      count: input.rfqTotal,
      href: "/rfqs",
    },
    {
      id: "responses",
      label: "Responses",
      count: Math.max(0, input.rfqTotal - input.rfqAwaitingResponse),
      href: "/rfqs?status=responses",
    },
    {
      id: "award",
      label: "Awarded",
      count: input.rfqAwarded,
      href: "/rfqs?status=awarded",
    },
    {
      id: "po",
      label: "Purchase orders",
      count: input.poDraft + input.poPendingApproval + input.poApproved,
      href: "/purchase-orders",
    },
    {
      id: "receiving",
      label: "Receiving",
      count: input.receivingAwaiting + input.receivingPartial,
      href: "/receiving",
    },
  ];
}
