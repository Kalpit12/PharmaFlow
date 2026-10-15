import type { PlanningWeights } from "@/lib/operations/routing";

export type PlannerPolicyWeightSource = {
  priorityWeight: number;
  dueDateWeight: number;
  changeoverWeight: number;
  utilizationWeight: number;
  leadTimeWeight?: number;
  onTimeCountWeight?: number;
  customerPriorityWeight?: number;
  similarJobsWeight?: number;
  eligibilityWeight?: number;
};

export function planningWeightsFromPolicy(policy: PlannerPolicyWeightSource): PlanningWeights {
  return {
    priorityWeight: policy.priorityWeight,
    dueDateWeight: policy.dueDateWeight,
    changeoverWeight: policy.changeoverWeight,
    utilizationWeight: policy.utilizationWeight,
    leadTimeWeight: policy.leadTimeWeight ?? 25,
    onTimeCountWeight: policy.onTimeCountWeight ?? 30,
    customerPriorityWeight: policy.customerPriorityWeight ?? 20,
    similarJobsWeight: policy.similarJobsWeight ?? 15,
    eligibilityWeight: policy.eligibilityWeight ?? 10,
  };
}
