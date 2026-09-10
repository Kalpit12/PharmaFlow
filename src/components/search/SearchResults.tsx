"use client";

import { Building2, FileText, Folder, Inbox, Package, ShoppingBag } from "lucide-react";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { SearchCategory, SearchRecord } from "@/lib/mock/search";

const categoryIcon: Record<SearchCategory, typeof Package> = {
  Products: Package,
  Customers: Building2,
  RFQs: Inbox,
  Quotations: FileText,
  Orders: ShoppingBag,
  Documents: Folder,
};

const categoryOrder: SearchCategory[] = [
  "Products",
  "Customers",
  "RFQs",
  "Quotations",
  "Orders",
  "Documents",
];

export function SearchResults({
  results,
  onSelect,
}: {
  results: SearchRecord[];
  onSelect: (item: SearchRecord) => void;
}) {
  const grouped = categoryOrder
    .map((category) => ({
      category,
      items: results.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {grouped.map((group) => {
        const Icon = categoryIcon[group.category];
        return (
          <CommandGroup key={group.category} heading={group.category.toUpperCase()}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.category} ${item.title} ${item.subtitle}`}
                onSelect={() => onSelect(item)}
              >
                <Icon />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                </span>
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{item.category}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
