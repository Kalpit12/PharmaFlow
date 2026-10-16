"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  const hrefForWeek = useCallback(
    (weekStart: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "roster");
      next.set("rosterWeek", weekStart);
      return `/operations?${next.toString()}`;
    },
    [searchParams]
  );

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, WorkstationRosterSnapshot["assignments"]>();
    for (const row of data.assignments) {
      const key = `${row.workstationId}|${row.date}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Workstation scheduling</p>
          <p className="text-xs text-muted-foreground">{data.weekLabel} · EAT · Ctrl+drag a chip to duplicate to another day</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            {data.workstations.map((ws) => (
              <tr key={ws.id} className="border-b border-border/60 align-top">
                <td className="sticky left-0 z-10 bg-background p-2">
                  <p className="font-medium leading-tight">{ws.name}</p>
                  <p className="text-xs text-muted-foreground">{ws.code}</p>
                </td>
                {data.days.map((day) => {
                  const key = `${ws.id}|${day.date}`;
                  const chips = assignmentsByCell.get(key) ?? [];
                  const maintenance = ws.maintenanceDates.includes(day.date);
                  return (
                    <td
                      key={key}
                      className={cn("p-1.5", maintenance && "bg-amber-500/10")}
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
                        <p className="mb-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">Maintenance</p>
                      ) : null}
                      <div className="flex flex-col gap-1">
                        {chips.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setDragSourceId(chip.id);
                              event.dataTransfer.setData("text/plain", chip.id);
                            }}
                            onDragEnd={() => setDragSourceId(null)}
                            className={cn(
                              "rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:ring-1 hover:ring-primary/40",
                              chip.endMinute > 1_440 || chip.startMinute >= 19 * 60
                                ? "border-indigo-800/40 bg-indigo-950/80 text-indigo-50"
                                : "border-sky-800/30 bg-sky-900/70 text-sky-50",
                              chip.employeeOnLeave && "opacity-60 line-through decoration-red-400"
                            )}
                            title={`${chip.timeLabel}${chip.shiftLabel ? ` · ${chip.shiftLabel}` : ""}`}
                          >
                            <span className="block font-semibold">{chip.timeLabel}</span>
                            <span className="block truncate">{chip.employeeName ?? "Unassigned"}</span>
                          </button>
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
    </div>
  );
}
