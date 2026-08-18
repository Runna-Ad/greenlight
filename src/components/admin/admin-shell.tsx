"use client";

import { useState } from "react";
import {
  UserRound,
  Users,
  Activity,
  Plug,
  BookText,
  Images,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EquipoTab } from "./equipo-tab";
import { PerfilTab } from "./perfil-tab";
import { ActividadTab } from "./actividad-tab";
import { IntegracionesTab } from "./integraciones-tab";
import { BibliotecaTab } from "./biblioteca-tab";
import { MarcasTab } from "./marcas-tab";
import type { MiembroRow } from "@/lib/equipo";
import type {
  ActividadRow,
  ClienteConMarcas,
  IntegracionesEstado,
  MarcaOpt,
  SnippetRow,
} from "@/lib/admin-tipos";

type Soy = {
  id: string;
  name: string;
  color: string;
  track: string;
  notify_email: boolean;
  notify_slack: boolean;
} | null;

type TabKey = "perfil" | "equipo" | "marcas" | "actividad" | "integraciones" | "biblioteca";
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "perfil", label: "Mi perfil", icon: UserRound },
  { key: "equipo", label: "Equipo", icon: Users },
  { key: "marcas", label: "Marcas", icon: Images },
  { key: "actividad", label: "Actividad", icon: Activity },
  { key: "integraciones", label: "Integraciones", icon: Plug },
  { key: "biblioteca", label: "Biblioteca", icon: BookText },
];

export function AdminShell({
  equipoInicial,
  soy,
  marcas,
  actividad,
  integraciones,
  biblioteca,
}: {
  equipoInicial: MiembroRow[];
  soy: Soy;
  marcas: ClienteConMarcas[];
  actividad: ActividadRow[];
  integraciones: IntegracionesEstado;
  biblioteca: { snippets: SnippetRow[]; marcas: MarcaOpt[] };
}) {
  const [tab, setTab] = useState<TabKey>("equipo");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        Configuración
      </div>
      <h1 className="mb-5 text-2xl font-semibold text-foreground">Administración</h1>

      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        {/* Sub-nav lateral */}
        <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Panel */}
        <div className="min-w-0">
          {tab === "perfil" && <PerfilTab soy={soy} />}
          {tab === "equipo" && <EquipoTab inicial={equipoInicial} />}
          {tab === "marcas" && <MarcasTab clientes={marcas} />}
          {tab === "actividad" && <ActividadTab rows={actividad} />}
          {tab === "integraciones" && <IntegracionesTab estado={integraciones} />}
          {tab === "biblioteca" && <BibliotecaTab snippets={biblioteca.snippets} marcas={biblioteca.marcas} />}
        </div>
      </div>
    </div>
  );
}
