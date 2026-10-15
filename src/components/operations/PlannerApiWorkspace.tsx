"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLANNER_WEBHOOK_EVENT_OPTIONS } from "@/lib/operations/planner-webhook-events";

export function PlannerApiWorkspace({ canManage }: { canManage: boolean }) {
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [webhookUrl, setWebhookUrl] = useState("https://example.com/pharmora/webhook");
  const [webhookSecret, setWebhookSecret] = useState("change-me");

  if (!canManage) {
    return (
      <section className="work-surface p-4 text-sm text-muted-foreground">
        Tenant API keys and outbound webhooks require head-planner access (<code className="text-xs">production.global_rules</code>
        ).
      </section>
    );
  }

  const createKey = () => {
    startTransition(async () => {
      setMessage(null);
      setRawKey(null);
      const response = await fetch("/api/planner-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Planner integration" }),
      });
      const payload = (await response.json()) as { rawKey?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to create key.");
        return;
      }
      setRawKey(payload.rawKey ?? null);
      setMessage("Copy the key now — it is shown once.");
    });
  };

  const createWebhook = () => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/planner-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Planner outbound",
          endpointUrl: webhookUrl,
          secret: webhookSecret,
          events: [...PLANNER_WEBHOOK_EVENT_OPTIONS],
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to register webhook.");
        return;
      }
      setMessage("Webhook subscription created.");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="work-surface space-y-3 p-4 text-sm">
        <p className="font-medium">REST API (v1)</p>
        <p className="text-muted-foreground">
          Use header <code className="text-xs">Authorization: Bearer pf_live_…</code> or <code className="text-xs">X-Api-Key</code>.
          Endpoints: <code className="text-xs">/api/v1/production-orders</code>,{" "}
          <code className="text-xs">/api/v1/workstations</code>, <code className="text-xs">/api/v1/schedule</code>,{" "}
          <code className="text-xs">/api/v1/timelogs</code>, <code className="text-xs">/api/v1/workstation-exceptions</code>.
        </p>
        <Button type="button" size="sm" disabled={pending} onClick={createKey}>
          Create API key
        </Button>
        {rawKey ? (
          <p className="break-all rounded-sm bg-muted p-2 font-mono text-xs">{rawKey}</p>
        ) : null}
      </section>

      <section className="work-surface space-y-3 p-4 text-sm">
        <p className="font-medium">Outbound webhooks</p>
        <p className="text-muted-foreground">
          Events: plan accepted, job started/completed, order late, batch material delayed (HMAC SHA-256 signature header).
        </p>
        <div>
          <Label htmlFor="wh-url">Endpoint URL</Label>
          <Input id="wh-url" className="mt-1" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="wh-secret">Signing secret</Label>
          <Input id="wh-secret" className="mt-1" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={createWebhook}>
          Register webhook
        </Button>
      </section>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
