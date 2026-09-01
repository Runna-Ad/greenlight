"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  UserRound,
  Users,
  Activity,
  Plug,
  BookText,
  Images,
  Inbox,
  UserCheck,
  Brain,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  InvitacionRow,
  ClienteOpt,
  ClienteUsuarioRow,
} from "@/app/(app)/admin/clientes-actions";
import type { MiembroRow } from "@/lib/equipo";
import type {
  ActividadRow,
  ClienteConMarcas,
  IntegracionesEstado,
  MarcaOpt,
  SnippetRow,
} from "@/lib/admin-tipos";

// Cada pestaña carga su código sólo cuando se selecciona — antes las 8 (incl. el
// HUB y Equipo, los más pesados) se importaban eager aunque sólo una se muestra
// a la vez (reap perf). ssr:false: son tabs de cliente, nunca se ven en el HTML
// inicial (arranca en "equipo", pero ese tab tampoco necesita SSR aquí).
const HueHubTab = dynamic(() => import("./hue-hub/hue-hub-tab").then((m) => m.HueHubTab), { ssr: false });
const EquipoTab = dynamic(() => import("./equipo-tab").then((m) => m.EquipoTab), { ssr: false });
const PerfilTab = dynamic(() => import("./perfil-tab").then((m) => m.PerfilTab), { ssr: false });
const ActividadTab = dynamic(() => import("./actividad-tab").then((m) => m.ActividadTab), { ssr: false });
const IntegracionesTab = dynamic(
  () => import("./integraciones-tab").then((m) => m.IntegracionesTab),
  { ssr: false },
);
const BibliotecaTab = dynamic(() => import("./biblioteca-tab").then((m) => m.BibliotecaTab), { ssr: false });
const MarcasTab = dynamic(() => import("./marcas-tab").then((m) => m.MarcasTab), { ssr: false });
const InvitacionesTab = dynamic(
  () => import("./invitaciones-tab").then((m) => m.InvitacionesTab),
  { ssr: false },
);
const ClientesTab = dynamic(() => import("./clientes-tab").then((m) => m.ClientesTab), { ssr: false });
const PapeleraTab = dynamic(() => import("./papelera-tab").then((m) => m.PapeleraTab), { ssr: false });

type Soy = {
  id: string;
  name: string;
  color: string;
  track: string | null;
  notify_email: boolean;
  notify_slack: boolean;
} | null;

type TabKey =
  | "perfil" | "equipo" | "invitaciones" | "clientes"
  | "marcas" | "actividad" | "integraciones" | "biblioteca" | "hue" | "papelera";
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "perfil", label: "Mi perfil", icon: UserRound },
  { key: "equipo", label: "Equipo", icon: Users },
  { key: "invitaciones", label: "Invitaciones", icon: Inbox },
  { key: "clientes", label: "Clientes", icon: UserCheck },
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
  invitaciones,
  clientesUsuarios,
  esMaster,
}: {
  equipoInicial: MiembroRow[];
  soy: Soy;
  marcas: ClienteConMarcas[];
  actividad: ActividadRow[];
  integraciones: IntegracionesEstado;
  biblioteca: { snippets: SnippetRow[]; marcas: MarcaOpt[] };
  invitaciones: { pendientes: InvitacionRow[]; clientes: ClienteOpt[] };
  clientesUsuarios: ClienteUsuarioRow[];
  /** El H.Ü.E HUB es master-only; sólo entonces se muestra su pestaña. */
  esMaster: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("equipo");
  // El HUB sólo aparece para el master (además el gate real está en cada action = canHue).
  // Papelera: sólo Master Builder, igual que el HUB — restaurar/vaciar es suyo
  // (borrar sí lo puede hacer un admin). El gate REAL vive en papelera-actions
  // (`noMaster`); esto sólo evita ofrecer una pestaña que no podría usar.
  const tabs: typeof TABS = esMaster
    ? [
        ...TABS,
        { key: "hue", label: "H.Ü.E HUB", icon: Brain },
        { key: "papelera", label: "Papelera", icon: Trash2 },
      ]
    : TABS;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        Configuración
      </div>
      <h1 className="mb-5 text-2xl font-semibold text-foreground">Administración</h1>

      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        {/* Sub-nav lateral */}
        <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {tabs.map((t) => {
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
          {tab === "invitaciones" && (
            <InvitacionesTab pendientes={invitaciones.pendientes} clientes={invitaciones.clientes} />
          )}
          {tab === "clientes" && <ClientesTab usuarios={clientesUsuarios} />}
          {tab === "marcas" && <MarcasTab clientes={marcas} />}
          {tab === "actividad" && <ActividadTab rows={actividad} />}
          {tab === "integraciones" && <IntegracionesTab estado={integraciones} />}
          {tab === "biblioteca" && <BibliotecaTab snippets={biblioteca.snippets} marcas={biblioteca.marcas} />}
          {tab === "hue" && esMaster && <HueHubTab />}
          {tab === "papelera" && esMaster && <PapeleraTab />}
        </div>
      </div>
    </div>
  );
}
