"use client";

import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DEFAULT_ROLE, type ViewRole } from "@/lib/roles";
import { ViewAsSwitch } from "./view-as-switch";
import { Wordmark } from "./wordmark";

export function Topbar({ title, role = DEFAULT_ROLE }: { title?: string; role?: ViewRole }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
      {title ? (
        <h1 className="text-base font-semibold text-foreground font-[family-name:var(--font-poppins)]">
          {title}
        </h1>
      ) : (
        <Wordmark on="light" className="text-[15px]" />
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar idea, brief, archivo…"
            aria-label="Buscar"
            className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <ViewAsSwitch role={role} />
        <Button variant="ghost" size="icon" aria-label="Notificaciones">
          <Bell className="size-4" />
        </Button>
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            PV
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
