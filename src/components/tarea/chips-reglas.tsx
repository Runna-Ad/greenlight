"use client";

import { Info, AlertTriangle, Ban } from "lucide-react";
import { agruparPorPlataforma, type Regla } from "@/lib/reglas";
import { PLATAFORMA_LABEL } from "@/lib/vocab";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICONO = { info: Info, aviso: AlertTriangle, bloqueo: Ban } as const;

/**
 * Las reglas que aplican, AGRUPADAS POR PLATAFORMA.
 *
 * Una tarea puede llevar varias plataformas y sus reglas contradecirse: las 5
 * tareas de Images son FB+GG+TT, y el estático de GG NO lleva CTA mientras el
 * de FB SÍ. Agrupar es la única forma honesta de enseñarlo — elegir una regla
 * por la tarea sería decidir por el creativo.
 *
 * El chip muestra el título corto; al pasar el mouse, un tooltip abre el
 * mensaje completo (que es mucho más claro: "de 30s en adelante, 5 beneficios…").
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
    <TooltipProvider delayDuration={150}>
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
                    ? "border-status-warning/50 text-status-warning bg-status-warning/10"
                    : "border-border text-muted-foreground bg-secondary/60";
              return (
                <Tooltip key={r.codigo}>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tono}`}
                    >
                      <Icono className="size-2.5 shrink-0" />
                      {r.titulo}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-[11px] leading-snug">
                    <span className="mb-0.5 block font-semibold">{r.titulo}</span>
                    {r.mensaje}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
