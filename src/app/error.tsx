"use client";

import { useEffect } from "react";
import { TriangleAlert, RotateCcw } from "lucide-react";

/**
 * Límite de error del ROOT: cubre lo que vive FUERA de (app) — /login, /portal/login,
 * /auth. Antes esas rutas caían al global-error (pantalla mínima sin estilos). Misma
 * pantalla que (app)/error.tsx, en español y con reintento. (reap 2026-09-02)
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Error (root):", error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--status-corrections)_16%,transparent)] text-status-corrections">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-foreground">Algo salió mal</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Ocurrió un error al cargar esta página. Puedes reintentar; si sigue pasando, avísale al equipo.
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
    </div>
  );
}
