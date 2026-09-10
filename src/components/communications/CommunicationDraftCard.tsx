"use client";

import { useState } from "react";
import Link from "next/link";

import { COMMUNICATION_REGISTRY, type CommunicationDraftView } from "@/lib/ai/communications";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StatusTone } from "@/types/status";

const statusTone: Record<string, StatusTone> = {
  DRAFT: "warning",
  REVIEWED: "info",
  APPROVED: "success",
  ARCHIVED: "neutral",
};

export function CommunicationDraftCard({
  draft,
  compact = false,
  onUpdated,
}: {
  draft: CommunicationDraftView;
  compact?: boolean;
  onUpdated?: (next: CommunicationDraftView) => void;
}) {
  const [open, setOpen] = useState(!compact);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(draft);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const meta = COMMUNICATION_REGISTRY[current.type];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/communications/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const payload = (await result.json()) as { draft?: CommunicationDraftView; message?: string };
      if (!result.ok || !payload.draft) {
        setError(payload.message ?? "Unable to save the draft.");
        return;
      }
      setCurrent(payload.draft);
      setSubject(payload.draft.subject);
      setBody(payload.draft.body);
      setEditing(false);
      onUpdated?.(payload.draft);
    } catch {
      setError("Unable to save the draft.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "mt-3 rounded-lg border border-border p-3" : "work-surface p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {compact ? (
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Communication draft</p>
          ) : null}
          <p className="mt-1 text-sm font-medium">{meta.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{current.customerName}</p>
        </div>
        <StatusBadge tone={statusTone[current.status] ?? "neutral"}>{current.status}</StatusBadge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{current.reason}</p>
      {compact && !open ? (
        <Button type="button" size="sm" className="mt-3 min-h-11 sm:min-h-7" onClick={() => setOpen(true)}>
          Review draft
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          {editing ? (
            <>
              <label className="block text-xs font-medium text-foreground">
                Subject
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm sm:h-9"
                />
              </label>
              <label className="block text-xs font-medium text-foreground">
                Body
                <Textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 min-h-32" />
              </label>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{current.subject}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{current.body}</p>
            </>
          )}
          <p className="text-xs text-muted-foreground">This is a draft only. Pharmaflow does not send messages in this phase.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {!editing ? (
              <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            {compact ? (
              <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" asChild>
                <Link href="/communications">Communication Center</Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
