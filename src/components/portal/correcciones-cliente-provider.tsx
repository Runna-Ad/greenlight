"use client";

import { useMemo, useTransition, type ReactNode } from "react";
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
  revisiones,
  editable,
  children,
}: {
  ideaId: string;
  clienteSlug: string;
  /** Los cambios que el cliente ya fijó y aún no envía (pins pendientes). */
  cambios: Correccion[];
  /** Los cambios de rondas pasadas que el equipo YA aplicó (read-only, "aplicado"). */
  revisiones: Correccion[];
  editable: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();

  // El value se memoiza (igual que el provider interno, contexto.tsx): sin esto era un
  // objeto NUEVO cada render, y como CADA CampoLectura del documento (10-40 en un guión
  // largo del portal) lo lee vía useCorrecciones(), un cambio de estado del provider
  // (p. ej. `pendiente` del useTransition al fijar/quitar un cambio, o un router.refresh)
  // re-renderizaba TODO el documento del cliente. (reap perf pre-launch)
  const value = useMemo<Ctx>(() => {
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

    return {
      ideaId,
      clienteSlug,
      marcaColor: null, // el portal no pinta el badge "Cliente" (el cliente ES el cliente)
      esRevisor: false,
      esCliente: editable,
      esEquipo: false,
      // El cliente no arma "rondas en borrador": lo que fija lo manda él con su propio
      // botón, y hasta entonces sólo lo ve él (sus pins son suyos). Nunca es borrador
      // en el sentido interno (lead armando una ronda que el especialista no debe ver).
      borrador: false,
      correcciones: cambios,
      revisiones,
      pendiente,
      deCampo: (tabla, filaId, campo) => {
        const k = keyCampo(tabla, filaId, campo);
        return cambios.filter(
          (c) => keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo) === k,
        );
      },
      revisionesDeCampo: (tabla, filaId, campo) => {
        const k = keyCampo(tabla, filaId, campo);
        return revisiones.filter(
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
  }, [ideaId, clienteSlug, editable, cambios, revisiones, pendiente, router, start]);

  return <CorreccionesCtx.Provider value={value}>{children}</CorreccionesCtx.Provider>;
}
