"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText, PackageOpen, CheckCircle2, RefreshCw, Eye, ArrowRight } from "lucide-react";
import type { PortalBrief, PortalTarea } from "@/app/(app)/[cliente]/portal/portal-data";
import { cn } from "@/lib/utils";

// Estado en palabras del cliente (no la máquina de estados interna).
const ESTADO_CLIENTE: Record<string, { label: string; tone: string; Icon: typeof Eye }> = {
  delivered: { label: "Aprobado", tone: "var(--status-completed)", Icon: CheckCircle2 },
  in_corrections: { label: "En cambios", tone: "var(--status-corrections)", Icon: RefreshCw },
};
const estadoCliente = (s: string) =>
  ESTADO_CLIENTE[s] ?? { label: "Por revisar", tone: "var(--status-progress)", Icon: Eye };

const href = (brief: string, tarea: string) => `?brief=${brief}&tarea=${tarea}`;

export function PortalShell({
  cliente,
  briefs,
  selBriefId,
  selTareaId,
  vista,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  briefs: PortalBrief[];
  selBriefId: string | null;
  selTareaId: string | null;
  /** La vista de sólo lectura de la tarea seleccionada (con su barra de acción). */
  vista: ReactNode;
}) {
  const brief = briefs.find((b) => b.id === selBriefId) ?? briefs[0] ?? null;
  const marca = cliente.brandColor;

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Glow sutil con el color de marca del cliente — hace sentir el portal
          "suyo" sin robar protagonismo al contenido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56"
        style={{
          background: `radial-gradient(60rem 20rem at 50% -8rem, color-mix(in srgb, ${marca} 22%, transparent), transparent 70%)`,
        }}
      />

      <header className="mb-6 flex items-center gap-3 gl-rise-in">
        {cliente.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cliente.logoUrl}
            alt={cliente.name}
            className="h-10 w-auto max-w-[120px] object-contain"
          />
        ) : (
          <span
            className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ background: marca }}
          >
            {cliente.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <p className="gl-eyebrow">Portal de revisión</p>
          <h1 className="text-xl font-semibold text-foreground">{cliente.name}</h1>
        </div>
      </header>

      {!briefs.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center gl-rise-in">
          <PackageOpen className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay nada para revisar. Cuando el equipo te envíe una idea, aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Selector de brief */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {briefs.map((b) => {
              const activo = b.id === brief?.id;
              return (
                <Link
                  key={b.id}
                  href={href(b.id, b.tasks[0]?.id ?? "")}
                  scroll={false}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-95",
                    activo
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary",
                  )}
                >
                  <FileText className="size-3.5" />
                  {b.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      activo ? "bg-white/20" : "bg-secondary",
                    )}
                  >
                    {b.tasks.length}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Lista densa de tareas del brief (Opción B): una fila por tarea con
              filtro por estado + encabezado fijo — escala a briefs de 15+ tareas
              sin scroll horizontal. */}
          {brief && <TareaLista brief={brief} selTareaId={selTareaId} marca={marca} />}

          {/* La vista de la tarea (incluye su barra de acción pegada arriba). El
              key por tarea la remonta al cambiar → entra con un fade sutil. */}
          {vista ? (
            <div key={selTareaId ?? "none"} className="mt-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              {vista}
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">Elige una idea para revisarla.</p>
          )}
        </>
      )}
    </div>
  );
}

// El estado del cliente en "cubetas" para el filtro (mismas 3 que ESTADO_CLIENTE).
type Bucket = "todas" | "revisar" | "cambios" | "aprobado";
const bucketDe = (s: string): Exclude<Bucket, "todas"> =>
  s === "delivered" ? "aprobado" : s === "in_corrections" ? "cambios" : "revisar";
const FILTROS: { k: Bucket; label: string }[] = [
  { k: "todas", label: "Todas" },
  { k: "revisar", label: "Por revisar" },
  { k: "cambios", label: "En cambios" },
  { k: "aprobado", label: "Aprobadas" },
];

/**
 * Lista DENSA de tareas del brief (Opción B). Una fila por tarea — estado · nombre ·
 * acción — con filtro por estado y encabezado FIJO al hacer scroll. Reemplaza al riel
 * horizontal: escala a briefs de 15+ tareas sin scroll horizontal. La activa lleva
 * una pleca del color de marca. Navega igual (Link a ?brief&tarea, sin saltar scroll).
 */
function TareaLista({
  brief,
  selTareaId,
  marca,
}: {
  brief: PortalBrief;
  selTareaId: string | null;
  marca: string;
}) {
  const [filtro, setFiltro] = useState<Bucket>("todas");
  const selId = brief.tasks.find((t) => t.id === selTareaId)?.id ?? brief.tasks[0]?.id ?? null;
  if (!brief.tasks.length) return null;

  const cuenta = (k: Bucket) =>
    k === "todas" ? brief.tasks.length : brief.tasks.filter((t) => bucketDe(t.status) === k).length;
  const visibles = brief.tasks.filter((t) => filtro === "todas" || bucketDe(t.status) === filtro);

  return (
    <div className="space-y-2.5">
      {/* Filtro por estado */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const n = cuenta(f.k);
          const activo = filtro === f.k;
          return (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(f.k)}
              disabled={n === 0 && f.k !== "todas"}
              aria-pressed={activo}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors active:scale-95 disabled:cursor-default disabled:opacity-40",
                activo
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-secondary",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10.5px] tabular-nums",
                  activo ? "bg-background/25" : "bg-secondary",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lista con encabezado fijo */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="sticky top-0 z-[1] grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-border bg-secondary/85 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
            <span>Estado</span>
            <span>Tarea</span>
            <span className="text-right">Acción</span>
          </div>
          {visibles.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ninguna tarea en este estado.
            </p>
          ) : (
            visibles.map((t) => (
              <TareaFila key={t.id} briefId={brief.id} t={t} activo={t.id === selId} marca={marca} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TareaFila({
  briefId,
  t,
  activo,
  marca,
}: {
  briefId: string;
  t: PortalTarea;
  activo: boolean;
  marca: string;
}) {
  const est = estadoCliente(t.status);
  return (
    <Link
      href={href(briefId, t.id)}
      scroll={false}
      aria-current={activo ? "true" : undefined}
      style={{
        boxShadow: activo ? `inset 3px 0 0 ${marca}` : undefined,
        background: activo ? `color-mix(in srgb, ${marca} 8%, transparent)` : undefined,
      }}
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-[13px] transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        !activo && "hover:bg-secondary/50",
      )}
    >
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
        style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
      >
        <est.Icon className="size-2.5" /> {est.label}
      </span>
      <span className="min-w-0 truncate font-semibold text-foreground">
        {t.naming ?? t.code ?? "Idea"}
      </span>
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold"
        style={{
          color: activo ? `color-mix(in srgb, ${marca} 72%, #000)` : "var(--muted-foreground)",
        }}
      >
        {activo ? "Revisando" : "Ver"} <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
