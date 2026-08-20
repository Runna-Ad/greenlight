"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  FileText,
  PackageCheck,
  GaugeCircle,
  Settings,
  RefreshCw,
  Eye,
  Menu,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canSee, DEFAULT_ROLE, type NavKey, type ViewRole } from "@/lib/roles";
import { Wordmark } from "./wordmark";
import { SoySwitch, type PoolMember } from "./soy-switch";
import { ViewAsSwitch } from "./view-as-switch";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Soy } from "@/lib/soy";

// `soon` = la pantalla está en el roadmap pero la ruta todavía no existe.
// Se pinta apagada y SIN <Link>, porque un Link a una ruta inexistente lo
// prefetchea Next y devuelve 404 en producción aunque nadie lo haya clicado.
type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
};

// Cross-client items live at the root; client-scoped items take the active slug.
// La sección del partner (DIDI…) es COLAPSABLE: se conserva en las páginas
// generales (colapsada) en vez de desaparecer.
function navFor(
  slug: string | null,
): { section: string; items: NavItem[]; collapsible?: boolean }[] {
  const clientBase = slug ? `/${slug}` : null;
  return [
    {
      section: "General",
      items: [
        { key: "clientes", href: "/clientes", label: "Clientes", icon: Users },
        { key: "mi-trabajo", href: "/mi-trabajo", label: "Mi trabajo", icon: LayoutGrid },
        { key: "performance", href: "/performance", label: "Performance", icon: GaugeCircle },
        { key: "entregas", href: "/entregas", label: "Entregas", icon: PackageCheck },
        // "Mi perfil" ya NO vive en la nav lateral (secciones de trabajo): las acciones
        // de CUENTA van en el menú del avatar (arriba a la derecha) — ver Topbar. (Pedro)
      ],
    },
    ...(clientBase
      ? [
          {
            section: slug!.toUpperCase(),
            collapsible: true,
            items: [
              { key: "tablero", href: `${clientBase}/tablero`, label: "Tablero", icon: LayoutGrid },
              { key: "briefs", href: `${clientBase}/briefs`, label: "Briefs", icon: FileText },
              { key: "sync", href: `${clientBase}/sync`, label: "Sincronizar", icon: RefreshCw },
              { key: "portal", href: `${clientBase}/portal`, label: "Portal", icon: Eye },
            ] as NavItem[],
          },
        ]
      : []),
    {
      section: "Admin",
      items: [
        { key: "admin", href: "/admin", label: "Configuración", icon: Settings },
      ],
    },
  ];
}

// Rutas top-level que NO son slugs de cliente. DEBE listar TODA ruta general de
// primer nivel (ver src/app/(app)/*): si falta una, el sidebar la toma como
// cliente y arma una sección fantasma (/<ruta>/tablero → vacío). Al agregar una
// página general nueva, agrégala AQUÍ.
const RESERVED = new Set([
  "clientes",
  "mi-trabajo",
  "performance",
  "workload",
  "entregas",
  "admin",
  "mi-perfil",
  "login",
]);

/**
 * El contenido del menú, reutilizable por el rail de escritorio (<aside>) y por
 * el Sheet móvil. `onNavigate` cierra el Sheet al tocar un link.
 */
