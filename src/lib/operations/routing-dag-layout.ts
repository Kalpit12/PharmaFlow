export type RoutingDagNode = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  isQcHold: boolean;
};

export type RoutingDagEdge = {
  fromId: string;
  toId: string;
};

/** Order nodes for left-to-right DAG display: sequence first, then dependency depth. */
export function layoutRoutingDag(nodes: RoutingDagNode[], edges: RoutingDagEdge[]): RoutingDagNode[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();
  for (const node of nodes) depth.set(node.id, 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const from = depth.get(edge.fromId) ?? 0;
      const next = from + 1;
      const current = depth.get(edge.toId) ?? 0;
      if (next > current) {
        depth.set(edge.toId, next);
        changed = true;
      }
    }
  }

  return [...nodes].sort((a, b) => {
    const depthDiff = (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0);
    if (depthDiff !== 0) return depthDiff;
    return a.sequence - b.sequence;
  });
}

export function buildRoutingDagEdges(
  operations: Array<{ id: string; dependenciesFrom: Array<{ toOperationId: string }> }>
): RoutingDagEdge[] {
  const edges: RoutingDagEdge[] = [];
  for (const op of operations) {
    for (const dep of op.dependenciesFrom) {
      edges.push({ fromId: op.id, toId: dep.toOperationId });
    }
  }
  return edges;
}
