"use client";

import { Bell, FileText, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { usePreferences } from "@/components/providers/preferences-provider";
import { getNotifications, type NotificationType } from "@/lib/mock/notifications";
import { cn } from "@/lib/utils";

const typeIcon: Record<NotificationType, typeof Inbox> = {
  rfq: Inbox,
  quote: FileText,
  document: FileText,
};

export function NotificationPopover() {
  const notifications = getNotifications();
  const unread = notifications.some((item) => item.unread);
  const { showNotificationBadge } = usePreferences();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          {unread && showNotificationBadge ? (
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="border-b border-border px-3 py-2.5">
          <PopoverTitle className="text-sm">Notifications</PopoverTitle>
        </PopoverHeader>
        <ul className="scrollbar-themed max-h-80 overflow-y-auto p-1">
          {notifications.map((item) => {
            const Icon = typeIcon[item.type];
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    "flex gap-2.5 rounded-lg px-2.5 py-2",
                    item.unread && "bg-primary-muted/60"
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{item.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.time}</p>
                  </div>
                  {item.unread ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
