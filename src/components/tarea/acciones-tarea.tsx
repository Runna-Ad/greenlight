"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Check, RotateCcw, PlayCircle, CornerUpLeft } from "lucide-react";
import { toast } from "sonner";

import { actionsFor, waitingLabel, type TaskContext, type TaskVerb } from "@/lib/task-actions";
import type { AssetStatus } from "@/lib/brand";
import { canOverrideStatus } from "@/lib/roles";
import { EJECUTA_VERBO, TOAST_VERBO } from "@/components/board/verbos";
import {
  mandarCorrecciones,
  devolverARevision,
} from "@/app/(app)/[cliente]/tareas/[id]/correcciones-actions";
import {
  revisarOrtografia,
  marcarOrtografiaIgnorada,
  type ErrorOrtografia,
} from "@/app/(app)/[cliente]/tareas/[id]/ortografia-actions";
import { DialogoOrtografia } from "./dialogo-ortografia";
import { useWorkspace } from "./workspace-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Los verbos del workspace: los de flujo + los dos de correcciones localizadas. */
type WorkspaceVerb = TaskVerb | "mandar_correcciones" | "devolver";
type Tono = "primary" | "danger";
type Accion = { verb: WorkspaceVerb; label: string; tone: Tono };

const ICONO: Record<WorkspaceVerb, typeof Send> = {
  start: PlayCircle,
  submit_review: Send,
  request_changes: RotateCcw,
  approve: Check,
  send_client: Send,
  mandar_correcciones: RotateCcw,
  devolver: CornerUpLeft,
};

const TOAST_EXTRA: Partial<Record<WorkspaceVerb, string>> = {
  mandar_correcciones: "Mandada a correcciones — el especialista ya tiene el aviso.",
  devolver: "Devuelta a revisión — el Dept Head ya tiene el aviso.",
};

/**
 * Los botones de flujo del workspace. La fase de REVISIÓN es consciente de las
 * correcciones localizadas:
 *   - under_review + revisor: hay algo en rojo → "Mandar a correcciones";
 *     no queda nada → "Aprobar" (paso aparte de "Enviar a cliente", decisión de Pedro).
 *   - in_corrections + quien la trabaja: "Devolver a revisión" (dispara el aviso al lead).
 * Las demás fases delegan en la MISMA decisión que el tablero (actionsFor + EJECUTA_VERBO).
 */
