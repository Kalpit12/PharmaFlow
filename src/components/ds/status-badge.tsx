import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/types/status";

const toneClass: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-transparent bg-info/12 text-info",
  success: "border-transparent bg-success/12 text-success",
  warning: "border-transparent bg-warning/18 text-warning-foreground",
  danger: "border-transparent bg-danger/12 text-danger",
  primary: "border-transparent bg-primary-muted text-primary",
  intel: "border-transparent bg-intel/12 text-intel",
  material: "border-transparent bg-material/14 text-material",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm px-1.5 font-medium tracking-[0.08em] uppercase text-[10px]", toneClass[tone], className)}
    >
      {children}
    </Badge>
  );
}
