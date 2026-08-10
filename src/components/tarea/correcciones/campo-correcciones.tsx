"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { useCorrecciones } from "./contexto";
import { estadoCampo, type Correccion, type EstadoCorreccion } from "@/lib/correcciones";
import { cn } from "@/lib/utils";

// Fondo SÓLIDO (texto blanco encima) — un pelín más oscuro que el token para que
// el blanco pase AA. Y color de TEXTO sobre fondo claro. Mismos colores, más
// legibles (lección de contraste: los tonos medios fallan blanco Y oscuro).
const PIN_BG: Record<EstadoCorreccion, string> = {
  open: "color-mix(in srgb, var(--status-corrections) 78%, #000)",
  done: "color-mix(in srgb, var(--status-progress) 80%, #000)",
  closed: "color-mix(in srgb, var(--status-completed) 92%, #000)",
};
const ETIQUETA_ESTADO: Record<EstadoCorreccion, string> = {
  open: "Sin atender",
  done: "Atendido · por confirmar",
  closed: "Confirmado",
};

/**
 * La capa de correcciones que se dibuja SOBRE un campo: el pin (con su color de
 * estado), el tooltip de lectura (hover/tap/foco) y, para el revisor, la barra
 * flotante "Pedir cambio / Confirmar" con su compositor. Vive dentro del wrapper
 * `.group.relative` de <Campo>; si no hay contexto de correcciones, no pinta nada.
 */
export function CampoCorrecciones({
  tabla,
  filaId,
  campo,
  etiqueta,
  cs,
}: {
  tabla: "planos" | "estaticos" | "ideas" | "brief";
  filaId: string | null;
  campo: string;
  etiqueta: string;
  cs: Correccion[];
}) {
  const ctx = useCorrecciones();
  const [fijado, setFijado] = useState(false);
  const [componiendo, setComponiendo] = useState(false);
  const [texto, setTexto] = useState("");
  if (!ctx) return null;

  const estado = estadoCampo(cs);
  const hay = cs.length > 0;

  const fijar = () => {
    if (!texto.trim()) return;
    ctx.pedir({ tabla, filaId, campo, label: etiqueta }, texto.trim());
    setTexto("");
    setComponiendo(false);
  };

  return (
    <>
      {/* Pin anclado al campo */}
      {hay && estado && (
        <button
          type="button"
          onClick={() => setFijado((v) => !v)}
          aria-label={`${cs.length} corrección(es) en ${etiqueta}`}
          className="absolute -left-2.5 top-6 z-20 grid size-[22px] place-items-center rounded-full border-2 border-background text-[11px] font-extrabold text-white shadow-sm"
          style={{ background: PIN_BG[estado] }}
        >
          {estado === "open" ? cs.length : "✓"}
        </button>
      )}

      {/* Tooltip de lectura: hover / foco del campo, o fijado con clic en el pin */}
      {hay && (
        <div
          role="tooltip"
          className={cn(
            "pointer-events-none absolute right-0 top-8 z-30 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-lg transition-opacity",
            fijado ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          style={{ borderColor: "color-mix(in srgb, var(--status-corrections) 40%, var(--border))" }}
        >
          {cs.map((c) => (
            <div key={c.id} className="border-t border-border p-2.5 first:border-t-0">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: PIN_BG[c.estado] }}
                >
                  {ETIQUETA_ESTADO[c.estado]}
                </span>
              </div>
              <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>
              {c.autor && <p className="mt-1 text-[10px] text-muted-foreground">{c.autor}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Barra del revisor: aparece al pasar el mouse por el campo */}
      {ctx.esRevisor && (
        <div className="absolute right-0 top-0 z-20 hidden gap-1.5 group-hover:flex group-focus-within:flex">
          {hay && estado !== "closed" && (
            <button
              type="button"
              disabled={ctx.pendiente}
              onClick={() => ctx.confirmarCampo(tabla, filaId, campo)}
              className="inline-flex items-center gap-1 rounded-full border border-status-completed/45 bg-card px-2 py-0.5 text-[11px] font-bold text-status-completed shadow-sm transition-colors hover:bg-status-completed hover:text-white"
            >
              <Check className="size-3" /> Confirmar
            </button>
          )}
          <button
            type="button"
            onClick={() => setComponiendo((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-bold text-status-corrections shadow-sm transition-colors hover:bg-status-corrections hover:text-white"
            style={{ borderColor: "color-mix(in srgb, var(--status-corrections) 40%, transparent)" }}
          >
            <Plus className="size-3" /> Pedir cambio
          </button>
        </div>
      )}

      {/* Compositor anclado bajo el campo */}
      {componiendo && (
        <div className="relative z-30 mt-2 rounded-lg border border-border-strong bg-secondary p-2.5 shadow-sm">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Cambio para <b className="text-status-corrections">{etiqueta}</b>
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe el cambio que quieres para este campo…"
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={ctx.pendiente || !texto.trim()}
              onClick={fijar}
              style={{ background: PIN_BG.open }}
              className="rounded-md px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Fijar cambio
            </button>
            <button
              type="button"
              onClick={() => setComponiendo(false)}
              className="rounded-md border border-border px-3 py-1 text-[12px] font-medium hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
