"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ArrowRight, Eye, RefreshCw, CheckCircle2, CheckCheck } from "lucide-react";
import type { PortalBrief, PortalTarea } from "@/app/(app)/[cliente]/portal/portal-data";
import { bucketPortal, estadoCliente } from "@/lib/portal-bucket";

function iconoDe(t: PortalTarea) {
  if (t.status === "delivered") return CheckCircle2;
  if (t.status === "in_corrections") return RefreshCw;
  if (t.status === "published" && t.reReview) return CheckCheck;
  return Eye;
}
const nombreTarea = (t: PortalTarea) => t.naming ?? t.code ?? "Idea";

/**
 * NIVEL 2 del portal (Fase 2): los briefs de UNA marca, como tarjetas. Cada card muestra el
 * conteo por estado (activas · en revisión · aprobadas) de las tareas de ESA marca, un
 * desplegable para asomarse a las tareas (Pedro: "2 clicks"), y lleva a la vista del brief
 * (que ya filtra a la marca). `briefs` llega YA filtrado a la marca por la página.
 */
export function PortalBriefGrid({
  cliente,
  marcaNombre,
  marcaId,
  briefs,
  backHref,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  marcaNombre: string;
  marcaId: string;
  briefs: PortalBrief[];
  /** A dónde vuelve el "atrás" (grid de marcas), o null si esta marca es la única. */
  backHref: string | null;
}) {
  return (
    <div className="mx-auto max-w-4xl px-1">
      <header className="mb-6 flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Volver a marcas"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <ChevronLeft className="size-4" />
          </Link>
        )}
        <div>
          <p className="gl-eyebrow">{cliente.name} · {marcaNombre}</p>
          <h1 className="text-xl font-semibold text-foreground">Briefs</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3">
        {briefs.map((b) => (
          <BriefCard key={b.id} brief={b} marcaId={marcaId} />
        ))}
      </div>
    </div>
  );
}

/** Chip de conteo por estado (0 → no se muestra). Módulo-nivel: definirlo dentro de la card
 *  reinicia su estado en cada render (react-hooks/static-components). */
function Chip({ n, label, tone }: { n: number; label: string; tone: string }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: `color-mix(in srgb, ${tone} 82%, #000)` }}>
      {n} {label}
    </span>
  );
}

function BriefCard({ brief, marcaId }: { brief: PortalBrief; marcaId: string }) {
  const [abierto, setAbierto] = useState(false);
  const cuenta = (k: "activas" | "revision" | "aprobado") => brief.tasks.filter((t) => bucketPortal(t.status) === k).length;
  const entrar = `?marca=${marcaId}&brief=${brief.id}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 p-4">
        <Link href={entrar} className="group flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-none">
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{brief.label}</span>
          <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">{brief.tasks.length}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? "Ocultar tareas" : "Ver tareas"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary"
        >
          <ChevronDown className={`size-4 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <Chip n={cuenta("activas")} label="por revisar" tone="var(--status-progress)" />
        <Chip n={cuenta("revision")} label="en revisión" tone="var(--status-corrections)" />
        <Chip n={cuenta("aprobado")} label="aprobadas" tone="var(--status-completed)" />
      </div>

      {abierto && (
        <ul className="border-t border-border">
          {brief.tasks.map((t) => {
            const est = estadoCliente(t.status, t.reReview);
            const Icono = iconoDe(t);
            return (
              <li key={t.id}>
                <Link
                  href={`?marca=${marcaId}&brief=${brief.id}&tarea=${t.id}`}
                  className="flex min-h-11 items-center gap-2 border-b border-border px-4 py-2 text-[13px] transition-colors last:border-b-0 hover:bg-secondary/60"
                >
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}>
                    <Icono className="size-2.5" /> {est.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{nombreTarea(t)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
