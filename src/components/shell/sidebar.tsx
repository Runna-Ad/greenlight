"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  FileText,
  CalendarClock,
  GaugeCircle,
  CheckCheck,
  Settings,
  RefreshCw,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canSee, DEFAULT_ROLE, type NavKey, type ViewRole } from "@/lib/roles";
import { Wordmark } from "./wordmark";

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
function navFor(slug: string | null): { section: string; items: NavItem[] }[] {
  const clientBase = slug ? `/${slug}` : null;
  return [
    {
      section: "General",
      items: [
        { key: "clientes", href: "/clientes", label: "Clientes", icon: Users },
        { key: "mi-trabajo", href: "/mi-trabajo", label: "Mi trabajo", icon: LayoutGrid },
        { key: "carga", href: "/carga", label: "Carga", icon: GaugeCircle, soon: true },
        {
          key: "entrega-check",
          href: "/entrega-check",
          label: "Entregas por revisar",
          icon: CheckCheck,
          soon: true,
        },
      ],
    },
    ...(clientBase
      ? [
          {
            section: slug!.toUpperCase(),
            items: [
              { key: "tablero", href: `${clientBase}/tablero`, label: "Tablero", icon: LayoutGrid },
              { key: "briefs", href: `${clientBase}/briefs`, label: "Briefs", icon: FileText },
              { key: "sync", href: `${clientBase}/sync`, label: "Sincronizar", icon: RefreshCw },
              {
                key: "entregas",
                href: `${clientBase}/entregas`,
                label: "Entregas",
                icon: CalendarClock,
                soon: true,
              },
              { key: "portal", href: `${clientBase}/portal`, label: "Portal", icon: Eye },
            ] as NavItem[],
          },
        ]
      : []),
    {
      section: "Admin",
      items: [
        { key: "admin", href: "/admin", label: "Configuración", icon: Settings, soon: true },
      ],
    },
  ];
}

// Root-level sections that are NOT client slugs.
const RESERVED = new Set([
  "clientes",
  "mi-trabajo",
  "carga",
  "entrega-check",
  "admin",
  "login",
]);

export function Sidebar({ role = DEFAULT_ROLE }: { role?: ViewRole }) {
  const pathname = usePathname();
  const first = pathname.split("/")[1] ?? "";
  const activeClient = first && !RESERVED.has(first) ? first : null;

  // Filtrado por rol: en una vista previa el menú debe ENCOGER, que es
  // justamente lo que no se podía comprobar antes.
  const groups = navFor(activeClient)
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, i.key)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 flex-col justify-center gap-1 px-5 border-b border-sidebar-border">
        <Wordmark on="dark" className="text-[17px]" />
        <span className="flex items-center gap-1.5 pl-[15px] text-[10px] text-sidebar-foreground/45">
          by
          <Image
            src="/brand/logo-h-white.png"
            alt="Rünna"
            width={104}
            height={26}
            className="h-[15px] w-auto opacity-90"
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
        {groups.map((group) => (
          <div key={group.section} className="mb-5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
              {group.section}
            </p>
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
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4 text-[11px] text-sidebar-foreground/40">
        Producción de anuncios
      </div>
    </aside>
  );
}
