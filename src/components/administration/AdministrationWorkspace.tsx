import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Check, CircleAlert, Factory, MapPin, ShieldCheck, Users, Warehouse } from "lucide-react";

import { MetricStrip } from "@/components/ds/metric-strip";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { AdministrationSnapshot } from "@/lib/administration/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatUtcDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function AdministrationWorkspace({ data }: { data: AdministrationSnapshot }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="work-surface grid min-w-0 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-4 p-4 sm:p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40">
            <Building2 className="size-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{data.tenant.name}</h2>
              <StatusBadge tone={data.tenant.status === "ACTIVE" ? "intel" : "info"}>{data.tenant.status}</StatusBadge>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{data.tenant.slug}</p>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Tenant identity, people, operating sites, and master-data coverage for this workspace.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-border text-xs lg:min-w-[22rem] lg:border-t-0 lg:border-l">
          <div className="p-4">
            <dt className="label-context">Created</dt>
            <dd className="mt-1.5 font-medium tabular-nums">{formatUtcDate(data.tenant.createdAt)}</dd>
          </div>
          <div className="border-l border-border p-4">
            <dt className="label-context">Last updated</dt>
            <dd className="mt-1.5 font-medium tabular-nums">{formatUtcDate(data.tenant.updatedAt)}</dd>
          </div>
          <div className="col-span-2 border-t border-border p-4">
            <dt className="label-context">Your access</dt>
            <dd className="mt-1.5 font-medium">{data.currentUser.roleLabel}</dd>
            <dd className="truncate text-muted-foreground">{data.currentUser.email}</dd>
          </div>
        </dl>
      </section>

      <MetricStrip
        aria-label="Administration metrics"
        items={[
          { id: "users", label: "Active users", value: String(data.counts.activeUsers), hint: `${data.counts.users} total accounts` },
          { id: "products", label: "Products", value: String(data.counts.products), hint: "Tenant product master" },
          { id: "customers", label: "Customers", value: String(data.counts.customers), hint: "Commercial directory" },
          { id: "suppliers", label: "Suppliers", value: String(data.counts.suppliers), hint: "Procurement network" },
          { id: "workstations", label: "Workstations", value: String(data.counts.workstations), hint: "Production resources" },
          { id: "lots", label: "Inventory lots", value: String(data.counts.inventoryLots), hint: `${data.counts.warehouses} warehouses` },
        ]}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <section className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="label-context">Configuration</p>
            <h2 className="mt-1 text-sm font-semibold">Workspace readiness</h2>
            <p className="mt-1 text-xs text-muted-foreground">Evidence from current tenant records—no assumed integrations.</p>
          </div>
          <ul className="divide-y divide-border">
            {data.readiness.map((item) => {
              const inner = (
                <>
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                      item.state === "READY" ? "bg-intel/12 text-intel" : "bg-warning/15 text-warning"
                    }`}
                  >
                    {item.state === "READY" ? <Check className="size-3" aria-hidden /> : <CircleAlert className="size-3" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <StatusBadge tone={item.state === "READY" ? "intel" : "warning"}>{item.state}</StatusBadge>
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} className="flex min-h-14 items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-h-14 items-start gap-3 px-4 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="work-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" aria-hidden />
                <h2 className="text-sm font-semibold">People and access</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Account status is shown here. Role changes and audit stay in Governance.
              </p>
            </div>
            {data.canViewGovernance ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/governance">{data.canManageUsers ? "Manage access" : "Open governance"}</Link>
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="ops-table w-full min-w-[640px]" aria-label="Administration users">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td>{user.roleLabel}</td>
                    <td>
                      <StatusBadge tone={user.status === "ACTIVE" ? "intel" : "neutral"}>{user.status}</StatusBadge>
                    </td>
                    <td className="tabular-nums text-muted-foreground">{formatUtcDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            User invitation and password administration are not configured in this workspace. Local demo credentials remain environment-controlled.
          </div>
        </section>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <ResourcePanel
          icon={<Factory className="size-4 text-primary" aria-hidden />}
          title="Production resources"
          subtitle={`${data.workstations.filter((row) => row.active).length} active workstations`}
        >
          <ul className="divide-y divide-border">
            {data.workstations.map((workstation) => (
              <li key={workstation.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{workstation.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{workstation.code}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{workstation.capacityHoursPerDay}h/day</span>
                  <StatusBadge tone={workstation.active ? "intel" : "neutral"}>{workstation.active ? "Active" : "Inactive"}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
          <ResourceFooter href="/operations" label="Open production planning" />
        </ResourcePanel>

        <ResourcePanel
          icon={<Warehouse className="size-4 text-material" aria-hidden />}
          title="Warehouse network"
          subtitle={`${data.warehouses.length} configured locations`}
        >
          <ul className="divide-y divide-border">
            {data.warehouses.map((warehouse) => (
              <li key={warehouse.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{warehouse.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{warehouse.code}</span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {warehouse.lotCount} {warehouse.lotCount === 1 ? "lot" : "lots"}
                </span>
              </li>
            ))}
          </ul>
          <ResourceFooter href="/inventory" label="Open inventory" />
        </ResourcePanel>

        <ResourcePanel
          icon={<MapPin className="size-4 text-intel" aria-hidden />}
          title="Commercial regions"
          subtitle={`${data.regions.length} configured ${data.regions.length === 1 ? "territory" : "territories"}`}
        >
          <ul className="divide-y divide-border">
            {data.regions.map((region) => (
              <li key={region.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{region.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {region.code} · {region.country}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {region.customerCount} {region.customerCount === 1 ? "customer" : "customers"}
                </span>
              </li>
            ))}
          </ul>
          <ResourceFooter href="/dashboard" label="Open commercial overview" />
        </ResourcePanel>
      </div>

      <section className="flex flex-col gap-3 border-y border-border px-1 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-intel" aria-hidden />
          <div>
            <p className="text-sm font-medium">Sensitive controls remain separated</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Roles, approval authority, and the append-only audit trail are managed in Governance.
            </p>
          </div>
        </div>
        {data.canViewGovernance ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/governance">Review governance</Link>
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function ResourcePanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="work-surface flex min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        {icon}
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function ResourceFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-auto border-t border-border px-4 py-3">
      <Link href={href} className="text-xs font-medium text-primary hover:underline">
        {label}
      </Link>
    </div>
  );
}
