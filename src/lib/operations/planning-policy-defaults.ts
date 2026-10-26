import type { AutopilotMode } from "@prisma/client";

/** SkyPlanner-style defaults for Global Rules reset. */
export const PLANNING_POLICY_DEFAULTS = {
  priorityWeight: 40,
  dueDateWeight: 35,
  changeoverWeight: 15,
  utilizationWeight: 10,
  leadTimeWeight: 25,
  onTimeCountWeight: 30,
  customerPriorityWeight: 20,
  similarJobsWeight: 15,
  eligibilityWeight: 10,
  considerMaterials: true,
  considerEligibility: true,
  freezeMinutes: 120,
  autopilotMode: "OFF" as AutopilotMode,
  useGlobalOptimizer: true,
};

export const GLOBAL_RULE_HELP: Record<string, string> = {
  dueDateWeight: "Prefer jobs that would otherwise miss the customer due date.",
  priorityWeight: "When the plant is congested, start higher-priority orders first.",
  changeoverWeight: "Group similar products to cut cleaning and changeover time.",
  onTimeCountWeight: "Maximise how many jobs finish on time, not only the worst late one.",
  leadTimeWeight: "Pull work earlier so orders spend less time in the plant.",
  similarJobsWeight: "Run similar products in succession on the same line.",
  customerPriorityWeight: "Prefer key-account orders when two jobs compete.",
  eligibilityWeight: "Prefer jobs close to their earliest-start or expiry window.",
  utilizationWeight: "Keep work on preferred / qualified resources when possible.",
};
