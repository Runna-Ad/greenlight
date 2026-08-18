"use client";

import { Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DEFAULT_ROLE, type ViewRole } from "@/lib/roles";
import type { Soy } from "@/lib/soy";
import { type PoolMember } from "./soy-switch";
import { NotificationsBell } from "./notifications-bell";
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
      {/* La marca vive UNA sola vez, en el sidebar. Aquí el topbar lleva el
          contexto: el título de la página, o el saludo personalizado
          "Hola, {nombre}" (de "¿Quién eres?") — nunca el logo repetido. */}
      {title ? (
        <h1 className="truncate text-base font-semibold text-white font-[family-name:var(--font-poppins)]">
          {title}
        </h1>
      ) : soy ? (
        <span className="truncate text-lg font-bold text-white">Hola, {soy.name}</span>
      ) : null}

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
