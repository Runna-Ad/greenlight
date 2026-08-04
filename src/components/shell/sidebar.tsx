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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Cross-client items live at the root; client-scoped items take the active slug.
function navFor(slug: string | null): { section: string; items: NavItem[] }[] {
  const clientBase = slug ? `/${slug}` : null;
  return [
    {
      section: "General",
      items: [
        { href: "/clientes", label: "Clientes", icon: Users },
        { href: "/mi-trabajo", label: "Mi trabajo", icon: LayoutGrid },
        { href: "/carga", label: "Carga", icon: GaugeCircle },
        { href: "/entrega-check", label: "Entregas por revisar", icon: CheckCheck },
      ],
    },
    ...(clientBase
      ? [
          {
            section: slug!.toUpperCase(),
            items: [
              { href: `${clientBase}/tablero`, label: "Tablero", icon: LayoutGrid },
              { href: `${clientBase}/briefs`, label: "Briefs", icon: FileText },
              { href: `${clientBase}/sync`, label: "Sincronizar", icon: RefreshCw },
              { href: `${clientBase}/entregas`, label: "Entregas", icon: CalendarClock },
            ] as NavItem[],
          },
        ]
      : []),
    {
      section: "Admin",
      items: [{ href: "/admin", label: "Configuración", icon: Settings }],
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

export function Sidebar() {
  const pathname = usePathname();
  const first = pathname.split("/")[1] ?? "";
  const activeClient = first && !RESERVED.has(first) ? first : null;
  const groups = navFor(activeClient);

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
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
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
