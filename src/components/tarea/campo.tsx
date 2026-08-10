"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { guardarCampo, type Tabla } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { useCorrecciones } from "./correcciones/contexto";
import { CampoCorrecciones } from "./correcciones/campo-correcciones";
import { estadoCampo, keyCampo, type EstadoCorreccion } from "@/lib/correcciones";

const ANILLO: Record<EstadoCorreccion, string> = {
  open: "0 0 0 3px color-mix(in srgb, var(--status-corrections) 16%, transparent)",
  done: "0 0 0 3px color-mix(in srgb, var(--status-progress) 16%, transparent)",
  closed: "0 0 0 3px color-mix(in srgb, var(--status-completed) 14%, transparent)",
};
const ANILLO_BORDE: Record<EstadoCorreccion, string> = {
  open: "color-mix(in srgb, var(--status-corrections) 55%, transparent)",
  done: "color-mix(in srgb, var(--status-progress) 55%, transparent)",
  closed: "color-mix(in srgb, var(--status-completed) 50%, transparent)",
};

export type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "guardado" | "error";

/** Lo mínimo que el autoguardado necesita saber de una respuesta del servidor. */
export type ResultadoGuardado =
  | { ok: true }
  | { ok: false; conflicto: true; valorActual: string | null }
  | { ok: false; conflicto?: false; error: string };

/**
 * El autoguardado, sin UI: debounce, flush al salir y resolución de conflicto.
 *
 * Vive en un hook porque hay dos superficies que lo necesitan con formas muy
 * distintas — el cuerpo de la plantilla (`Campo`, textarea grande) y la
 * cabecera (`CampoIntake`, una línea entre los datos del intake). Duplicar la
 * lógica haría que un arreglo en una se olvidara en la otra.
 */
export function useAutoguardado(
  valorInicial: string | null,
  guardar: (anterior: string | null, nuevo: string | null) => Promise<ResultadoGuardado>,
  onCambio?: (valor: string) => void,
) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [estado, setEstado] = useState<EstadoGuardado>("limpio");
  const [conflicto, setConflicto] = useState<string | null>(null);
  const guardado = useRef<string | null>(valorInicial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `guardar` se toma de ESTA renderización a propósito: el debounce se arma
  // dentro de alEscribir, que se recrea con cada tecla, así que la función que
  // acaba disparando es la de la misma renderización que el texto que manda.
  const persistir = async (v: string) => {
    if ((guardado.current ?? "") === v) return;
    setEstado("guardando");
    const res = await guardar(guardado.current, v || null);
    if (res.ok) {
      guardado.current = v || null;
      setEstado("guardado");
      return;
    }
    if ("conflicto" in res && res.conflicto) setConflicto(res.valorActual ?? "");
    setEstado("error");
  };

  const alEscribir = (v: string) => {
    setValor(v);
    onCambio?.(v);
    setEstado("pendiente");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistir(v), 800);
  };

  const alSalir = () => {
    if (timer.current) clearTimeout(timer.current);
    void persistir(valor);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return {
    valor,
    estado,
    conflicto,
    alEscribir,
    alSalir,
    /** Me quedo con lo mío: se acepta el valor ajeno como base y se reescribe. */
    quedarme: () => {
      guardado.current = conflicto || null;
      setConflicto(null);
      void persistir(valor);
    },
    /** Tomo lo suyo: se descarta lo mío, sin escribir nada. */
    tomarSuyo: () => {
      const suyo = conflicto ?? "";
      setValor(suyo);
      onCambio?.(suyo);
      guardado.current = suyo || null;
      setConflicto(null);
      setEstado("limpio");
    },
  };
}

/**
 * Un campo de la plantilla, con autoguardado por CAMPO.
 *
 * No hay botón de guardar: el indicador ES la afordancia. Debounce de 800 ms y
 * flush al salir del campo, para que salir de la pantalla no pierda lo último.
 *
 * Si otra persona cambió el mismo campo mientras escribías, no se descarta nada
 * en silencio: se enseñan los dos valores y decides.
 */
