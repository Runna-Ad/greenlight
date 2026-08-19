"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, FileText, PackageOpen } from "lucide-react";
import type { PortalBrief, PortalTarea } from "@/app/(app)/[cliente]/portal/portal-data";
import { cn } from "@/lib/utils";

// Estado en palabras del cliente (no la máquina de estados interna).
const ESTADO_CLIENTE: Record<string, { label: string; tone: string }> = {
  delivered: { label: "Aprobado", tone: "var(--status-completed)" },
  in_corrections: { label: "En cambios", tone: "var(--status-corrections)" },
};
const estadoCliente = (s: string) =>
  ESTADO_CLIENTE[s] ?? { label: "Por revisar", tone: "var(--status-progress)" };

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        {cliente.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cliente.logoUrl}
            alt={cliente.name}
            className="h-10 w-auto max-w-[120px] object-contain"
          />
        ) : (
          <span
            className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white"
            style={{ background: cliente.brandColor }}
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
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <PackageOpen className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay nada para revisar. Cuando el equipo te envíe una idea, aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Selector de brief */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {briefs.map((b) => {
              const activo = b.id === brief?.id;
              return (
                <Link
                  key={b.id}
                  href={href(b.id, b.tasks[0]?.id ?? "")}
                  scroll={false}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    activo
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  <FileText className="size-3.5" />
                  {b.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px]",
                      activo ? "bg-white/20" : "bg-secondary",
                    )}
                  >
                    {b.tasks.length}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Dropdown de tareas del brief */}
          {brief && (
            <TareaDropdown brief={brief} selTareaId={selTareaId} />
          )}

          {/* La vista de la tarea (incluye su barra de acción pegada arriba) */}
          {vista ? (
            <div className="mt-5">{vista}</div>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Elige una idea para revisarla.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TareaDropdown({ brief, selTareaId }: { brief: PortalBrief; selTareaId: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = brief.tasks.find((t) => t.id === selTareaId) ?? brief.tasks[0] ?? null;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  if (!sel) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/50"
      >
        <TareaLinea t={sel} />
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1.5 max-h-80 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {brief.tasks.map((t) => (
            <Link
              key={t.id}
              href={href(brief.id, t.id)}
              scroll={false}
              onClick={() => setAbierto(false)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary",
                t.id === sel.id && "bg-secondary",
              )}
            >
              <TareaLinea t={t} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TareaLinea({ t }: { t: PortalTarea }) {
  const est = estadoCliente(t.status);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {t.marcaLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.marcaLogo} alt="" className="h-5 w-auto max-w-[40px] shrink-0 object-contain" />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
        {t.naming ?? t.code ?? "Idea"}
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
        style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
      >
        {est.label}
      </span>
    </span>
  );
}
