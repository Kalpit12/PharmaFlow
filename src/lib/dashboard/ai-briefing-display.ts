/** Turn model output into a scannable briefing (no duplicate paragraph + bullets). */
export function normalizeAiBriefing(summary: string, signals: string[]): { lead: string | null; items: string[] } {
  const items = signals.map((line) => line.trim()).filter(Boolean).slice(0, 5);

  if (items.length > 0) {
    const sentences = summary
      .trim()
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const first = sentences[0] ?? "";
    const lead =
      first.length > 0 && first.length <= 100 && sentences.length === 1
        ? null
        : first.length > 0 && first.length <= 90
          ? first
          : items.length >= 2
            ? `Focus on ${items.length} areas today.`
            : null;
    return { lead, items };
  }

  const sentences = summary
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (sentences.length <= 1) {
    return { lead: summary.trim() || null, items: [] };
  }
  return { lead: sentences[0] ?? null, items: sentences.slice(1) };
}

export function parseSignalMetric(text: string): { metric: string | null; body: string } {
  const match = text.match(/^(\d+)\s+(.+)$/);
  if (match) {
    return { metric: match[1], body: match[2] };
  }
  return { metric: null, body: text };
}
