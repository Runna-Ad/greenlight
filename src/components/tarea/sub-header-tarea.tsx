"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetStatus } from "@/lib/brand";
import type { TaskContext } from "@/lib/task-actions";
import { canOverrideStatus } from "@/lib/roles";
import { AccionesTarea } from "./acciones-tarea";
import { NavBundle } from "./nav-bundle";
import { useCorrecciones } from "./correcciones/contexto";
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
  // El botón de H.Ü.E vive también AQUÍ (barra sticky de arriba), no sólo en el
  // panel de correcciones al fondo — durante la revisión el lead mira arriba, así
  // que el validador quedaba "perdido".
  //
  // Se muestra en el MOMENTO de revisar: la tarea tiene cambios de esta ronda y
  // aún no está entregada. NO se ata a "cambios sin cerrar" — antes, en cuanto el
  // lead confirmaba todos los cambios, el botón desaparecía justo cuando quería
  // repasarlos con H.Ü.E. Ahora sigue disponible para revisar la ronda entera.
  const corr = useCorrecciones();
  const mostrarHue = !!corr?.esRevisor && corr.correcciones.length > 0 && status !== "delivered";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={`/${cliente}/tablero`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver al tablero
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mostrarHue && corr && (
          <button
            type="button"
            disabled={corr.validando}
            onClick={() => corr.validar()}
            title="H.Ü.E revisa si cada cambio pedido ya se hizo (te ayuda a confirmar)"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-card px-2.5 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            {corr.validando ? "Revisando con H.Ü.E…" : "Revisar con H.Ü.E"}
          </button>
        )}
        {verCliente && !canOverrideStatus(ctx.role) ? (
          <BotonesClientePreview abiertas={abiertas} />
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
 * El botón de revisión del cliente, SÓLO como vista previa (las acciones reales
 * del cliente son un build posterior — el portal). Es UN botón que cambia, como
 * el flujo real: "Aprobar" por defecto, y si hay cambios pedidos (correcciones
 * abiertas) se convierte en "Pedir cambios" — nunca los dos a la vez (Pedro).
 */
function BotonesClientePreview({ abiertas }: { abiertas: number }) {
  const hayCambios = abiertas > 0;
  return (
    <span
      className={cn(
        "inline-flex cursor-default items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold opacity-90",
        hayCambios
          ? "border border-status-corrections text-status-corrections"
          : "bg-status-completed text-white",
      )}
      title="Vista previa — así verá el cliente su botón de revisión"
    >
      {hayCambios ? (
        <>
          <RefreshCw className="size-4" /> Pedir cambios
        </>
      ) : (
        <>
          Aprobar <Check className="size-4" />
        </>
      )}
    </span>
  );
}
