"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { marcarArchivoVisto } from "@/app/(app)/[cliente]/portal/archivo-actions";

/**
 * Al abrir el Archivo, guarda la visita (una vez). Mientras lo lee no se recarga nada: las
 * etiquetas «Nuevo» se quedan. Al SALIR se refresca, porque el menú vive en el layout y Next
 * no lo vuelve a pintar entre páginas: sin esto el número viejo regresaba. (revisión 0101)
 */
export function MarcarArchivoVisto() {
  const router = useRouter();
  const guardado = useRef<Promise<void> | null>(null);
  useEffect(() => {
    guardado.current ??= marcarArchivoVisto().catch(() => {});
    const p = guardado.current;
    return () => { p.then(() => router.refresh()); };
  }, [router]);
  return null;
}