export function Campo({
  tabla,
  filaId,
  campo,
  label,
  valorInicial,
  placeholder,
  rows = 3,
  mono,
  soloLectura,
  onCambio,
  grupoCorreccion,
}: {
  tabla: Tabla;
  filaId: string;
  campo: string;
  label: string;
  valorInicial: string | null;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  soloLectura?: boolean;
  /** Para que el preview se actualice en la misma tecla, sin ir al servidor. */
  onCambio?: (valor: string) => void;
  /** Prefijo de la etiqueta de la corrección, p. ej. "Plano 1". */
  grupoCorreccion?: string;
}) {
  const g = useAutoguardado(
    valorInicial,
    (anterior, nuevo) => guardarCampo(tabla, filaId, campo, anterior, nuevo),
    onCambio,
  );
  const { valor, estado, conflicto } = g;

  // Correcciones fijadas a ESTE campo (si el workspace las provee).
  const ctx = useCorrecciones();
  const cs = ctx ? ctx.deCampo(tabla, filaId, campo) : [];
  const estadoCorr = estadoCampo(cs);
  const etiqueta = grupoCorreccion ? `${grupoCorreccion} · ${label}` : label;

  return (
    <div
      className="group relative min-w-0 scroll-mt-24"
      data-campo-key={ctx ? keyCampo(tabla, filaId, campo) : undefined}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Indicador estado={estado} />
      </div>

      <textarea
        value={valor}
        rows={rows}
        readOnly={soloLectura}
        onChange={(e) => g.alEscribir(e.target.value)}
        onBlur={g.alSalir}
        placeholder={placeholder}
        aria-label={label}
        style={
          conflicto === null && estadoCorr
            ? { boxShadow: ANILLO[estadoCorr], borderColor: ANILLO_BORDE[estadoCorr] }
            : undefined
        }
        className={cn(
          "w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-[13px] leading-relaxed outline-none transition-colors",
          "placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring",
          mono && "font-mono",
          conflicto !== null ? "border-status-corrections" : "border-input",
          soloLectura && "cursor-default bg-secondary/40",
        )}
      />

      {conflicto !== null && (
        <PanelConflicto valorAjeno={conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
      )}

      {ctx && (
        <CampoCorrecciones tabla={tabla} filaId={filaId} campo={campo} etiqueta={etiqueta} cs={cs} />
      )}
    </div>
  );
}

/**
 * Dos valores, una decisión. Nunca se descarta nada en silencio — es la misma
 * familia de fallo que el `row_hash: "imported"`: perder trabajo sin error.
 */
export function PanelConflicto({
  valorAjeno,
  quedarme,
  tomarSuyo,
}: {
  valorAjeno: string;
  quedarme: () => void;
  tomarSuyo: () => void;
}) {
  return (
    <div className="mt-1.5 rounded-md border border-status-corrections bg-[color-mix(in_srgb,var(--status-corrections)_8%,transparent)] p-2 text-[11px]">
      <p className="flex items-center gap-1.5 font-medium text-status-corrections">
        <AlertTriangle className="size-3.5 shrink-0" />
        Alguien más cambió este campo mientras escribías
      </p>
      <p className="mt-1.5 text-muted-foreground">
        Ahora dice: <span className="text-foreground">{valorAjeno || "(vacío)"}</span>
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={quedarme}
          className="rounded bg-status-corrections px-2 py-1 font-medium text-white"
        >
          Quedarme con lo mío
        </button>
        <button
          onClick={tomarSuyo}
          className="rounded border border-border px-2 py-1 font-medium text-foreground hover:bg-secondary"
        >
          Tomar lo suyo
        </button>
      </div>
    </div>
  );
}

export function Indicador({ estado }: { estado: EstadoGuardado }) {
  if (estado === "limpio") return null;
  const texto = {
    pendiente: "sin guardar",
    guardando: "guardando…",
    guardado: "guardado",
    error: "no se pudo guardar",
  }[estado];
  const color =
    estado === "guardado"
      ? "text-status-completed"
      : estado === "error"
        ? "text-status-corrections"
        : "text-muted-foreground";
  return <span className={cn("text-[10px]", color)}>{texto}</span>;
}
