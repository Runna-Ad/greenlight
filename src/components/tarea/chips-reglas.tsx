"use client";

import { Info, AlertTriangle, Ban } from "lucide-react";
import { agruparPorPlataforma, type Regla } from "@/lib/reglas";
import { PLATAFORMA_LABEL } from "@/lib/vocab";

const ICONO = { info: Info, aviso: AlertTriangle, bloqueo: Ban } as const;

/**
 * Las reglas que aplican, AGRUPADAS POR PLATAFORMA.
 *
 * Una tarea puede llevar varias plataformas y sus reglas contradecirse: las 5
 * tareas de Images son FB+GG+TT, y el estático de GG NO lleva CTA mientras el
 * de FB SÍ. Agrupar es la única forma honesta de enseñarlo — elegir una regla
 * por la tarea sería decidir por el creativo.
 */
export function ChipsReglas({
  reglas,
  plataformas,
}: {
  reglas: Regla[];
  plataformas: string[];
}) {
  if (!reglas.length) return null;
  const grupos = agruparPorPlataforma(reglas, plataformas);

  return (
    <div className="space-y-1.5">
      {grupos.map((g) => (
        <div key={g.plataforma ?? "general"} className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.plataforma
              ? (PLATAFORMA_LABEL[g.plataforma as keyof typeof PLATAFORMA_LABEL] ?? g.plataforma)
              : "Siempre"}
          </span>
          {g.reglas.map((r) => {
            const Icono = ICONO[r.severidad] ?? Info;
            const tono =
              r.severidad === "bloqueo"
                ? "border-status-corrections text-status-corrections bg-[color-mix(in_srgb,var(--status-corrections)_10%,transparent)]"
                : r.severidad === "aviso"
                  ? "border-amber-500/50 text-amber-800 bg-amber-500/10"
                  : "border-border text-muted-foreground bg-secondary/60";
            return (
              <span
                key={r.codigo}
                title={r.mensaje}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tono}`}
              >
                <Icono className="size-2.5 shrink-0" />
                {r.titulo}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
