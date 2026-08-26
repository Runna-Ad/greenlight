"use client";

import { useState } from "react";
import { Lightbulb, Puzzle, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Plantilla } from "@/lib/plantilla";
import { DetallesTab } from "./detalles-tab";
import { RunnaToolsTab, type Persona } from "./runna-tools-tab";
import { useWorkspaceView } from "./workspace-provider";

type DetallesProps = {
  tipoAsset: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string[];
  concepto: string | null;
  trend: string | null;
};

type PoolPersona = { id: string; name: string; color: string };
type RunnaProps = {
  personas: Persona[];
  entregaUrl: string | null;
  filenames: string[];
  comentariosCreativo: string | null;
  peloteo: string | null;
  sellingPoints: string | null;
  puedeEditar: boolean;
  /** Puede cambiar la asignación (lead/admin/master). */
  puedeAsignar: boolean;
  /** Pool vivo por rol+track para el editor de asignación. */
  leadsPool: PoolPersona[];
  especialistasPool: PoolPersona[];
};

/**
 * El bloque de pestañas del mockup: "Detalles asset" / "Rünna tools".
 * "Rünna tools" sólo existe para el equipo (`runna` presente) y se oculta en
 * "Vista cliente"; el cliente sólo ve "Detalles asset". El servidor decide si
 * `runna` llega (no se manda al rol cliente) — aquí sólo se oculta la pestaña.
 */
export function TabsTarea({
  ideaId,
  plantilla,
  soloLectura,
  detalles,
  runna,
}: {
  ideaId: string;
  plantilla: Plantilla;
  soloLectura: boolean;
  detalles: DetallesProps;
  runna?: RunnaProps;
}) {
  const { verCliente } = useWorkspaceView();
  const [tab, setTab] = useState<"detalles" | "runna">("detalles");
  // Rünna tools sigue ACCESIBLE en Vista cliente (el equipo puede entrar), sólo se
  // atenúa + marca "no lo ve el cliente" — antes desaparecía por completo (Pedro).
  const mostrarRunna = !!runna;
  const activa = tab === "runna" && mostrarRunna ? "runna" : "detalles";

  return (
    <div>
      <div className="mb-3 inline-flex gap-2">
        <TabBtn activa={activa === "detalles"} onClick={() => setTab("detalles")} icon={Lightbulb}>
          Detalles asset
        </TabBtn>
        {mostrarRunna && (
          <TabBtn
            activa={activa === "runna"}
            onClick={() => setTab("runna")}
            icon={verCliente ? EyeOff : Puzzle}
            atenuado={verCliente}
            title={verCliente ? "Interno — el cliente no ve esta pestaña" : undefined}
          >
            Rünna tools{verCliente && " · interno"}
          </TabBtn>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        {activa === "runna" && runna ? (
          <RunnaToolsTab
            ideaId={ideaId}
            personas={runna.personas}
            entregaUrl={runna.entregaUrl}
            filenames={runna.filenames}
            comentariosCreativo={runna.comentariosCreativo}
            peloteo={runna.peloteo}
            sellingPoints={runna.sellingPoints}
            puedeEditar={runna.puedeEditar}
            puedeAsignar={runna.puedeAsignar}
            leadsPool={runna.leadsPool}
            especialistasPool={runna.especialistasPool}
            soloLectura={soloLectura}
          />
        ) : (
          <DetallesTab
            ideaId={ideaId}
            tipoAsset={detalles.tipoAsset}
            plataformas={detalles.plataformas}
            tamanos={detalles.tamanos}
            duracion={detalles.duracion}
            concepto={detalles.concepto}
            trend={detalles.trend}
            plantilla={plantilla}
            soloLectura={soloLectura}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  activa,
  onClick,
  icon: Icon,
  children,
  atenuado,
  title,
}: {
  activa: boolean;
  onClick: () => void;
  icon: typeof Lightbulb;
  children: React.ReactNode;
  /** Atenúa la pestaña (Rünna tools en Vista cliente): sigue clickable, sólo marcada. */
  atenuado?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
        activa
          ? "border border-primary/30 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary"
          : "bg-secondary text-muted-foreground hover:text-foreground",
        atenuado && "opacity-55",
      )}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}
