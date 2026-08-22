"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PackageCheck, ChevronDown, Sparkles, ArrowRight, FileText, Star } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/ui/pill";
import { chipTextColor } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { estrellarTopPerformer, quitarTopPerformer } from "@/app/(app)/entregas/actions";

// Verde neón del logo (Greenlit).
const GREENLIT = "#00e676";

// Una tarea ARCHIVADA: Greenlit (delivered). El archivo tiene TODAS; las recientes
// también salen en el tablero (columna Greenlit ≤7d).
export type TareaArchivada = {
  id: string;
  code: string | null;
  namingBase: string | null;
  greenlitEl: string | null; // fecha ya formateada por el server
  asignados: { name: string; color: string }[];
  /** ¿Estrellada como top performer? (Biblioteca de Ganadores de H.Ü.E) */
  starred: boolean;
};

// El archivo se BUNDLEA por brief: una tarjeta por brief, expandible.
export type BriefArchivo = {
  briefId: string;
  briefLabel: string;
  clienteName: string;
  clienteColor: string;
  clienteSlug: string;
  tareas: TareaArchivada[];
};

/**
 * Entregas = ARCHIVO. Registro COMPLETO de todo el trabajo Greenlit (aprobado por el
 * cliente), agrupado por brief. Cada brief es una tarjeta expandible con sus tareas +
 * la fecha en que se hicieron Greenlit; al abrir una tarea el lead puede consultarla o
 * reabrirla (override, delivered es terminal). Las Greenlit recientes también están en
 * el tablero (columna Greenlit ≤7d); aquí están TODAS.
 */
export function EntregasBoard({
  briefs,
  puedeEstrellar,
}: {
  briefs: BriefArchivo[];
  /** master/admin: puede estrellar top performers. El resto sólo ve la estrella si ya está. */
  puedeEstrellar: boolean;
}) {
  const total = briefs.reduce((n, b) => n + b.tareas.length, 0);
  if (!total) {
    return (
      <EmptyState
        icon={PackageCheck}
        titulo="Archivo vacío"
        descripcion="Cuando el cliente apruebe una tarea (Greenlit), aparecerá aquí agrupada por brief."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total} tarea{total === 1 ? "" : "s"} Greenlit archivada{total === 1 ? "" : "s"} en{" "}
        {briefs.length} brief{briefs.length === 1 ? "" : "s"}.
      </p>
      {briefs.map((b) => (
        <BriefCard key={b.briefId} b={b} puedeEstrellar={puedeEstrellar} />
      ))}
    </div>
  );
}

function BriefCard({ b, puedeEstrellar }: { b: BriefArchivo; puedeEstrellar: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="gl-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-secondary/40"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-semibold text-foreground">{b.briefLabel}</span>
        <Pill color={b.clienteColor} dot className="shrink-0">
          {b.clienteName}
        </Pill>
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ background: `color-mix(in srgb, ${GREENLIT} 20%, transparent)`, color: "var(--greenlight-ink)" }}
        >
          <Sparkles className="size-3" /> {b.tareas.length} Greenlit
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border">
          {b.tareas.map((t) => (
            <div key={t.id} className="flex items-stretch border-b border-border last:border-b-0">
              <Link
                href={`/${b.clienteSlug}/tareas/${t.id}`}
                aria-label={`Abrir ${t.namingBase ?? t.code ?? "tarea"}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-[13px] transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Sparkles className="size-3 shrink-0" style={{ color: "var(--greenlight-ink)" }} />
                {t.code && (
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                    {t.code}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                  {t.namingBase ?? "—"}
                </span>
                {t.asignados.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {t.asignados.slice(0, 3).map((a, i) => (
                      <span
                        key={i}
                        title={a.name}
                        className="grid size-5 place-items-center rounded-full border-2 border-card text-[8px] font-semibold"
                        style={{ backgroundColor: a.color, color: chipTextColor(a.color) }}
                      >
                        {a.name.slice(0, 2).toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                {t.greenlitEl && (
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground" title="Fecha de Greenlit">
                    Greenlit {t.greenlitEl}
                  </span>
                )}
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
              {(puedeEstrellar || t.starred) && (
                <StarCelda
                  ideaId={t.id}
                  starred={t.starred}
                  puede={puedeEstrellar}
                  nombre={t.namingBase ?? t.code ?? "tarea"}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Estrella de "top performer" en una tarea Greenlit. master/admin la togglea; los demás
 * sólo ven la estrella si ya está (indicador de lectura). La estrella ES la señal humana
 * "esto ganó" (Greenlight no tiene métricas de anuncio en vivo) → Biblioteca de Ganadores.
 */
function StarCelda({
  ideaId,
  starred,
  puede,
  nombre,
}: {
  ideaId: string;
  starred: boolean;
  puede: boolean;
  nombre: string;
}) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();

  if (!puede) {
    if (!on) return null;
    return (
      <span className="flex items-center px-2.5" style={{ color: "var(--greenlight-ink)" }} title="Top performer">
        <Star className="size-4 fill-current" />
      </span>
    );
  }

  const toggle = () =>
    start(async () => {
      const res = on ? await quitarTopPerformer(ideaId) : await estrellarTopPerformer(ideaId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo.");
        return;
      }
      setOn(!on);
      toast.success(on ? "Quitado de top performers" : "Marcado como top performer");
    });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      aria-label={`${on ? "Quitar" : "Marcar"} ${nombre} como top performer`}
      title={on ? "Quitar de top performers" : "Marcar como top performer — alimenta la Biblioteca de Ganadores de H.Ü.E"}
      className="flex items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
    >
      <Star className={cn("size-4", on && "fill-current")} style={on ? { color: "var(--greenlight-ink)" } : undefined} />
    </button>
  );
}