function SidebarNav({
  role = DEFAULT_ROLE,
  soy = null,
  pool = [],
  onNavigate,
}: {
  role?: ViewRole;
  soy?: Soy | null;
  pool?: PoolMember[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const first = pathname.split("/")[1] ?? "";
  const activeClient = first && !RESERVED.has(first) ? first : null;

  // Recuerda el último partner para que su sección NO desaparezca en las páginas
  // generales — se muestra colapsada. Vive en estado (no efecto ni localStorage):
  // el layout del App Router no se desmonta entre navegaciones, así que persiste
  // durante la sesión. Se ajusta EN RENDER (patrón recomendado por React).
  const [lastClient, setLastClient] = useState<string | null>(activeClient);
  if (activeClient && activeClient !== lastClient) setLastClient(activeClient);
  const clienteMostrado = activeClient ?? lastClient;

  // La sección del partner arranca DESPLEGADA en sus páginas y COLAPSADA en las
  // generales; se puede abrir/cerrar a mano (click en el nombre). El default se
  // recalcula en render cuando entras/sales del partner.
  const [prevActive, setPrevActive] = useState(activeClient);
  const [colapsada, setColapsada] = useState(!activeClient);
  if (activeClient !== prevActive) {
    setPrevActive(activeClient);
    setColapsada(!activeClient);
  }

  // Filtrado por rol: en una vista previa el menú debe ENCOGER, que es
  // justamente lo que no se podía comprobar antes.
  const groups = navFor(clienteMostrado)
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, i.key)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="flex h-16 flex-col justify-center gap-1 px-5 border-b border-sidebar-border">
        <Wordmark on="dark" className="text-[22px]" />
        <span className="flex items-center gap-1.5 pl-[15px] text-[10px] text-sidebar-foreground/45">
          by
          <Image
            src="/brand/logo-h-white.png"
            alt="Rünna"
            width={104}
            height={26}
            className="h-[16px] w-auto opacity-90"
            priority
          />
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.length === 0 && (
          <p className="px-3 text-xs text-sidebar-foreground/50">
            Este rol no entra a la app interna.
          </p>
        )}
        {groups.map((group) => {
          const cerrada = group.collapsible && colapsada;
          return (
          <div key={group.section} className="mb-5">
            {group.collapsible ? (
              // El nombre del partner es un botón: colapsa/despliega sus páginas.
              <button
                type="button"
                onClick={() => setColapsada((v) => !v)}
                aria-expanded={!cerrada}
                className="flex w-full items-center gap-1 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground/75"
              >
                <ChevronDown className={cn("size-3 shrink-0 transition-transform", cerrada && "-rotate-90")} />
                {group.section}
              </button>
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
                {group.section}
              </p>
            )}
            {!cerrada && (
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const row = "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm";

                // Pendiente de construir: se enseña, no se navega.
                if (item.soon) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        title="Todavía no está construida"
                        className={cn(row, "cursor-default text-sidebar-foreground/35")}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                        <span className="ml-auto rounded-sm bg-sidebar-accent/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em]">
                          Pronto
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        row,
                        "transition-colors",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
          );
        })}
      </nav>

      {/* Sesión: quién eres (honor-system) + ver la app como otro rol. Antes
          vivían arriba a la derecha en el topbar; Pedro los movió aquí, bajo el
          menú (debajo de Admin / Configuración). */}
      <div className="mt-auto space-y-1.5 border-t border-sidebar-border px-3 py-3">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
          Sesión
        </p>
        <SoySwitch soy={soy} pool={pool} />
        <ViewAsSwitch role={role} />
      </div>

      <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/40">
        Producción de anuncios
      </div>
    </>
  );
}

/** Rail de escritorio (≥ md). Debajo de md el menú vive en <MobileNav>. */
export function Sidebar({
  role = DEFAULT_ROLE,
  soy = null,
  pool = [],
}: {
  role?: ViewRole;
  soy?: Soy | null;
  pool?: PoolMember[];
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col self-start bg-sidebar text-sidebar-foreground md:flex md:w-60">
      <SidebarNav role={role} soy={soy} pool={pool} />
    </aside>
  );
}

/**
 * Menú móvil (< md): un botón de hamburguesa que abre el mismo menú en un Sheet
 * lateral. Se cierra al navegar. Vive en la Topbar (que ya recibe el rol).
 */
export function MobileNav({
  role = DEFAULT_ROLE,
  soy = null,
  pool = [],
}: {
  role?: ViewRole;
  soy?: Soy | null;
  pool?: PoolMember[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-64 flex-col bg-sidebar p-0 text-sidebar-foreground [&>button]:top-5 [&>button]:text-sidebar-foreground/70"
      >
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        <SidebarNav role={role} soy={soy} pool={pool} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
