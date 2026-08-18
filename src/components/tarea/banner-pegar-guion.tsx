"use client";

import { PegarGuion } from "./pegar-guion";
import { useWorkspace } from "./workspace-provider";

/**
 * La banda "¿Ya tienes el guión? / Pegar Guión". Además de su función (pegar el
 * guión/copy y llenar todo de una vez), es EL SEPARADOR entre la sección de
 * arriba (hero + pestañas) y la del guión — el punto donde el menú superior deja
 * de estar pegado y arranca el inferior (Fase 2 de sticky).
 *
 * Es una acción de EDICIÓN → se oculta en "Vista cliente" y cuando la tarea está
 * cerrada. Escribe el cuerpo vivo del contexto (setPlanos/setEstatico).
 */
export function BannerPegarGuion({
  ideaId,
  esEstatico,
  soloLectura,
}: {
  ideaId: string;
  esEstatico: boolean;
  soloLectura: boolean;
}) {
  const { verCliente, setPlanos, setEstatico } = useWorkspace();
  if (soloLectura || verCliente) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-primary px-6 py-5 text-primary-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-lg font-bold">
          {esEstatico ? "¿Ya tienes el copy?" : "¿Ya tienes el guión?"}
        </p>
        <p className="text-[13px] text-primary-foreground/80">
          {esEstatico
            ? "Pégalo del deck para llenar los campos automáticamente."
            : "Pégalo completo del deck para llenar todos los planos automáticamente."}
        </p>
      </div>
      <PegarGuion
        ideaId={ideaId}
        modo={esEstatico ? "estatico" : "guion"}
        onPlanos={setPlanos}
        onEstatico={setEstatico}
      />
    </div>
  );
}
