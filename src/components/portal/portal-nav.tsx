"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  ChevronDown,
  SlidersHorizontal,
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
import { cn } from "@/lib/utils";

// Estado en palabras del cliente (no la máquina de estados interna). Igual que en portal-shell.
const ESTADO_CLIENTE: Record<string, { label: string; tone: string; Icon: typeof Eye }> = {
  delivered: { label: "Aprobado", tone: "var(--status-completed)", Icon: CheckCircle2 },
  in_corrections: { label: "En cambios", tone: "var(--status-corrections)", Icon: RefreshCw },
};
const estadoCliente = (s: string) =>
  ESTADO_CLIENTE[s] ?? { label: "Por revisar", tone: "var(--status-progress)", Icon: Eye };
// La tarea volvió tras una ronda (published + reReview): morado, NO verde (el verde es "Aprobado").
const ESTADO_RE_REVIEW = { label: "Cambios listos", tone: "var(--primary)", Icon: CheckCheck };
const estadoDeTarea = (t: PortalTarea) =>
  t.status === "published" && t.reReview ? ESTADO_RE_REVIEW : estadoCliente(t.status);

// Cubetas del filtro (mismas 3 que ESTADO_CLIENTE + "todas").
type Bucket = "todas" | "revisar" | "cambios" | "aprobado";
const bucketDe = (s: string): Exclude<Bucket, "todas"> =>
  s === "delivered" ? "aprobado" : s === "in_corrections" ? "cambios" : "revisar";
const FILTROS: { k: Bucket; label: string }[] = [
  { k: "todas", label: "Todas" },
  { k: "revisar", label: "Por revisar" },
  { k: "cambios", label: "En cambios" },
  { k: "aprobado", label: "Aprobadas" },
];

const href = (brief: string, tarea: string) => `?brief=${brief}&tarea=${tarea}`;
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
 * El header STICKY del portal (Pedro): consolida toda la navegación de briefs/tareas en
 * una sola barra que se queda arriba al hacer scroll — así el cliente cambia de tarea sin
 * volver arriba. Tres popovers (Brief · Ver detalle de tareas · Filtro) + flechas ← N/M →
 * que recorren SECUENCIALMENTE las tareas (filtradas) del brief seleccionado. Pega bajo el
 * Topbar de la app (top-16); la barra de acción del cliente (PortalAcciones) baja debajo.
 */
export function PortalNav({
  cliente,
  briefs,
  selBriefId,
  selTareaId,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  briefs: PortalBrief[];
  selBriefId: string | null;
  selTareaId: string | null;
}) {
  const [filtro, setFiltro] = useState<Bucket>("todas");
  const [openBrief, setOpenBrief] = useState(false);
  const [openTareas, setOpenTareas] = useState(false);
  const [openFiltro, setOpenFiltro] = useState(false);
  const marca = cliente.brandColor;

  const brief = briefs.find((b) => b.id === selBriefId) ?? briefs[0] ?? null;
  const grupos = useMemo(() => agruparPorMes(briefs), [briefs]);

  const tareas = brief?.tasks ?? [];
  const cuenta = (k: Bucket) =>
    k === "todas" ? tareas.length : tareas.filter((t) => bucketDe(t.status) === k).length;
  // La lista que recorren las flechas y muestra el dropdown de tareas — respeta el filtro.
  const visibles = tareas.filter((t) => filtro === "todas" || bucketDe(t.status) === filtro);
  const idx = visibles.findIndex((t) => t.id === selTareaId);
  const prev = idx > 0 ? visibles[idx - 1] : null;
  // Si la tarea abierta no está en el filtro (idx=-1), "siguiente" salta a la primera.
  const next = idx < 0 ? visibles[0] ?? null : idx < visibles.length - 1 ? visibles[idx + 1] : null;

  return (
    <div className="sticky top-16 z-30 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* UNA sola fila de altura constante (scroll horizontal si no cabe) para que la barra
          de acción de abajo pueda pegarse a un offset fijo sin solaparse (sticky-collision). */}
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
          <div className="hidden md:block">
            <p className="gl-eyebrow leading-none">Portal de revisión</p>
            <h1 className="text-sm font-semibold leading-tight text-foreground">{cliente.name}</h1>
          </div>
        </div>

        {/* Selector de BRIEF (agrupado por mes) */}
        <Popover open={openBrief} onOpenChange={setOpenBrief}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex w-[11rem] shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
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
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
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

        {/* "Ver detalle de tareas" — la lista (filtrada) del brief, navegable */}
        <Popover open={openTareas} onOpenChange={setOpenTareas}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
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
                const est = estadoDeTarea(t);
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
                      "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b border-border px-3 py-2.5 text-[13px] transition-colors last:border-b-0",
                      !activo && "hover:bg-secondary/60",
                    )}
                  >
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
                    >
                      <est.Icon className="size-2.5" /> {est.label}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-foreground">{nombreTarea(t)}</span>
                  </Link>
                );
              })
            )}
          </PopoverContent>
        </Popover>

        {/* Filtro por estado (funnel) — narra las flechas Y el dropdown de tareas */}
        <Popover open={openFiltro} onOpenChange={setOpenFiltro}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Filtrar por estado"
              className={cn(
                "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                filtro === "todas"
                  ? "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-secondary"
                  : "border-primary bg-primary/10 text-primary",
              )}
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-1.5">
            <p className="px-2 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Filtros
            </p>
            {FILTROS.map((f) => {
              const n = cuenta(f.k);
              const activo = filtro === f.k;
              const deshab = n === 0 && f.k !== "todas";
              return (
                <button
                  key={f.k}
                  type="button"
                  disabled={deshab}
                  onClick={() => {
                    setFiltro(f.k);
                    setOpenFiltro(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-default disabled:opacity-40",
                    activo ? "bg-secondary font-semibold text-foreground" : "text-foreground hover:bg-secondary",
                  )}
                >
                  <span className="min-w-0 flex-1">{f.label}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Flechas de navegación secuencial por las tareas (filtradas) del brief */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          <FlechaTarea brief={brief?.id} tarea={prev?.id} dir="prev" />
          <span className="min-w-[3.5rem] text-center text-[13px] font-medium tabular-nums text-muted-foreground">
            {idx >= 0 ? idx + 1 : "–"} / {visibles.length}
          </span>
          <FlechaTarea brief={brief?.id} tarea={next?.id} dir="next" />
        </div>
      </div>
    </div>
  );
}

/** Una flecha de navegación: Link si hay tarea destino, botón inerte (deshabilitado) si no. */
function FlechaTarea({ brief, tarea, dir }: { brief?: string; tarea?: string; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = dir === "prev" ? "Tarea anterior" : "Tarea siguiente";
  const clase =
    "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors";
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
