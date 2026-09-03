"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RefreshCw, Clock, Eye } from "lucide-react";
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
  puedeActuar = true,
}: {
  clienteSlug: string;
  ideaId: string;
  status: AssetStatus;
  /** La tarea volvió tras una ronda: el equipo ya aplicó lo que el cliente pidió. */
  reReview?: boolean;
  /** Cuántos cambios aplicó el equipo (para el copy de la barra). */
  nRevisados?: number;
  /** ¿El visor puede aprobar / pedir cambios? (cliente de esta marca o master).
   *  Un admin en sólo-lectura ve la barra informativa, sin botones. */
  puedeActuar?: boolean;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  // Aprobar es la acción MÁS consecuente del portal (pasa a delivered + avisa al
  // equipo, sin deshacer en la UI). Confirmación en dos pasos para que un toque
  // accidental en la barra pegada no la dispare (Pedro / reap).
  const [confirmando, setConfirmando] = useState(false);
  const corr = useCorrecciones();
  const n = corr?.correcciones.length ?? 0;
  const hayCambios = n > 0;

  // Sólo-lectura: un usuario de agencia sin permiso de actuar (admin) VE el portal
  // pero no aprueba ni pide cambios como el cliente. (El server también lo bloquea:
  // puedeActuarComoCliente en portal-actions.) Va tras los hooks para no romper su orden.
  if (!puedeActuar)
    return (
      <Barra>
        <div className="flex w-full items-center gap-2 text-[13px] text-muted-foreground">
          <Eye className="size-4 shrink-0" />
          Vista de solo lectura — sólo el cliente (o el Master Builder) puede aprobar o pedir cambios.
        </div>
      </Barra>
    );

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
      toast.success("¡Aprobado! El equipo fue notificado — la tarea pasó a la pestaña Aprobadas.");
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
          reReview && !hayCambios ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        {ayuda}
      </p>
      {/* Un solo botón que se transforma — Aprobar ⇄ Pedir cambios. La transición
          de color/tamaño le da el "click" de que algo cambió. Pedir cambios es
          reversible (va al equipo); Aprobar pide confirmación en dos pasos. */}
      {hayCambios ? (
        <button
          type="button"
          onClick={enviar}
          disabled={pend}
          className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-110 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
          style={{ background: "color-mix(in srgb, var(--status-corrections) 82%, #000)" }}
        >
          <RefreshCw className="size-4 transition-transform duration-500 group-hover:rotate-180" />
          Pedir {n === 1 ? "cambio" : "cambios"}
          <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-white/25 px-1 text-xs tabular-nums">
            {n}
          </span>
        </button>
      ) : confirmando ? (
        <div className="inline-flex items-center gap-2">
          <span className="hidden text-[13px] font-medium text-foreground sm:block">¿Aprobar esta idea?</span>
          <button
            type="button"
            onClick={() => {
              setConfirmando(false);
              aprobar();
            }}
            disabled={pend}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            style={{ background: "color-mix(in srgb, var(--status-completed) 90%, #000)" }}
          >
            <Check className="size-4" /> Sí, aprobar
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={pend}
            autoFocus
            className="rounded-xl border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pend}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-110 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
          style={{ background: "color-mix(in srgb, var(--status-completed) 90%, #000)" }}
        >
          <Check className="size-4" /> Aprobar
        </button>
      )}
    </Barra>
  );
}

/** La barra pegada arriba: bleed a los bordes del contenedor + blur de fondo.
 *  Pega DEBAJO del PortalNav sticky: top = topbar (4rem) + la altura MEDIDA del nav, que
 *  el shell publica como `--portal-nav-h` (antes era un número fijo acoplado a la altura
 *  del nav — crecer un botón lo desalineaba). El fallback 4rem es la altura del nav sin
 *  envolver. z-20 (bajo el nav, z-30). El bleed -mx iguala el padding del contenedor
 *  full-width del shell (px-4 sm:px-6 lg:px-8) para tocar los bordes del viewport. */
function Barra({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-[calc(4rem+var(--portal-nav-h,4rem))] z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
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
