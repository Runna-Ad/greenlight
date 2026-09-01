"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { keyCampo, type Correccion } from "@/lib/correcciones";
import { useWorkspaceView } from "@/components/tarea/workspace-provider";
import type { PlanoVista, EstaticoVista } from "@/components/tarea/preview-slide";
import {
  agregarCorreccion,
  setEstadoCorreccion,
  confirmarCampo as confirmarCampoAction,
  descartarCorreccion,
  type CorreccionTarget,
} from "@/app/(app)/[cliente]/tareas/[id]/correcciones-actions";
import {
  validarCambios,
  aplicarSugerencia as aplicarSugerenciaAction,
  marcarVeredictoIgnorado,
  type VeredictoCambio,
} from "@/app/(app)/[cliente]/tareas/[id]/validar-actions";

export type Ctx = {
  ideaId: string;
  clienteSlug: string;
  /** Color de marca del cliente — pinta el badge "Cliente" (Pedro). null = fallback. */
  marcaColor: string | null;
  /** Puede pedir/confirmar cambios (Dept Head/Lead/admin/master). */
  esRevisor: boolean;
  /** Es el CLIENTE en el portal: pide cambios seleccionando texto igual que un
   *  lead, pero SIN tipo de cambio y sin confirmar/atender (esas son del equipo).
   *  Comparte el mismo contexto para reusar CampoLectura tal cual. */
  esCliente: boolean;
  /** Equipo interno (puede marcar atendido como especialista). */
  esEquipo: boolean;
  /**
   * BORRADOR: el lead sigue ARMANDO la ronda y aún no la ha mandado (la tarea está en
   * `under_review`). Es la etapa que le faltaba al ciclo de vida de una corrección
   * —borrador → enviada → atendida → confirmada—: sin ella, una corrección recién
   * fijada nacía como `open` ("Sin atender") y arrastraba dos problemas (Pedro
   * 2026-09-01): al lead se le ofrecían Confirmar y "Revisar con H.Ü.E" cuando todavía
   * no hay nada que confirmar ni que revisar, y el ESPECIALISTA ya las veía con sólo
   * recargar, antes de que se las mandaran.
   * No hace falta columna nueva: el envío ES la transición de estado
   * (`rpc_task_send_corrections`: under_review → in_corrections), que es la única puerta.
   */
  borrador: boolean;
  correcciones: Correccion[];
  /** Cambios de rondas PASADAS ya aplicados por el equipo (read-only). Sólo el portal
   *  los usa: al re-revisar, el cliente ve DÓNDE y QUÉ se cambió. Vacío en el interno. */
  revisiones?: Correccion[];
  pendiente: boolean;
  /** Correcciones que apuntan a un campo exacto. */
  deCampo: (tabla: string, filaId: string | null, campo: string) => Correccion[];
  /** Revisiones (cambios ya aplicados) que apuntan a un campo exacto. Portal-only. */
  revisionesDeCampo?: (tabla: string, filaId: string | null, campo: string) => Correccion[];
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
  /** Aplica la sugerencia de H.Ü.E directo al campo (sólo revisor). Parchea el campo en
   *  memoria (SIN recargar) y quita el botón sólo de ESE cambio; los demás veredictos siguen. */
  aplicarSugerencia?: (correccion: Correccion, textoNuevo: string) => void;
};

export const CorreccionesCtx = createContext<Ctx | null>(null);

/** Devuelve el contexto de correcciones, o null si el campo vive fuera del workspace. */
export const useCorrecciones = () => useContext(CorreccionesCtx);

