"use client";

import { useMemo, useState, useTransition } from "react";
import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL } from "@/lib/auth/identity";
import type { GovernanceSnapshot } from "@/lib/governance/types";
import type { UserRole } from "@prisma/client";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "OPERATIONS", "OPERATOR", "PROCUREMENT", "QUALITY", "SALES", "VIEWER"];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function GovernanceWorkspace({ data }: { data: GovernanceSnapshot }) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filteredAudit = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.audit;
    return data.audit.filter(
      (row) =>
        row.actorName.toLowerCase().includes(term) ||
        row.action.toLowerCase().includes(term) ||
        row.entityType.toLowerCase().includes(term) ||
        (row.entityId ?? "").toLowerCase().includes(term) ||
        row.changeSummary.toLowerCase().includes(term)
    );
  }, [data.audit, query]);

  async function changeRole(userId: string, role: UserRole) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/governance/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Unable to update role.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <section aria-label="Governance metrics" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Current role", value: data.currentRoleLabel },
          { label: "Permissions", value: String(data.permissions.length) },
          { label: "Tenant users", value: String(data.users.length) },
          { label: "Recent audit", value: String(data.audit.length) },
        ].map((metric) => (
          <div key={metric.label} className="rounded-[3px] border border-border/70 bg-card px-3 py-2.5">
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{metric.label}</p>
            <p className="mt-1 font-mono text-lg tabular-nums">{metric.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="space-y-4 rounded-[3px] border border-border/70 bg-card p-3">
          <div>
            <h2 className="text-sm font-medium">Access</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Role-based permissions for {data.currentRoleLabel}. Server authorization is authoritative.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-[3px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {permission}
              </span>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-medium">Approval authority</h3>
            <ul className="mt-2 space-y-1.5">
              {data.approvalAuthority.map((row) => (
                <li key={row.capability} className="flex items-center justify-between gap-3 text-xs">
                  <span>{row.capability}</span>
                  <StatusBadge tone={row.permitted ? "intel" : "neutral"}>{row.permitted ? "Permitted" : "Not permitted"}</StatusBadge>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-3 rounded-[3px] border border-border/70 bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Users</h2>
              <p className="text-xs text-muted-foreground">Tenant-scoped roles only.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs" aria-label="Governance users table">
              <thead className="border-b border-border/60 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 font-medium">User</th>
                  <th className="px-2 py-2 font-medium">Role</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="px-2 py-2">
                      {data.canManageUsers ? (
                        <Select
                          defaultValue={user.role}
                          disabled={pending}
                          onValueChange={(value) => changeRole(user.id, value as UserRole)}
                        >
                          <SelectTrigger className="h-8 w-[160px] rounded-[3px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{user.roleLabel}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge tone={user.status === "ACTIVE" ? "intel" : "neutral"}>{user.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </section>
      </div>

      <section className="rounded-[3px] border border-border/70 bg-card p-3">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">Audit trail</h2>
            <p className="text-xs text-muted-foreground">Append-only record of sensitive operational mutations.</p>
          </div>
          <SearchInput
            aria-label="Search audit records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Actor, action, entity…"
            className="max-w-sm"
          />
        </div>
        {filteredAudit.length === 0 ? (
          <EmptyState title="No audit records" description="Sensitive actions will appear here when recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs" aria-label="Governance audit table">
              <thead className="border-b border-border/60 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Actor</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                  <th className="px-2 py-2 font-medium">Entity</th>
                  <th className="px-2 py-2 font-medium">Change</th>
                  <th className="px-2 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{formatWhen(row.createdAt)}</td>
                    <td className="px-2 py-2">{row.actorName}</td>
                    <td className="px-2 py-2 font-mono">{row.action}</td>
                    <td className="px-2 py-2">
                      <p>{row.entityType}</p>
                      {row.entityId ? <p className="font-mono text-[10px] text-muted-foreground">{row.entityId.slice(0, 8)}…</p> : null}
                    </td>
                    <td className="px-2 py-2">{row.changeSummary}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
