"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Check, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetStatus } from "@/lib/brand";
import type { TaskContext } from "@/lib/task-actions";
import { canAdmin, canOverrideStatus } from "@/lib/roles";
import { eliminarTarea } from "@/app/(app)/[cliente]/tareas/[id]/actions";
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
