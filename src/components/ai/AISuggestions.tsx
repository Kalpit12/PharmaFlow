import { Button } from "@/components/ui/button";
import { starterQuestions } from "@/lib/mock/ai";

export function AISuggestions({
  questions,
  onSelect,
  label = "Suggested questions",
}: {
  questions: string[];
  onSelect: (question: string) => void;
  label?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <ul className="flex flex-col gap-2">
        {questions.map((question) => (
          <li key={question}>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm font-normal"
              onClick={() => onSelect(question)}
            >
              {question}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AIStarterPrompts({ onSelect }: { onSelect: (question: string) => void }) {
  return <AISuggestions questions={starterQuestions} onSelect={onSelect} />;
}
