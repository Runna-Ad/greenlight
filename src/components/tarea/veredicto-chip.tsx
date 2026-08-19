"use client";

import { Check, X, AlertTriangle } from "lucide-react";
import type { VeredictoCambio } from "@/app/(app)/[cliente]/tareas/[id]/validar-actions";

// La etiqueta ADVISORY de la IA sobre si un cambio ya se hizo. Sólo ayuda a
// confirmar más rápido — el revisor decide. El `title` lleva la razón.
const CFG = {
  si: { label: "H.Ü.E: parece hecho", tone: "var(--status-completed)", Icon: Check },
  no: { label: "H.Ü.E: no parece hecho", tone: "var(--status-corrections)", Icon: X },
  parcial: { label: "H.Ü.E: a medias", tone: "var(--status-progress)", Icon: AlertTriangle },
} as const;

export function VeredictoChip({ v }: { v: VeredictoCambio | undefined }) {
  if (!v) return null;
  const c = CFG[v.hecho];
  return (
    <span
      title={v.razon || undefined}
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${c.tone} 16%, transparent)`,
        color: `color-mix(in srgb, ${c.tone} 78%, #000)`,
      }}
    >
      <c.Icon className="size-3" /> {c.label}
    </span>
  );
}
