"use client";

import { PegarGuion } from "./pegar-guion";
import { useWorkspaceView } from "./workspace-provider";

/**
 * La banda "¿Ya tienes el guión? / Pegar Guión". Además de su función (pegar el
 * guión/copy y llenar todo de una vez), es EL SEPARADOR entre la sección de
 * arriba (hero + pestañas) y la del guión — el punto donde el menú superior deja
 * de estar pegado y arranca el inferior (Fase 2 de sticky).
 *
 * Es una acción de EDICIÓN → se oculta en "Vista cliente" y cuando la tarea está
 * cerrada. Escribe el cuerpo vivo del contexto (setPlanos/setEstatico).
 *
 * `puedeCrear` es el interruptor HÜE Creativo de la persona (0092): apagado, sólo se
 * quita el botón de crear con H.Ü.E. La banda y "Pegar" siguen, porque pegar el guión
 * del deck no usa ese interruptor y la banda además es el separador.
 */
export function BannerPegarGuion({
  ideaId,
  esEstatico,
  soloLectura,
  puedeCrear,
}: {
  ideaId: string;
  esEstatico: boolean;
  soloLectura: boolean;
  puedeCrear: boolean;
}) {
  const { verCliente, setPlanos, setEstatico } = useWorkspaceView();
  if (soloLectura || verCliente) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-primary px-6 py-5 text-primary-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-lg font-bold">
          {esEstatico ? "¿El copy?" : "¿El guión?"}
        </p>
        <p className="text-[13px] text-primary-foreground/80">
          {puedeCrear
            ? esEstatico
              ? "Deja que H.Ü.E lo escriba desde el brief, o pégalo del deck."
              : "Deja que H.Ü.E lo escriba desde el brief, o pégalo completo del deck."
            : esEstatico
              ? "Pégalo del deck."
              : "Pégalo completo del deck."}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {puedeCrear && (
          <PegarGuion
            ideaId={ideaId}
            modo={esEstatico ? "estatico" : "guion"}
            intent="crear"
            onPlanos={setPlanos}
            onEstatico={setEstatico}
          />
        )}
        <PegarGuion
          ideaId={ideaId}
          modo={esEstatico ? "estatico" : "guion"}
          intent="pegar"
          onPlanos={setPlanos}
          onEstatico={setEstatico}
        />
      </div>
    </div>
  );
}
