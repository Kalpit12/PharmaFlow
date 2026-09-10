"use client";

import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";

import { useShell } from "@/components/layout/shell-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsFromName, ROLE_LABEL } from "@/lib/auth/identity";
import { getMockUser } from "@/lib/mock/session";

export function UserMenu() {
  const { data } = useSession();
  const fallback = getMockUser();
  const name = data?.user?.name ?? fallback.name;
  const role = data?.user?.role ? ROLE_LABEL[data.user.role] : fallback.role;
  const initials = initialsFromName(name);
  const { openPalette } = useShell();
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block font-medium text-foreground">{name}</span>
          <span className="block text-xs font-normal text-muted-foreground">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => toast("Profile is coming with Settings.")}>Profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast("Preferences are coming with Settings.")}>
            Preferences
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openPalette("commands")}>Keyboard Shortcuts</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme((resolvedTheme ?? "dark") === "dark" ? "light" : "dark")}>
            Toggle appearance
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast("Help & Support is UI-only in this phase.")}>
            Help & Support
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
