import assert from "node:assert/strict";

import { layoutRoutingDag } from "../src/lib/operations/routing-dag-layout";
import {
  parseExceptionsCsv,
  parsePersonnelCsv,
  parseSubAssembliesCsv,
  parseToolsCsv,
  PLANNER_CSV_TEMPLATES,
} from "../src/lib/operations/planner-csv-parsers";

const personnel = parsePersonnelCsv(PLANNER_CSV_TEMPLATES.personnel);
assert.equal(personnel.issues.length, 0);
assert.equal(personnel.rows[0]?.code, "OP-001");
assert.deepEqual(personnel.rows[0]?.skillCodes, ["GRAN", "COMP"]);

const tools = parseToolsCsv(PLANNER_CSV_TEMPLATES.tools);
assert.equal(tools.issues.length, 0);
assert.equal(tools.rows[0]?.workstationCodes.length, 2);

const exceptions = parseExceptionsCsv(PLANNER_CSV_TEMPLATES.exceptions);
assert.equal(exceptions.issues.length, 0);
assert.equal(exceptions.rows[0]?.closed, true);

const sub = parseSubAssembliesCsv(PLANNER_CSV_TEMPLATES.subassemblies);
assert.equal(sub.issues.length, 0);
assert.equal(sub.rows[0]?.quantityPerBatch, 1);

const laidOut = layoutRoutingDag(
  [
    { id: "b", code: "B", name: "Blend", sequence: 20, isQcHold: false },
    { id: "a", code: "A", name: "Gran", sequence: 10, isQcHold: false },
  ],
  [{ fromId: "a", toId: "b" }]
);
assert.equal(laidOut[0]?.id, "a");
assert.equal(laidOut[1]?.id, "b");

console.log("verify-planner-phase11: OK");
