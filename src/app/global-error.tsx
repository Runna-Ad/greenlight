"use client";

import { useEffect } from "react";

/**
 * Último recurso: si el propio ROOT layout revienta, `(app)/error.tsx` no alcanza a
 * montarse (Next reemplaza el layout entero). global-error debe traer su propio
 * <html>/<body> y no puede depender del CSS global, así que va con estilos inline —
 * una pantalla mínima, legible, en español, con recargar.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Error global:", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0f",
          color: "#e7e7ea",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Algo salió mal</h2>
          <p style={{ fontSize: 14, color: "#a1a1aa", marginTop: 8 }}>
            Ocurrió un error inesperado. Vuelve a intentarlo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              color: "#0b0b0f",
              background: "#e7e7ea",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
