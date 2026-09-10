import { getMockUser } from "@/lib/mock/session";

import { AIStarterPrompts } from "@/components/ai/AISuggestions";

export function AIWelcome({ onSelect }: { onSelect: (question: string) => void }) {
  const firstName = getMockUser().name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold tracking-tight">Good morning, {firstName}.</p>
        <p className="mt-1 text-sm text-muted-foreground">What would you like to understand about the business?</p>
      </div>
      <AIStarterPrompts onSelect={onSelect} />
    </div>
  );
}
