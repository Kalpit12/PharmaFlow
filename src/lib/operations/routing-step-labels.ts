/** Canonical shop-floor step names — never "Process". */

export const ROUTING_STEP_LABELS: Record<string, string> = {
  FBD: "FBD drying",
  BLND: "Blending",
  COMP: "Compression",
  COMPRESS: "Compression",
  COAT: "Coating",
  ENC: "Capsule filling",
  ENCAPSULATE: "Capsule filling",
  COMPOUND: "Compounding",
  FILL: "Liquid filling",
  DPS: "Oral liquid filling",
  PACK: "Packing",
  QUAR: "sFG quarantine",
  QC: "QC release",
  "QC-HOLD": "QC hold",
};

export function routingStepDisplayName(code: string | null | undefined, name?: string | null): string {
  const key = (code ?? "").trim().toUpperCase();
  const raw = (name ?? "").trim();
  if (raw && raw.toUpperCase() !== key && raw.toUpperCase() !== "PROCESS") return raw;
  return ROUTING_STEP_LABELS[key] ?? (raw && raw.toUpperCase() !== "PROCESS" ? raw : key || "Step");
}
