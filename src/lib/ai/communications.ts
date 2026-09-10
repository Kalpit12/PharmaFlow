export const COMMUNICATION_TYPES = [
  "CUSTOMER_FOLLOW_UP",
  "RFQ_FOLLOW_UP",
  "SALES_OPPORTUNITY_FOLLOW_UP",
  "CUSTOMER_REENGAGEMENT",
] as const;

export type CommunicationTypeName = (typeof COMMUNICATION_TYPES)[number];

export const COMMUNICATION_STATUSES = ["DRAFT", "REVIEWED", "APPROVED", "ARCHIVED"] as const;

export type CommunicationStatusName = (typeof COMMUNICATION_STATUSES)[number];

export const COMMUNICATION_REGISTRY: Record<CommunicationTypeName, { label: string }> = {
  CUSTOMER_FOLLOW_UP: { label: "Customer follow-up" },
  RFQ_FOLLOW_UP: { label: "RFQ follow-up" },
  SALES_OPPORTUNITY_FOLLOW_UP: { label: "Sales opportunity follow-up" },
  CUSTOMER_REENGAGEMENT: { label: "Customer re-engagement" },
};

export function isCommunicationType(value: string): value is CommunicationTypeName {
  return (COMMUNICATION_TYPES as readonly string[]).includes(value);
}

const UNSAFE_MEDICAL = /\b(diagnos|dosage|prescribe|treatment plan|medical advice|patient-specific)\b/i;

export function isUnsafeCommunicationText(value: string): boolean {
  return UNSAFE_MEDICAL.test(value);
}

export type CommunicationDraftView = {
  id: string;
  type: CommunicationTypeName;
  status: CommunicationStatusName;
  customerName: string;
  subject: string;
  body: string;
  reason: string;
  createdAt: string;
  preview: string;
};

export type ModelCommunicationDraft = {
  type: string;
  targetName: string;
  subject: string;
  body: string;
  reason: string;
};

export function parseModelCommunication(raw: unknown): ModelCommunicationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";
  if (type === "NONE" || !isCommunicationType(type)) return null;
  const targetName = typeof row.targetName === "string" ? row.targetName.trim() : "";
  const subject = typeof row.subject === "string" ? row.subject.trim() : "";
  const body = typeof row.body === "string" ? row.body.trim() : "";
  const reason = typeof row.reason === "string" ? row.reason.trim() : "";
  if (!targetName || !subject || !body || !reason) return null;
  if (isUnsafeCommunicationText(`${subject}\n${body}`)) return null;
  return {
    type,
    targetName: targetName.slice(0, 160),
    subject: subject.slice(0, 160),
    body: body.slice(0, 2000),
    reason: reason.slice(0, 400),
  };
}
