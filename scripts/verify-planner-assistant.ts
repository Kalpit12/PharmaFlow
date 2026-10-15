import assert from "node:assert/strict";

import {
  parsePlannerAssistantMessage,
  PLANNER_ASSISTANT_HELP,
} from "../src/lib/operations/planner-assistant-intents";

const order = parsePlannerAssistantMessage(
  "Create an order for 20 batches of Amoxicillin 500 for customer Nairobi due in 3 weeks"
);
assert.equal(order.intent, "CREATE_FIRM_ORDER");
assert.ok(order.productQuery?.toLowerCase().includes("amoxicillin"));
assert.equal(order.batchCount, 20);
assert.equal(order.dueInWeeks, 3);

const reschedule = parsePlannerAssistantMessage("Please schedule unscheduled jobs");
assert.equal(reschedule.intent, "PROPOSE_RESCHEDULE_ALL");

const down = parsePlannerAssistantMessage("What happens if CMP-2 is down tomorrow?");
assert.equal(down.intent, "WORKSTATION_DOWNTIME");
assert.equal(down.workstationQuery, "CMP-2");

assert.ok(PLANNER_ASSISTANT_HELP.toLowerCase().includes("accept"));

console.log("verify-planner-assistant: OK");
