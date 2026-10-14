"use client";

import { useId, useMemo } from "react";

import type { ForecastSnapshot } from "@/lib/forecasting/types";

export function ForecastChart({ points }: { points: ForecastSnapshot["series"] }) {
  const labelledBy = useId();
  const width = 640;
  const height = 200;
  const pad = { top: 16, right: 16, bottom: 28, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const series = useMemo(() => {
    const values = points.map((point) => point.value);
    const max = Math.max(...values, 1);
    const coords = values.map((value, index) => {
      const x = pad.left + (index / Math.max(values.length - 1, 1)) * innerW;
      const y = pad.top + innerH - (value / max) * innerH;
      return { x, y, point: points[index] };
    });
    const historical = coords.filter((row) => row.point.kind === "historical");
    const projected = coords.filter((row) => row.point.kind === "projected");
    const histLine = historical.map((row) => `${row.x},${row.y}`).join(" ");
    const projJoin =
      historical.length > 0 && projected.length > 0
        ? `${historical[historical.length - 1].x},${historical[historical.length - 1].y} ${projected.map((row) => `${row.x},${row.y}`).join(" ")}`
        : projected.map((row) => `${row.x},${row.y}`).join(" ");
    return { coords, histLine, projJoin };
  }, [innerH, innerW, pad.left, pad.top, points]);

  if (points.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">No series available.</p>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy} className="h-[180px] w-full sm:h-[200px]">
      <title id={labelledBy}>Historical revenue versus projected outlook</title>
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
      {series.histLine ? <polyline points={series.histLine} fill="none" className="stroke-primary" strokeWidth="2" /> : null}
      {series.projJoin ? (
        <polyline points={series.projJoin} fill="none" className="stroke-primary" strokeWidth="2" strokeDasharray="5 4" />
      ) : null}
      {series.coords.map((row) => (
        <circle
          key={row.point.label}
          cx={row.x}
          cy={row.y}
          r="3.5"
          className={row.point.kind === "projected" ? "fill-background stroke-primary" : "fill-primary"}
          strokeWidth={row.point.kind === "projected" ? 2 : 0}
        />
      ))}
      {series.coords.map((row) => (
        <text key={`${row.point.label}-l`} x={row.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {row.point.label}
        </text>
      ))}
    </svg>
  );
}
