import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkspacePage({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "standard" | "full";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-4 sm:px-6 lg:px-8",
        width === "full" ? "max-w-[1600px]" : width === "wide" ? "max-w-[1400px]" : "max-w-[1280px]",
        className
      )}
    >
      {children}
    </div>
  );
}
