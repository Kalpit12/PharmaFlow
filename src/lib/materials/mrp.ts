import type { MaterialBomLine } from "@/lib/materials/types";

export type BomExplosionPath = {
  rootProductId: string;
  pathProductIds: string[];
  pathSkus: string[];
  quantityPer: number;
};

export type OrderComponentDemand = {
  componentId: string;
  requiredQuantity: number;
  paths: BomExplosionPath[];
};

export type BomExplosionResult =
  | { ok: true; demands: Map<string, OrderComponentDemand> }
  | { ok: false; cyclePath: string[] };

const MAX_BOM_DEPTH = 16;

function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Recursively explode BOM demand for one production order quantity.
 * Components with their own BOM expand further; leaf components accumulate gross demand.
 */
export function explodeOrderDemand(
  rootProductId: string,
  orderQuantity: number,
  boms: MaterialBomLine[],
  skuByProductId: Map<string, string> = new Map()
): BomExplosionResult {
  const bomByProduct = new Map<string, MaterialBomLine[]>();
  for (const line of boms) {
    const list = bomByProduct.get(line.productId) ?? [];
    list.push(line);
    bomByProduct.set(line.productId, list);
  }

  const demands = new Map<string, OrderComponentDemand>();
  let cyclePath: string[] | null = null;

  function addDemand(componentId: string, qty: number, path: BomExplosionPath) {
    const current = demands.get(componentId);
    if (!current) {
      demands.set(componentId, { componentId, requiredQuantity: roundQty(qty), paths: [path] });
      return;
    }
    current.requiredQuantity = roundQty(current.requiredQuantity + qty);
    current.paths.push(path);
  }

  function walk(productId: string, cumulativeQty: number, pathIds: string[], depth: number): boolean {
    if (depth > MAX_BOM_DEPTH) return true;
    if (pathIds.includes(productId)) {
      cyclePath = [...pathIds, productId];
      return false;
    }

    const lines = bomByProduct.get(productId) ?? [];
    if (lines.length === 0) return true;

    const nextPath = [...pathIds, productId];
    for (const line of lines) {
      const required = roundQty(cumulativeQty * line.quantityPer);
      const childLines = bomByProduct.get(line.componentId) ?? [];
      const pathSkus = nextPath
        .map((id) => skuByProductId.get(id) ?? id)
        .concat(skuByProductId.get(line.componentId) ?? line.componentId);
      const path: BomExplosionPath = {
        rootProductId,
        pathProductIds: nextPath.concat(line.componentId),
        pathSkus,
        quantityPer: roundQty(required / Math.max(orderQuantity, 1)),
      };

      if (childLines.length > 0) {
        const ok = walk(line.componentId, required, nextPath, depth + 1);
        if (!ok) return false;
      } else {
        addDemand(line.componentId, required, path);
      }
    }
    return true;
  }

  const rootLines = bomByProduct.get(rootProductId) ?? [];
  if (rootLines.length === 0) {
    return { ok: true, demands };
  }

  const ok = walk(rootProductId, orderQuantity, [], 0);
  if (!ok) {
    return { ok: false, cyclePath: cyclePath ?? [rootProductId] };
  }
  return { ok: true, demands };
}

/** Single-level explosion preserved for regression comparisons. */
export function explodeOrderDemandSingleLevel(
  rootProductId: string,
  orderQuantity: number,
  boms: MaterialBomLine[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of boms) {
    if (line.productId !== rootProductId) continue;
    out.set(line.componentId, roundQty((out.get(line.componentId) ?? 0) + orderQuantity * line.quantityPer));
  }
  return out;
}

export function detectBomCycle(boms: MaterialBomLine[]): string[] | null {
  const bomByProduct = new Map<string, MaterialBomLine[]>();
  for (const line of boms) {
    const list = bomByProduct.get(line.productId) ?? [];
    list.push(line);
    bomByProduct.set(line.productId, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle: string[] | null = null;

  function dfs(productId: string, stack: string[]): boolean {
    if (visiting.has(productId)) {
      cycle = [...stack, productId];
      return false;
    }
    if (visited.has(productId)) return true;
    visiting.add(productId);
    for (const line of bomByProduct.get(productId) ?? []) {
      if (!dfs(line.componentId, [...stack, productId])) return false;
    }
    visiting.delete(productId);
    visited.add(productId);
    return true;
  }

  for (const productId of bomByProduct.keys()) {
    if (!dfs(productId, [])) return cycle;
  }
  return null;
}