export function AccionesTarea({
  ideaId,
  clienteSlug,
  status,
  ctx,
  abiertas,
  variante = "compacta",
}: {
  ideaId: string;
  clienteSlug: string;
  status: AssetStatus;
  ctx: TaskContext;
  /** Correcciones sin atender (rojas) en la ronda actual. */
  abiertas: number;
  variante?: "compacta" | "prominente";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const esRevisor = canOverrideStatus(ctx.role);
  // Chequeo de ortografía (H.Ü.E) al mandar a revisión: si hay errores se abre el
  // diálogo; el especialista aplica los que quiera y SIEMPRE puede enviar igual.
  const [errores, setErrores] = useState<ErrorOrtografia[] | null>(null);
  const [pendiente, setPendiente] = useState<Accion | null>(null);
  // Cuántos fixes aplicó el usuario en el diálogo. El editor tiene el texto en
  // estado propio (Campo uncontrolled) y el fix lo escribe una acción HERMANA
  // (el diálogo), así que el campo no refleja el cambio hasta recargar. Si aplicó
  // algo, recargamos al cerrar/enviar para que VEA el cambio (bug reportado por Pedro).
  const [aplicados, setAplicados] = useState(0);
  // El cuerpo vivo del editor (texto actual en pantalla) para que el chequeo no
  // dependa de que el autosave ya haya escrito en la BD.
  const { planos, estatico } = useWorkspace();

  const acciones = accionesDe(status, ctx, esRevisor, abiertas);
  const espera = waitingLabel(status, ctx);

  const ejecutarVerbo = async (a: Accion) => {
    const res =
      a.verb === "mandar_correcciones"
        ? await mandarCorrecciones(clienteSlug, ideaId)
        : a.verb === "devolver"
          ? await devolverARevision(clienteSlug, ideaId)
          : await EJECUTA_VERBO[a.verb](ideaId);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo completar la acción.");
      return;
    }
    const msg = TOAST_EXTRA[a.verb] ?? TOAST_VERBO[a.verb as TaskVerb];
    if (msg) toast.success(msg);
    router.refresh();
  };

  const ejecutar = (a: Accion) =>
    startTransition(async () => {
      // "Mandar a revisión" pasa primero por el corrector de H.Ü.E (surface+override).
      if (a.verb === "submit_review") {
        const r = await revisarOrtografia(ideaId, { planos, estatico });
        if (r.ok && r.errores.length > 0) {
          setErrores(r.errores);
          setPendiente(a);
          return;
        }
        // Sin errores, o el chequeo no corrió (sin clave/DB) → manda directo.
      }
      await ejecutarVerbo(a);
    });

  const enviarDeTodosModos = () =>
    startTransition(async () => {
      const a = pendiente;
      const recargar = aplicados > 0;
      const restantes = errores ?? [];
      setErrores(null);
      setPendiente(null);
      setAplicados(0);
      // Adopción: las sugerencias que quedaron sin aplicar al mandar de todos modos =
      // ignoradas (best-effort, no bloquea el envío).
      if (restantes.length)
        void marcarOrtografiaIgnorada(restantes.map((e) => ({ filaId: e.filaId, campo: e.campo, sugerencia: e.sugerencia })));
      if (a) await ejecutarVerbo(a);
      // Si se aplicaron fixes, recargar para que el campo muestre el texto corregido
      // (la tarea ya se envió; el reviewer ya lo ve — esto es para la vista del envío).
      if (recargar) window.location.reload();
    });

  const cerrarOrtografia = () => {
    const recargar = aplicados > 0;
    const restantes = errores ?? [];
    setErrores(null);
    setPendiente(null);
    setAplicados(0);
    // Adopción: lo que quedó sin aplicar al cerrar el diálogo = ignorado (best-effort).
    if (restantes.length)
      void marcarOrtografiaIgnorada(restantes.map((e) => ({ filaId: e.filaId, campo: e.campo, sugerencia: e.sugerencia })));
    if (recargar) window.location.reload();
  };

  const dialogoOrtografia = errores && (
    <DialogoOrtografia
      errores={errores}
      enviando={pending}
      onAplicado={(id) => {
        setErrores((prev) => prev?.filter((e) => e.id !== id) ?? null);
        setAplicados((n) => n + 1);
      }}
      onEnviar={enviarDeTodosModos}
      onCerrar={cerrarOrtografia}
    />
  );

  if (!acciones.length && !espera) return null;

  const prominente = variante === "prominente";

  const botones = acciones.map((a) => {
    const Icono = ICONO[a.verb];
    return (
      <Button
        key={a.verb}
        size={prominente ? "lg" : "default"}
        disabled={pending}
        variant={a.tone === "danger" ? "destructive" : "default"}
        onClick={() => ejecutar(a)}
        className={cn(
          "gap-2 font-semibold shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md",
          a.tone === "primary" &&
            "bg-gradient-to-r from-primary to-[color-mix(in_srgb,var(--primary)_70%,#7c3aed)] text-primary-foreground",
          prominente && "px-6",
        )}
      >
        <Icono className={prominente ? "size-5" : "size-4"} />
        {a.label}
      </Button>
    );
  });

  if (prominente) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.07] to-secondary/40 px-4 py-5 shadow-sm sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-foreground">
              {espera ? espera : "¿Lista esta tarea?"}
            </p>
            {!espera && (
              <p className="text-xs text-muted-foreground">
                Cuando termines, mándala al siguiente paso desde aquí.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">{botones}</div>
        </div>
        {dialogoOrtografia}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {espera && (
          <span className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {espera}
          </span>
        )}
        {botones}
      </div>
      {dialogoOrtografia}
    </>
  );
}

/**
 * La decisión de qué botón toca. Las fases de revisión se computan aquí (miran
 * las correcciones); las demás salen de actionsFor(), la fuente compartida.
 */
function accionesDe(
  status: AssetStatus,
  ctx: TaskContext,
  esRevisor: boolean,
  abiertas: number,
): Accion[] {
  // El especialista ejecuta; el revisor (lead/admin/master) revisa. `esRevisor`
  // (canOverrideStatus) es exactamente lead/admin/master, así que un asignado que
  // NO es revisor es el especialista. Devolver una corrección la trabajó él.
  const esEspecialista = ctx.isAssignee && !esRevisor;

  if (status === "under_review" && esRevisor) {
    return abiertas > 0
      ? [{ verb: "mandar_correcciones", label: "Pedir cambios", tone: "danger" }]
      : [{ verb: "approve", label: "Aprobar", tone: "primary" }];
  }
  if (status === "in_corrections" && esEspecialista) {
    return [{ verb: "devolver", label: "Devolver a revisión", tone: "primary" }];
  }
  // Resto de fases: la misma decisión que el tablero.
  return actionsFor(status, ctx).map((a) => ({ verb: a.verb, label: a.label, tone: a.tone }));
}
