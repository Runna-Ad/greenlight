"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, Check } from "lucide-react";

import type { AssetStatus } from "@/lib/brand";
import type { TaskContext } from "@/lib/task-actions";
import { canOverrideStatus } from "@/lib/roles";
import { AccionesTarea } from "./acciones-tarea";
import { NavBundle } from "./nav-bundle";
import { useWorkspace } from "./workspace-provider";
import type { BundleTask } from "@/lib/bundle";

/**
 * El sub-header (fila A del mockup) = el MENÚ superior de la sección de arriba.
 * Izquierda: "Volver al tablero". Derecha: los botones de flujo + el paginador
 * del bundle (← 2/10 →).
 *
 * Botones según vista Y rol:
 *  - Un REVISOR (lead/admin/master) ve SIEMPRE las acciones reales
 *    (AccionesTarea) — también en "Vista cliente", porque su trabajo es revisar
 *    y pedir cambios desde ahí (Pedro). Es su vista por defecto.
 *  - Un no-revisor en "Vista cliente" ve la PREVIEW deshabilitada (así la
 *    agencia ve la disposición del cliente); en "Vista editor" ve AccionesTarea
 *    (p. ej. "Mandar a revisión", que dispara el chequeo H.Ü.E).
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
        {verCliente && !canOverrideStatus(ctx.role) ? (
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
