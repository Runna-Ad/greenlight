"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  guardarIntake,
  guardarBrief,
  type IntakeResultado,
} from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { Indicador, PanelConflicto, useAutoguardado } from "./campo";

type CampoIdea =
  | "duracion"
  | "trend"
  | "notas"
  | "entrega_url"
  | "entrega_num"
  | "legales_libres"
  | "nota_guion";
type CampoBrief = "description";

/**
 * Un campo del intake, con autoguardado por campo (hook compartido con el
 * cuerpo). Escribe a `ideas` (pasar `ideaId`) o a `briefs` (pasar `briefId`) —
 * exactamente uno de los dos. La forma es la de un dato del intake: una línea,
 * etiqueta chiquita, sin marco hasta enfocar; la cabecera es de lectura rápida.
 */
export function CampoIntake({
  ideaId,
  briefId,
  campo,
  label,
  valorInicial,
  placeholder,
  sugerencias,
  rows = 1,
  ancho,
  soloLectura,
  caja,
  refrescar,
  onGuardado,
}: {
  ideaId?: string;
  briefId?: string;
  campo: CampoIdea | CampoBrief;
  label: string;
  valorInicial: string | null;
  placeholder?: string;
  /** Sugerencias del vocabulario. No limitan: se puede escribir cualquier cosa. */
  sugerencias?: string[];
  rows?: number;
  ancho?: string;
  soloLectura?: boolean;
  /** Recuadro visible siempre (para que se lea "aquí se escribe", no un dato). */
  caja?: boolean;
  /** Al guardar bien, refresca la página (p. ej. duración → renombra archivos). */
  refrescar?: boolean;
  onGuardado?: (res: IntakeResultado) => void;
}) {
  const listaId = useId();
  const router = useRouter();
  const g = useAutoguardado(valorInicial, async (anterior, nuevo) => {
    const res = briefId
      ? await guardarBrief(briefId, campo as CampoBrief, anterior, nuevo)
      : await guardarIntake(ideaId!, campo as CampoIdea, anterior, nuevo);
    onGuardado?.(res);
    // La duración reescribe los nombres en la BD; refrescar re-renderiza para
    // que "Nombres de archivos" (en Rünna details) muestre los nuevos.
    if (refrescar && res.ok) router.refresh();
    return res;
  });

  // Recuadro visible (caja) vs. estilo dato (borde sólo al enfocar).
  const clase = cn(
    "w-full rounded text-xs text-foreground outline-none transition-colors",
    "placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring",
    caja
      ? "border border-input bg-background px-2 py-1.5"
      : "border border-transparent bg-transparent px-1 py-0.5 hover:border-input focus-visible:border-input",
    g.conflicto !== null && "border-status-corrections",
    soloLectura && "cursor-default hover:border-transparent",
  );

  // Cuando el contenedor ya trae su propia etiqueta (p. ej. el bloque de Link
  // de entrega), se pasa label="" y no se pinta el encabezado interno.
  const ariaLabel = label || placeholder || "campo";

  return (
    <div className={cn("min-w-0 leading-tight", ancho)}>
      {label && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {caja && !soloLectura && <Pencil className="size-2.5 text-muted-foreground/50" />}
          <Indicador estado={g.estado} />
        </div>
      )}

      {rows > 1 ? (
        <textarea
          value={g.valor}
          rows={rows}
          readOnly={soloLectura}
          onChange={(e) => g.alEscribir(e.target.value)}
          onBlur={g.alSalir}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn(clase, "resize-y")}
        />
      ) : (
        <>
          <input
            value={g.valor}
            readOnly={soloLectura}
            // autoComplete off: el navegador NO debe ofrecer su dropdown de
            // autocompletar (confunde en campos como Duración, que parecen
            // fechas). Las sugerencias propias sólo salen si se piden.
            autoComplete="off"
            list={sugerencias?.length ? listaId : undefined}
            onChange={(e) => g.alEscribir(e.target.value)}
            onBlur={g.alSalir}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={clase}
          />
          {sugerencias?.length ? (
            <datalist id={listaId}>
              {sugerencias.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ) : null}
        </>
      )}

      {g.conflicto !== null && (
        <PanelConflicto valorAjeno={g.conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
      )}
    </div>
  );
}
