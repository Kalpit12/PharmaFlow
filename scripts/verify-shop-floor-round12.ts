/**
 * Round 12 — shop-floor completeness (pure logic, no database).
 * Pause reasons, offline queue replay, breakdown capacity windows, duration learning.
 */
import assert from "node:assert/strict";

import { availabilityAfterBreakdown, splitDownWindow } from "../src/lib/operations/breakdown-window";
import { buildDurationSuggestions, loggedRunMinutes, median } from "../src/lib/operations/duration-learning";
import {
  OFFLINE_QUEUE_KEY,
  classifyReplay,
  enqueue,
  flushQueue,
  readQueue,
  type QueueStorage,
} from "../src/lib/production-execution/offline-queue";
import {
  formatPauseReason,
  isDowntimePause,
  parsePauseReasonCode,
  readPauseReason,
} from "../src/lib/production-execution/pause-reasons";
import { formatPauseReason as legacyLabel, SHOP_FLOOR_PAUSE_REASONS } from "../src/lib/production-execution/shop-floor";
import { OFFLINE_LOG_MAX_AGE_MS, clampRecordedAt, parseShopFloorBody } from "../src/lib/production-execution/shop-floor-action-input";

let checks = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log(`  ✓ ${name}`);
  });
}

function memoryStorage(): QueueStorage & { dump(): string | null } {
  let value: string | null = null;
  return {
    getItem: (key) => (key === OFFLINE_QUEUE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === OFFLINE_QUEUE_KEY) value = next;
    },
    dump: () => value,
  };
}

const t = (iso: string) => new Date(iso);

