/** Assign sub-lanes for overlapping bars on parallel-capacity workstations. */

export type BarLaneInput = {
  id: string;
  workstationId: string;
  start: string;
  end: string;
};

export type BarLaneOutput = {
  subLane: number;
  laneCount: number;
};

export function assignParallelSubLanes(
  bars: BarLaneInput[],
  parallelCapacityByWorkstation: Map<string, number>
): Map<string, BarLaneOutput> {
  const byWs = new Map<string, BarLaneInput[]>();
  for (const bar of bars) {
    const list = byWs.get(bar.workstationId) ?? [];
    list.push(bar);
    byWs.set(bar.workstationId, list);
  }

  const result = new Map<string, BarLaneOutput>();

  for (const [wsId, list] of byWs) {
    const capacity = Math.max(1, parallelCapacityByWorkstation.get(wsId) ?? 1);
    if (capacity <= 1) {
      for (const bar of list) result.set(bar.id, { subLane: 0, laneCount: 1 });
      continue;
    }

    const sorted = [...list].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    const laneEnds: number[] = Array.from({ length: capacity }, () => 0);
    let maxLaneUsed = 0;

    for (const bar of sorted) {
      const startMs = new Date(bar.start).getTime();
      const endMs = new Date(bar.end).getTime();
      let lane = 0;
      for (let i = 0; i < capacity; i += 1) {
        if (laneEnds[i]! <= startMs) {
          lane = i;
          break;
        }
        lane = i;
      }
      if (laneEnds[lane]! > startMs) {
        lane = laneEnds.findIndex((end) => end <= startMs);
        if (lane < 0) lane = laneEnds.indexOf(Math.min(...laneEnds));
      }
      laneEnds[lane] = Math.max(laneEnds[lane]!, endMs);
      maxLaneUsed = Math.max(maxLaneUsed, lane + 1);
      result.set(bar.id, { subLane: lane, laneCount: maxLaneUsed });
    }

    const laneCount = Math.max(1, maxLaneUsed);
    for (const bar of list) {
      const row = result.get(bar.id)!;
      result.set(bar.id, { ...row, laneCount });
    }
  }

  return result;
}
