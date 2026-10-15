"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PlannerEngineActions({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [workstationId, setWorkstationId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: string, extra?: Record<string, string>) => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/schedule-plans/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        proposal?: { name?: string };
        count?: number;
        orderNumber?: string;
      };
      if (!response.ok) {
        setMessage(payload.message ?? "Action failed.");
        return;
      }
      if (payload.proposal?.name) {
        setMessage(`Proposed: ${payload.proposal.name}`);
      } else if (payload.orderNumber) {
        setMessage(`Unscheduled ${payload.orderNumber}.`);
      } else if (payload.count != null) {
        setMessage(`Unscheduled ${payload.count} order(s).`);
      } else {
        setMessage("Done.");
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Engine actions (Phase 12)</h3>
      <p className="text-xs text-muted-foreground">
        Bulldozer, unscheduled-only, and workstation scope create proposals. Unschedule writes immediately (audited).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => run("BULLDOZER")}>
          Bulldozer
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => run("UNSCHEDULED_ONLY")}>
          Schedule unscheduled
        </Button>
        <Button type="button" size="sm" variant="destructive" disabled={disabled || pending} onClick={() => run("UNSCHEDULE_ALL")}>
          Unschedule all open
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ws-scope">Workstation ID (one line)</Label>
          <Input
            id="ws-scope"
            value={workstationId}
            onChange={(event) => setWorkstationId(event.target.value)}
            placeholder="UUID from plant model"
          />
          <Button
            type="button"
            size="sm"
            className="mt-1"
            disabled={disabled || pending || !workstationId.trim()}
            onClick={() => run("WORKSTATION", { workstationId: workstationId.trim() })}
          >
            Reschedule workstation
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ft-order">Order ID (fast track)</Label>
          <Input id="ft-order" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Production order UUID" />
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || pending || !orderId.trim()}
              onClick={() => run("FAST_TRACK", { orderId: orderId.trim() })}
            >
              Fast track + propose
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || pending || !orderId.trim()}
              onClick={() => run("UNSCHEDULE_ORDER", { orderId: orderId.trim() })}
            >
              Unschedule order
            </Button>
          </div>
        </div>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
