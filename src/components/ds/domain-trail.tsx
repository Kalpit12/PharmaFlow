import Link from "next/link";

import { trailForPath, type DomainLink } from "@/lib/ux/domain-links";
import { cn } from "@/lib/utils";

export function DomainTrail({
  pathname,
  links,
  className,
}: {
  pathname?: string;
  links?: DomainLink[];
  className?: string;
}) {
  const items = links ?? (pathname ? trailForPath(pathname) : []);
  if (items.length === 0) return null;

  return (
    <nav aria-label="Related workspaces" className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px]", className)}>
      <span className="text-muted-foreground/70">Related</span>
      {items.map((item, index) => (
        <span key={item.href} className="inline-flex min-w-0 items-center gap-2">
          {index > 0 ? <span className="text-border" aria-hidden>·</span> : null}
          <Link href={item.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
