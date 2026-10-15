"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlannerCsvKind } from "@/lib/operations/planner-csv-parsers";
import { PLANNER_CSV_TEMPLATES } from "@/lib/operations/planner-csv-parsers";

const KINDS: PlannerCsvKind[] = [
  "workstations",
  "orders",
  "customers",
  "shifts",
  "products",
  "materials",
  "routings",
  "personnel",
  "tools",
  "exceptions",
  "subassemblies",
];

export function PlannerDataImportWorkspace() {
  const [kind, setKind] = useState<PlannerCsvKind>("workstations");
  const [csv, setCsv] = useState(PLANNER_CSV_TEMPLATES.workstations);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const loadTemplate = (next: PlannerCsvKind) => {
    setKind(next);
    setCsv(PLANNER_CSV_TEMPLATES[next]);
    setPreview([]);
    setMessage(null);
  };

  const run = (dryRun: boolean) => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(`/api/planner-import/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });
      const payload = (await response.json()) as {
        message?: string;
        ok?: boolean;
        rowCount?: number;
        issues?: Array<{ line: number; message: string }>;
        preview?: string[];
        imported?: number;
      };
      if (!response.ok) {
        setMessage(payload.message ?? payload.issues?.[0]?.message ?? "Import failed.");
        setPreview([]);
        return;
      }
      if (dryRun) {
        setPreview(payload.preview ?? []);
        setMessage(`Validation OK · ${payload.rowCount ?? 0} row(s) ready.`);
        return;
      }
      setMessage(`Imported ${payload.imported ?? 0} row(s). Refresh to see updates.`);
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4 text-sm text-muted-foreground">
        Phase 9 onboarding — paste CSV, validate (dry run), then import. Templates match SkyPlanner-style plant setup: workstations,
        shifts, products/materials, routings, firm orders, and customers.
      </section>

      <Tabs value={kind} onValueChange={(value) => loadTemplate(value as PlannerCsvKind)}>
        <TabsList className="flex h-auto flex-wrap">
          {KINDS.map((row) => (
            <TabsTrigger key={row} value={row}>
              {row}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((row) => (
          <TabsContent key={row} value={row} className="mt-3 space-y-3">
            <Label htmlFor="csv-input">CSV</Label>
            <textarea
              id="csv-input"
              className="min-h-[200px] w-full rounded-sm border border-border bg-background p-3 font-mono text-xs"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(true)}>
                Validate preview
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={() => run(false)}>
                Import
              </Button>
            </div>
            {preview.length > 0 ? (
              <p className="text-xs text-muted-foreground">Preview: {preview.join(", ")}</p>
            ) : null}
            {message ? <p className="text-sm">{message}</p> : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
