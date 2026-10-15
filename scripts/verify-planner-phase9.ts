import assert from "node:assert/strict";

import { generateApiKey, hashApiKey } from "../src/lib/server/api-key-auth";
import { parseProductionOrdersCsv, parseShiftsCsv } from "../src/lib/operations/planner-csv-parsers";

const orders = parseProductionOrdersCsv(`orderNumber,productSku,quantity,dueDate,priority
PRO-1,SKU-1,100,2026-12-01,HIGH`);
assert.equal(orders.issues.length, 0);
assert.equal(orders.rows[0]?.priority, "HIGH");

const shifts = parseShiftsCsv(`workstationCode,weekday,startHour,endHour
GRN-01,1,8,16`);
assert.equal(shifts.issues.length, 0);
assert.equal(shifts.rows[0]?.endMinute, 16 * 60);

const key = generateApiKey();
assert.ok(key.rawKey.startsWith("pf_live_"));
assert.equal(hashApiKey(key.rawKey), key.hash);

console.log("verify-planner-phase9: OK");
