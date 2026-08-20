"use client";

import {
  createContext,
  useCallback,
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
  /** Nonce de "re-siembra" por campo (`tabla|filaId|campo` → contador). Sube cuando algo
   *  EXTERNO reescribe un campo (p. ej. "Aplicar" de H.Ü.E) para forzar el REMOUNT de ese
   *  <Campo> — que es uncontrolled (siembra su textarea una sola vez con `valorInicial`),
   *  así que sin remount no mostraría el texto nuevo. El TECLEO no lo sube (no queremos
   *  remontar mientras se escribe). Lo lee CampoDoc para keyear su <Campo>. */
  reseed: Record<string, number>;
  bumpReseed: (tabla: string, filaId: string, campo: string) => void;
};

/** Clave de re-siembra de un campo — estable entre el que sube el nonce y el que lo lee. */
export const reseedKey = (tabla: string, filaId: string, campo: string) => `${tabla}|${filaId}|${campo}`;

const WorkspaceCtx = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({
  planosIniciales,
  estaticoInicial,
  verClienteInicial = false,
  children,
}: {
  planosIniciales: PlanoVista[];
  estaticoInicial: EstaticoVista | null;
  /** Vista inicial: los leads/admin arrancan en "Vista cliente" (revisan), los
      especialistas en "Vista editor" (producen). Sigue siendo un toggle. */
  verClienteInicial?: boolean;
  children: ReactNode;
}) {
  // "Vista cliente" pasa el documento a lectura; el toggle vive en memoria (no
  // cookie), a diferencia del rol gl_view_as del sistema.
  const [verCliente, setVerCliente] = useState(verClienteInicial);
  const [planos, setPlanos] = useState(planosIniciales);
  const [estatico, setEstatico] = useState(estaticoInicial);
  const [reseed, setReseed] = useState<Record<string, number>>({});

  const bumpReseed = useCallback((tabla: string, filaId: string, campo: string) => {
    const k = reseedKey(tabla, filaId, campo);
    setReseed((prev) => ({ ...prev, [k]: (prev[k] ?? 0) + 1 }));
  }, []);

  const api = useMemo<WorkspaceApi>(
    () => ({ verCliente, setVerCliente, planos, setPlanos, estatico, setEstatico, reseed, bumpReseed }),
    [verCliente, planos, estatico, reseed, bumpReseed],
  );

  return <WorkspaceCtx.Provider value={api}>{children}</WorkspaceCtx.Provider>;
}

/** El estado del workspace. Lanza si se usa fuera del provider (siempre dentro). */
export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>.");
  return ctx;
}
