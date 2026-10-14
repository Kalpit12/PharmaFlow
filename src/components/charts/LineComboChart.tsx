"use client";

import { useMemo } from "react";

import { ChartSurface } from "@/components/charts/ChartSurface";
import { axisTicks, formatAxisValue } from "@/lib/charts/axis";
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
  bare = false,
}: {
  title: string;
  description?: string;
  points: ChartSeriesPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  primarySuffix?: string;
  emptyMessage?: string;
  dominant?: boolean;
  /** Render chart body only (parent supplies the section title). */
  bare?: boolean;
}) {
  const accessibleName = `${title}. ${primaryLabel} and ${secondaryLabel} over time.`;
  const width = 720;
  const height = dominant ? 240 : 180;
  const pad = { top: 16, right: 12, bottom: 28, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const series = useMemo(() => {
    if (points.length === 0) return null;
    const primaryMax = Math.max(...points.map((p) => p.primary), 0.001);
    const secondaryMax = Math.max(...points.map((p) => p.secondary ?? 0), 1);
    const yTicks = axisTicks(primaryMax);
    const primaryTop = Math.max(yTicks[yTicks.length - 1] ?? primaryMax, 0.001);
    const toPoints = (values: number[], max: number) =>
      values.map((value, index) => {
        const x = pad.left + (index / Math.max(values.length - 1, 1)) * innerW;
        const y = pad.top + innerH - (value / max) * innerH;
        return { x, y, value };
      });

    const primaryValues = points.map((p) => p.primary);
    const secondaryValues = points.map((p) => p.secondary ?? 0);
    const primaryPts = toPoints(primaryValues, primaryTop);
    const revenueLine = primaryPts.map((p) => `${p.x},${p.y}`).join(" ");
    const first = pad.left;
    const last = pad.left + innerW;
    const base = pad.top + innerH;
    const area = `M ${first},${base} L ${revenueLine.replace(/ /g, " L ")} L ${last},${base} Z`;

    return {
      area,
      revenueLine,
      primaryPts,
      primaryTop,
      yTicks,
      ordersLine: toPoints(secondaryValues, secondaryMax)
        .map((p) => `${p.x},${p.y}`)
        .join(" "),
    };
  }, [innerH, innerW, pad.left, pad.top, points]);

  if (points.length < 2) {
    if (bare) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }
    return <ChartSurface title={title} description={description} empty={emptyMessage} dominant={dominant} />;
  }

  const chartBody = (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={accessibleName}
        className={dominant ? "h-[200px] w-full sm:h-[240px]" : "h-[160px] w-full sm:h-[180px]"}
      >
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + innerH} className="stroke-border/80" strokeWidth="1" />
        {series
          ? series.yTicks.map((tick, tickIndex) => {
              const y = pad.top + innerH - (tick / series.primaryTop) * innerH;
              return (
                <g key={tickIndex}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="stroke-border/55" strokeWidth="1" />
                  <text x={pad.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
                    {formatAxisValue(tick)}
                  </text>
                </g>
              );
            })
          : null}
        {series ? (
          <>
            <path d={series.area} className="fill-chart-1/18" />
            <polyline points={series.revenueLine} fill="none" className="stroke-chart-1" strokeWidth="2.25" strokeLinejoin="round" />
            <polyline points={series.ordersLine} fill="none" className="stroke-chart-2" strokeWidth="1.75" strokeDasharray="4 3" />
            {series.primaryPts.map((pt, index) => (
              <circle key={`pt-${index}`} cx={pt.x} cy={pt.y} r="3.25" className="fill-chart-1 stroke-background" strokeWidth="1.5" />
            ))}
          </>
        ) : null}
        {points.map((point, index) => {
          const x = pad.left + (index / Math.max(points.length - 1, 1)) * innerW;
          return (
            <text key={index} x={x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
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
    </>
  );

  if (bare) {
    return <div className="min-w-0">{chartBody}</div>;
  }

  return (
    <ChartSurface title={title} description={description} dominant={dominant}>
      {chartBody}
    </ChartSurface>
  );
}
