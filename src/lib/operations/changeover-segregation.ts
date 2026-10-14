/** Pharma campaign / potency groups used when no explicit ChangeoverRule exists. */
export const CHANGEOVER_FAMILY_GROUP: Record<string, string> = {
  GENERAL: "NON_POTENT",
  OTC: "NON_POTENT",
  BETA_LACTAM: "POTENT",
  PENICILLIN: "POTENT",
  HORMONE: "POTENT",
};

export const DEFAULT_SEGREGATION_CLEAN_MINUTES = 120;

export function segregationTransitionRequiresClean(
  fromFamily: string | null,
  toFamily: string | null
): boolean {
  if (!fromFamily || !toFamily || fromFamily === toFamily) return false;
  const fromGroup = CHANGEOVER_FAMILY_GROUP[fromFamily] ?? fromFamily;
  const toGroup = CHANGEOVER_FAMILY_GROUP[toFamily] ?? toFamily;
  return fromGroup !== toGroup;
}

export function syntheticSegregationRuleId(fromFamily: string, toFamily: string): string {
  return `seg:${fromFamily}->${toFamily}`;
}
