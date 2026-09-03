"use client";

import Link from "next/link";
import { CheckCircle2, RefreshCw, Eye, CheckCheck, ArrowRight } from "lucide-react";
import type { PortalTarea } from "@/app/(app)/[cliente]/portal/portal-data";
import { estadoCliente, type BucketPortal } from "@/lib/portal-bucket";

const LABEL_BUCKET: Record<BucketPortal, string> = {
  activas: "Por revisar",
  revision: "En revisión",
  aprobado: "Aprobadas",
};

/** Ícono por estado — presentación (la etiqueta/color viene de estadoCliente, compartido). */
function iconoDe(t: PortalTarea) {
  if (t.status === "delivered") return CheckCircle2;
  if (t.status === "in_corrections") return RefreshCw;
  if (t.status === "published" && t.reReview) return CheckCheck;
  return Eye;
}

const nombreTarea = (t: PortalTarea) => t.naming ?? t.code ?? "Idea";

/**
 * La LISTA de tarjetas de una cubeta (En revisión / Aprobadas) dentro de un brief. Cada
 * tarjeta lleva a la vista completa de esa tarea (?brief&tarea=id). Es el modo "lista"
 * del portal: las cubetas donde el cliente no tiene nada urgente que hacer se ven como un
 * tablero de tarjetas que puede recorrer y abrir si quiere. Activas se queda como el flujo
 * de revisión (una tarea + flechas). (Pedro 2026-09-03, Fase 1)
 */
export function PortalListaTareas({
  briefId,
  bucket,
  tareas,
  marca,
}: {
  briefId: string;
  bucket: BucketPortal;
  tareas: PortalTarea[];
  marca: string;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{LABEL_BUCKET[bucket]}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {tareas.length}
        </span>
      </div>

      {tareas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {bucket === "aprobado"
            ? "Todavía no has aprobado ninguna idea de este brief."
            : "No hay ideas en revisión en este brief ahora mismo."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tareas.map((t) => {
            const est = estadoCliente(t.status, t.reReview);
            const Icono = iconoDe(t);
            return (
              <Link
                key={t.id}
                href={`?brief=${briefId}&tarea=${t.id}`}
                scroll={false}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  {t.code && (
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-bold text-secondary-foreground">
                      {t.code}
                    </span>
                  )}
                  {t.marcaName && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: `color-mix(in srgb, ${marca} 82%, #000)` }}
                    >
                      {t.marcaName}
                    </span>
                  )}
                  <span
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: `color-mix(in srgb, ${est.tone} 82%, #000)` }}
                  >
                    <Icono className="size-2.5" /> {est.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{nombreTarea(t)}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
