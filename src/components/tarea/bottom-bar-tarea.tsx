"use client";

import { useMemo } from "react";
import { Timer, Eye, Puzzle } from "lucide-react";

import { cn } from "@/lib/utils";
import { readTimeS, type Plantilla } from "@/lib/plantilla";
import { useWorkspace } from "./workspace-provider";

/**
 * La barra inferior (fila B del mockup) = el MENÚ de la sección del guión.
 * Izquierda: el read-time total ("N s de lectura total"). Derecha: el toggle
 * "Vista cliente / Vista editor" (page-level: pasa TODO el workspace a lectura).
 * Sólo el guión tiene read-time (diálogo por plano); estático y copies no.
 */
export function BottomBarTarea({ plantilla }: { plantilla: Plantilla }) {
  const { verCliente, setVerCliente, planos } = useWorkspace();
  const totalS = useMemo(
    () => planos.reduce((n, p) => n + readTimeS(p.dialogo), 0),
    [planos],
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Timer className="size-4 text-status-progress" />
        <b className="font-semibold text-foreground">{plantilla === "guion" ? `${totalS} s` : "—"}</b>{" "}
        de lectura total
      </span>

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[12px] font-medium shadow-sm">
        <button
          type="button"
          onClick={() => setVerCliente(true)}
          aria-pressed={verCliente}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
            verCliente
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="size-3.5" /> Vista cliente
        </button>
        <button
          type="button"
          onClick={() => setVerCliente(false)}
          aria-pressed={!verCliente}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
            !verCliente
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Puzzle className="size-3.5" /> Vista editor
        </button>
      </div>
    </div>
  );
}
