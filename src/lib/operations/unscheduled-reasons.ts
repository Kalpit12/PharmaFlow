import type { RoutingIssue } from "@/lib/operations/routing";
import type { OrderMaterialConstraint } from "@/lib/operations/material-constraints";

export type UnscheduledReasonInput = {
  operationId: string;
  operationCode: string;
  operationName: string;
  orderLocked: boolean;
  materialScheduleState: string;
  materialConstraint: OrderMaterialConstraint | undefined;
  issue: RoutingIssue | undefined;
  predecessorUnscheduled: boolean;
};

export function describeUnscheduledReason(input: UnscheduledReasonInput): string {
  if (input.materialScheduleState === "BLOCKED" || input.materialConstraint?.state === "BLOCKED") {
    const material =
      input.materialConstraint?.blockedMaterials[0] ??
      input.materialConstraint?.delayedMaterials[0] ??
      "materials";
    const ready = input.materialConstraint?.readyAt;
    if (ready) {
      return `Material: ${material} short until ${ready.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    }
    return `Material: ${material} shortage`;
  }
  if (input.orderLocked) return "Locked / frozen order";
  if (input.predecessorUnscheduled) return "Predecessor unscheduled";
  if (input.issue) {
    switch (input.issue.kind) {
      case "NO_QUALIFIED_RESOURCE":
        return `No workstation qualified for step ${input.operationName || input.operationCode}`;
      case "MATERIAL_UNAVAILABLE":
        return "Material not available for this order";
      case "PAST_DUE":
        return "No capacity before due date";
      case "CYCLIC_DEPENDENCY":
        return "Routing dependency cycle";
      case "INVALID_DURATION":
        return "Invalid operation duration";
      default:
        return input.issue.detail;
    }
  }
  if (input.materialScheduleState === "DELAYED") {
    const material = input.materialConstraint?.delayedMaterials[0] ?? "supply";
    const ready = input.materialConstraint?.readyAt;
    return ready
      ? `Material: ${material} delayed until ${ready.toISOString().slice(0, 16).replace("T", " ")} UTC`
      : `Material: ${material} delayed`;
  }
  return "Not placed in current planning pass";
}
