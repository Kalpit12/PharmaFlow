/** Maps routing step codes to machine workstation codes (demo plant). */

export const STEP_CODE_TO_MACHINE_CODES: Record<string, readonly string[]> = {
  DISP: ["DISP"],
  DISPENSE: ["DISP"],
  DISPENSING: ["DISP"],
  GRAN: ["GRN-1", "GRN-2"],
  GRANULATION: ["GRN-1", "GRN-2"],
  FBD: ["FBD"],
  DRY: ["FBD"],
  BLND: ["BLND"],
  BLEND: ["BLND"],
  BLENDING: ["BLND"],
  COMP: ["CMP-1", "CMP-2", "CMP-3"],
  COMPRESS: ["CMP-1", "CMP-2", "CMP-3"],
  COMPRESSION: ["CMP-1", "CMP-2", "CMP-3"],
  COAT: ["COAT"],
  COATING: ["COAT"],
  ENC: ["ENC"],
  ENCAPSULATE: ["ENC"],
  ENCAPSULATION: ["ENC"],
  COMPOUND: ["COMPOUND-1"],
  COMPOUNDING: ["COMPOUND-1"],
  FILL: ["LIQ-FILL"],
  "LIQ-FILL": ["LIQ-FILL"],
  PACK: ["BLST-A", "BLST-B"],
  PACKING: ["BLST-A", "BLST-B"],
  BLISTER: ["BLST-A", "BLST-B"],
  QC: ["QC-HOLD"],
  "QC-HOLD": ["QC-HOLD"],
};

export type QualifiedResourceRow = {
  workstationId: string;
  efficiencyPercent: number;
  preferred: boolean;
  resourceRole?: "STANDARD" | "ALTERNATE" | "SUBCONTRACT";
};

function normalizeStepCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function machineCodesForStep(operationCode: string): readonly string[] {
  const normalized = normalizeStepCode(operationCode);
  return (
    STEP_CODE_TO_MACHINE_CODES[normalized] ??
    STEP_CODE_TO_MACHINE_CODES[normalized.replace(/ING$/i, "")] ??
    (normalized.includes("PACK") ? STEP_CODE_TO_MACHINE_CODES.PACK : undefined) ??
    (normalized.includes("GRAN") ? STEP_CODE_TO_MACHINE_CODES.GRAN : undefined) ??
    []
  );
}

export function resolveQualifiedResources(input: {
  operationCode: string;
  routingResources: QualifiedResourceRow[];
  workstationId: string | null;
  workstationIdByCode: Map<string, string>;
}): QualifiedResourceRow[] {
  if (input.routingResources.length > 0) return input.routingResources;

  const codes = machineCodesForStep(input.operationCode);
  const fromCodes: QualifiedResourceRow[] = codes.flatMap((code, index) => {
    const workstationId = input.workstationIdByCode.get(code);
    if (!workstationId) return [];
    return [
      {
        workstationId,
        efficiencyPercent: index === 0 ? 100 : 95,
        preferred: index === 0,
        resourceRole: "STANDARD" as const,
      },
    ];
  });

  if (fromCodes.length > 0) return fromCodes;

  if (input.workstationId) {
    return [
      {
        workstationId: input.workstationId,
        efficiencyPercent: 100,
        preferred: true,
        resourceRole: "STANDARD",
      },
    ];
  }
  return [];
}
