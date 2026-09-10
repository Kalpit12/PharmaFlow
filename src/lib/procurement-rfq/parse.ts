export function parseProcurementRfqRef(label?: string | null): string | null {
  if (!label) return null;
  const token = label.match(/procurement-rfq:([a-f0-9-]+)/i)?.[1];
  if (token) return token;
  if (/^[a-f0-9-]{36}$/i.test(label.trim())) return label.trim();
  return null;
}

export function procurementRfqAiLabel(rfqId: string): string {
  return `procurement-rfq:${rfqId}`;
}
