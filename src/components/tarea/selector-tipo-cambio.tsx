"use client";

import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS_POR_GRUPO,
  GRUPO_LABEL,
  GRUPO_TONO,
  tipoCambio,
  type CategoriaCambio,
} from "@/lib/tipos-cambio";

/**
 * Selector OBLIGATORIO del tipo de cambio, agrupado por las secciones del rúbrica.
 * Compartido por las dos superficies que crean correcciones (el editor `Campo` y
 * la vista de lectura `CampoLectura`) para que la etiqueta y el orden nunca se
 * separen. El chip seleccionado se rellena con el tono (oscurecido) del grupo para
 * que el blanco pase contraste (misma lección que PIN_BG).
 */
export function SelectorTipoCambio({
  value,
  onChange,
}: {
  value: CategoriaCambio | null;
  onChange: (v: CategoriaCambio) => void;
}) {
  return (
    <div className="space-y-1.5">
      {CATEGORIAS_POR_GRUPO.map((g) => (
        <div key={g.grupo}>
          <p className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            <span className="size-1.5 rounded-full" style={{ background: g.tono }} />
            {g.label}
          </p>
          <div className="flex flex-wrap gap-1">
            {g.items.map((t) => {
              const sel = value === t.slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  title={t.hint}
                  aria-pressed={sel}
                  onClick={() => onChange(t.slug)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    sel
                      ? "border-transparent text-white"
                      : "border-border text-foreground hover:bg-secondary",
                  )}
                  style={
                    sel ? { background: `color-mix(in srgb, ${g.tono} 80%, #000)` } : undefined
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * La etiqueta de solo lectura del tipo de un cambio, para la tarjeta de hover y
 * los paneles. Tinte suave del color del grupo + punto + nombre. null si el cambio
 * no lleva categoría (cliente / legacy).
 */
export function TagTipoCambio({ slug, className }: { slug: string | null; className?: string }) {
  const t = tipoCambio(slug);
  if (!t) return null;
  const tono = GRUPO_TONO[t.grupo];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${tono} 18%, transparent)`,
        color: `color-mix(in srgb, ${tono} 75%, #000)`,
      }}
      title={GRUPO_LABEL[t.grupo]}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: tono }} />
      {t.label}
    </span>
  );
}

/**
 * Badge que marca que un cambio vino del CLIENTE (no una corrección interna). Va
 * DONDE iría la categoría de rúbrica — el cliente no elige tipo. Tono morado
 * (primary) para distinguirse de las pastillas de estado rojo/ámbar/verde del
 * lifecycle: eso comunica el ESTADO; esto comunica el ORIGEN.
 */
export function BadgeCliente({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        className,
      )}
      style={{
        background: "color-mix(in srgb, var(--primary) 14%, transparent)",
        color: "color-mix(in srgb, var(--primary) 82%, #000)",
      }}
      title="Pedido por el cliente"
    >
      <User className="size-2.5 shrink-0" /> Cliente
    </span>
  );
}
