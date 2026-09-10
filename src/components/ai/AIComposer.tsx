"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AIComposer({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const empty = value.trim().length === 0;

  const send = () => {
    if (empty || disabled) return;
    onSubmit(value.trim());
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  return (
    <form onSubmit={onFormSubmit} className="rounded-xl bg-card p-2 ring-1 ring-foreground/10">
      <label htmlFor="pharmora-ai-input" className="sr-only">
        Ask Pharmaflow about your business
      </label>
      <div className="flex items-end gap-2">
        <Textarea
          id="pharmora-ai-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Ask Pharmaflow about your business..."
          rows={2}
          className="min-h-11 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="submit"
          size="sm"
          disabled={empty || disabled}
          aria-label="Send question"
          className="mb-0.5 min-h-11 min-w-11 shrink-0 sm:min-h-7 sm:min-w-0"
        >
          <ArrowUp data-icon="inline-start" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
    </form>
  );
}
