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
/**
 * El estado se parte en DOS contextos por FRECUENCIA de cambio (reap perf 2026-08-26):
 *
 *   - VISTA (`WorkspaceView`): `verCliente` + los setters (estables). Cambia sólo
 *     al alternar Vista cliente/editor — es decir, casi nunca.
 *   - DOCUMENTO (`WorkspaceDoc`): `planos`/`estatico`/`reseed`. Cambia en CADA tecla
 *     (el autoguardado escribe el cuerpo vivo).
 *
 * Antes todo vivía en UN objeto de contexto, así que teclear un carácter cambiaba su
 * identidad y re-renderizaba a TODOS los consumidores — incluidos hero/pestañas/
 * detalles/banner que sólo leen `verCliente`. Con la partición, esos leen `useWorkspaceView`
 * y ya no re-renderizan al teclear. Los consumidores del documento usan `useWorkspace`
 * (mezcla ambos) como antes — su API no cambia.
 */
type WorkspaceView = {
  verCliente: boolean;
  setVerCliente: (v: boolean) => void;
  setPlanos: Dispatch<SetStateAction<PlanoVista[]>>;
  setEstatico: Dispatch<SetStateAction<EstaticoVista | null>>;
  /** Sube el nonce de re-siembra de un campo (setter estable). */
  bumpReseed: (tabla: string, filaId: string, campo: string) => void;
};

type WorkspaceDoc = {
  planos: PlanoVista[];
  estatico: EstaticoVista | null;
  /** Nonce de "re-siembra" por campo (`tabla|filaId|campo` → contador). Sube cuando algo
   *  EXTERNO reescribe un campo (p. ej. "Aplicar" de H.Ü.E) para forzar el REMOUNT de ese
   *  <Campo> — que es uncontrolled (siembra su textarea una sola vez con `valorInicial`),
   *  así que sin remount no mostraría el texto nuevo. El TECLEO no lo sube (no queremos
   *  remontar mientras se escribe). Lo lee CampoDoc para keyear su <Campo>. */
  reseed: Record<string, number>;
};

export type WorkspaceApi = WorkspaceView & WorkspaceDoc;

/** Clave de re-siembra de un campo — estable entre el que sube el nonce y el que lo lee. */
export const reseedKey = (tabla: string, filaId: string, campo: string) => `${tabla}|${filaId}|${campo}`;

const ViewCtx = createContext<WorkspaceView | null>(null);
const DocCtx = createContext<WorkspaceDoc | null>(null);

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

  // VISTA: cambia identidad SÓLO cuando `verCliente` alterna (los setters son estables).
  const view = useMemo<WorkspaceView>(
    () => ({ verCliente, setVerCliente, setPlanos, setEstatico, bumpReseed }),
    [verCliente, bumpReseed],
  );
  // DOCUMENTO: cambia identidad en cada tecla (planos/estatico) o re-siembra.
  const doc = useMemo<WorkspaceDoc>(() => ({ planos, estatico, reseed }), [planos, estatico, reseed]);

  return (
    <ViewCtx.Provider value={view}>
      <DocCtx.Provider value={doc}>{children}</DocCtx.Provider>
    </ViewCtx.Provider>
  );
}

/** Sólo el estado de VISTA (verCliente + setters). Los consumidores que sólo leen esto
 *  (hero, pestañas, detalles, banner, correcciones, copies) NO re-renderizan al teclear. */
export function useWorkspaceView(): WorkspaceView {
  const ctx = useContext(ViewCtx);
  if (!ctx) throw new Error("useWorkspaceView debe usarse dentro de <WorkspaceProvider>.");
  return ctx;
}

/** El estado COMPLETO del workspace (vista + documento). Lo usan los consumidores del
 *  cuerpo (documento, portal, acciones, read-time). Re-renderiza al teclear — es lo que
 *  necesitan. API idéntica a antes. */
export function useWorkspace(): WorkspaceApi {
  const view = useContext(ViewCtx);
  const doc = useContext(DocCtx);
  if (!view || !doc) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>.");
  return useMemo<WorkspaceApi>(() => ({ ...view, ...doc }), [view, doc]);
}
