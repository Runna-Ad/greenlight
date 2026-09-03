"use client";

import { useMemo, useState, type Ref } from "react";
import Link from "next/link";
import {
  FileText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  CheckCircle2,
  RefreshCw,
  Eye,
  CheckCheck,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { PortalBrief, PortalTarea } from "@/app/(app)/[cliente]/portal/portal-data";
import { bucketPortal, estadoCliente, BUCKETS_PORTAL, type BucketPortal } from "@/lib/portal-bucket";
import { cn } from "@/lib/utils";

/** Ícono por estado — la etiqueta/color viene de estadoCliente (compartido con las cards). */
function iconoDe(t: PortalTarea) {
  if (t.status === "delivered") return CheckCircle2;
  if (t.status === "in_corrections") return RefreshCw;
  if (t.status === "published" && t.reReview) return CheckCheck;
  return Eye;
}

const href = (brief: string, tarea: string) => `?brief=${brief}&tarea=${tarea}`;
const hrefLista = (brief: string, bucket: BucketPortal) => `?brief=${brief}&vista=${bucket}`;
const nombreTarea = (t: PortalTarea) => t.naming ?? t.code ?? "Idea";

// Agrupa los briefs por MES de su fecha para el selector (los sin fecha van al final).
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
function agruparPorMes(briefs: PortalBrief[]): { titulo: string; items: PortalBrief[] }[] {
  const grupos = new Map<string, PortalBrief[]>();
  for (const b of briefs) {
    let key = "zzz"; // sin fecha → al final
    if (b.date) {
      const d = new Date(b.date);
      if (!Number.isNaN(d.getTime())) key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
    }
    (grupos.get(key) ?? grupos.set(key, []).get(key)!).push(b);
  }
  return [...grupos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // mes más reciente primero; "zzz" al final
    .map(([key, items]) => {
      if (key === "zzz") return { titulo: "Sin fecha", items };
      const [y, m] = key.split("-");
      return { titulo: `${MESES[Number(m)]} ${y}`, items };
    });
}

/**
 * El header STICKY del portal. Tres pestañas — Activas (por revisar) · En revisión (el
 * equipo trabaja tus cambios) · Aprobadas (delivered):
 *   · Activas es el FLUJO DE REVISIÓN — una tarea + flechas ← N/M → para recorrerlas.
 *   · En revisión / Aprobadas son LISTAS DE TARJETAS (modo lista, `?vista=`): el cliente no
 *     tiene nada urgente ahí, las ve como tablero y abre la que quiera. (Pedro 2026-09-03)
 * En modo lista las flechas y el dropdown de tareas se ocultan (la lista ES la navegación).
 * Pega bajo el Topbar (top-16); la barra de acción del cliente lee la altura medida
 * (`ref` → `--portal-nav-h`). Todos los controles ≥44px (se usa desde el teléfono).
 */
export function PortalNav({
  ref,
  cliente,
  briefs,
  selBriefId,
  selTareaId,
  vistaBucket,
}: {
  /** El shell lo usa para medir la altura del nav (ResizeObserver). */
  ref?: Ref<HTMLDivElement>;
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  briefs: PortalBrief[];
  selBriefId: string | null;
  selTareaId: string | null;
  /** Cubeta en modo LISTA (revision|aprobado), o null en modo DETALLE (tarea + flechas). */
  vistaBucket: BucketPortal | null;
}) {
  const [openBrief, setOpenBrief] = useState(false);
  const [openTareas, setOpenTareas] = useState(false);
  const marca = cliente.brandColor;

  const brief = briefs.find((b) => b.id === selBriefId) ?? briefs[0] ?? null;
  const grupos = useMemo(() => agruparPorMes(briefs), [briefs]);

  const tareas = brief?.tasks ?? [];
  const cuenta = (k: BucketPortal) => tareas.filter((t) => bucketPortal(t.status) === k).length;
  const primeraDe = (k: BucketPortal) => tareas.find((t) => bucketPortal(t.status) === k) ?? null;

  // La pestaña ACTIVA: en modo lista es la cubeta de la lista; en modo detalle se deriva de
  // la tarea EN PANTALLA (si ves una aprobada, estás en "Aprobadas").
  const tareaEnPantalla = tareas.find((t) => t.id === selTareaId) ?? null;
  const vistaActual: BucketPortal =
    vistaBucket ?? (tareaEnPantalla ? bucketPortal(tareaEnPantalla.status) : "activas");

  // Modo DETALLE: las flechas y el dropdown recorren la cubeta de la tarea en pantalla.
  const detalle = vistaBucket == null;
  const visibles = tareas.filter((t) => bucketPortal(t.status) === vistaActual);
  const idx = visibles.findIndex((t) => t.id === selTareaId);
  const prev = idx > 0 ? visibles[idx - 1] : null;
  const next = idx < 0 ? visibles[0] ?? null : idx < visibles.length - 1 ? visibles[idx + 1] : null;

  return (
    <div ref={ref} className="sticky top-16 z-30 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* UNA sola fila (scroll horizontal si no cabe). La barra de acción de abajo se pega
          justo debajo leyendo la altura medida de este nav (sin sticky-collision). */}
      <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Identidad del portal */}
        <div className="flex shrink-0 items-center gap-2.5">
          {cliente.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cliente.logoUrl} alt={cliente.name} className="h-9 w-auto max-w-[100px] object-contain" />
          ) : (
            <span
              className="grid size-9 place-items-center rounded-lg text-xs font-bold text-white shadow-sm"
              style={{ background: marca }}
            >
              {cliente.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          {/* sr-only en vez de hidden: en mobile el h1 sigue en el árbol de accesibilidad
              (es el único encabezado de la página) aunque se oculte visualmente. */}
          <div className="sr-only md:not-sr-only">
            <p className="gl-eyebrow leading-none">Portal de revisión</p>
            <h1 className="text-sm font-semibold leading-tight text-foreground">{cliente.name}</h1>
          </div>
        </div>

        {/* Selector de BRIEF (agrupado por mes) */}
        <Popover open={openBrief} onOpenChange={setOpenBrief}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-11 w-[11rem] shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">{brief?.label ?? "Selecciona brief"}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-64 overflow-y-auto p-1.5">
            {grupos.map((g) => (
              <div key={g.titulo} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                  {g.titulo}
                </p>
                {g.items.map((b) => {
                  const activo = b.id === brief?.id;
                  return (
                    <Link
                      key={b.id}
                      href={href(b.id, b.tasks[0]?.id ?? "")}
                      scroll={false}
                      onClick={() => setOpenBrief(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        activo ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{b.label}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 text-[11px] tabular-nums",
                          activo ? "bg-white/20" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {b.tasks.length}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* "Ver detalle de tareas" — sólo en modo DETALLE (en lista, las tarjetas son la lista) */}
        {detalle && (
          <Popover open={openTareas} onOpenChange={setOpenTareas}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                <ListChecks className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Ver detalle de tareas</span>
                <span className="sm:hidden">Tareas</span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-[70vh] w-80 overflow-y-auto p-0">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-border bg-secondary/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Estado</span>
                <span>Tareas</span>
              </div>
              {visibles.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Ninguna tarea en este estado.</p>
              ) : (
                visibles.map((t) => {
                  const est = estadoCliente(t.status, t.reReview);
                  const Icono = iconoDe(t);
                  const activo = t.id === selTareaId;
                  return (
                    <Link
                      key={t.id}
                      href={href(brief!.id, t.id)}
                      scroll={false}
                      onClick={() => setOpenTareas(false)}
                      aria-current={activo ? "true" : undefined}
                      style={{
                        boxShadow: activo ? `inset 3px 0 0 ${marca}` : undefined,
                        background: activo ? `color-mix(in srgb, ${marca} 8%, transparent)` : undefined,
                      }}
                      className={cn(
                        "grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b border-border px-3 py-2 text-[13px] transition-colors last:border-b-0",
                        !activo && "hover:bg-secondary/60",
                      )}
                    >
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
                      >
                        <Icono className="size-2.5" /> {est.label}
                      </span>
                      <span className="min-w-0 truncate font-semibold text-foreground">{nombreTarea(t)}</span>
                    </Link>
                  );
                })
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Pestañas Activas · En revisión · Aprobadas. Activas → flujo de revisión (detalle);
            En revisión / Aprobadas → lista de tarjetas. Cubeta vacía = pestaña deshabilitada. */}
        <div
          role="tablist"
          aria-label="Ver tareas por estado"
          className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
        >
          {BUCKETS_PORTAL.map((v) => {
            const n = cuenta(v.k);
            const activo = v.k === vistaActual;
            const primera = primeraDe(v.k);
            const clase = cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
              activo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
            );
            const contador = (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  activo ? "bg-white/20 text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {n}
              </span>
            );
            // Cubeta vacía → pestaña inerte (no lleva a ningún lado).
            if (!primera) {
              return (
                <span key={v.k} role="tab" aria-selected={false} aria-disabled className={cn(clase, "cursor-default opacity-40")}>
                  {v.label}
                  {contador}
                </span>
              );
            }
            // Activas → DETALLE de su primera tarea (flujo de revisión). En revisión /
            // Aprobadas → modo LISTA (?vista=), un tablero de tarjetas.
            const destino = v.k === "activas" ? href(brief!.id, primera.id) : hrefLista(brief!.id, v.k);
            return (
              <Link
                key={v.k}
                href={destino}
                scroll={false}
                role="tab"
                aria-selected={activo}
                aria-current={activo ? "page" : undefined}
                className={clase}
              >
                {v.label}
                {contador}
              </Link>
            );
          })}
        </div>

        {/* Flechas de navegación secuencial — sólo en modo DETALLE (en lista no aplican). */}
        {detalle && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            <FlechaTarea brief={brief?.id} tarea={prev?.id} dir="prev" />
            <span className="min-w-[3.5rem] text-center text-[13px] font-medium tabular-nums text-muted-foreground">
              {idx >= 0 ? idx + 1 : "–"} / {visibles.length}
            </span>
            <FlechaTarea brief={brief?.id} tarea={next?.id} dir="next" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Una flecha de navegación: Link si hay tarea destino, botón inerte (deshabilitado) si no. */
function FlechaTarea({ brief, tarea, dir }: { brief?: string; tarea?: string; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = dir === "prev" ? "Tarea anterior" : "Tarea siguiente";
  const clase =
    "inline-flex size-11 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors";
  if (!brief || !tarea) {
    return (
      <span aria-hidden className={cn(clase, "cursor-default text-muted-foreground opacity-40")}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link href={href(brief, tarea)} scroll={false} aria-label={label} className={cn(clase, "hover:border-primary/40 hover:bg-secondary")}>
      <Icon className="size-4" />
    </Link>
  );
}
