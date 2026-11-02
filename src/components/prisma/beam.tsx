"use client";

/**
 * El haz del prisma: la firma visual de HÜE Prisma. Puro CSS (ver prisma.css).
 *
 * Estados (data-estado):
 *  - "idle":        el haz entra, el prisma lo abre en espectro que fluye despacio.
 *  - "escribiendo": el abanico respira (abre/cierra): es el indicador de que H.Ü.E
 *                   está trabajando, en vez de un spinner genérico.
 *  - "listo":       el espectro se resuelve en UN color, el de la herramienta.
 *
 * Es decorativo para el lector de pantalla (aria-hidden): el estado real se anuncia
 * en texto donde corresponde.
 */
export function Beam({ estado, color, className }: { estado: "idle" | "escribiendo" | "listo"; color?: string | null; className?: string }) {
  return (
    <div
      className={`p-beam ${className ?? ""}`}
      data-estado={estado}
      style={color ? ({ "--p-tool": color } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      <span className="p-beam-in" />
      <span className="p-prism" />
      <span className="p-beam-out" />
    </div>
  );
}
