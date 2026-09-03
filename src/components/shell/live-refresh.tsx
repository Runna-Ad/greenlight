"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LIVE_EVENT } from "@/lib/live";

/** Varios avisos seguidos (un import, una reasignación con diff) → UN refresh. */
const DEBOUNCE_MS = 400;
/** Al volver a la pestaña: si hace más de esto que no se re-lee, re-leer (el socket
 *  pudo dormirse con la laptop). Corto para que "volví y está viejo" no exista. */
const FOCUS_MIN_MS = 15_000;

/**
 * La plataforma se entera SOLA de los cambios de estado / asignación (Pedro 2026-09-03):
 * escucha el canal privado de esta persona (`greenlight:user:<id>`, lo emite el trigger
 * de la 0062) y hace `router.refresh()`.
 *
 * Por qué `router.refresh()` y no reload: re-corre los server components y funde el
 * payload SIN perder el estado de cliente (useState, scroll) — un texto a medio escribir
 * en la tarea sigue ahí (la lección 2026-08-17: los editores guardan su texto en estado
 * propio, justo por eso no se pisa). Las vistas que copian props a estado (Board, la
 * campana) se sincronizan ellas mismas cuando llega la nueva entrega del servidor.
 *
 * Sin sesión (login apagado en local, o Supabase sin configurar) no se suscribe: queda
 * sólo el refresh al volver a la pestaña. Nunca rompe la página.
 */
export function LiveRefresh({ topic }: { topic: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // 0 hasta montar (Date.now() en render es impuro — react-hooks/purity); se sella en el efecto.
  const ultimo = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ultimo.current = Date.now();
    const refresh = () => {
      ultimo.current = Date.now();
      startTransition(() => router.refresh());
    };
    const programar = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    };
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimo.current > FOCUS_MIN_MS) refresh();
    };
    document.addEventListener("visibilitychange", alVolver);

    let limpiarCanal: (() => void) | null = null;
    if (topic) {
      try {
        // createBrowserClient (@supabase/ssr) es SINGLETON en el navegador: el doble
        // montaje de StrictMode no abre un segundo cliente ni un segundo socket.
        const supabase = createClient();
        let cancelado = false;
        let yaSuscrito = false;
        const canal = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: LIVE_EVENT }, programar);

        // setAuth(): el JWT de la sesión va al socket — sin él la policy del canal privado
        // rechaza el join. Se espera ANTES de suscribir.
        void supabase.realtime.setAuth().then(() => {
          if (cancelado) return;
          canal.subscribe((status) => {
            // Re-conexión (tras dormir, tras un corte): pudo perderse algo → re-leer.
            // CHANNEL_ERROR / TIMED_OUT no necesitan reintento propio: realtime-js
            // re-une el canal solo con backoff (rejoinTimer) y vuelve a pasar por aquí
            // como SUBSCRIBED; mientras tanto queda el refresh al volver a la pestaña.
            if (status === "SUBSCRIBED") {
              if (yaSuscrito) programar();
              yaSuscrito = true;
            }
          });
        });

        limpiarCanal = () => {
          cancelado = true;
          void supabase.removeChannel(canal);
        };
      } catch {
        // Sin URL/llave pública en este entorno: sólo queda el refresh al volver a la pestaña.
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      if (timer.current) clearTimeout(timer.current);
      limpiarCanal?.();
    };
  }, [topic, router]);

  return null;
}
