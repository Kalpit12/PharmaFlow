"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { typeLabel } from "@/lib/quality/service";
import {
  QUALITY_EXCEPTION_SEVERITIES,
  QUALITY_EXCEPTION_TYPES,
  type QualityExceptionSeverity,
  type QualityExceptionType,
  type QualitySnapshot,
} from "@/lib/quality/types";

export function QualityLogExceptionDialog({
  open,
  onOpenChange,
  data,
  pending,
  title,
  description,
  type,
  severity,
  batchId,
  onTitleChange,
  onDescriptionChange,
  onTypeChange,
  onSeverityChange,
  onBatchIdChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: QualitySnapshot;
  pending: boolean;
  title: string;
  description: string;
  type: QualityExceptionType;
  severity: QualityExceptionSeverity;
  batchId: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTypeChange: (value: QualityExceptionType) => void;
  onSeverityChange: (value: QualityExceptionSeverity) => void;
  onBatchIdChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log quality exception</DialogTitle>
          <DialogDescription>Operational exception record — not a validated QMS submission.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Title</span>
            <Input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={160} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Description</span>
            <textarea
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Type</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-2"
              value={type}
              onChange={(event) => onTypeChange(event.target.value as QualityExceptionType)}
            >
              {QUALITY_EXCEPTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Severity</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-2"
              value={severity}
              onChange={(event) => onSeverityChange(event.target.value as QualityExceptionSeverity)}
            >
              {QUALITY_EXCEPTION_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {data.batchOptions.length > 0 ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Linked batch (optional)</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-2"
                value={batchId}
                onChange={(event) => onBatchIdChange(event.target.value)}
              >
                <option value="">None</option>
                {data.batchOptions.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batchNumber} · {batch.productName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={onSubmit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Log exception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
