"use client";

import { useId } from "react";
import { guardarIntake, type IntakeResultado } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { Indicador, PanelConflicto, useAutoguardado } from "./campo";

/**
 * Un campo de la CABECERA (vive en `ideas`, no en la tabla de la plantilla).
 *
 * Mismo autoguardado que el cuerpo — el hook es compartido — pero con la forma
 * de un dato del intake: una línea, etiqueta chiquita arriba, sin marco cuando
 * no se está editando. La cabecera es de lectura rápida; un textarea con borde
 * por cada campo la convertiría en un formulario.
 */
export function CampoIntake({
  ideaId,
  campo,
  label,
  valorInicial,
  placeholder,
  sugerencias,
  rows = 1,
  ancho,
  soloLectura,
  onGuardado,
}: {
  ideaId: string;
  campo: "duracion" | "trend" | "notas";
  label: string;
  valorInicial: string | null;
  placeholder?: string;
  /** Sugerencias del vocabulario. No limitan: se puede escribir cualquier cosa. */
  sugerencias?: string[];
  rows?: number;
  ancho?: string;
  soloLectura?: boolean;
  onGuardado?: (res: IntakeResultado) => void;
}) {
  const listaId = useId();
  const g = useAutoguardado(valorInicial, async (anterior, nuevo) => {
    const res = await guardarIntake(ideaId, campo, anterior, nuevo);
    onGuardado?.(res);
    return res;
  });

  const clase = cn(
    "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground outline-none transition-colors",
    "hover:border-input focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring",
    "placeholder:text-muted-foreground/55",
    g.conflicto !== null && "border-status-corrections",
    soloLectura && "cursor-default hover:border-transparent",
  );

  return (
    <div className={cn("min-w-0 leading-tight", ancho)}>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Indicador estado={g.estado} />
      </div>

      {rows > 1 ? (
        <textarea
          value={g.valor}
          rows={rows}
          readOnly={soloLectura}
          onChange={(e) => g.alEscribir(e.target.value)}
          onBlur={g.alSalir}
          placeholder={placeholder}
          aria-label={label}
          className={cn(clase, "resize-y")}
        />
      ) : (
        <>
          <input
            value={g.valor}
            readOnly={soloLectura}
            list={sugerencias?.length ? listaId : undefined}
            onChange={(e) => g.alEscribir(e.target.value)}
            onBlur={g.alSalir}
            placeholder={placeholder}
            aria-label={label}
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
