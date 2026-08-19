"use client";

import { type ReactNode } from "react";
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

          {/* Riel de tareas del brief — tarjetas visuales, no un dropdown. */}
          {brief && <TareaRail brief={brief} selTareaId={selTareaId} marca={marca} />}

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

/**
 * El riel de tareas: una fila de tarjetas que se desliza en horizontal. Cada una
 * muestra la marca, el nombre y su estado en palabras del cliente. La activa lleva
 * el color de marca; al pasar el ratón se levanta. Entran escalonadas.
 */
function TareaRail({
  brief,
  selTareaId,
  marca,
}: {
  brief: PortalBrief;
  selTareaId: string | null;
  marca: string;
}) {
  const selId = brief.tasks.find((t) => t.id === selTareaId)?.id ?? brief.tasks[0]?.id ?? null;
  if (!brief.tasks.length) return null;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2.5">
        {brief.tasks.map((t, i) => (
          <TareaCard
            key={t.id}
            briefId={brief.id}
            t={t}
            activo={t.id === selId}
            marca={marca}
            indice={i}
          />
        ))}
      </div>
    </div>
  );
}

function TareaCard({
  briefId,
  t,
  activo,
  marca,
  indice,
}: {
  briefId: string;
  t: PortalTarea;
  activo: boolean;
  marca: string;
  indice: number;
}) {
  const est = estadoCliente(t.status);
  return (
    <Link
      href={href(briefId, t.id)}
      scroll={false}
      style={{
        animationDelay: `${Math.min(indice, 8) * 45}ms`,
        boxShadow: activo ? `0 0 0 2px color-mix(in srgb, ${marca} 55%, transparent)` : undefined,
      }}
      className={cn(
        "group relative flex w-[170px] shrink-0 flex-col gap-2.5 rounded-2xl border bg-card p-3 fill-mode-both duration-300 animate-in fade-in-0 slide-in-from-bottom-3",
        "transition-transform hover:-translate-y-1 hover:shadow-lg",
        activo ? "border-transparent shadow-md" : "border-border hover:border-primary/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {t.marcaLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.marcaLogo} alt="" className="h-6 w-auto max-w-[52px] object-contain" />
        ) : (
          <span className="grid size-6 place-items-center rounded-md bg-secondary text-[10px] font-bold text-muted-foreground">
            {(t.marcaName ?? t.code ?? "·").slice(0, 2).toUpperCase()}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white"
          style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
        >
          <est.Icon className="size-2.5" /> {est.label}
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.4em] text-[13px] font-semibold leading-snug text-foreground">
        {t.naming ?? t.code ?? "Idea"}
      </p>

      {/* Pista de acción: en la activa se ve fija; en las demás aparece al hover. */}
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-semibold transition-opacity",
          activo ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        style={{ color: `color-mix(in srgb, ${marca} 70%, #000)` }}
      >
        {activo ? "Revisando" : "Revisar"} <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
