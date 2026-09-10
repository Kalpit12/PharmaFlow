"use client";

import { usePathname } from "next/navigation";
import { LayoutTemplate } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { findNavItem } from "@/lib/mock/navigation";

export default function PlaceholderPage() {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const title = item?.label ?? "Coming soon";
  const phase = item?.phase ?? "a later phase";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6">
      <PageHeader
        title={title}
        description={`${title} is coming in ${phase}. This route exists so navigation and the command palette have somewhere to land.`}
      />
      <EmptyState
        icon={<LayoutTemplate className="size-5" />}
        title={`${title} is not built yet`}
        description="Pharmaflow is being designed phase by phase. The application shell is ready; this module will inherit it when its phase begins."
      />
    </div>
  );
}
