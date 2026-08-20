"use client";

import { useEffect } from "react";
import { TriangleAlert, RotateCcw } from "lucide-react";

/**
 * Límite de error para TODO lo que vive bajo (app). Sin esto, cualquier throw en
 * un loader/página caía a la pantalla genérica de Next (sin estilo, en inglés, sin
 * salida). Aquí damos un estado propio, en español, con reintento (reset re-renderiza
 * el segmento). El error real se registra en consola para depurar.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Error en (app):", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--status-corrections)_16%,transparent)] text-status-corrections">
        <TriangleAlert className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">Algo salió mal</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Ocurrió un error al cargar esta sección. Puedes reintentar; si sigue pasando, avísale al equipo.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:brightness-110"
      >
        <RotateCcw className="size-4" /> Reintentar
      </button>
    </div>
  );
}
