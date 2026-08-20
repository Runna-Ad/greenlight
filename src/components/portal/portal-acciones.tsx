"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RefreshCw, Clock } from "lucide-react";
import { clienteAprobar, clienteEnviarCambios } from "@/app/(app)/[cliente]/portal/portal-actions";
import { useCorrecciones } from "@/components/tarea/correcciones/contexto";
import type { AssetStatus } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * La barra de acción del cliente, PEGADA ARRIBA (sticky). UN botón que cambia,
 * como pidió Pedro: por defecto "Aprobar" (verde); en cuanto anota ≥1 cambio se
 * convierte en "Pedir cambios" — nunca los dos a la vez. El conteo de cambios se
 * lee del contexto del cliente (se actualiza al anotar/quitar un pin).
 *
 * Si la idea ya fue resuelta por el cliente (delivered/in_corrections) se muestra
 * el estado en vez del botón.
 */
export function PortalAcciones({
  clienteSlug,
  ideaId,
  status,
  reReview = false,
  nRevisados = 0,
}: {
  clienteSlug: string;
  ideaId: string;
  status: AssetStatus;
  /** La tarea volvió tras una ronda: el equipo ya aplicó lo que el cliente pidió. */
  reReview?: boolean;
  /** Cuántos cambios aplicó el equipo (para el copy de la barra). */
  nRevisados?: number;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const corr = useCorrecciones();
  const n = corr?.correcciones.length ?? 0;
  const hayCambios = n > 0;

  if (status === "delivered")
    return (
      <Barra>
        <Estado tono="var(--status-completed)" Icon={Check} texto="Aprobaste esta idea. ¡Gracias!" />
      </Barra>
    );
  if (status === "in_corrections")
    return (
      <Barra>
        <Estado tono="var(--status-corrections)" Icon={Clock} texto="Pediste cambios — el equipo está en ello." />
      </Barra>
    );

  const aprobar = () =>
    start(async () => {
      const res = await clienteAprobar(clienteSlug, ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("¡Aprobado! El equipo fue notificado.");
      router.refresh();
    });

  const enviar = () =>
    start(async () => {
      const res = await clienteEnviarCambios(clienteSlug, ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Cambios enviados al equipo.");
      router.refresh();
    });

  // Copy de la barra: al anotar cambios, el conteo; en la re-revisión (el equipo ya
  // aplicó lo pedido), un aviso claro de "revísalos"; si no, la instrucción base.
  const ayuda = hayCambios
    ? `${n} ${n === 1 ? "cambio anotado" : "cambios anotados"}`
    : reReview
      ? `El equipo aplicó ${nRevisados} ${nRevisados === 1 ? "cambio que pediste" : "cambios que pediste"} — revísalos y aprueba, o pide más.`
      : "Selecciona el texto que quieras cambiar, o aprueba la idea.";

  return (
    <Barra>
      <p
        className={cn(
          "hidden text-[13px] sm:block",
          reReview && !hayCambios ? "font-medium text-status-completed" : "text-muted-foreground",
        )}
      >
        {ayuda}
      </p>
      {/* Un solo botón que se transforma — Aprobar ⇄ Pedir cambios. La transición
          de color/tamaño le da el "click" de que algo cambió. */}
      <button
        type="button"
        onClick={hayCambios ? enviar : aprobar}
        disabled={pend}
        className="group inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-110 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
        style={{
          background: hayCambios
            ? "color-mix(in srgb, var(--status-corrections) 82%, #000)"
            : "color-mix(in srgb, var(--status-completed) 90%, #000)",
        }}
      >
        {hayCambios ? (
          <>
            <RefreshCw className="size-4 transition-transform duration-500 group-hover:rotate-180" />
            Pedir {n === 1 ? "cambio" : "cambios"}
            <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-white/25 px-1 text-xs tabular-nums">
              {n}
            </span>
          </>
        ) : (
          <>
            <Check className="size-4" /> Aprobar
          </>
        )}
      </button>
    </Barra>
  );
}

/** La barra pegada arriba: bleed a los bordes del contenedor + blur de fondo.
 *  Pega a `top-16` (bajo el Topbar de la app, h-16 sticky top-0 z-30) con z-20 — como
 *  el sub-header interno. Antes iba `top-0 z-30`: chocaba con el Topbar al hacer scroll
 *  (la búsqueda "Buscar idea" se asomaba por el borde derecho de la barra centrada). */
function Barra({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
}

function Estado({
  tono,
  texto,
  Icon,
}: {
  tono: string;
  texto: string;
  Icon: typeof Check;
}) {
  return (
    <div
      className="flex w-full items-center gap-2 text-sm font-medium"
      style={{ color: `color-mix(in srgb, ${tono} 78%, #000)` }}
    >
      <Icon className="size-4 shrink-0" />
      {texto}
    </div>
  );
}