export function CorreccionesProvider({
  ideaId,
  clienteSlug,
  marcaColor,
  esRevisor,
  esEquipo,
  borrador,
  correcciones,
  children,
}: {
  ideaId: string;
  clienteSlug: string;
  marcaColor: string | null;
  esRevisor: boolean;
  esEquipo: boolean;
  /** El lead sigue armando la ronda (tarea en `under_review`): aún no se mandó. */
  borrador: boolean;
  /** Correcciones internas + cambios del cliente ENVIADOS (con `cliente:true`) —
   *  ambos de primera clase, mismo lifecycle/panel/gate/rondas (0038). */
  correcciones: Correccion[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [validando, startValidar] = useTransition();
  const [veredictos, setVeredictos] = useState<Map<string, VeredictoCambio>>(new Map());
  // Setters ESTABLES del workspace (identidad fija de React) para parchear el campo tras
  // "Aplicar" sin recargar. Se destructuran aparte para NO meter el objeto `ws` completo
  // (que cambia en cada edición de planos) en las deps del useMemo de abajo — eso reventaría
  // la memo de perf. Este provider vive DENTRO de <WorkspaceProvider> (page.tsx).
  const { setPlanos: setWsPlanos, setEstatico: setWsEstatico, bumpReseed } = useWorkspaceView();

  const validar = useCallback(
    () =>
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
    }),
    [ideaId],
  );

  const run = useCallback(
    (p: Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
      start(async () => {
        const res = await p;
        if (!res.ok) {
          toast.error(res.error ?? "No se pudo completar la acción.");
          return;
        }
        if (okMsg) toast.success(okMsg);
        router.refresh();
      }),
    [router],
  );

  // El value se MEMOIZA: sin esto era un objeto nuevo cada render, y como cada Campo/
  // CampoLectura del documento (30+ instancias) lo lee vía useCorrecciones(), cualquier
  // cambio de estado del provider re-renderizaba TODO el documento (reap perf).
  const value: Ctx = useMemo(
    () => ({
      ideaId,
      clienteSlug,
      marcaColor,
      esRevisor,
      borrador,
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
      marcar: (id, estado) => {
        // Señal de adopción (best-effort): al CONFIRMAR una corrección, si su veredicto de
        // H.Ü.E seguía sin aplicarse, cuenta como IGNORADO. No pisa un 'applied' (server).
        if (estado === "closed") void marcarVeredictoIgnorado(ideaId, id);
        run(
          setEstadoCorreccion(ideaId, id, estado),
          estado === "done" ? "Marcado como atendido" : estado === "closed" ? "Confirmado" : "Reabierto",
        );
      },
      confirmarCampo: (tabla, filaId, campo) =>
        run(confirmarCampoAction(ideaId, tabla, filaId, campo), "Campo confirmado"),
      descartar: (id) => run(descartarCorreccion(ideaId, id), "Corrección descartada"),
      veredictos,
      validando,
      validar,
      aplicarSugerencia: (correccion, textoNuevo) =>
        start(async () => {
          const res = await aplicarSugerenciaAction(ideaId, clienteSlug, correccion.id, textoNuevo);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          // SIN reload: parchea el campo EN MEMORIA (el documento lee de useWorkspace). Antes
          // recargaba (el estado del workspace no se re-siembra tras el write) — pero el reload
          // borraba TODOS los veredictos de H.Ü.E, obligando a re-correrlo (llamada pagada) tras
          // cada Aplicar. Ahora el campo se actualiza al instante y los demás veredictos siguen.
          const campo = correccion.targetCampo;
          const tabla = correccion.targetTabla;
          const filaId = correccion.targetFilaId;
          if (campo && tabla && filaId) {
            if (tabla === "planos") {
              setWsPlanos((prev) =>
                prev.map((p) => (p.id === filaId ? ({ ...p, [campo]: textoNuevo } as PlanoVista) : p)),
              );
            } else if (tabla === "estaticos") {
              // Guarda por id: sólo parchea si el estático en memoria es el que la corrección
              // apunta (defensa por si algún día hay más de un estático por idea).
              setWsEstatico((prev) =>
                prev && prev.id === filaId ? ({ ...prev, [campo]: textoNuevo } as EstaticoVista) : prev,
              );
            }
            // Fuerza el remount del <Campo> (uncontrolled) para que el editor muestre el
            // texto nuevo — sin esto, el patch al estado del workspace NO repinta la textarea
            // (siembra su valor una sola vez). La Vista cliente (CampoLectura) ya reflejaba
            // el cambio sola (lee `valor` directo); esto arregla el modo editor.
            bumpReseed(tabla, filaId, campo);
          }
          // El cambio ya está aplicado → marca su veredicto como HECHO ('si': el chip pasa a
          // verde, ya no un "no parece hecho" contradiciendo que el lead aplicó la sugerencia)
          // y quita su `aplicar` (el botón desaparece). El resto y TODOS los demás, intactos.
          setVeredictos((prev) => {
            const v = prev.get(correccion.id);
            if (!v) return prev;
            const n = new Map(prev);
            n.set(correccion.id, { ...v, hecho: "si", aplicar: null });
            return n;
          });
          toast.success("Sugerencia aplicada");
        }),
    }),
    [ideaId, clienteSlug, marcaColor, esRevisor, esEquipo, borrador, correcciones, pendiente, veredictos, validando, validar, run, setWsPlanos, setWsEstatico, bumpReseed],
  );

  return <CorreccionesCtx.Provider value={value}>{children}</CorreccionesCtx.Provider>;
}
