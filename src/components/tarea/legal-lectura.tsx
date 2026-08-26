"use client";

import { Scale } from "lucide-react";
import { CampoLectura } from "./campo-lectura";
import { keyCampo } from "@/lib/correcciones";

/**
 * El bloque de LEGALES en modo lectura ANCLABLE. Reusa CampoLectura (el mismo
 * "selecciona texto → Pedir cambio aquí" de los planos), así el cliente puede
 * pedir cambios sobre el legal en el portal Y el revisor los ve/gestiona en la
 * Vista cliente interna — igual que Copies. El destino de la corrección es
 * (tabla:"ideas", campo:"legal", fila:ideaId): el legal es uno por guión, así que
 * un solo campo virtual lo ancla sin tabla nueva. Un partner sin contexto ve el
 * texto tal cual (`pretty`).
 */
export function LegalLectura({
  ideaId,
  legal,
  titulo,
}: {
  ideaId: string;
  legal: string;
  titulo: string;
}) {
  return (
    <section
      // Ancla para "Ver campo" del panel de correcciones (mismo data-campo-key que
      // el editor y que CampoLectura): el legal se ancla como (ideas · idea · "legal"),
      // así el salto+flash del panel cae en la vista de lectura del legal.
      data-campo-key={keyCampo("ideas", ideaId, "legal")}
      className="overflow-hidden rounded-xl border border-[#2d2b55]/20 bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 bg-[#2d2b55] px-4 py-2.5 text-white">
        <Scale className="size-4" />
        <h3 className="text-[12px] font-bold uppercase tracking-widest">{titulo}</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-white/60">Legales</span>
      </div>
      <div className="p-4">
        <CampoLectura
          tabla="ideas"
          filaId={ideaId}
          campo="legal"
          label="Legal"
          valor={legal}
          icono={<Scale className="size-3" />}
          pretty={<span className="whitespace-pre-wrap text-[11px] leading-snug text-foreground">{legal}</span>}
        />
      </div>
    </section>
  );
}
