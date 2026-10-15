"use client";

import { PlannerGlobalRulesPanel } from "@/components/operations/PlannerGlobalRulesPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PlanningPolicyView } from "@/lib/server/aps-plan";

export function PlannerGlobalRulesDrawer({
  open,
  onOpenChange,
  initialPolicy,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPolicy: PlanningPolicyView;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Global planning rules</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <PlannerGlobalRulesPanel
            key={initialPolicy.freezeUntil}
            initialPolicy={initialPolicy}
            canEdit={canEdit}
            variant="full"
            collapsible={false}
            defaultOpen
            onSaved={onSaved}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
