"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { WorkstationSettingsDialog } from "@/components/operations/WorkstationSettingsDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkstationRosterSnapshot } from "@/lib/server/workstation-roster";
import { cn } from "@/lib/utils";

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function WorkstationRosterWorkspace({ data }: { data: WorkstationRosterSnapshot }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [groupByGroup, setGroupByGroup] = useState(false);
  const [settingsWsId, setSettingsWsId] = useState<string | null>(null);
  const [editChip, setEditChip] = useState<WorkstationRosterSnapshot["assignments"][number] | null>(null);
  const [editEmployeeId, setEditEmployeeId] = useState<string>("");

  const hrefForWeek = useCallback(
    (weekStart: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "roster");
      next.set("rosterWeek", weekStart);
      return `/operations?${next.toString()}`;
    },
    [searchParams]
  );

  const workstations = useMemo(() => {
    const rows = [...data.workstations];
    if (groupByGroup) {
      rows.sort((a, b) => {
        const ga = a.groupName ?? "";
        const gb = b.groupName ?? "";
        if (ga !== gb) return ga.localeCompare(gb);
        return a.name.localeCompare(b.name);
      });
    }
    return rows;
  }, [data.workstations, groupByGroup]);

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, WorkstationRosterSnapshot["assignments"]>();
    for (const row of data.assignments) {
      const key = `${row.workstationId}|${row.date}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.startMinute - b.startMinute);
    }
    return map;
  }, [data.assignments]);

  const goToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    router.push(hrefForWeek(today));
  };

  const duplicateToDate = (assignmentId: string, targetDate: string) => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/workstation-roster/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, targetDate }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Duplicate failed.");
        return;
      }
      setMessage("Shift duplicated.");
      router.refresh();
    });
  };

  const saveChip = () => {
    if (!editChip) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/workstation-roster/assignment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editChip.id.startsWith("tpl:") ? undefined : editChip.id,
          workstationId: editChip.workstationId,
          date: editChip.date,
          startMinute: editChip.startMinute,
          endMinute: editChip.endMinute,
          employeeId: editEmployeeId || null,
          shiftLabel: editChip.shiftLabel,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Save failed.");
        return;
      }
      setEditChip(null);
      router.refresh();
    });
  };

  const deleteChip = () => {
    if (!editChip || editChip.id.startsWith("tpl:")) {
      setEditChip(null);
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/workstation-roster/assignment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editChip.id }),
      });
      if (!response.ok) {
        setMessage("Delete failed.");
        return;
      }
      setEditChip(null);
      router.refresh();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Workstation scheduling</p>
          <p className="text-xs text-muted-foreground">
            {data.weekLabel} · EAT · Ctrl+drag a chip to duplicate to another day
            {data.warningCount > 0 ? (
              <span className="ml-2 font-medium text-destructive">
                · {data.warningCount} staffing warning{data.warningCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={groupByGroup ? "secondary" : "outline"} onClick={() => setGroupByGroup((v) => !v)}>
            Group
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/operations?view=plant">Plant model</Link>
          </Button>
          <Button type="button" size="icon-sm" variant="outline" asChild aria-label="Previous week">
            <Link href={hrefForWeek(addDaysYmd(data.weekStart, -7))}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={goToday}>
            Today
          </Button>
          <Button type="button" size="icon-sm" variant="outline" asChild aria-label="Next week">
            <Link href={hrefForWeek(addDaysYmd(data.weekStart, 7))}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {message ? <p className="px-1 text-xs text-muted-foreground">{message}</p> : null}

      <section className="work-surface overflow-x-auto">
        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[200px] bg-background p-2">Workstation</th>
              {data.days.map((day) => (
                <th key={day.date} className="min-w-[120px] p-2 font-medium text-foreground">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workstations.map((ws) => (
              <tr key={ws.id} className="border-b border-border/60 align-top">
                <td className="sticky left-0 z-10 bg-background p-2">
                  <button
                    type="button"
                    className="text-left hover:text-primary"
                    onClick={() => setSettingsWsId(ws.id)}
                  >
                    <p className="font-medium leading-tight">{ws.name}</p>
                    <p className="text-xs text-muted-foreground">{ws.code}</p>
                  </button>
                </td>
                {data.days.map((day) => {
                  const key = `${ws.id}|${day.date}`;
                  const chips = assignmentsByCell.get(key) ?? [];
                  const maintenance = ws.maintenanceDates.includes(day.date);
                  return (
                    <td
                      key={key}
                      className={cn(
                        "p-1.5",
                        maintenance && "bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(120,120,120,0.15)_4px,rgba(120,120,120,0.15)_8px)]"
                      )}
                      onDragOver={(event) => {
                        if (dragSourceId) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!dragSourceId || !event.ctrlKey) return;
                        duplicateToDate(dragSourceId, day.date);
                        setDragSourceId(null);
                      }}
                    >
                      {maintenance ? (
                        <p className="mb-1 text-[10px] font-medium text-muted-foreground">Maintenance</p>
                      ) : null}
                      <div className="flex flex-col gap-1">
                        {chips.map((chip) => (
                          <Popover
                            key={chip.id}
                            open={editChip?.id === chip.id}
                            onOpenChange={(open) => {
                              if (open) {
                                setEditChip(chip);
                                setEditEmployeeId(chip.employeeId ?? "");
                              } else setEditChip(null);
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  setDragSourceId(chip.id);
                                  event.dataTransfer.setData("text/plain", chip.id);
                                }}
                                onDragEnd={() => setDragSourceId(null)}
                                className={cn(
                                  "w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:ring-1 hover:ring-primary/40",
                                  chip.endMinute > 1_440 || chip.startMinute >= 19 * 60
                                    ? "border-indigo-800/40 bg-indigo-950/80 text-indigo-50"
                                    : "border-sky-800/30 bg-sky-900/70 text-sky-50",
                                  chip.employeeOnLeave && "opacity-60 line-through decoration-red-400",
                                  chip.warnings.length > 0 && "ring-2 ring-destructive border-destructive"
                                )}
                                title={
                                  chip.warnings.length > 0
                                    ? chip.warnings.join(" ")
                                    : `${chip.timeLabel}${chip.shiftLabel ? ` · ${chip.shiftLabel}` : ""}`
                                }
                              >
                                <span className="block font-semibold">{chip.timeLabel}</span>
                                <span className="block truncate">{chip.employeeName ?? "Unassigned"}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 space-y-2" align="start">
                              <p className="text-xs font-medium">Edit shift</p>
                              <p className="text-[11px] text-muted-foreground">{chip.timeLabel}</p>
                              <div className="grid gap-1">
                                <Label className="text-xs">Operator</Label>
                                <select
                                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                  value={editEmployeeId}
                                  onChange={(event) => setEditEmployeeId(event.target.value)}
                                >
                                  <option value="">Unassigned</option>
                                  {data.employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={saveChip} disabled={pending}>
                                  Save
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={deleteChip} disabled={pending}>
                                  Delete
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {pending ? <p className="text-xs text-muted-foreground">Updating roster…</p> : null}

      <WorkstationSettingsDialog
        workstationId={settingsWsId}
        open={settingsWsId != null}
        onOpenChange={(open) => {
          if (!open) setSettingsWsId(null);
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
