"use client";

import { useEffect, useRef } from "react";
import { marcarArchivoVisto } from "@/app/(app)/[cliente]/portal/archivo-actions";

/** Al abrir el Archivo, guarda la visita (una vez). La página no se recarga: las etiquetas
 *  «Nuevo» se quedan mientras la lee, y el número del menú baja en la siguiente navegación. */
export function MarcarArchivoVisto() {
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    marcarArchivoVisto().catch(() => {});
  }, []);
  return null;
}
