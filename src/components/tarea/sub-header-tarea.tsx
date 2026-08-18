"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, Check } from "lucide-react";

import type { AssetStatus } from "@/lib/brand";
import type { TaskContext } from "@/lib/task-actions";
import { AccionesTarea } from "./acciones-tarea";
import { NavBundle } from "./nav-bundle";
import { useWorkspace } from "./workspace-provider";
import type { BundleTask } from "@/lib/bundle";

/**
 * El sub-header (fila A del mockup) = el MENÚ superior de la sección de arriba.
 * Izquierda: "Volver al tablero". Derecha: los botones de flujo + el paginador
 * del bundle (← 2/10 →).
 *
 * En "Vista cliente" (preview) muestra los botones que verá el cliente cuando
 * revise —"Pedir cambios" / "Aprobar"—, pero DESHABILITADOS: las acciones reales
 * del cliente aún no existen (el portal es un build aparte); esto es sólo para
 * que la agencia vea la disposición. En "Vista editor" muestra AccionesTarea
 * (los botones reales del flujo, p. ej. "Mandar a revisión", que dispara el
 * chequeo de ortografía H.Ü.E).
 */
export function SubHeaderTarea({
  cliente,
  ideaId,
  status,
  ctx,
  abiertas,
  indice,
  total,
  anterior,
  siguiente,
}: {
  cliente: string;
  ideaId: string;
  status: AssetStatus;
  ctx: TaskContext;
  abiertas: number;
  indice: number;
  total: number;
  anterior: BundleTask | null;
  siguiente: BundleTask | null;
}) {
  const { verCliente } = useWorkspace();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={`/${cliente}/tablero`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver al tablero
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {verCliente ? (
          <BotonesClientePreview />
        ) : (
          <AccionesTarea
            ideaId={ideaId}
            clienteSlug={cliente}
            status={status}
            abiertas={abiertas}
            ctx={ctx}
          />
        )}
        <NavBundle
          cliente={cliente}
          indice={indice}
          total={total}
          anterior={anterior}
          siguiente={siguiente}
        />
      </div>
    </div>
  );
}

/**
 * Los botones de revisión del cliente, SÓLO como vista previa. No hacen nada
 * (las acciones reales del cliente son un build posterior — el portal). Se
 * muestran para que la agencia vea, en "Vista cliente", lo que tendrá el
 * cliente al revisar.
 */
function BotonesClientePreview() {
  return (
    <div
      className="flex items-center gap-2"
      title="Vista previa — así verá el cliente sus botones de revisión"
    >
      <span className="inline-flex cursor-default items-center gap-2 rounded-md border border-status-corrections px-4 py-2 text-sm font-semibold text-status-corrections opacity-90">
        <RefreshCw className="size-4" /> Pedir cambios
      </span>
      <span className="inline-flex cursor-default items-center gap-2 rounded-md bg-status-completed px-4 py-2 text-sm font-semibold text-white opacity-90">
        Aprobar <Check className="size-4" />
      </span>
    </div>
  );
}
