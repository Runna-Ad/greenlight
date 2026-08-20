"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight } from "lucide-react";
import { useCorrecciones } from "@/components/tarea/correcciones/contexto";
import { keyCampo, porRonda, type Correccion } from "@/lib/correcciones";
import { cn } from "@/lib/utils";

// Salta al campo del cambio y lo hace parpadear (mismo data-campo-key + gl-flash que
// usa el panel interno) — así "Ver" lleva al cliente justo a donde se aplicó.
function verCampo(c: Correccion) {
  const k = keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo);
  const el = document.querySelector<HTMLElement>(`[data-campo-key="${k}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("gl-flash");
  void el.offsetWidth;
  el.classList.add("gl-flash");
}

/**
 * El resumen READ-ONLY de "los cambios que pediste — ya aplicados", para el cliente
 * cuando la tarea vuelve a su cancha tras una ronda. Es el espejo del panel interno,
 * sin las acciones de equipo (atendido/confirmar/descartar/H.Ü.E): sólo lista qué
 * pidió el cliente, agrupado por ronda (la última abierta), con un "Ver" que salta al
 * campo. Así no queda adivinando dónde ni qué se cambió.
 */
export function PanelRevisionesCliente() {
  const ctx = useCorrecciones();
  const revisiones = ctx?.revisiones ?? [];
  const grupos = porRonda(revisiones);
  const [colapsadas, setColapsadas] = useState<Set<number>>(new Set());
  if (!revisiones.length) return null;

  const rondaActual = grupos[0]?.ronda;

  return (
    <aside className="rounded-xl border border-[color-mix(in_srgb,var(--status-completed)_40%,var(--border))] bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b border-border p-3.5">
        <span
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white"
          style={{ background: "color-mix(in srgb, var(--status-completed) 88%, #000)" }}
        >
          <Check className="size-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Cambios que pediste — ya aplicados
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            El equipo aplicó lo que pediste. Revísalo aquí y aprueba, o pide más ajustes.
          </p>
        </div>
      </div>

      <div>
        {grupos.map(({ ronda, items }) => {
          // La ronda actual (la más reciente) abierta; las pasadas colapsadas. El toggle
          // invierte ese default para esa ronda (XOR).
          const visible = (ronda === rondaActual) !== colapsadas.has(ronda);
          return (
            <div key={ronda} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  setColapsadas((prev) => {
                    const n = new Set(prev);
                    if (n.has(ronda)) n.delete(ronda);
                    else n.add(ronda);
                    return n;
                  })
                }
                className="flex w-full items-center gap-2 px-3.5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", visible ? "" : "-rotate-90")} />
                Ronda {ronda}
                <span className="ml-auto rounded-full bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-muted-foreground">
                  {items.length}
                </span>
              </button>

              {visible && (
                <div className="grid gap-2 px-2.5 pb-2.5">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className="cursor-pointer rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-[color-mix(in_srgb,var(--status-completed)_45%,transparent)]"
                      onClick={() => verCampo(c)}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {c.targetLabel && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                            {c.targetLabel}
                          </span>
                        )}
                        <span
                          className="ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: "color-mix(in srgb, var(--status-completed) 88%, #000)" }}
                        >
                          <Check className="size-2.5" /> Aplicado
                        </span>
                      </div>
                      {c.targetQuote && (
                        <p className="mb-0.5 flex flex-wrap items-center gap-1 text-[11px] italic text-muted-foreground">
                          <span>&laquo;{c.targetQuote}&raquo;</span>
                          <ArrowRight className="size-3 not-italic" />
                        </p>
                      )}
                      <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
