import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type AttentionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "WATCH";

/** Indicator only — the information stays dominant, not the colour. */
const severityMark: Record<AttentionSeverity, string> = {
  CRITICAL: "w-1 bg-danger",
  HIGH: "w-0.5 bg-danger",
  MEDIUM: "w-0.5 bg-material",
  LOW: "w-0.5 bg-border",
  INFO: "w-0.5 bg-info",
  WATCH: "w-0.5 bg-material",
};

const severityText: Record<AttentionSeverity, string> = {
  CRITICAL: "text-danger",
  HIGH: "text-danger",
  MEDIUM: "text-material",
  LOW: "text-muted-foreground",
  INFO: "text-info",
  WATCH: "text-material",
};

export type AttentionItemProps = {
  domain: string;
  severity: AttentionSeverity;
  issue: string;
  evidence?: string;
  consequence?: string;
  href: string;
  actionLabel?: string;
  rank?: number;
  className?: string;
};

/**
 * Management Attention — signature Pharmora signal.
 * Domain + severity, issue, evidence, consequence, inspect.
 */
export function AttentionItem({
  domain,
  severity,
  issue,
  evidence,
  consequence,
  href,
  actionLabel = "Inspect",
  rank,
  className,
}: AttentionItemProps) {
  return (
    <li className={cn("group relative", className)}>
      <Link
        href={href}
        className="flex min-h-11 flex-col gap-2 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:px-5"
      >
        <span className={cn("absolute inset-y-3 left-0", severityMark[severity])} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {rank != null ? (
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70">{rank}</span>
            ) : null}
            <span className="label-context">{domain}</span>
            <span className={cn("text-[10px] font-medium tracking-[0.12em] uppercase", severityText[severity])}>
              {severity.replace(/_/g, " ")}
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-[15px] leading-snug font-medium tracking-tight text-foreground">
              <span className="sr-only">Signal: </span>
              {issue}
            </p>
            {evidence ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="mr-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground/80 uppercase">
                  Evidence
                </span>
                {evidence}
              </p>
            ) : null}
            {consequence ? (
              <p className="text-xs leading-relaxed text-foreground/80">
                <span className="mr-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground/80 uppercase">
                  Consequence
                </span>
                {consequence}
              </p>
            ) : null}
          </div>
        </div>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[11px] font-medium tracking-[0.08em] text-primary uppercase sm:min-h-0 sm:pt-0.5">
          {actionLabel}
          <ArrowRight className="size-3.5" />
        </span>
      </Link>
    </li>
  );
}

export function AttentionList({
  title = "Management Attention",
  subtitle,
  children,
  empty,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <section className="work-surface">
      <div className="border-b border-border/70 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {empty ? empty : <ol className="divide-y divide-border/60">{children}</ol>}
    </section>
  );
}
