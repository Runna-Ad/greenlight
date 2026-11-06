"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import {
  guardarIntake,
  guardarBrief,
  type IntakeResultado,
} from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { urlsDe } from "@/lib/urls";
import { Indicador, PanelConflicto, useAutoguardado } from "./campo";

type CampoIdea =
  | "trend"
  | "notas"
  | "entrega_url"
  | "entrega_num"
  | "legales_libres"
  | "nota_guion"
  | "concepto"
  | "selling_points"
  | "comentarios_creativo";
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
  accion,
  onGuardado,
  onCambio,
  enlaces,
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
  /** Acción de guardado a la medida (p. ej. Selling Points, que guarda un arreglo).
   *  Si se pasa, reemplaza a guardarIntake/guardarBrief. */
  accion?: (anterior: string | null, nuevo: string | null) => Promise<IntakeResultado>;
  onGuardado?: (res: IntakeResultado) => void;
  /** Se llama en cada tecla (para vistas que reaccionan al valor en vivo). */
  onCambio?: (valor: string) => void;
  /** Debajo de la caja, los links que haya en el texto como botones clicables
   *  (un textarea no puede tener links). Pedido del equipo, 2026-11-05. */
  enlaces?: boolean;
}) {
  const listaId = useId();
  const router = useRouter();
  const g = useAutoguardado(
    valorInicial,
    async (anterior, nuevo) => {
      const res = accion
        ? await accion(anterior, nuevo)
        : briefId
          ? await guardarBrief(briefId, campo as CampoBrief, anterior, nuevo)
          : await guardarIntake(ideaId!, campo as CampoIdea, anterior, nuevo);
      onGuardado?.(res);
      // La duración reescribe los nombres en la BD; refrescar re-renderiza para
      // que "Nombres de archivos" (en Rünna details) muestre los nuevos.
      if (refrescar && res.ok) router.refresh();
      return res;
    },
    onCambio,
  );

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

      {enlaces && <Enlaces texto={g.valor} />}

      {g.conflicto !== null && (
        <PanelConflicto valorAjeno={g.conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
      )}
    </div>
  );
}

function Enlaces({ texto }: { texto: string }) {
  const urls = urlsDe(texto);
  if (!urls.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {urls.map((url) => {
        const href = /^https?:/i.test(url) ? url : `https://${url}`;
        // Etiqueta corta: dominio + inicio de la ruta; la URL completa va en el title.
        const corta = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/^www\./i, "").replace(/\?.*$/, "");
        return (
          <a
            key={url}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={url}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{corta.length > 48 ? `${corta.slice(0, 47)}…` : corta}</span>
          </a>
        );
      })}
    </div>
  );
}
