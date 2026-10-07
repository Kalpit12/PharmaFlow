/** Published list prices — illustrative stack math only (VAT excl.). */

export const PRICING_FX = {
  eurToKes: 145,
  usdToKes: 132,
} as const;

export const SKYPLANNER_LIST = {
  baseEurPerMonth: 199,
  includedWorkstations: 5,
  extraWorkstationEurPerMonth: 20,
} as const;

export const POWER_BI_LIST = {
  proUsdPerUserPerMonth: 14,
} as const;

export const PHARMAFLOW_LIST_KES = {
  plant: 24_500,
  network: 52_000,
  group: 94_000,
} as const;

export type PharmaflowPlanId = "plant" | "network" | "group";

export function skyPlannerMonthlyKes(workstations: number): number {
  const ws = Math.max(1, Math.min(250, Math.round(workstations)));
  const extra = Math.max(0, ws - SKYPLANNER_LIST.includedWorkstations);
  const eur = SKYPLANNER_LIST.baseEurPerMonth + extra * SKYPLANNER_LIST.extraWorkstationEurPerMonth;
  return Math.round(eur * PRICING_FX.eurToKes);
}

export function powerBiProMonthlyKes(reportUsers: number): number {
  const users = Math.max(0, Math.min(200, Math.round(reportUsers)));
  return Math.round(users * POWER_BI_LIST.proUsdPerUserPerMonth * PRICING_FX.usdToKes);
}

export function stackMonthlyKes(workstations: number, reportUsers: number): number {
  return skyPlannerMonthlyKes(workstations) + powerBiProMonthlyKes(reportUsers);
}

export function recommendPharmaflowPlan(workstations: number, reportUsers: number): {
  id: PharmaflowPlanId;
  monthlyKes: number;
  label: string;
} {
  const ws = Math.round(workstations);
  const users = Math.round(reportUsers);
  if (ws <= 8 && users <= 25) {
    return { id: "plant", monthlyKes: PHARMAFLOW_LIST_KES.plant, label: "Plant" };
  }
  if (ws <= 15 && users <= 80) {
    return { id: "network", monthlyKes: PHARMAFLOW_LIST_KES.network, label: "Network" };
  }
  return { id: "group", monthlyKes: PHARMAFLOW_LIST_KES.group, label: "Group" };
}

export function compareStack(workstations: number, reportUsers: number) {
  const stack = stackMonthlyKes(workstations, reportUsers);
  const sky = skyPlannerMonthlyKes(workstations);
  const bi = powerBiProMonthlyKes(reportUsers);
  const pharma = recommendPharmaflowPlan(workstations, reportUsers);
  const savings = stack - pharma.monthlyKes;
  const savingsPct = stack > 0 ? Math.round((savings / stack) * 100) : 0;
  return { stack, sky, bi, pharma, savings, savingsPct };
}

export function formatKes(amount: number): string {
  return `KSh ${amount.toLocaleString("en-KE")}`;
}
