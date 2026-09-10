import type { ReactNode } from "react";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/Breadcrumbs";
import { DomainTrail } from "@/components/ds/domain-trail";
import type { DomainLink } from "@/lib/ux/domain-links";
import { cn } from "@/lib/utils";

export function PageHeader({
  context,
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  metadata,
  related,
  relatedPath,
  className,
}: {
  context?: string;
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  badge?: ReactNode;
  metadata?: ReactNode;
  related?: DomainLink[];
  relatedPath?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 border-b border-border/80 pb-4", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="lg:hidden">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl space-y-1.5">
          {context ? <p className="label-context">{context}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.35rem] font-medium tracking-[-0.02em] sm:text-[1.5rem]">{title}</h1>
            {badge}
          </div>
          {description ? <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          {metadata ? <div className="text-[11px] tabular-nums text-muted-foreground">{metadata}</div> : null}
          {related || relatedPath ? <DomainTrail pathname={relatedPath} links={related} className="pt-1" /> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">{actions}</div> : null}
      </div>
    </header>
  );
}
