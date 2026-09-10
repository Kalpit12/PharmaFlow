import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import type { AttentionItem as AttentionRecord } from "@/lib/mock/dashboard";
import type { AttentionSeverity } from "@/components/ds/attention-item";

function toSeverity(value: string): AttentionSeverity {
  if (value === "High" || value === "HIGH" || value === "CRITICAL") return "HIGH";
  if (value === "Medium" || value === "MEDIUM") return "MEDIUM";
  return "WATCH";
}

export function NeedsAttention({ items }: { items: AttentionRecord[] }) {
  return (
    <AttentionList
      title="Needs Attention"
      subtitle="Operational items requiring action"
      empty={
        items.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent px-4 py-8"
            title="Nothing needs attention"
            description="Open RFQs and inactive accounts will appear here when they require follow-up."
          />
        ) : undefined
      }
    >
      {items.map((item) => (
        <AttentionItem
          key={item.id}
          domain={item.meta}
          severity={toSeverity(item.severity)}
          issue={item.title}
          evidence={item.detail}
          href={item.href}
          actionLabel={item.actionLabel}
        />
      ))}
    </AttentionList>
  );
}
