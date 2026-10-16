"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  Clock,
  Home,
  LayoutGrid,
  MoreHorizontal,
  Package,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PlannerShellView =
  | "gantt"
  | "dashboard"
  | "plant"
  | "roster"
  | "orders"
  | "engine"
  | "integrations"
  | "import"
  | "api"
  | "assistant";

const PRIMARY: Array<{
  view?: PlannerShellView;
  href?: string;
  label: string;
  icon: typeof Home;
}> = [
  { href: "/dashboard", label: "Home", icon: Home },
  { view: "plant", label: "Resources", icon: LayoutGrid },
  { view: "orders", label: "Orders", icon: ShoppingCart },
  { href: "/materials", label: "Warehouse", icon: Warehouse },
  { view: "gantt", label: "Scheduling", icon: Clock },
  { href: "/execution/production", label: "Timer", icon: Package },
  { view: "dashboard", label: "Reporting", icon: BarChart3 },
];

const OVERFLOW: Array<{ view: PlannerShellView; label: string }> = [
  { view: "engine", label: "Planner engine" },
  { view: "integrations", label: "Integrations" },
  { view: "import", label: "Data import" },
  { view: "api", label: "API & webhooks" },
  { view: "assistant", label: "Assistant" },
];

function hrefForView(view: PlannerShellView, params: URLSearchParams): string {
  const next = new URLSearchParams(params.toString());
  next.set("view", view);
  return `/operations?${next.toString()}`;
}

export function OperationsPlannerShell({
  activeView,
  children,
}: {
  activeView: PlannerShellView;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGantt = activeView === "gantt";

  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0",
        isGantt ? "h-[calc(100vh-3.5rem)]" : "min-h-[60vh]"
      )}
    >
      <nav
        className="flex w-16 shrink-0 flex-col border-r border-border bg-background py-2"
        aria-label="Operations planner"
      >
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = item.view
            ? item.view === "plant"
              ? activeView === "plant" || activeView === "roster"
              : activeView === item.view
            : false;
          const href = item.href ?? (item.view ? hrefForView(item.view, searchParams) : "/operations");
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "mx-1 flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] leading-tight text-muted-foreground transition hover:bg-muted hover:text-foreground",
                active && "bg-muted font-medium text-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="text-center">{item.label}</span>
            </Link>
          );
        })}
        <div className="mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mx-1 flex w-[calc(100%-0.5rem)] flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] text-muted-foreground hover:bg-muted"
              >
                <MoreHorizontal className="size-5" />
                More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end">
              {OVERFLOW.map((row) => (
                <DropdownMenuItem key={row.view} onClick={() => router.push(hrefForView(row.view, searchParams))}>
                  {row.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
