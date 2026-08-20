"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { keyCampo, type Correccion } from "@/lib/correcciones";
import {
  agregarCorreccion,
  setEstadoCorreccion,
  confirmarCampo as confirmarCampoAction,
  descartarCorreccion,
  type CorreccionTarget,
} from "@/app/(app)/[cliente]/tareas/[id]/correcciones-actions";
import { validarCambios, type VeredictoCambio } from "@/app/(app)/[cliente]/tareas/[id]/validar-actions";

export type Ctx = {
  ideaId: string;
  clienteSlug: string;
  /** Puede pedir/confirmar cambios (Dept Head/Lead/admin/master). */
  esRevisor: boolean;
  /** Es el CLIENTE en el portal: pide cambios seleccionando texto igual que un
   *  lead, pero SIN tipo de cambio y sin confirmar/atender (esas son del equipo).
   *  Comparte el mismo contexto para reusar CampoLectura tal cual. */
  esCliente: boolean;
  /** Equipo interno (puede marcar atendido como especialista). */
  esEquipo: boolean;
  correcciones: Correccion[];
  pendiente: boolean;
  /** Correcciones que apuntan a un campo exacto. */
  deCampo: (tabla: string, filaId: string | null, campo: string) => Correccion[];
  pedir: (t: CorreccionTarget, body: string) => void;
  marcar: (id: string, estado: "open" | "done" | "closed") => void;
  confirmarCampo: (tabla: string, filaId: string | null, campo: string) => void;
  /** El revisor descarta una corrección que fijó (borrado duro). */
  descartar: (id: string) => void;
  /** Veredicto ADVISORY de la IA por corrección (¿ya se hizo el cambio?). */
  veredictos: Map<string, VeredictoCambio>;
  validando: boolean;
  /** Corre la validación con IA de todas las correcciones vivas. */
  validar: () => void;
};

export const CorreccionesCtx = createContext<Ctx | null>(null);

/** Devuelve el contexto de correcciones, o null si el campo vive fuera del workspace. */
export const useCorrecciones = () => useContext(CorreccionesCtx);

export function CorreccionesProvider({
  ideaId,
  clienteSlug,
  esRevisor,
  esEquipo,
  correcciones,
  children,
}: {
  ideaId: string;
  clienteSlug: string;
  esRevisor: boolean;
  esEquipo: boolean;
  /** Correcciones internas + cambios del cliente ENVIADOS (con `cliente:true`) —
   *  ambos de primera clase, mismo lifecycle/panel/gate/rondas (0038). */
  correcciones: Correccion[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [validando, startValidar] = useTransition();
  const [veredictos, setVeredictos] = useState<Map<string, VeredictoCambio>>(new Map());

  const validar = () =>
    startValidar(async () => {
      const res = await validarCambios(ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!res.veredictos.length) {
        setVeredictos(new Map()); // limpia veredictos viejos si ya no hay nada pendiente
        toast.info("No hay cambios pendientes que validar.");
        return;
      }
      setVeredictos(new Map(res.veredictos.map((v) => [v.correccionId, v])));
      // Resumen legible del veredicto — para que se ENTIENDA qué hizo H.Ü.E, no
      // sólo "listo". Cada cambio también lleva su chip (parece hecho / a medias /
      // no parece hecho) en su tarjeta.
      const si = res.veredictos.filter((v) => v.hecho === "si").length;
      const parc = res.veredictos.filter((v) => v.hecho === "parcial").length;
      const no = res.veredictos.filter((v) => v.hecho === "no").length;
      const partes = [
        si ? `${si} ${si === 1 ? "hecho" : "hechos"}` : null,
        parc ? `${parc} a medias` : null,
        no ? `${no} sin hacer` : null,
      ].filter(Boolean);
      toast.success(`H.Ü.E revisó ${res.veredictos.length}: ${partes.join(" · ")}`);
    });

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
    esRevisor,
    esCliente: false,
    esEquipo,
    correcciones,
    pendiente,
    deCampo: (tabla, filaId, campo) => {
      const k = keyCampo(tabla, filaId, campo);
      return correcciones.filter(
        (c) => keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo) === k,
      );
    },
    pedir: (t, body) => run(agregarCorreccion(ideaId, t, body), "Cambio fijado a " + t.label),
    marcar: (id, estado) =>
      run(
        setEstadoCorreccion(ideaId, id, estado),
        estado === "done" ? "Marcado como atendido" : estado === "closed" ? "Confirmado" : "Reabierto",
      ),
    confirmarCampo: (tabla, filaId, campo) =>
      run(confirmarCampoAction(ideaId, tabla, filaId, campo), "Campo confirmado"),
    descartar: (id) => run(descartarCorreccion(ideaId, id), "Corrección descartada"),
    veredictos,
    validando,
    validar,
  };

  return <CorreccionesCtx.Provider value={value}>{children}</CorreccionesCtx.Provider>;
}
