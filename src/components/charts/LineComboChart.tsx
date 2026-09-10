"use client";

import { useMemo } from "react";

import { ChartSurface } from "@/components/charts/ChartSurface";
import type { ChartSeriesPoint } from "@/lib/charts/types";

export function LineComboChart({
  title,
  description,
  points,
  primaryLabel = "Revenue",
  secondaryLabel = "Orders",
  primarySuffix = "M",
  emptyMessage = "No data available for this period.",
  dominant = false,
}: {
  title: string;
  description?: string;
  points: ChartSeriesPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  primarySuffix?: string;
  emptyMessage?: string;
  dominant?: boolean;
}) {
  const accessibleName = `${title}. ${primaryLabel} and ${secondaryLabel} over time.`;
  const width = 720;
  const height = dominant ? 240 : 180;
  const pad = { top: 16, right: 12, bottom: 28, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const series = useMemo(() => {
    if (points.length === 0) return null;
    const primaryMax = Math.max(...points.map((p) => p.primary), 0.001);
    const secondaryMax = Math.max(...points.map((p) => p.secondary ?? 0), 1);
    const toLine = (values: number[], max: number) =>
      values
        .map((value, index) => {
          const x = pad.left + (index / Math.max(values.length - 1, 1)) * innerW;
          const y = pad.top + innerH - (value / max) * innerH;
          return `${x},${y}`;
        })
        .join(" ");

    const primaryValues = points.map((p) => p.primary);
    const secondaryValues = points.map((p) => p.secondary ?? 0);
    const revenueLine = toLine(primaryValues, primaryMax);
    const first = pad.left;
    const last = pad.left + innerW;
    const base = pad.top + innerH;
    const area = `M ${first},${base} L ${revenueLine.replace(/ /g, " L ")} L ${last},${base} Z`;

    return {
      area,
      revenueLine,
      ordersLine: toLine(secondaryValues, secondaryMax),
    };
  }, [innerH, innerW, pad.left, pad.top, points]);

  if (points.length < 2) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} dominant={dominant} />;
  }

  return (
    <ChartSurface title={title} description={description} dominant={dominant}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={accessibleName}
        className={dominant ? "h-[200px] w-full sm:h-[240px]" : "h-[160px] w-full sm:h-[180px]"}
      >
        {[0.25, 0.5, 0.75, 1].map((line) => (
          <line
            key={line}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH * (1 - line)}
            y2={pad.top + innerH * (1 - line)}
            className="stroke-border"
            strokeWidth="1"
          />
        ))}
        {series ? (
          <>
            <path d={series.area} className="fill-chart-1/12" />
            <polyline points={series.revenueLine} fill="none" className="stroke-chart-1" strokeWidth="2" />
            <polyline points={series.ordersLine} fill="none" className="stroke-chart-2" strokeWidth="1.75" strokeDasharray="4 3" />
          </>
        ) : null}
        {points.map((point, index) => {
          const x = pad.left + (index / Math.max(points.length - 1, 1)) * innerW;
          return (
            <text key={point.label} x={x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {point.label}
            </text>
          );
        })}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-1" aria-hidden />
          {primaryLabel}
          {primarySuffix ? ` (${primarySuffix})` : ""}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-2" aria-hidden />
          {secondaryLabel}
        </li>
      </ul>
    </ChartSurface>
  );
}
