"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CloudOff, Loader2, MonitorPlay, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueue,
  flushQueue,
  readQueue,
  type QueuedShopFloorAction,
} from "@/lib/production-execution/offline-queue";
import {
  PAUSE_REASON_CODES,
  PAUSE_REASON_LABELS,
  readPauseReason,
  type PauseReasonCode,
} from "@/lib/production-execution/pause-reasons";
import type { ExecutionOrderRow, ProductionExecutionSnapshot } from "@/lib/production-execution/types";
import { filterOpenStationJobs, sortStationQueue } from "@/lib/production-execution/shop-floor";
import { cn } from "@/lib/utils";

/** Live refresh while the operator is not typing (spec: shop-floor log visible on the plan within seconds). */
const REFRESH_MS = 15_000;
const FLUSH_MS = 10_000;

const ISSUE_KINDS = [
  { id: "BREAKDOWN", label: "Machine breakdown" },
  { id: "MATERIAL", label: "Material problem" },
  { id: "QUALITY_DEVIATION", label: "Quality deviation" },
  { id: "SAFETY", label: "Safety incident" },
  { id: "OTHER", label: "Other" },
] as const;

type Panel = "none" | "stop" | "pause" | "issue";

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function elapsedLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "0:00";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "0:00";
  const total = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function sendAction(item: Pick<QueuedShopFloorAction, "orderId" | "path" | "body">): Promise<{ status: number | null; message?: string }> {
  try {
    const response = await fetch(`/api/production-orders/${item.orderId}/${item.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.body),
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    return { status: response.status, message: payload.message };
  } catch {
    return { status: null };
  }
}

export function ShopFloorTimerWorkspace({ data }: { data: ProductionExecutionSnapshot }) {
  const router = useRouter();
  const [workstationId, setWorkstationId] = useState<string | null>(data.workstationId);
  const [operatorId, setOperatorId] = useState(data.currentUser.id ?? data.operators[0]?.id ?? "");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [panel, setPanel] = useState<Panel>("none");
  const [qtyGood, setQtyGood] = useState("");
  const [qtyScrap, setQtyScrap] = useState("0");
  const [note, setNote] = useState("");
  const [pauseCode, setPauseCode] = useState<PauseReasonCode | null>(null);
  const [issueKind, setIssueKind] = useState<(typeof ISSUE_KINDS)[number]["id"]>("BREAKDOWN");
  const [issueText, setIssueText] = useState("");
  const [downHours, setDownHours] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedShopFloorAction[]>([]);
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const flush = useCallback(async () => {
    const storage = safeStorage();
    if (readQueue(storage).length === 0) return;
    const result = await flushQueue(storage, async (item) => (await sendAction(item)).status);
    setQueued(readQueue(storage));
    if (result.rejected.length > 0) {
      setError(
        `${result.rejected.length} offline log${result.rejected.length === 1 ? "" : "s"} could not be applied (${result.rejected
          .map((row) => `${row.path} ${row.orderNumber}`)
          .join(", ")}). Check the job and log again.`
      );
    }
    if (result.sent + result.duplicates > 0) {
      setNotice(`Synced ${result.sent + result.duplicates} offline log${result.sent + result.duplicates === 1 ? "" : "s"}.`);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    // Browser-only state (storage + connectivity) is read after mount to keep hydration stable.
    const hydrate = window.setTimeout(() => {
      setQueued(readQueue(safeStorage()));
      setOnline(navigator.onLine);
      void flush();
    }, 0);
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const id = window.setInterval(() => void flush(), FLUSH_MS);
    return () => {
      window.clearTimeout(hydrate);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(id);
    };
  }, [flush]);

  useEffect(() => {
    if (panel !== "none" || pending || !online || queued.length > 0) return;
    const id = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [panel, pending, online, queued.length, router]);

  const stations = data.workstations;
  const queue = useMemo(() => {
    if (!workstationId) return [];
    return sortStationQueue(filterOpenStationJobs(data.orders.filter((row) => row.workstationId === workstationId)));
  }, [data.orders, workstationId]);
  const current = queue[0] ?? null;
  const upcoming = queue.slice(1, 4);
  const operatorName =
    data.operators.find((row) => row.id === operatorId)?.name ?? data.currentUser.name ?? "Operator";
  const queuedForCurrent = current ? queued.filter((row) => row.orderId === current.id) : [];
  const lastPause = current?.isPaused
    ? readPauseReason([...current.shopFloorEvents].reverse().find((row) => row.eventType === "PAUSE")?.reason)
    : null;

  const run = (path: QueuedShopFloorAction["path"], body: Record<string, unknown> = {}) => {
    if (!current) return;
    const payload = {
      ...body,
      reason: body.reason ?? operatorName,
      expectedOperationId: current.activeOperationId ?? undefined,
    };
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline && path === "qa-release") {
        setError("QA release is an e-signature — it needs a live connection.");
        return;
      }
      const result = offline ? { status: null } : await sendAction({ orderId: current.id, path, body: payload });
      if (result.status === null && path === "qa-release") {
        setError("QA release is an e-signature — it needs a live connection. Try again.");
        return;
      }
      if (result.status === null) {
        setQueued(enqueue(safeStorage(), { orderId: current.id, orderNumber: current.orderNumber, path, body: payload }));
        setOnline(false);
        setPanel("none");
        setNotice(`No connection — ${path} saved on this tablet with the time you tapped. It will sync automatically.`);
        return;
      }
      if (result.status === 409) {
        setPanel("none");
        setNotice(result.message ?? "Already logged.");
        router.refresh();
        return;
      }
      if (result.status < 200 || result.status >= 300) {
        setError(("message" in result && result.message) || "Action failed.");
        return;
      }
      setPanel("none");
      setNote("");
      setIssueText("");
      if (path === "issue" && "message" in result && result.message) setNotice(result.message);
      router.refresh();
    });
  };

  if (!workstationId) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shop floor timer</p>
            <h1 className="text-2xl font-semibold tracking-tight">Pick a workstation</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tablet view — current job, queue, and Start / Stop.</p>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/operations?view=board">
              <MonitorPlay className="size-4" /> TV board
            </Link>
          </Button>
        </div>
        <OfflineBanner online={online} queued={queued} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => {
            const count = data.orders.filter(
              (row) => row.workstationId === station.id && row.executionState !== "COMPLETED"
            ).length;
            const running = data.orders.some(
              (row) => row.workstationId === station.id && row.executionState === "IN_PROGRESS"
            );
            const paused = data.orders.some((row) => row.workstationId === station.id && row.isPaused);
            return (
              <li key={station.id}>
                <button
                  type="button"
                  className="flex min-h-24 w-full flex-col items-start justify-center rounded-xl border border-border bg-card px-4 py-4 text-left shadow-sm transition hover:border-foreground/30 hover:bg-muted/40"
                  onClick={() => setWorkstationId(station.id)}
                >
                  <span className="text-base font-semibold">{station.name}</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {paused ? "Job paused" : running ? "Job running" : `${count} in queue`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const stationName = stations.find((row) => row.id === workstationId)?.name ?? "Station";
  const actionsLocked = pending || queuedForCurrent.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Timer</p>
          <h1 className="text-2xl font-semibold tracking-tight">{stationName}</h1>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setWorkstationId(null)}>
          Change station
        </Button>
      </div>

      <OfflineBanner online={online} queued={queued} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Operator
        <select
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          value={operatorId}
          onChange={(event) => setOperatorId(event.target.value)}
        >
          {data.currentUser.name ? (
            <option value={data.currentUser.id ?? ""}>{data.currentUser.name} (you)</option>
          ) : null}
          {data.operators
            .filter((row) => row.id !== data.currentUser.id)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>

      {current ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <StatusBadge tone={current.isPaused ? "warning" : current.executionState === "IN_PROGRESS" ? "primary" : "neutral"}>
                {current.isPaused ? "Paused" : current.activeOperationLabel ?? current.executionState.replace(/_/g, " ")}
              </StatusBadge>
              <p className="mt-2 text-xl font-semibold">{current.orderNumber}</p>
              <p className="text-sm text-muted-foreground">{current.productName}</p>
              <p className="mt-1 text-sm">
                {current.activeOperationLabel}
                {current.batchNumber ? ` · ${current.batchNumber}` : ""}
              </p>
              {lastPause ? (
                <p className="mt-1 text-sm text-warning-foreground">
                  {lastPause.label}
                  {lastPause.note ? ` — ${lastPause.note}` : ""}
                </p>
              ) : null}
            </div>
            <p className="font-mono text-4xl tabular-nums tracking-tight">
              {elapsedLabel(current.actualStart ?? current.shopFloorEvents.find((row) => row.eventType === "START")?.recordedAt ?? null, nowMs)}
            </p>
          </div>

          {queuedForCurrent.length > 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-warning/18 px-3 py-2 text-sm text-warning-foreground">
              <CloudOff className="size-4 shrink-0" />
              {queuedForCurrent.map((row) => row.path).join(", ")} saved offline — buttons unlock after sync.
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {current.canStart ? <BigAction label="Start" disabled={actionsLocked} onClick={() => run("start")} /> : null}
            {current.canPause ? (
              <BigAction
                label="Pause"
                variant="secondary"
                disabled={actionsLocked}
                onClick={() => {
                  setPauseCode(null);
                  setNote("");
                  setPanel("pause");
                }}
              />
            ) : null}
            {current.canResume ? <BigAction label="Resume" disabled={actionsLocked} onClick={() => run("resume")} /> : null}
            {current.canQaRelease ? (
              <BigAction
                label="QA release"
                disabled={actionsLocked}
                onClick={() => {
                  const signature = window.prompt("Type your name to e-sign this QA release", operatorName);
                  if (!signature || signature.trim().length < 3) {
                    setError("A signed name is required for QA release.");
                    return;
                  }
                  run("qa-release", { signature: signature.trim() });
                }}
              />
            ) : null}
            {current.canComplete || current.executionState === "IN_PROGRESS" || current.executionState === "PAUSED" ? (
              <BigAction
                label="Stop"
                variant="danger"
                disabled={actionsLocked}
                onClick={() => {
                  setQtyGood(String(current.producedQuantity ?? current.plannedQuantity));
                  setPanel("stop");
                }}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-danger/50 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              setIssueText("");
              setPanel("issue");
            }}
          >
            <TriangleAlert className="size-4" /> Raise an issue
          </button>
          {pending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Saving…
            </p>
          ) : null}
          {notice ? <p className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No open jobs on this workstation.
        </p>
      )}

      {panel === "pause" && current ? (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">Why are you pausing {current.orderNumber}?</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAUSE_REASON_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setPauseCode(code)}
                className={cn(
                  "min-h-12 rounded-lg border px-3 text-sm font-medium transition",
                  pauseCode === code ? "border-primary bg-primary-muted text-primary" : "border-border bg-background hover:bg-muted"
                )}
              >
                {PAUSE_REASON_LABELS[code]}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm font-medium">
            Note (optional)
            <Input className="mt-1 h-12 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Breakdown, material missing and waiting for QA are logged as downtime so planners can replan.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              className="min-h-12 flex-1"
              disabled={pending || !pauseCode}
              onClick={() => run("pause", { reasonCode: pauseCode, reason: note.trim() || operatorName })}
            >
              Confirm pause
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "issue" && current ? (
        <section className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-medium">Raise an issue on {current.orderNumber}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ISSUE_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => setIssueKind(kind.id)}
                className={cn(
                  "min-h-12 rounded-lg border px-3 text-sm font-medium transition",
                  issueKind === kind.id ? "border-danger bg-danger/10 text-danger" : "border-border bg-background hover:bg-muted"
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm font-medium">
            What happened?
            <Input
              className="mt-1 h-12 text-base"
              value={issueText}
              placeholder="e.g. Punch set B cracked, turret stopped"
              onChange={(e) => setIssueText(e.target.value)}
            />
          </label>
          {issueKind === "BREAKDOWN" ? (
            <label className="mt-3 block text-sm font-medium">
              Expected down time (hours, 0 if unknown)
              <Input className="mt-1 h-12 text-base" inputMode="decimal" value={downHours} onChange={(e) => setDownHours(e.target.value)} />
            </label>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {issueKind === "BREAKDOWN"
              ? "Removes station capacity for the down time and logs downtime for the planner."
              : issueKind === "QUALITY_DEVIATION" || issueKind === "MATERIAL"
                ? "Opens a Quality exception for QA, linked to this order and batch."
                : "Recorded in the audit trail for the supervisor."}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              className="min-h-12 flex-1"
              disabled={pending || issueText.trim().length < 5}
              onClick={() =>
                run("issue", {
                  kind: issueKind,
                  description: issueText.trim(),
                  downHours: issueKind === "BREAKDOWN" ? Number(downHours) || 0 : 0,
                  severity: issueKind === "SAFETY" ? "HIGH" : "MEDIUM",
                })
              }
            >
              Send issue
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "stop" && current ? (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">Stop {current.orderNumber}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Qty good
              <Input className="mt-1 h-12 text-base" inputMode="numeric" value={qtyGood} onChange={(e) => setQtyGood(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Qty scrap
              <Input className="mt-1 h-12 text-base" inputMode="numeric" value={qtyScrap} onChange={(e) => setQtyScrap(e.target.value)} />
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium">
            Note (optional)
            <Input className="mt-1 h-12 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              className="min-h-12 flex-1"
              disabled={pending}
              onClick={() =>
                run("stop", {
                  producedQuantity: Number(qtyGood),
                  scrapQuantity: Number(qtyScrap) || 0,
                  reason: note.trim() || operatorName,
                })
              }
            >
              Confirm stop
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <p className="text-sm font-medium">Next in queue</p>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No further jobs on this station.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {upcoming.map((row, index) => (
              <QueueRow key={row.id} row={row} index={index + 2} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function OfflineBanner({ online, queued }: { online: boolean; queued: QueuedShopFloorAction[] }) {
  if (online && queued.length === 0) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/18 px-3 py-2 text-sm text-warning-foreground">
      <CloudOff className="size-4 shrink-0" />
      {online ? "Back online — syncing" : "Offline"}
      {queued.length > 0 ? ` · ${queued.length} log${queued.length === 1 ? "" : "s"} waiting to sync` : " · logs are saved on this tablet"}
    </p>
  );
}

function BigAction({
  label,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-16 rounded-xl text-base font-semibold shadow-sm transition disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" && "border border-border bg-background hover:bg-muted",
        variant === "danger" && "bg-destructive text-destructive-foreground hover:opacity-90"
      )}
    >
      {label}
    </button>
  );
}

function QueueRow({ row, index }: { row: ExecutionOrderRow; index: number }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
      <div>
        <p className="text-xs text-muted-foreground">#{index}</p>
        <p className="font-medium">{row.orderNumber}</p>
        <p className="text-sm text-muted-foreground">
          {row.activeOperationLabel ?? "Queued"} · {row.productName}
        </p>
      </div>
      <StatusBadge tone="neutral">{row.executionState.replace(/_/g, " ")}</StatusBadge>
    </li>
  );
}
