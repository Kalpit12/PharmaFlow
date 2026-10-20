"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkstationSettingsPayload = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  allowedParallelJobs: number;
  efficiencyCoefficient: number;
  efficiencyPercent: number;
  dedicatedTo: string;
  displayColor: string | null;
  capacityHoursPerDay: number;
  qualificationStatus: string;
  calibrationDueDate: string | null;
  cleanStatus: string;
  site: { id: string; code: string; name: string } | null;
  group: { id: string; code: string; name: string } | null;
  groups: Array<{ id: string; code: string; name: string }>;
  sites: Array<{ id: string; code: string; name: string }>;
  shifts: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  shiftGrid?: Array<{
    weekday: number;
    dayLabel: string;
    shiftLabel: string;
    timeLabel: string;
    startMinute: number;
    endMinute: number;
  }>;
  exceptions: Array<{ id: string; date: string; reason: string; closed: boolean }>;
  lastQualifiedAt?: string | null;
  nextQualificationDue?: string | null;
  cleanHoldExpiresAt?: string | null;
  lastProductRun?: string | null;
  routingSteps: Array<{ id: string; operationCode: string; operationName: string; productSku: string; productName: string }>;
  auditLogs: Array<{ id: string; at: string; actor: string; action: string; detail: string }>;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 42%)`;
}

export function WorkstationSettingsDialog({
  workstationId,
  open,
  onOpenChange,
  onSaved,
}: {
  workstationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<WorkstationSettingsPayload | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [displayColor, setDisplayColor] = useState("#3b82f6");
  const [parallel, setParallel] = useState(1);
  const [efficiencyPercent, setEfficiencyPercent] = useState(100);
  const [dedicatedTo, setDedicatedTo] = useState("ANY");
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [shiftRows, setShiftRows] = useState<
    Array<{ weekday: number; shiftLabel: string; startMinute: number; endMinute: number }>
  >([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !workstationId) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/workstations/${workstationId}`);
      const payload = (await response.json()) as WorkstationSettingsPayload & { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to load workstation.");
        return;
      }
      setData(payload);
      setCode(payload.code);
      setName(payload.name);
      setGroupId(payload.group?.id ?? "");
      setSiteId(payload.site?.id ?? "");
      setDisplayColor(payload.displayColor ?? defaultColor(payload.code));
      setParallel(payload.allowedParallelJobs);
      setEfficiencyPercent(payload.efficiencyPercent ?? Math.round(payload.efficiencyCoefficient * 100));
      setDedicatedTo(payload.dedicatedTo);
      setActive(payload.active);
      setShiftRows(
        (payload.shiftGrid ?? []).map((row) => ({
          weekday: row.weekday,
          shiftLabel: row.shiftLabel,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        }))
      );
    });
  }, [open, workstationId]);

  const save = () => {
    if (!workstationId) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(`/api/workstations/${workstationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          active,
          allowedParallelJobs: parallel,
          efficiencyPercent,
          dedicatedTo,
          groupId: groupId || null,
          siteId: siteId || null,
          displayColor,
          shiftBands: shiftRows.map((row) => ({
            weekday: row.weekday,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
          })),
        }),
      });
      const payload = (await response.json()) as WorkstationSettingsPayload & { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Save failed.");
        return;
      }
      setData(payload);
      onSaved?.();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(800px,95vw)] max-w-[800px] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? `${data.name} (${data.code})` : "Workstation settings"}</DialogTitle>
        </DialogHeader>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        {data ? (
          <Tabs defaultValue="general">
            <TabsList className="flex w-full flex-nowrap gap-1 overflow-x-auto">
              <TabsTrigger value="general" className="shrink-0 px-2 text-xs">
                General
              </TabsTrigger>
              <TabsTrigger value="shifts" className="shrink-0 px-2 text-xs">
                Shifts
              </TabsTrigger>
              <TabsTrigger value="products" className="shrink-0 px-2 text-xs">
                Products
              </TabsTrigger>
              <TabsTrigger value="qual" className="shrink-0 px-2 text-xs">
                Qualification
              </TabsTrigger>
              <TabsTrigger value="history" className="shrink-0 px-2 text-xs">
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="grid gap-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="ws-code">Code</Label>
                  <Input id="ws-code" value={code} onChange={(event) => setCode(event.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ws-name">Name</Label>
                  <Input id="ws-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="ws-group">Group</Label>
                  <select
                    id="ws-group"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                  >
                    <option value="">—</option>
                    {data.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.code} · {group.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ws-site">Site</Label>
                  <select
                    id="ws-site"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={siteId}
                    onChange={(event) => setSiteId(event.target.value)}
                  >
                    <option value="">—</option>
                    {data.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} · {site.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="ws-color">Colour</Label>
                  <Input
                    id="ws-color"
                    type="color"
                    className="h-9 cursor-pointer p-1"
                    value={displayColor.startsWith("#") ? displayColor : "#64748b"}
                    onChange={(event) => setDisplayColor(event.target.value)}
                  />
                </div>
                <p className="self-end text-xs text-muted-foreground">
                  Capacity {data.capacityHoursPerDay} h/d (from shift template)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="ws-parallel">Parallel capacity</Label>
                  <Input
                    id="ws-parallel"
                    type="number"
                    min={1}
                    value={parallel}
                    onChange={(event) => setParallel(Number(event.target.value))}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ws-eff">Efficiency (%)</Label>
                  <Input
                    id="ws-eff"
                    type="number"
                    step={1}
                    min={10}
                    max={200}
                    value={efficiencyPercent}
                    onChange={(event) => setEfficiencyPercent(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ws-dedicated">Dedicated to (GMP)</Label>
                <select
                  id="ws-dedicated"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={dedicatedTo}
                  onChange={(event) => setDedicatedTo(event.target.value)}
                >
                  <option value="ANY">Any product</option>
                  <option value="GENERAL_ONLY">General (non–beta-lactam)</option>
                  <option value="BETA_LACTAM">Beta-lactam only</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
                Active on schedule
              </label>
            </TabsContent>
            <TabsContent value="shifts" className="pt-3">
              <p className="mb-2 text-xs text-muted-foreground">Weekly template (EAT). Overnight shown as 18:00–06:00 (+1).</p>
              <div className="max-h-52 overflow-y-auto rounded border border-border text-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Day</th>
                      <th className="px-2 py-1">Shift</th>
                      <th className="px-2 py-1">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftRows.map((row, index) => (
                      <tr key={`${row.weekday}-${row.shiftLabel}-${index}`} className="border-t border-border/60">
                        <td className="px-2 py-1">{WEEKDAY[row.weekday]}</td>
                        <td className="px-2 py-1">{row.shiftLabel}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <Input
                              className="h-7 w-14 px-1"
                              type="number"
                              min={0}
                              max={1439}
                              value={row.startMinute}
                              onChange={(event) => {
                                const startMinute = Number(event.target.value);
                                setShiftRows((prev) =>
                                  prev.map((item, i) => (i === index ? { ...item, startMinute } : item))
                                );
                              }}
                            />
                            <span>–</span>
                            <Input
                              className="h-7 w-16 px-1"
                              type="number"
                              min={0}
                              max={2880}
                              value={row.endMinute}
                              onChange={(event) => {
                                const endMinute = Number(event.target.value);
                                setShiftRows((prev) =>
                                  prev.map((item, i) => (i === index ? { ...item, endMinute } : item))
                                );
                              }}
                            />
                            {row.endMinute > 1_440 ? " (+1)" : ""}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.exceptions.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {data.exceptions.map((row) => (
                    <li key={row.id}>
                      {row.date}: {row.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </TabsContent>
            <TabsContent value="products" className="max-h-56 overflow-y-auto pt-3">
              <ul className="space-y-1 text-sm">
                {data.routingSteps.map((step) => (
                  <li key={step.id} className="flex gap-2">
                    <input type="checkbox" checked readOnly aria-readonly className="mt-1" />
                    <span>
                      {step.productSku} · {step.operationCode} {step.operationName}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="qual" className="grid gap-2 pt-3 text-sm">
              <p>
                Qualification: <strong>{data.qualificationStatus}</strong>
              </p>
              <p>Last qualified: {data.lastQualifiedAt ?? "—"}</p>
              <p>Next qualification due: {data.nextQualificationDue ?? "—"}</p>
              <p>Calibration due: {data.calibrationDueDate ?? "—"}</p>
              <p>
                Cleaning: <strong>{data.cleanStatus}</strong>
                {data.cleanHoldExpiresAt ? ` · clean-by ${data.cleanHoldExpiresAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
              <p>Last product run: {data.lastProductRun ?? "—"}</p>
              {data.qualificationStatus === "EXPIRED" ? (
                <p className="text-destructive text-xs">Scheduling blocked until qualification is renewed.</p>
              ) : null}
            </TabsContent>
            <TabsContent value="history" className="max-h-56 overflow-y-auto pt-3">
              <ul className="space-y-2 text-xs">
                {data.auditLogs.map((row) => (
                  <li key={row.id} className="border-b border-border/60 pb-1">
                    <span className="font-medium">{row.at.slice(0, 16).replace("T", " ")}</span> · {row.actor} · {row.action}
                    {row.detail ? ` — ${row.detail}` : ""}
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground">{pending ? "Loading…" : "Select a workstation."}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || !data}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatMin(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
