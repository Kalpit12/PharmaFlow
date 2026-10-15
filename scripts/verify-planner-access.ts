import assert from "node:assert/strict";

import {
  departmentScopedRoles,
  mapUserRoleToPlannerRole,
  plannerRoleCapabilities,
} from "../src/lib/auth/planner-access";
import { hasPermission } from "../src/lib/auth/permissions";
import { reorderWidgetTypes } from "../src/lib/operations/planner-widgets";

assert.equal(mapUserRoleToPlannerRole("OPERATOR"), "OPERATOR");
assert.equal(mapUserRoleToPlannerRole("MANAGER"), "HEAD_PLANNER");
assert.equal(mapUserRoleToPlannerRole("SALES"), "SALES");

const operator = plannerRoleCapabilities("OPERATOR");
assert.equal(operator.canExecuteShopFloor, true);
assert.equal(operator.canProposeSchedule, false);
assert.equal(operator.readOnlyPlanner, true);

const planner = plannerRoleCapabilities("PLANNER");
assert.equal(planner.canProposeSchedule, true);
assert.equal(planner.canGlobalRules, false);

assert.equal(departmentScopedRoles("SUPERVISOR"), true);
assert.equal(departmentScopedRoles("PLANNER"), false);

assert.equal(hasPermission("OPERATOR", "production.execute"), true);
assert.equal(hasPermission("OPERATOR", "production.schedule"), false);
assert.equal(hasPermission("OPERATIONS", "production.schedule"), true);
assert.equal(hasPermission("OPERATIONS", "production.global_rules"), false);
assert.equal(hasPermission("MANAGER", "production.global_rules"), true);

const reordered = reorderWidgetTypes(
  ["KPI_STRIP", "JOB_REPORT", "TIMELOG_REPORT"],
  ["TIMELOG_REPORT", "KPI_STRIP", "JOB_REPORT"]
);
assert.deepEqual(reordered, ["TIMELOG_REPORT", "KPI_STRIP", "JOB_REPORT"]);

console.log("verify-planner-access: OK");
