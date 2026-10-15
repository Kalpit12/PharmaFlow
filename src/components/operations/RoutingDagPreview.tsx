"use client";

import { layoutRoutingDag, type RoutingDagEdge, type RoutingDagNode } from "@/lib/operations/routing-dag-layout";
import { cn } from "@/lib/utils";

export function RoutingDagPreview({
  productSku,
  productName,
  nodes,
  edges,
}: {
  productSku: string;
  productName: string;
  nodes: RoutingDagNode[];
  edges: RoutingDagEdge[];
}) {
  const ordered = layoutRoutingDag(nodes, edges);
  const edgeSet = new Set(edges.map((edge) => `${edge.fromId}→${edge.toId}`));

  return (
    <section className="work-surface p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">
          {productName} <span className="font-normal text-muted-foreground">({productSku})</span>
        </h3>
        <p className="text-xs text-muted-foreground">Read-only routing DAG — sequence and dependencies.</p>
      </header>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No operations on this routing.</p>
      ) : (
        <ol className="flex min-w-0 flex-wrap items-center gap-2">
          {ordered.map((node, index) => {
            const prev = index > 0 ? ordered[index - 1] : null;
            const showArrow =
              prev &&
              (edgeSet.has(`${prev.id}→${node.id}`) ||
                (!edges.length && node.sequence > (prev?.sequence ?? 0)));
            return (
              <li key={node.id} className="flex min-w-0 items-center gap-2">
                {showArrow ? <span className="text-muted-foreground" aria-hidden="true">→</span> : null}
                <div
                  className={cn(
                    "rounded-md border border-border px-2 py-1.5 text-xs",
                    node.isQcHold ? "border-dashed bg-muted/40" : "bg-background"
                  )}
                >
                  <p className="font-medium">{node.code}</p>
                  <p className="text-muted-foreground">{node.name}</p>
                  <p className="text-[10px] text-muted-foreground">Seq {node.sequence}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
