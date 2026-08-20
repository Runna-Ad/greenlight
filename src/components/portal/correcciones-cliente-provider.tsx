"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { keyCampo, type Correccion } from "@/lib/correcciones";
import { CorreccionesCtx, type Ctx } from "@/components/tarea/correcciones/contexto";
import {
  clienteFijarCambio,
  clienteQuitarCambio,
} from "@/app/(app)/[cliente]/portal/portal-actions";

/**
 * El MISMO contexto de correcciones, pero para el CLIENTE en el portal. Así
 * CampoLectura reusa tal cual el flujo "selecciona texto → escribe el cambio" que
 * usa el lead — la única diferencia (sin tipo de cambio, sin confirmar/atender) la
 * decide `esCliente` dentro de CampoLectura.
 *
 * `editable=false` (la idea ya no está en la cancha del cliente) apaga esCliente,
 * así los campos vuelven a ser sólo-lectura bonitos (sin poder pedir más cambios).
 */
export function CorreccionesClienteProvider({
  ideaId,
  clienteSlug,
  cambios,
  editable,
  children,
}: {
  ideaId: string;
  clienteSlug: string;
  /** Los cambios que el cliente ya fijó y aún no envía (pins pendientes). */
  cambios: Correccion[];
  editable: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => {
      const res = await p;
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo completar la acción.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
    });

  const value: Ctx = {
    ideaId,
    clienteSlug,
    marcaColor: null, // el portal no pinta el badge "Cliente" (el cliente ES el cliente)
    esRevisor: false,
    esCliente: editable,
    esEquipo: false,
    correcciones: cambios,
    pendiente,
    deCampo: (tabla, filaId, campo) => {
      const k = keyCampo(tabla, filaId, campo);
      return cambios.filter(
        (c) => keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo) === k,
      );
    },
    pedir: (t, body) => run(clienteFijarCambio(clienteSlug, ideaId, t, body), "Cambio anotado"),
    // El cliente no atiende ni confirma — esas acciones son del equipo.
    marcar: () => {},
    confirmarCampo: () => {},
    descartar: (id) => run(clienteQuitarCambio(clienteSlug, ideaId, id), "Cambio quitado"),
    veredictos: new Map(),
    validando: false,
    validar: () => {},
  };

  return <CorreccionesCtx.Provider value={value}>{children}</CorreccionesCtx.Provider>;
}
