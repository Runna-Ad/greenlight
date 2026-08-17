"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { PlanoVista, EstaticoVista } from "./preview-slide";

/**
 * El "borrador" en vivo de la tarea: lo que el editor tiene AHORA en pantalla,
 * incluso lo tecleado hace medio segundo que aún no se autoguardó. El chequeo de
 * ortografía (H.Ü.E) lo lee para revisar el texto ACTUAL — si leyera la BD podría
 * perderse los últimos cambios (el autosave es debounced + async → carrera).
 *
 * Se expone como funciones set/get (no el ref crudo) para no mutar desde fuera un
 * valor devuelto por un hook (regla react-hooks/refs).
 */
export type BorradorTarea = { planos: PlanoVista[]; estatico: EstaticoVista | null };

type BorradorApi = {
  /** Guarda el borrador vivo — lo llama el editor en cada cambio. */
  set: (b: BorradorTarea) => void;
  /** Lee el borrador vivo — lo lee el chequeo al mandar a revisión. */
  get: () => BorradorTarea;
};

const BorradorCtx = createContext<BorradorApi | null>(null);

export function BorradorProvider({ children }: { children: ReactNode }) {
  const ref = useRef<BorradorTarea>({ planos: [], estatico: null });
  const api = useMemo<BorradorApi>(
    () => ({
      set: (b) => {
        ref.current = b;
      },
      get: () => ref.current,
    }),
    [],
  );
  return <BorradorCtx.Provider value={api}>{children}</BorradorCtx.Provider>;
}

/** La API del borrador vivo, o null fuera del workspace. */
export const useBorrador = () => useContext(BorradorCtx);
