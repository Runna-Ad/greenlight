"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/prisma/copy";

const KEY = "prisma_lang";
const EVENTO = "prisma-lang";

/** Lee el idioma guardado; sin storage (modo privado, SSR) cae a "es". */
function leer(): Lang {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

function suscribir(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO, cb);
  };
}

/**
 * Idioma de la interfaz de HÜE Prisma. Español por defecto; se recuerda en el
 * navegador. `useSyncExternalStore` en vez de useEffect+setState: el servidor
 * renderiza "es" (snapshot de servidor) y el cliente adopta lo guardado sin
 * disparar renders en cascada. Local al módulo: el resto de Greenlight sigue en
 * español.
 */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(suscribir, leer, () => "es" as Lang);
  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      /* sin storage: el cambio no persiste, pero el evento re-renderiza igual */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [lang, setLang];
}
