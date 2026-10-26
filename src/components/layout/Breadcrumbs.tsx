import Link from "next/link";

import { cn } from "@/lib/utils";

function CrumbSeparator() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 opacity-50" aria-hidden>
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;

  const last = items[items.length - 1];
  const first = items[0];
  const collapsed = items.length > 2;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
        {collapsed ? (
          <>
            <li className="hidden min-w-0 sm:block">
              <Crumb item={first} />
            </li>
            <li className="hidden sm:flex" aria-hidden>
              <CrumbSeparator />
            </li>
            <li className="hidden text-muted-foreground/70 sm:block" aria-hidden>
              …
            </li>
            <li className="hidden sm:flex" aria-hidden>
              <CrumbSeparator />
            </li>
            <li className="min-w-0 truncate font-medium text-foreground">
              <span className="sm:hidden">{last.label}</span>
              <span className="hidden sm:inline">
                <Crumb item={{ ...last, href: undefined }} current />
              </span>
            </li>
          </>
        ) : (
          items.map((item, index) => {
            const current = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <CrumbSeparator /> : null}
                <span className={cn("truncate", current && "font-medium text-foreground")}>
                  <Crumb item={item} current={current} />
                </span>
              </li>
            );
          })
        )}
      </ol>
    </nav>
  );
}

function Crumb({ item, current }: { item: BreadcrumbItem; current?: boolean }) {
  if (current || !item.href) {
    return <span aria-current={current ? "page" : undefined}>{item.label}</span>;
  }

  return (
    <Link href={item.href} className="hover:text-foreground">
      {item.label}
    </Link>
  );
}
