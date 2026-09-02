"use client";

import Link from "next/link";
import { User, UserRound, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_ROLE, canSee, type ViewRole } from "@/lib/roles";
import type { Soy } from "@/lib/soy";
import { NotificationsBell } from "./notifications-bell";
import { SearchBox } from "./search-box";
import { MobileNav } from "./sidebar";
import { cerrarSesion } from "@/app/(app)/logout-actions";

export function Topbar({
  title,
  role = DEFAULT_ROLE,
  soy = null,
  avisos = 0,
}: {
  title?: string;
  role?: ViewRole;
  soy?: Soy | null;
  avisos?: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground shadow-sm md:px-6">
      <MobileNav role={role} />
      {/* La marca vive UNA sola vez, en el sidebar. Aquí el topbar lleva el
          contexto: el título de la página, o el saludo personalizado
          "Hola, {nombre}" (de su sesión) — nunca el logo repetido. */}
      {title ? (
        <h1 className="truncate text-base font-semibold text-white font-[family-name:var(--font-poppins)]">
          {title}
        </h1>
      ) : soy ? (
        <span className="truncate text-lg font-bold text-white">Hola, {soy.name}</span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {/* El buscador sólo para el equipo interno; el cliente no busca en la app. */}
        {role !== "client" && <SearchBox />}
        <NotificationsBell initialCount={avisos} />
        {/* Menú de CUENTA (arriba a la derecha): el avatar abre "Mi perfil" — las
            acciones de cuenta viven aquí, no en la nav lateral (Pedro). El avatar
            refleja QUIÉN eres (soy); sin identidad, un ícono neutro (nada de "PV" fijo). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menú de cuenta"
              className="rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8">
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{
                    background: soy ? "var(--primary)" : "var(--secondary)",
                    color: soy ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {soy ? inicialesDe(soy.name) : <User className="size-4" aria-hidden />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">{soy ? soy.name : "Sin identidad"}</DropdownMenuLabel>
            {canSee(role, "mi-perfil") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/mi-perfil" className="cursor-pointer">
                    <UserRound className="size-4" /> Mi perfil
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            {/* Logout es real ahora que hay sesión. El form dispara el server action
                que hace signOut() + redirect a /login. */}
            <form action={cerrarSesion}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full cursor-pointer">
                  <LogOut className="size-4" /> Cerrar sesión
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Iniciales de un nombre: primeras letras de hasta 2 palabras. */
function inicialesDe(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
