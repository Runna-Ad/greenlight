"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { useCorrecciones } from "./contexto";
import { estadoCampo, PIN_BG, type Correccion } from "@/lib/correcciones";

/**
 * Los AFFORDANCES DEL REVISOR sobre un campo: la barra flotante "Confirmar /
 * Pedir cambio" (aparece al pasar el mouse) y su compositor de campo entero.
 *
 * El pin, el resaltado en vivo y la tarjeta de LECTURA viven ahora en <Campo>,
 * junto a la geometría de la frase — así la tarjeta se ancla a la selección y
 * cede el paso mientras editas. Aquí sólo quedan las acciones del revisor; si no
 * hay contexto o no eres revisor, no se pinta nada.
 */
export function CampoCorrecciones({
  tabla,
  filaId,
  campo,
  etiqueta,
  cs,
  campoVacio,
}: {
  tabla: "planos" | "estaticos" | "ideas" | "brief";
  filaId: string | null;
  campo: string;
  etiqueta: string;
  cs: Correccion[];
  /** El campo no tiene texto. Sólo entonces mostramos "Pedir cambio" de campo
   *  entero: con texto, anclar a la SELECCIÓN cubre lo mismo y el botón sobra. */
  campoVacio: boolean;
}) {
  const ctx = useCorrecciones();
  const [componiendo, setComponiendo] = useState(false);
  const [texto, setTexto] = useState("");
  if (!ctx || !ctx.esRevisor) return null;

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
      {/* Barra del revisor: aparece al pasar el mouse por el campo */}
      <div className="absolute right-0 top-0 z-20 hidden gap-1.5 group-hover:flex group-focus-within:flex">
        {hay && estado !== "closed" && (
          <button
            type="button"
            disabled={ctx.pendiente}
            onClick={() => ctx.confirmarCampo(tabla, filaId, campo)}
            className="inline-flex items-center gap-1 rounded-full border border-status-completed/45 bg-card px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--status-completed)_82%,#000)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--status-completed)_88%,#000)] hover:text-white"
          >
            <Check className="size-3" /> Confirmar
          </button>
        )}
        {/* Campo entero: sólo cuando está VACÍO (no hay texto que resaltar). Con
            texto, el revisor ancla a la selección ("Pedir cambio aquí"). */}
        {campoVacio && (
          <button
            type="button"
            onClick={() => setComponiendo((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--status-corrections)_72%,#000)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--status-corrections)_80%,#000)] hover:text-white"
            style={{ borderColor: "color-mix(in srgb, var(--status-corrections) 40%, transparent)" }}
          >
            <Plus className="size-3" /> Pedir cambio
          </button>
        )}
      </div>

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
