"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WORKSTATION_CSV_TEMPLATE } from "@/lib/operations/workstation-csv";
import { RoutingDagPreview } from "@/components/operations/RoutingDagPreview";
import { WorkstationSettingsDialog } from "@/components/operations/WorkstationSettingsDialog";
import type { PlantModelSnapshot } from "@/lib/server/plant-model";
import { cn } from "@/lib/utils";

function qualTone(status: string): "intel" | "warning" | "danger" | "neutral" {
  if (status === "QUALIFIED") return "intel";
  if (status === "DUE") return "warning";
  if (status === "EXPIRED") return "danger";
  return "neutral";
}

export function PlantModelWorkspace({ data }: { data: PlantModelSnapshot }) {
  const [csv, setCsv] = useState(WORKSTATION_CSV_TEMPLATE);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [settingsWorkstationId, setSettingsWorkstationId] = useState<string | null>(null);

  const phaseChecks = useMemo(
    () => [
      { id: "sites", label: "Sites & departments", done: data.counts.sites > 0 && data.departments.length > 0 },
      { id: "ws", label: "Workstations mapped", done: data.workstations.some((row) => row.siteCode) },
      { id: "routing", label: "Active routings", done: data.counts.activeRoutings > 0 },
      { id: "changeover", label: "Changeover matrix", done: data.counts.changeoverRules > 0 },
      { id: "people", label: "Personnel registry", done: data.counts.employees > 0 },
      { id: "sub", label: "Sub-products", done: data.counts.subAssemblies > 0 },
    ],
    [data]
  );

  const runImport = (dryRun: boolean) => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/plant-model/workstations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        imported?: number;
        rows?: number;
        ok?: boolean;
        issues?: Array<{ line: number; message: string }>;
      };
      if (!response.ok) {
        setMessage(payload.message ?? payload.issues?.map((row) => `Line ${row.line}: ${row.message}`).join(" · ") ?? "Import failed.");
        return;
      }
      if (dryRun) {
        setMessage(`Preview OK — ${payload.rows ?? 0} row(s) valid.`);
        return;
      }
      setMessage(`Imported ${payload.imported ?? 0} workstation(s). Refresh to see updates.`);
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Sites, departments, workstations, routings, and changeovers — the plant model feeds scheduling and capacity planning.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/operations?view=roster">Workstation scheduling</Link>
          </Button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {phaseChecks.map((item) => (
            <li key={item.id}>
              <StatusBadge tone={item.done ? "intel" : "neutral"}>{item.label}</StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Plant model metrics"
        className="grid min-w-0 grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-4 lg:grid-cols-7 sm:divide-y-0"
      >
        {[
          { label: "Sites", value: data.counts.sites },
          { label: "Active lines", value: data.counts.workstations },
          { label: "Routings", value: data.counts.activeRoutings },
          { label: "Changeovers", value: data.counts.changeoverRules },
          { label: "Tools", value: data.counts.tools },
          { label: "People", value: data.counts.employees },
          { label: "Sub-products", value: data.counts.subAssemblies },
        ].map((kpi) => (
          <p key={kpi.label} className="flex flex-col px-3 py-2.5">
            <span className="text-lg font-semibold tabular-nums">{kpi.value}</span>
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</span>
          </p>
        ))}
      </section>

      <Tabs defaultValue="plant" className="min-w-0">
        <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0">
          <TabsTrigger value="plant">Plant structure</TabsTrigger>
          <TabsTrigger value="workstations">Workstations</TabsTrigger>
          <TabsTrigger value="routings">Routings</TabsTrigger>
          <TabsTrigger value="changeover">Changeover</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="subproducts">Sub-products</TabsTrigger>
          <TabsTrigger value="import">CSV import</TabsTrigger>
        </TabsList>

        <TabsContent value="plant" className="mt-3 space-y-3">
          <DataTable
            title="Sites"
            columns={["Code", "Name", "Timezone", "Depts", "Rooms"]}
            rows={data.sites.map((row) => [row.code, row.name, row.timezone, String(row.departmentCount), String(row.roomCount)])}
            empty="No sites yet. Run demo seed or import workstations with siteCode."
          />
          <DataTable
            title="Departments"
            columns={["Site", "Code", "Name"]}
            rows={data.departments.map((row) => [row.siteCode, row.code, row.name])}
            empty="No departments."
          />
          <DataTable
            title="Rooms & areas"
            columns={["Site", "Dept", "Code", "Name", "Shared"]}
            rows={data.rooms.map((row) => [
              row.siteCode,
              row.departmentCode ?? "—",
              row.code,
              row.name,
              row.sharedCapacity ? "Yes" : "No",
            ])}
            empty="No rooms."
          />
          <DataTable
            title="Workstation groups"
            columns={["Code", "Name", "Lines"]}
            rows={data.groups.map((row) => [row.code, row.name, String(row.workstationCount)])}
            empty="No groups."
          />
        </TabsContent>

        <TabsContent value="workstations" className="mt-3">
          <DataTable
            title="Workstations"
            columns={["Code", "Name", "Group", "Site", "Qual", "Clean", "Cap h/d", "Shifts"]}
            rows={data.workstations.map((row) => [
              row.code,
              row.name,
              row.groupCode ?? "—",
              row.siteCode ?? "—",
              row.qualificationStatus,
              row.cleanStatus,
              String(row.capacityHoursPerDay),
              String(row.shiftCount),
            ])}
            empty="No workstations in this tenant."
            rowMeta={data.workstations.map((row) => ({ inactive: !row.active, qual: row.qualificationStatus }))}
            onRowClick={(index) => setSettingsWorkstationId(data.workstations[index]?.id ?? null)}
          />
        </TabsContent>

        <TabsContent value="routings" className="mt-3 space-y-4">
          <DataTable
            title="Active product routings"
            columns={["Product", "SKU", "Routing", "Ver", "Steps", "Deps"]}
            rows={data.routings.map((row) => [
              row.productName,
              row.productSku,
              row.name,
              String(row.version),
              String(row.stepCount),
              String(row.dependencyCount),
            ])}
            empty="No active routings. Configure routings in product master (APS seed)."
          />
          {data.routingGraphs.map((graph) => (
            <RoutingDagPreview
              key={graph.routingId}
              productSku={graph.productSku}
              productName={graph.productName}
              nodes={graph.nodes}
              edges={graph.edges}
            />
          ))}
        </TabsContent>

        <TabsContent value="people" className="mt-3">
          <DataTable
            title="Plant personnel"
            columns={["Code", "Name", "Dept", "Status", "Groups", "Skills"]}
            rows={data.employees.map((row) => [
              row.code,
              row.name,
              row.departmentCode ?? "—",
              row.status,
              row.groupCodes.join(", ") || "—",
              row.skillCodes.join(", ") || "—",
            ])}
            empty="No employees. Import personnel CSV (Operations → Data import) or run demo seed."
          />
        </TabsContent>

        <TabsContent value="subproducts" className="mt-3">
          <DataTable
            title="Sub-product links"
            columns={["Parent SKU", "Parent", "Component SKU", "Component", "Qty / batch", "Seq"]}
            rows={data.subAssemblies.map((row) => [
              row.parentSku,
              row.parentName,
              row.componentSku,
              row.componentName,
              String(row.quantityPerBatch),
              String(row.sequence),
            ])}
            empty="No sub-products linked. Import subassemblies CSV when component products have their own routings."
          />
        </TabsContent>

        <TabsContent value="changeover" className="mt-3">
          <DataTable
            title="Changeover / cleaning matrix"
            columns={["Line", "From", "To", "Minutes", "Level", "Max campaign"]}
            rows={data.changeoverRules.map((row) => [
              row.workstationCode ?? "All lines",
              row.fromFamily,
              row.toFamily,
              String(row.durationMinutes),
              row.level,
              row.maxCampaignBatches != null ? String(row.maxCampaignBatches) : "—",
            ])}
            empty="No changeover rules."
          />
        </TabsContent>

        <TabsContent value="import" className="mt-3">
          <section className="work-surface p-4">
            <h2 className="text-sm font-semibold">Workstation CSV</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns: code, name, kind, capacityHoursPerDay, siteCode, groupCode, active. Creates or updates by code (tenant-scoped).
            </p>
            <textarea
              className="mt-3 min-h-[10rem] w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              aria-label="Workstation CSV"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => runImport(true)}>
                Validate preview
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={() => runImport(false)}>
                Import
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCsv(WORKSTATION_CSV_TEMPLATE)}>
                Reset template
              </Button>
            </div>
            {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
          </section>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Design reference:{" "}
        <Link href="/reports?view=operations" className="text-primary hover:underline">
          Operations report
        </Link>
        {" · "}
        <Link href="/execution/production" className="text-primary hover:underline">
          Shop floor execution
        </Link>
      </p>

      <WorkstationSettingsDialog
        workstationId={settingsWorkstationId}
        open={settingsWorkstationId != null}
        onOpenChange={(open) => {
          if (!open) setSettingsWorkstationId(null);
        }}
      />
    </div>
  );
}

function DataTable({
  title,
  columns,
  rows,
  empty,
  rowMeta,
  onRowClick,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
  rowMeta?: Array<{ inactive?: boolean; qual?: string }>;
  onRowClick?: (index: number) => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-[10px] tracking-wide text-muted-foreground uppercase">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-4 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, index) => (
                <tr
                  key={`${cells[0]}-${index}`}
                  className={cn(
                    "border-t border-border",
                    rowMeta?.[index]?.inactive ? "opacity-50" : null,
                    onRowClick ? "cursor-pointer hover:bg-muted/40" : null
                  )}
                  onClick={onRowClick ? () => onRowClick(index) : undefined}
                >
                  {cells.map((cell, cellIndex) => (
                    <td key={`${index}-${cellIndex}`} className="px-4 py-2 align-middle">
                      {cellIndex === columns.findIndex((c) => c === "Qual") && rowMeta?.[index]?.qual ? (
                        <StatusBadge tone={qualTone(rowMeta[index].qual!)}>{cell}</StatusBadge>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
