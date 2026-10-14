import { chartBarFill } from "@/lib/charts/tokens";
import { cn } from "@/lib/utils";

const ITEMS = [
  { tone: "primary" as const, label: "Headroom (<50%)" },
  { tone: "intel" as const, label: "Healthy (50–84%)" },
  { tone: "warning" as const, label: "High load (85–94%)" },
  { tone: "danger" as const, label: "Over capacity (≥95%)" },
];

export function ChartUtilizationLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {ITEMS.map((item) => (
        <li key={item.tone} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-sm", chartBarFill[item.tone])} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
