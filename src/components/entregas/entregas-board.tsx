"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PackageCheck, ChevronDown, Sparkles, ArrowRight, Star, Package, Layers } from "lucide-react";
import { CampoDrive } from "@/components/paquetes/campo-drive";
import type { TonoEntrega } from "@/lib/paquetes";
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
  /** De qué pestaña es: el card junta Real y Normal del mismo día (fase 2). */
  track: "Real" | "Normal" | null;
  greenlitEl: string | null; // fecha ya formateada por el server
  asignados: { name: string; color: string }[];
  /** ¿Estrellada como top performer? (Biblioteca de Ganadores de H.Ü.E) */
  starred: boolean;
};

// El archivo se BUNDLEA por brief: una tarjeta por brief (Real y Normal del mismo día
// juntos), expandible, con sus tareas por paquete (fase 2, Pedro 2026-11-13).
export type BriefArchivo = {
  /** Llave del card (cliente + fecha, o la pestaña sola si el brief no tiene fecha). */
  briefId: string;
  briefLabel: string;
  /** "Real 4 · Normal 2". */
  desglose: string;
  clienteName: string;
  clienteColor: string;
  clienteSlug: string;
  total: number;
  /** Paquetes por nombre; `nombre` null = «Sin paquete» (al final). Sólo paquetes con TODAS
   *  sus tareas Greenlit (Pedro 2026-11-19); `paquete` trae su resumen y su carpeta de Drive. */
  grupos: {
    paqueteId: string | null;
    nombre: string | null;
    paquete: {
      total: number;
      desglose: string;
      nota: { texto: string; tono: TonoEntrega } | null;
      driveUrl: string | null;
    } | null;
    tareas: TareaArchivada[];
  }[];
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
  const total = briefs.reduce((n, b) => n + b.total, 0);
  if (!total) {
    return (
      <EmptyState
        icon={PackageCheck}
        titulo="Archivo vacío"
        descripcion="Cuando el cliente apruebe todas las piezas de un paquete (Greenlit), aparecerá aquí con su brief."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total} tarea{total === 1 ? "" : "s"} Greenlit en {briefs.length} brief{briefs.length === 1 ? "" : "s"}.
      </p>
      {briefs.map((b) => (
        <BriefCard key={b.briefId} b={b} puedeEstrellar={puedeEstrellar} />
      ))}
    </div>
  );
}

/** Color de la nota de entrega del paquete (el mismo que en Briefs). Tarde = rojo, sólo equipo. */
const TONO_COLOR: Record<TonoEntrega, string> = {
  antes: "color-mix(in srgb, #00e676 60%, var(--foreground))",
  a_tiempo: "var(--foreground)",
  tarde: "var(--status-corrections)",
  pendiente: "var(--muted-foreground)",
};

/** Un brief en Entregas: el MISMO card que en Briefs (título, Real/Normal, pastilla Greenlit,
 *  conteo y sus paquetes), sólo con los paquetes ya Greenlit y la carpeta de Drive de cada uno. */
function BriefCard({ b, puedeEstrellar }: { b: BriefArchivo; puedeEstrellar: boolean }) {
  const conPaquetes = b.grupos.some((g) => g.paqueteId);
  return (
    <div className="gl-card overflow-hidden p-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{b.briefLabel}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill color={b.clienteColor} dot className="shrink-0">{b.clienteName}</Pill>
              {b.desglose && <span className="text-[11px] text-muted-foreground">{b.desglose}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${GREENLIT} 18%, transparent)`,
                color: `color-mix(in srgb, ${GREENLIT} 72%, #000)`,
              }}
            >
              <Sparkles className="size-3" /> Greenlit
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <Layers className="size-3" /> {b.total}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 px-4 py-1.5">
        {conPaquetes && (
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {(() => { const n = b.grupos.filter((g) => g.paqueteId).length; return n === 1 ? "1 paquete" : `${n} paquetes`; })()}
          </p>
        )}
        <ul className="divide-y divide-border/40">
          {b.grupos.map((g) => (
            <GrupoFila key={g.paqueteId ?? "sin-paquete"} g={g} b={b} puedeEstrellar={puedeEstrellar} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function GrupoFila({
  g,
  b,
  puedeEstrellar,
}: {
  g: BriefArchivo["grupos"][number];
  b: BriefArchivo;
  puedeEstrellar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const n = g.tareas.length;
  return (
    <li className="py-1.5">
      <div className="flex items-start gap-2">
        <Package className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground" title={g.nombre ?? undefined}>
            {g.nombre ?? "Sin paquete"}
          </p>
          {g.paquete ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                {g.paquete.total} {g.paquete.total === 1 ? "pieza" : "piezas"}{g.paquete.desglose ? ` · ${g.paquete.desglose}` : ""}
              </p>
              {g.paquete.nota && (
                <p className="text-[11px] font-medium" style={{ color: TONO_COLOR[g.paquete.nota.tono] }}>{g.paquete.nota.texto}</p>
              )}
              <CampoDrive
                key={g.paquete.driveUrl ?? ""}
                cliente={b.clienteSlug}
                paqueteId={g.paqueteId!}
                nombre={g.nombre ?? "paquete"}
                driveUrl={g.paquete.driveUrl}
                puedeEditar={puedeEstrellar}
              />
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">{n} {n === 1 ? "pieza Greenlit" : "piezas Greenlit"}</p>
          )}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Ver {n} {n === 1 ? "tarea" : "tareas"}
            <ChevronDown className={cn("size-3 transition-transform", abierto && "rotate-180")} />
          </button>
        </div>
      </div>
      {abierto && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-border">
          {g.tareas.map((t) => (
            <div key={t.id} className="flex items-stretch border-b border-border last:border-b-0">
              <Link
                href={`/${b.clienteSlug}/tareas/${t.id}`}
                aria-label={`Abrir ${t.namingBase ?? t.code ?? "tarea"}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-[13px] transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {t.code && (
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                    {t.code}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">{t.namingBase ?? "—"}</span>
                {t.track && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                    style={{
                      color: `var(--type-${t.track === "Real" ? "real" : "normal"})`,
                      backgroundColor: `color-mix(in srgb, var(--type-${t.track === "Real" ? "real" : "normal"}) 12%, transparent)`,
                    }}
                  >
                    {t.track}
                  </span>
                )}
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
                <StarCelda ideaId={t.id} starred={t.starred} puede={puedeEstrellar} nombre={t.namingBase ?? t.code ?? "tarea"} />
              )}
            </div>
          ))}
        </div>
      )}
    </li>
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
