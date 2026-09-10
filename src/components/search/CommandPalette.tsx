"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SearchResults } from "@/components/search/SearchResults";
import { useShell } from "@/components/layout/shell-context";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { filterCommands } from "@/lib/mock/commands";
import { searchMock } from "@/lib/mock/search";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, paletteMode, setPaletteMode, openPalette } = useShell();
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => searchMock(query), [query]);
  const commands = useMemo(() => filterCommands(query), [query]);

  const close = () => {
    setPaletteOpen(false);
    setQuery("");
  };

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={(open) => {
        setPaletteOpen(open);
        if (!open) setQuery("");
      }}
      title={paletteMode === "search" ? "Search Pharmaflow" : "Command palette"}
      description={
        paletteMode === "search"
          ? "Search products, customers, RFQs, quotations, orders, and documents."
          : "Run a quick action or jump to a section."
      }
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false} className="rounded-xl">
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={paletteMode === "search" ? "Search Pharmaflow..." : "Type a command..."}
        />
        <div className="flex gap-1 px-2">
          <ModeButton
            active={paletteMode === "search"}
            onClick={() => {
              setPaletteMode("search");
              setQuery("");
            }}
          >
            Search
          </ModeButton>
          <ModeButton
            active={paletteMode === "commands"}
            onClick={() => {
              setPaletteMode("commands");
              setQuery("");
            }}
          >
            Commands
          </ModeButton>
        </div>
        <CommandList>
          {paletteMode === "search" ? (
            query.trim() ? (
              <>
                <CommandEmpty>No matching records in demo data.</CommandEmpty>
                <SearchResults
                  results={searchResults}
                  onSelect={(item) => {
                    close();
                    toast("Opening a placeholder — domain pages are not built yet.");
                    router.push(item.href);
                  }}
                />
              </>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Try “Amoxicillin”, “RFQ-10482”, or “ABC”.
              </p>
            )
          ) : (
            <>
              <CommandEmpty>No matching commands.</CommandEmpty>
              <CommandGroup heading="Quick Actions">
                {commands
                  .filter((item) => item.group === "Quick Actions")
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.label}
                      onSelect={() => {
                        if (item.id === "search-products") {
                          openPalette("search");
                          setQuery("");
                          return;
                        }
                        close();
                        if (item.comingSoon) {
                          toast(`${item.label} is coming soon.`);
                        }
                        if (item.href) router.push(item.href);
                      }}
                    >
                      {item.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Navigation">
                {commands
                  .filter((item) => item.group === "Navigation")
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.label}
                      onSelect={() => {
                        close();
                        if (item.comingSoon) {
                          toast(`${item.label} — placeholder route.`);
                        }
                        if (item.href) router.push(item.href);
                      }}
                    >
                      {item.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
