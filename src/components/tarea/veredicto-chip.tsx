"use client";

import { Check, X, AlertTriangle } from "lucide-react";
import type { VeredictoCambio } from "@/app/(app)/[cliente]/tareas/[id]/validar-actions";

// La etiqueta ADVISORY de la IA sobre si un cambio ya se hizo. Sólo ayuda a
// revisar — el lead decide y confirma.
const CFG = {
  si: { label: "H.Ü.E: parece hecho", tone: "var(--status-completed)", Icon: Check },
  no: { label: "H.Ü.E: no parece hecho", tone: "var(--status-corrections)", Icon: X },
  parcial: { label: "H.Ü.E: a medias", tone: "var(--status-progress)", Icon: AlertTriangle },
} as const;

/**
 * Un CHIP compacto con el veredicto de H.Ü.E (verde=hecho, ámbar=a medias,
 * rojo=no). Al pasar el ratón despliega una tarjetita con la razón (una línea) y
 * la sugerencia. Mismo chip en el panel y en las tarjetas flotantes — consistente.
 * ADVISORY: el revisor sigue confirmando.
 */
export function VeredictoChip({ v }: { v: VeredictoCambio | undefined }) {
  if (!v) return null;
  const c = CFG[v.hecho];
  const tint = c.tone;
  return (
    <span className="group/hue relative inline-flex align-middle">
      <span
        tabIndex={0}
        className="inline-flex cursor-help items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          background: `color-mix(in srgb, ${tint} 16%, transparent)`,
          color: `color-mix(in srgb, ${tint} 78%, #000)`,
        }}
      >
        <c.Icon className="size-3" /> {c.label}
      </span>
      {(v.razon || v.sugerencia) && (
        <span
          role="tooltip"
          // Anclado a la DERECHA (abre hacia la izquierda): el chip de H.Ü.E es el
          // último de su fila y el panel vive pegado al borde derecho de la pantalla,
          // así que `left-0` lo empujaba fuera de vista y se cortaba. `right-0` lo abre
          // hacia adentro del panel/tarjeta, donde siempre hay espacio.
          className="pointer-events-none absolute right-0 top-full z-[70] mt-1 hidden w-64 max-w-[min(20rem,80vw)] rounded-lg border bg-card p-2 text-left shadow-lg group-hover/hue:block group-focus-within/hue:block"
          style={{ borderColor: `color-mix(in srgb, ${tint} 40%, var(--border))` }}
        >
          {v.razon && <span className="block text-[11px] leading-snug text-foreground">{v.razon}</span>}
          {v.sugerencia && (
            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
              <b className="text-foreground">Sugerencia:</b> {v.sugerencia}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