async function main() {
  console.log("Pause reasons");
  await check("codes parse case-insensitively, unknown → null", () => {
    assert.equal(parsePauseReasonCode("breakdown"), "BREAKDOWN");
    assert.equal(parsePauseReasonCode("nap"), null);
  });
  await check("breakdown / material / QA pauses count as downtime, breaks do not", () => {
    assert.equal(isDowntimePause("BREAKDOWN"), true);
    assert.equal(isDowntimePause("MATERIAL_MISSING"), true);
    assert.equal(isDowntimePause("WAITING_QA"), true);
    assert.equal(isDowntimePause("OPERATOR_BREAK"), false);
    assert.equal(isDowntimePause(null), false);
  });
  await check("format/read round-trip keeps the note", () => {
    const text = formatPauseReason("MATERIAL_MISSING", "foil roll not issued");
    assert.equal(text, "MATERIAL_MISSING · foil roll not issued");
    assert.deepEqual(readPauseReason(text), { code: "MATERIAL_MISSING", label: "Material missing", note: "foil roll not issued" });
    assert.equal(readPauseReason("Free text from 2025").label, "Free text from 2025");
  });
  await check("Execution page list is the same list (legacy labels still resolve)", () => {
    assert.ok(SHOP_FLOOR_PAUSE_REASONS.some((row) => row.id === "OPERATOR_BREAK"));
    assert.equal(legacyLabel("BREAKDOWN"), "Breakdown");
  });

  console.log("Offline timestamps");
  const now = t("2026-10-30T10:00:00Z");
  await check("future clamps to now, stale (>24h) refuses, junk ignored", () => {
    assert.equal(clampRecordedAt("2026-10-30T11:00:00Z", now)?.toISOString(), now.toISOString());
    assert.equal(clampRecordedAt(new Date(now.getTime() - OFFLINE_LOG_MAX_AGE_MS - 1).toISOString(), now), null);
    assert.equal(clampRecordedAt("not a date", now), undefined);
    assert.equal(clampRecordedAt("2026-10-30T09:30:00Z", now)?.toISOString(), "2026-10-30T09:30:00.000Z");
  });
  await check("body parser reads code, expected op and quantities", () => {
    const body = parseShopFloorBody(
      { reasonCode: "waiting_qa", expectedOperationId: "op-1", producedQuantity: "120", scrapQuantity: "", reason: "x" },
      now
    );
    assert.equal(body.reasonCode, "WAITING_QA");
    assert.equal(body.expectedOperationId, "op-1");
    assert.equal(body.producedQuantity, 120);
    assert.equal(body.scrapQuantity, undefined);
  });

  console.log("Offline queue");
  await check("replay status classification", () => {
    assert.equal(classifyReplay(200), "sent");
    assert.equal(classifyReplay(409), "duplicate");
    assert.equal(classifyReplay(400), "rejected");
    assert.equal(classifyReplay(503), "offline");
    assert.equal(classifyReplay(null), "offline");
  });
  await check("enqueue stamps tap time; flush keeps order and stops at first network failure", async () => {
    const storage = memoryStorage();
    enqueue(storage, { orderId: "o1", orderNumber: "ORD1", path: "start", body: {} }, t("2026-10-30T08:00:00Z"));
    enqueue(storage, { orderId: "o1", orderNumber: "ORD1", path: "pause", body: { reasonCode: "BREAKDOWN" } }, t("2026-10-30T08:30:00Z"));
    enqueue(storage, { orderId: "o1", orderNumber: "ORD1", path: "resume", body: {} }, t("2026-10-30T09:00:00Z"));
    assert.equal(readQueue(storage)[1]!.body.recordedAt, "2026-10-30T08:30:00.000Z");

    const seen: string[] = [];
    const statuses = [200, 409, null];
    const first = await flushQueue(storage, async (item) => {
      seen.push(item.path);
      return statuses.shift() ?? null;
    });
    assert.deepEqual(seen, ["start", "pause", "resume"]);
    assert.deepEqual([first.sent, first.duplicates, first.remaining], [1, 1, 1]);
    assert.equal(readQueue(storage)[0]!.path, "resume");

    const second = await flushQueue(storage, async () => 400);
    assert.equal(second.rejected.length, 1);
    assert.equal(readQueue(storage).length, 0);
  });
  await check("corrupt storage reads as empty", () => {
    const storage = memoryStorage();
    storage.setItem(OFFLINE_QUEUE_KEY, "{not json");
    assert.deepEqual(readQueue(storage), []);
    assert.deepEqual(readQueue(null), []);
  });

  console.log("Breakdown capacity");
  const dayShift = [{ startMinute: 510, endMinute: 1050 }]; // 08:30–17:30
  const twoShifts = [
    { startMinute: 510, endMinute: 1050 },
    { startMinute: 1140, endMinute: 1440 },
  ];
  await check("down 10:00–12:00 keeps 12:00–17:30", () => {
    assert.deepEqual(availabilityAfterBreakdown(dayShift, 600, 720), { closed: false, startMinute: 720, endMinute: 1050 });
  });
  await check("down past shift end closes the day", () => {
    assert.deepEqual(availabilityAfterBreakdown(dayShift, 900, 1100), { closed: true });
  });
  await check("down into the night gap keeps the night shift", () => {
    assert.deepEqual(availabilityAfterBreakdown(twoShifts, 1000, 1100), { closed: false, startMinute: 1140, endMinute: 1440 });
  });
  await check("overnight window splits across plant days", () => {
    assert.deepEqual(splitDownWindow(1380, 180), [
      { dayOffset: 0, from: 1380, to: 1440 },
      { dayOffset: 1, from: 0, to: 120 },
    ]);
    assert.deepEqual(splitDownWindow(600, 0), []);
  });

  console.log("Duration learning");
  const ev = (type: string, iso: string) => ({ eventType: type, recordedAt: t(iso) });
  await check("logged minutes exclude pauses; open timers return null", () => {
    assert.equal(
      loggedRunMinutes([
        ev("START", "2026-10-20T08:00:00Z"),
        ev("PAUSE", "2026-10-20T09:00:00Z"),
        ev("RESUME", "2026-10-20T09:30:00Z"),
        ev("STOP", "2026-10-20T10:00:00Z"),
      ]),
      90
    );
    assert.equal(loggedRunMinutes([ev("START", "2026-10-20T08:00:00Z")]), null);
    assert.equal(median([3, 1, 2, 10]), 2.5);
  });

  const steps = [
    { id: "r-comp", code: "COMP", name: "Compression", productName: "Paracetamol 500", runMinutesPerBatch: 240, isQcHold: false },
    { id: "r-qc", code: "QC", name: "QC hold", productName: "Paracetamol 500", runMinutesPerBatch: 1440, isQcHold: true },
    { id: "r-blend", code: "BLEND", name: "Blending", productName: "Paracetamol 500", runMinutesPerBatch: 60, isQcHold: false },
  ];
  const sample = (id: string, step: string, planned: number, minutes: number, ws = "ws-a") => ({
    operationId: id,
    routingOperationId: step,
    workstationId: ws,
    plannedMinutes: planned,
    events: [ev("START", "2026-10-20T08:00:00Z"), { eventType: "STOP", recordedAt: new Date(t("2026-10-20T08:00:00Z").getTime() + minutes * 60_000) }],
  });

  await check("compression 25% slower over 4 logs → suggests 300 min; QC hold and on-plan steps ignored", () => {
    const suggestions = buildDurationSuggestions(
      [
        sample("1", "r-comp", 240, 300),
        sample("2", "r-comp", 240, 290, "ws-b"),
        sample("3", "r-comp", 240, 310),
        sample("4", "r-comp", 240, 300),
        sample("5", "r-qc", 1440, 3000),
        sample("6", "r-qc", 1440, 3000),
        sample("7", "r-qc", 1440, 3000),
        sample("8", "r-blend", 60, 62),
        sample("9", "r-blend", 60, 58),
        sample("10", "r-blend", 60, 61),
      ],
      steps
    );
    assert.equal(suggestions.length, 1);
    const [s] = suggestions;
    assert.equal(s!.routingOperationId, "r-comp");
    assert.equal(s!.suggestedRunMinutes, 300);
    assert.equal(s!.sampleCount, 4);
    assert.equal(s!.confidence, "LOW");
    assert.equal(s!.byWorkstation[0]!.workstationId, "ws-a");
  });
  await check("needs ≥3 samples; outliers (timer left on) are dropped", () => {
    assert.equal(buildDurationSuggestions([sample("1", "r-comp", 240, 400), sample("2", "r-comp", 240, 400)], steps).length, 0);
    assert.equal(
      buildDurationSuggestions(
        [sample("1", "r-comp", 240, 3000), sample("2", "r-comp", 240, 3000), sample("3", "r-comp", 240, 3000)],
        steps
      ).length,
      0
    );
  });

  console.log(`\nverify-shop-floor-round12: ${checks} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
