"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { PlanoVista, EstaticoVista } from "./preview-slide";

/**
 * El estado compartido del workspace de una tarea. Reemplaza al viejo
 * BorradorProvider (que sólo guardaba un ref para el chequeo de ortografía):
 * ahora el estado vive en UN lugar y lo leen todas las piezas de la nueva
 * disposición, que están repartidas entre secciones:
 *
 *   - `verCliente`: el toggle "Vista cliente / Vista editor" (barra inferior).
 *     Lo leen la cabecera, las pestañas (ocultan Rünna tools), el documento
 *     (modo lectura) y el sub-header (botones de cliente vs. editor).
 *   - `planos` / `estatico`: el cuerpo en vivo. Lo escribe el documento y el
 *     "Pegar guión"; lo leen el read-time (barra inferior), las reglas y el
 *     chequeo de ortografía al mandar a revisión.
 *
 * Antes eran funciones set/get sobre un ref (para no mutar un ref devuelto por
 * un hook); aquí es estado normal de React expuesto por contexto — cambiar los
 * planos DEBE re-renderizar el documento, así que el estado reactivo es lo
 * correcto y no hay ref que mutar.
 */
export type WorkspaceApi = {
  verCliente: boolean;
  setVerCliente: (v: boolean) => void;
  planos: PlanoVista[];
  setPlanos: Dispatch<SetStateAction<PlanoVista[]>>;
  estatico: EstaticoVista | null;
  setEstatico: Dispatch<SetStateAction<EstaticoVista | null>>;
};

const WorkspaceCtx = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({
  planosIniciales,
  estaticoInicial,
  children,
}: {
  planosIniciales: PlanoVista[];
  estaticoInicial: EstaticoVista | null;
  children: ReactNode;
}) {
  // Por defecto editable (agencia); "Vista cliente" lo pasa a lectura. Es un
  // toggle en memoria (no cookie), a diferencia del rol gl_view_as del sistema.
  const [verCliente, setVerCliente] = useState(false);
  const [planos, setPlanos] = useState(planosIniciales);
  const [estatico, setEstatico] = useState(estaticoInicial);

  const api = useMemo<WorkspaceApi>(
    () => ({ verCliente, setVerCliente, planos, setPlanos, estatico, setEstatico }),
    [verCliente, planos, estatico],
  );

  return <WorkspaceCtx.Provider value={api}>{children}</WorkspaceCtx.Provider>;
}

/** El estado del workspace. Lanza si se usa fuera del provider (siempre dentro). */
export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>.");
  return ctx;
}
