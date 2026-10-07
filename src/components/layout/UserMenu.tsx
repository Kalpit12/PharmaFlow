"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
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

export function UserMenu() {
  const router = useRouter();
  const { user, openPalette } = useShell();
  const name = user.name;
  const role = ROLE_LABEL[user.role];
  const initials = initialsFromName(name);
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
          <DropdownMenuItem onClick={() => router.push("/settings#account")}>Profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings#preferences")}>Preferences</DropdownMenuItem>
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
