"use client";

import Link from "next/link";

import { coverageTone } from "@/components/traceability/traceability-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { coverageLabel } from "@/lib/traceability/impact";
import type { TraceabilityPathNode } from "@/lib/traceability/types";

export function TracePath({ nodes, compact }: { nodes: TraceabilityPathNode[]; compact: boolean }) {
  if (nodes.length === 0) return null;

  if (compact) {
    return (
      <ol className="flex min-w-0 flex-col gap-3" aria-label="Traceability path">
        {nodes.map((node, index) => (
          <li key={`${node.kind}-${node.id}`} className="relative border-l border-border pl-4">
            {index < nodes.length - 1 ? <span className="absolute -bottom-3 left-[-1px] h-3 w-px bg-border" aria-hidden /> : null}
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{node.kind.replaceAll("_", " ")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone={coverageTone[node.coverage]}>{coverageLabel(node.coverage)}</StatusBadge>
              {node.href ? (
                <Link href={node.href} className="font-medium hover:underline">
                  {node.label}
                </Link>
              ) : (
                <span className="font-medium">{node.label}</span>
              )}
            </div>
            {node.sublabel ? <p className="mt-1 text-xs text-muted-foreground">{node.sublabel}</p> : null}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <ol className="flex min-w-max items-start gap-0" aria-label="Traceability path">
        {nodes.map((node, index) => (
          <li key={`${node.kind}-${node.id}`} className="flex min-w-[9rem] max-w-[12rem] shrink-0 flex-col px-3 first:pl-0 last:pr-0">
            <div className="flex items-center gap-2">
              {index > 0 ? <span className="text-border" aria-hidden>↓</span> : null}
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{node.kind.replaceAll("_", " ")}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={coverageTone[node.coverage]}>{coverageLabel(node.coverage)}</StatusBadge>
            </div>
            {node.href ? (
              <Link href={node.href} className="mt-2 font-medium hover:underline">
                {node.label}
              </Link>
            ) : (
              <p className="mt-2 font-medium">{node.label}</p>
            )}
            {node.sublabel ? <p className="mt-1 text-xs text-muted-foreground">{node.sublabel}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
