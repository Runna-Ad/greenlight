"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DEFAULT_ROLE, type ViewRole } from "@/lib/roles";
import type { Soy } from "@/lib/soy";
import { type PoolMember } from "./soy-switch";
import { NotificationsBell } from "./notifications-bell";
import { Wordmark } from "./wordmark";
import { MobileNav } from "./sidebar";

export function Topbar({
  title,
  role = DEFAULT_ROLE,
  soy = null,
  pool = [],
  avisos = 0,
}: {
  title?: string;
  role?: ViewRole;
  soy?: Soy | null;
  pool?: PoolMember[];
  avisos?: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground shadow-sm md:px-6">
      <MobileNav role={role} soy={soy} pool={pool} />
      {title ? (
        <h1 className="text-base font-semibold text-white font-[family-name:var(--font-poppins)]">
          {title}
        </h1>
      ) : (
        <Wordmark on="dark" className="text-[15px]" />
      )}
      {/* Saludo personalizado, como en los mockups: "Hola, {nombre}" (viene de
          "¿Quién eres?"). Se oculta en móvil para no apretar el topbar. */}
      {soy && (
        <span className="hidden text-lg font-bold text-white sm:inline">Hola, {soy.name}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar idea, brief, archivo…"
            aria-label="Buscar"
            className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <NotificationsBell initialCount={avisos} />
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            PV
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
