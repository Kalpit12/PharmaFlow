import { Suspense } from "react";

import { AIAssistant } from "@/components/ai/AIAssistant";

export default function AIPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading AI workspace…</div>}>
      <AIAssistant />
    </Suspense>
  );
}
