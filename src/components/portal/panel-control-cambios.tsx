"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight, Trash2, SlidersHorizontal } from "lucide-react";
import { useCorrecciones } from "@/components/tarea/correcciones/contexto";
import { keyCampo, porRonda, type Correccion } from "@/lib/correcciones";
import { cn } from "@/lib/utils";

// Semáforo del flujo de cambios (Pedro): SOLICITADO=rojo (sin enviar) → HECHO/APLICADO=
// amarillo (el equipo lo hizo) → APROBADO=verde (a nivel tarea). Mismo lenguaje que el
// panel interno (open=coral, done=amber, closed=green).
const CORAL = "color-mix(in srgb, var(--status-corrections) 78%, #000)";
const AMARILLO = "color-mix(in srgb, var(--status-progress) 80%, #000)";

// Salta al campo del cambio y lo hace parpadear (mismo data-campo-key + gl-flash que el
// panel interno) — así "Ver" lleva al cliente justo a donde está el cambio.
function verCampo(c: Correccion) {
  const k = keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo);
  const el = document.querySelector<HTMLElement>(`[data-campo-key="${k}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("gl-flash");
  void el.offsetWidth;
  el.classList.add("gl-flash");
  // Además del scroll+flash, RELOCALIZA el foco (teclado/lector de pantalla) al campo:
  // si el ancla no es enfocable de origen, la hacemos enfocable con tabindex="-1"
  // (fuera del orden de tabulación) antes de enfocarla. preventScroll evita pisar el
  // scroll suave de arriba.
  if (el.tabIndex < 0) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * "Control de Cambios" del portal — el MISMO formato que la columna derecha interna,
 * adaptado al cliente: sin H.Ü.E, sin confirmar/atender. Muestra TODOS los cambios del
 * cliente: los que aún NO ha enviado (con "Quitar") y los que el equipo YA aplicó
 * (read-only "Aplicado"), agrupados; "Ver" salta al campo. `mobile` lo vuelve colapsable
 * (arriba del contenido en móvil); en desktop va como panel fijo a la derecha.
 */
export function PanelControlCambios({ mobile = false }: { mobile?: boolean }) {
  const ctx = useCorrecciones();
  const [colMovil, setColMovil] = useState(true); // en móvil arranca colapsado
  const [colapsadas, setColapsadas] = useState<Set<number>>(new Set());

  const drafts = ctx?.correcciones ?? []; // sin enviar
  const aplicados = ctx?.revisiones ?? []; // ya aplicados
  const total = drafts.length + aplicados.length;
  if (!ctx || !total) return null;

  const grupos = porRonda(aplicados);
  const rondaActual = grupos[0]?.ronda;

  const cuerpo = (
    <div>
      {/* Grupo: cambios SIN ENVIAR (borradores del cliente) — con Quitar. */}
      {drafts.length > 0 && (
        <div className="border-b border-border last:border-b-0">
          <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Sin enviar
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-white" style={{ background: CORAL }}>
              {drafts.length}
            </span>
          </div>
          <div className="grid gap-2 px-2.5 pb-2.5">
            {drafts.map((c) => (
              <Tarjeta key={c.id} c={c} tono={CORAL} etiqueta="Sin enviar" onQuitar={() => ctx.descartar(c.id)} pendiente={ctx.pendiente} />
            ))}
          </div>
        </div>
      )}

      {/* Grupos: rondas ya aplicadas — read-only. */}
      {grupos.map(({ ronda, items }) => {
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
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-muted-foreground">
                {items.length}
              </span>
            </button>
            {visible && (
              <div className="grid gap-2 px-2.5 pb-2.5">
                {items.map((c) => (
                  <Tarjeta key={c.id} c={c} tono={AMARILLO} etiqueta="Aplicado" />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <aside className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-3.5">
        {mobile ? (
          <button
            type="button"
            onClick={() => setColMovil((v) => !v)}
            aria-expanded={!colMovil}
            className="flex w-full items-center gap-2 text-sm font-semibold"
          >
            <SlidersHorizontal className="size-4 text-primary" />
            Control de Cambios
            <span className="rounded-full bg-secondary px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{total}</span>
            <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", colMovil && "-rotate-90")} />
          </button>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="size-4 text-primary" />
              Control de Cambios
            </h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Lo que pediste y su estado. Quita los que aún no envíes; los aplicados por el equipo quedan
              para que los revises.
            </p>
          </>
        )}
      </div>
      {(!mobile || !colMovil) && cuerpo}
    </aside>
  );
}

function Tarjeta({
  c,
  tono,
  etiqueta,
  onQuitar,
  pendiente,
}: {
  c: Correccion;
  tono: string;
  etiqueta: string;
  onQuitar?: () => void;
  pendiente?: boolean;
}) {
  return (
    <div
      // Tarjeta clicable: también por TECLADO (Enter/Espacio) — antes sólo con ratón.
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      onClick={() => verCampo(c)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // los botones de dentro manejan lo suyo
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); verCampo(c); }
      }}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {c.targetLabel && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
            {c.targetLabel}
          </span>
        )}
        <span
          className="ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ background: tono }}
        >
          {etiqueta === "Aplicado" && <Check className="size-2.5" />}
          {etiqueta}
        </span>
      </div>
      {c.targetQuote && (
        <p className="mb-0.5 flex flex-wrap items-center gap-1 text-[11px] italic text-muted-foreground">
          <span>&laquo;{c.targetQuote}&raquo;</span>
          <ArrowRight className="size-3 not-italic" />
        </p>
      )}
      <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>

      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => verCampo(c)}
          className="inline-flex items-center rounded-md border border-border bg-card min-h-11 px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Ver campo
        </button>
        {onQuitar && (
          <button
            type="button"
            disabled={pendiente}
            onClick={onQuitar}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card min-h-11 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--status-corrections)_45%,transparent)] hover:text-status-corrections disabled:opacity-50"
          >
            <Trash2 className="size-3" /> Quitar
          </button>
        )}
      </div>
    </div>
  );
}
