export function formatAxisValue(value: number, suffix = ""): string {
  const abs = Math.abs(value);
  let core: string;
  if (abs >= 1_000_000) core = `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 10_000) core = `${Math.round(value / 1000)}K`;
  else if (abs >= 1000) core = `${(value / 1000).toFixed(1)}K`;
  else core = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${core}${suffix}`;
}

/** Upper bound for Y-axis with headroom (Power BI–style clean ticks). */
export function niceAxisMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;
  const exp = Math.floor(Math.log10(rawMax));
  const magnitude = 10 ** exp;
  const normalized = rawMax / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function axisTicks(maxValue: number, steps = 4): number[] {
  const top = niceAxisMax(maxValue);
  const raw = Array.from({ length: steps + 1 }, (_, index) => (index === steps ? top : (top / steps) * index));
  const unique: number[] = [];
  for (const tick of raw) {
    const last = unique[unique.length - 1];
    if (last === undefined || Math.abs(tick - last) > 1e-9) {
      unique.push(tick);
    }
  }
  if (unique.length < 2) return [0, top];
  return unique;
}
