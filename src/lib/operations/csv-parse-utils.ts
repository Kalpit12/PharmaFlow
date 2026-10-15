export type CsvIssue = { line: number; message: string };

export function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim());
}

export function parseCsvHeader(text: string): { header: string[]; lines: string[]; issues: CsvIssue[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { header: [], lines: [], issues: [{ line: 0, message: "CSV is empty." }] };
  }
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  return { header, lines, issues: [] };
}

export function colIndex(header: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = header.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}
