"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";

import type { AssetStatus } from "@/lib/brand";
import type { TaskContext } from "@/lib/task-actions";
import { canAdmin } from "@/lib/roles";
import { eliminarTarea } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { AccionesTarea } from "./acciones-tarea";
import { NavBundle } from "./nav-bundle";
import { useCorrecciones } from "./correcciones/contexto";
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
  faltaLegal = false,
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
  /** Falta la cortinilla obligatoria → bloquea "Mandar a revisión". */
  faltaLegal?: boolean;
  ctx: TaskContext;
  abiertas: number;
  indice: number;
  total: number;
  anterior: BundleTask | null;
  siguiente: BundleTask | null;
}) {
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
      <div className="flex items-center gap-3">
        <Link
          href={`/${cliente}/tablero`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver al tablero
        </Link>
        {canAdmin(ctx.role) && <BorrarTarea cliente={cliente} ideaId={ideaId} />}
      </div>

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
        {/* Las acciones del equipo NO cambian con "Vista cliente" (es sólo un toggle de
            PREVIEW del documento). Antes, un especialista en Vista cliente veía la
            vista-previa del botón del cliente ("Aprobar") en vez de su "Mandar a
            revisión" — un error. El botón correcto por rol lo decide AccionesTarea. */}
        <AccionesTarea
          ideaId={ideaId}
          clienteSlug={cliente}
          status={status}
          abiertas={abiertas}
          ctx={ctx}
          faltaLegal={faltaLegal}
        />
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
 * Borrar la tarea entera — sólo master/admin. Confirmación en dos pasos (patrón
 * del panel de correcciones) para que un clic accidental no destruya una tarea con
 * todo su cuerpo. Al borrar, vuelve al tablero (la tarea ya no existe).
 */
function BorrarTarea({ cliente, ideaId }: { cliente: string; ideaId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, start] = useTransition();

  const borrar = () =>
    start(async () => {
      const r = await eliminarTarea(cliente, ideaId);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo borrar la tarea.");
        return;
      }
      toast.success("Tarea borrada.");
      router.push(`/${cliente}/tablero`);
    });

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        ¿Borrar tarea?
        <button
          type="button"
          onClick={borrar}
          disabled={borrando}
          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-60"
          style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
        >
          {borrando ? "…" : "Sí"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => setConfirmando(false)}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-background"
        >
          No
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Borrar tarea"
      title="Borrar tarea (master/admin)"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-status-corrections"
    >
      <Trash2 className="size-3.5" /> Borrar
    </button>
  );
}
