"use client";

import { Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, HelpCircle, Search, Settings } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ganttBarFillClass, type GanttBarTone } from "@/lib/operations/planner-gantt-colors";
import type { GanttZoom } from "@/lib/operations/gantt-window";
import type { GanttWorkstationRow } from "@/lib/server/operations-gantt";
import { cn } from "@/lib/utils";

const ZOOMS: GanttZoom[] = ["8h", "day", "week", "month"];

const LEGEND: Array<{ tone: GanttBarTone; label: string }> = [
  { tone: "scheduled", label: "Scheduled" },
  { tone: "running", label: "Running" },
  { tone: "prospect", label: "Prospect" },
  { tone: "late", label: "Late" },
  { tone: "qcHold", label: "QC hold" },
  { tone: "changeover", label: "Changeover" },
  { tone: "ghost", label: "Current plan (ghost)" },
];

export function GanttPlannerToolbar({
  windowStartIso,
  zoom,
  workstations,
  workstationFilter,
  onWorkstationFilterChange,
  searchQuery,
  onSearchQueryChange,
  onOpenRules,
  onExportPng,
  plantNowLabel,
}: {
  windowStartIso: string;
  zoom: GanttZoom;
  plantNowLabel: string;
  workstations: GanttWorkstationRow[];
  workstationFilter: string | "all";
  onWorkstationFilterChange: (value: string | "all") => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onOpenRules: () => void;
  onExportPng: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`/operations?${params.toString()}`);
  };

  const shiftWindow = (days: number) => {
    const start = new Date(windowStartIso);
    start.setUTCDate(start.getUTCDate() + days);
    pushParams((params) => {
      params.set("view", "gantt");
      params.set("ganttStart", start.toISOString().slice(0, 10));
      if (!params.get("ganttZoom")) params.set("ganttZoom", zoom);
    });
  };

  const setZoom = (next: GanttZoom) => {
    pushParams((params) => {
      params.set("view", "gantt");
      params.set("ganttZoom", next);
    });
  };

  const onDateChange = (value: string) => {
    pushParams((params) => {
      params.set("view", "gantt");
      if (value) params.set("ganttStart", value);
      else params.delete("ganttStart");
    });
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
      <div className="flex items-center gap-0.5">
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => shiftWindow(-7)} aria-label="Previous week">
          <ChevronsLeft className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => shiftWindow(-1)} aria-label="Previous day">
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          className="h-8 w-[9.5rem] text-xs"
          defaultValue={windowStartIso.slice(0, 10)}
          onChange={(event) => onDateChange(event.target.value)}
        />
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => shiftWindow(1)} aria-label="Next day">
          <ChevronRight className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => shiftWindow(7)} aria-label="Next week">
          <ChevronsRight className="size-4" />
        </Button>
      </div>

      <div className="relative hidden min-w-[12rem] flex-1 sm:block md:max-w-xs lg:max-w-sm">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8 text-xs"
          placeholder="Search by batch or order number"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline" title="Plant time (EAT)">
          {plantNowLabel} EAT
        </span>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onExportPng} aria-label="Export PNG">
          <Camera className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onOpenRules} aria-label="Global planning rules">
          <Settings className="size-4" />
        </Button>
        <Select value={workstationFilter} onValueChange={onWorkstationFilterChange}>
          <SelectTrigger className="h-8 w-[9.5rem] text-xs">
            <SelectValue placeholder="All workstations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workstations</SelectItem>
            {workstations.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden items-center gap-0.5 md:flex">
          {ZOOMS.map((z) => (
            <Button
              key={z}
              type="button"
              size="sm"
              variant={zoom === z ? "secondary" : "ghost"}
              className="h-8 px-2 text-xs"
              onClick={() => setZoom(z)}
            >
              {z}
            </Button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Colour legend">
              <HelpCircle className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <p className="mb-2 text-xs font-medium">Job colours</p>
            <ul className="space-y-1.5">
              {LEGEND.map((item) => (
                <li key={item.tone} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("inline-block h-2.5 w-6 rounded-sm", ganttBarFillClass[item.tone])} aria-hidden />
                  {item.label}
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-6 rounded-sm bg-[var(--planner-shift-green)] ring-1 ring-border/40" aria-hidden />
                Shift window
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
