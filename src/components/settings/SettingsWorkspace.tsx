"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, Check, Clock3, KeyRound, Monitor, Moon, RotateCcw, ShieldCheck, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/ds/status-badge";
import { usePreferences, type TimeZonePreference } from "@/components/providers/preferences-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingsSnapshot } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "dark", label: "Dark", detail: "Graphite control room", icon: Moon },
  { id: "light", label: "Light", detail: "Paper analytical view", icon: Sun },
  { id: "system", label: "System", detail: "Follow this device", icon: Monitor },
] as const;

const TIME_ZONES: Array<{ value: TimeZonePreference; label: string; detail: string }> = [
  { value: "utc", label: "UTC", detail: "Coordinated operations time" },
  { value: "nairobi", label: "East Africa Time", detail: "Africa/Nairobi (UTC+3)" },
  { value: "local", label: "Device local time", detail: "Uses this browser's time zone" },
];

export function SettingsWorkspace({ data }: { data: SettingsSnapshot }) {
  const { theme, setTheme } = useTheme();
  const {
    timeZone,
    setTimeZone,
    reduceMotion,
    setReduceMotion,
    showNotificationBadge,
    setShowNotificationBadge,
    resetPreferences,
  } = usePreferences();

  const reset = () => {
    setTheme("dark");
    resetPreferences();
    toast.success("Display preferences reset.");
  };

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <section id="preferences" className="work-surface scroll-mt-16">
          <SettingsHeading
            icon={<Monitor className="size-4 text-primary" aria-hidden />}
            title="Appearance"
            description="Applied immediately and stored in this browser."
          />
          <div className="grid gap-2 p-4 sm:grid-cols-3">
            {THEMES.map((option) => {
              const Icon = option.icon;
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    "relative min-h-24 rounded-sm border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/8" : "border-border bg-background hover:bg-muted/35"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    {selected ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-4 block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.detail}</span>
                </button>
              );
            })}
          </div>
          <div className="divide-y divide-border border-t border-border">
            <PreferenceRow
              title="Reduce motion"
              description="Minimizes animations and transitions across the workspace."
              control={
                <PreferenceSwitch
                  label="Reduce motion"
                  checked={reduceMotion}
                  onCheckedChange={setReduceMotion}
                />
              }
            />
          </div>
        </section>

        <section className="work-surface">
          <SettingsHeading
            icon={<Clock3 className="size-4 text-intel" aria-hidden />}
            title="Time and locale"
            description="Controls the operational timestamp in the application header."
          />
          <PreferenceRow
            title="Display time zone"
            description={TIME_ZONES.find((zone) => zone.value === timeZone)?.detail ?? ""}
            control={
              <Select value={timeZone} onValueChange={(value) => setTimeZone(value as TimeZonePreference)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_ZONES.map((zone) => (
                    <SelectItem key={zone.value} value={zone.value}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <PreferenceRow
            title="Number and date format"
            description="English (United Kingdom) · DD Mon YYYY · 24-hour clock"
            control={<StatusBadge tone="neutral">Workspace default</StatusBadge>}
          />
        </section>

        <section className="work-surface">
          <SettingsHeading
            icon={<Bell className="size-4 text-material" aria-hidden />}
            title="Notifications"
            description="Presentation preferences only; notification delivery services are not configured."
          />
          <PreferenceRow
            title="Unread indicator"
            description="Show the blue unread marker on the notification bell."
            control={
              <PreferenceSwitch
                label="Unread notification indicator"
                checked={showNotificationBadge}
                onCheckedChange={setShowNotificationBadge}
              />
            }
          />
          <PreferenceRow
            title="Email and messaging delivery"
            description="No outbound email, WhatsApp, or push provider is connected."
            control={<StatusBadge tone="neutral">Not configured</StatusBadge>}
          />
        </section>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Reset display preferences
          </Button>
        </div>
      </div>

      <aside className="min-w-0 space-y-5">
        <section id="account" className="work-surface scroll-mt-16">
          <SettingsHeading
            icon={<UserRound className="size-4 text-primary" aria-hidden />}
            title="Account"
            description="Authenticated identity for this workspace."
          />
          <dl className="divide-y divide-border text-sm">
            <ReadOnlyField label="Name" value={data.account.name} />
            <ReadOnlyField label="Work email" value={data.account.email} mono />
            <ReadOnlyField label="Role" value={data.account.roleLabel} />
          </dl>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Profile editing and password change endpoints are not configured.
          </p>
        </section>

        <section className="work-surface">
          <SettingsHeading
            icon={<KeyRound className="size-4 text-warning" aria-hidden />}
            title="Security"
            description="Current authentication posture."
          />
          <dl className="divide-y divide-border text-sm">
            <ReadOnlyField label="Authentication" value={data.security.authentication} />
            <ReadOnlyField label="Session" value={data.security.session} />
            <ReadOnlyField label="Multi-factor authentication" value={data.security.mfa} warning />
            <ReadOnlyField label="Single sign-on" value={data.security.sso} warning />
          </dl>
          {data.canViewGovernance ? (
            <div className="border-t border-border px-4 py-3">
              <Link href="/governance" className="text-xs font-medium text-primary hover:underline">
                Review governance and access
              </Link>
            </div>
          ) : null}
        </section>

        <section className="work-surface">
          <SettingsHeading
            icon={<ShieldCheck className="size-4 text-intel" aria-hidden />}
            title="Workspace"
            description="Organization context for this account."
          />
          <dl className="divide-y divide-border text-sm">
            <ReadOnlyField label="Organization" value={data.workspace.name} />
            <ReadOnlyField label="Workspace key" value={data.workspace.slug} mono />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge tone={data.workspace.status === "ACTIVE" ? "intel" : "info"}>{data.workspace.status}</StatusBadge>
              </dd>
            </div>
          </dl>
          {data.canViewAdministration ? (
            <div className="border-t border-border px-4 py-3">
              <Link href="/administration" className="text-xs font-medium text-primary hover:underline">
                Open workspace administration
              </Link>
            </div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function SettingsHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-4 py-3">
      {icon}
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function PreferenceRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function PreferenceSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-primary bg-primary" : "border-border bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-[1.125rem] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function ReadOnlyField({
  label,
  value,
  mono = false,
  warning = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-1 break-words", mono && "font-mono text-xs", warning && "text-warning")}>{value}</dd>
    </div>
  );
}
