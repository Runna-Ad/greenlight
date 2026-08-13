"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { guardarCampo, type Tabla } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { useCorrecciones } from "./correcciones/contexto";
import { CampoCorrecciones } from "./correcciones/campo-correcciones";
import { Plus } from "lucide-react";
import {
  estadoCampo,
  keyCampo,
  resaltadosEnTexto,
  type EstadoCorreccion,
} from "@/lib/correcciones";

// Fondo del <mark> del resaltado en vivo: un tinte del color de estado, suave para
// que el texto (que va encima, en el textarea) siga legible.
const MARCA: Record<EstadoCorreccion, string> = {
  open: "color-mix(in srgb, var(--status-corrections) 32%, transparent)",
  done: "color-mix(in srgb, var(--status-progress) 34%, transparent)",
  closed: "color-mix(in srgb, var(--status-completed) 30%, transparent)",
};

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
  // Auto-descarta el "guardado" tras un momento: un campo en reposo no debe
  // cargar chrome permanente (lección de motion: el 20º uso no debe tener ruido).
  const limpioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (limpioTimer.current) clearTimeout(limpioTimer.current);
      limpioTimer.current = setTimeout(() => setEstado("limpio"), 1200);
      return;
    }
    if ("conflicto" in res && res.conflicto) setConflicto(res.valorActual ?? "");
    setEstado("error");
  };

  const alEscribir = (v: string) => {
    setValor(v);
    onCambio?.(v);
    setEstado("pendiente");
    if (limpioTimer.current) clearTimeout(limpioTimer.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistir(v), 800);
  };

  const alSalir = () => {
    if (timer.current) clearTimeout(timer.current);
    void persistir(valor);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (limpioTimer.current) clearTimeout(limpioTimer.current);
  }, []);

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

  // Resaltado en vivo de las frases corregidas + captura de nuevas selecciones.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [seleccion, setSeleccion] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [componiendoSel, setComponiendoSel] = useState(false);
  const [textoSel, setTextoSel] = useState("");

  const resaltados = ctx ? resaltadosEnTexto(valor, cs) : [];
  const hayResaltado = resaltados.length > 0;

  // Partir el texto en segmentos [texto | frase resaltada] para el mirror.
  const segmentos: { texto: string; estado?: EstadoCorreccion }[] = [];
  {
    let i = 0;
    for (const r of resaltados) {
      if (r.start > i) segmentos.push({ texto: valor.slice(i, r.start) });
      segmentos.push({ texto: valor.slice(r.start, r.end), estado: r.estado });
      i = r.end;
    }
    if (i < valor.length) segmentos.push({ texto: valor.slice(i) });
  }

  const puedeSeleccionar = !!ctx?.esRevisor && !soloLectura;
  const capturarSeleccion = () => {
    const ta = taRef.current;
    if (!ta || !puedeSeleccionar) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (e > s) setSeleccion({ start: s, end: e, quote: valor.slice(s, e) });
    else if (!componiendoSel) setSeleccion(null);
  };
  const sincronizarScroll = () => {
    if (mirrorRef.current && taRef.current) mirrorRef.current.scrollTop = taRef.current.scrollTop;
  };
  const fijarSeleccion = () => {
    if (!ctx || !seleccion || !textoSel.trim()) return;
    ctx.pedir(
      { tabla, filaId, campo, label: etiqueta, quote: seleccion.quote, start: seleccion.start, end: seleccion.end },
      textoSel.trim(),
    );
    setTextoSel("");
    setComponiendoSel(false);
    setSeleccion(null);
  };

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

      <div className="relative">
        {/* Mirror BAJO el textarea: pinta el fondo del <mark> de cada frase
            corregida; el texto real (y el cursor) van en el textarea de encima
            (fondo transparente). Best-effort: si el texto cambia y la frase ya
            no está, no se pinta (el quote sigue en el panel). */}
        {hayResaltado && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-background px-2.5 py-1.5 text-sm leading-relaxed text-transparent [scrollbar-gutter:stable]",
              mono && "font-mono",
            )}
          >
            {segmentos.map((sg, i) =>
              sg.estado ? (
                <mark key={i} style={{ background: MARCA[sg.estado], color: "transparent", borderRadius: "2px" }}>
                  {sg.texto}
                </mark>
              ) : (
                <span key={i}>{sg.texto}</span>
              ),
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          value={valor}
          rows={rows}
          readOnly={soloLectura}
          onChange={(e) => g.alEscribir(e.target.value)}
          onBlur={g.alSalir}
          onScroll={hayResaltado ? sincronizarScroll : undefined}
          onSelect={puedeSeleccionar ? capturarSeleccion : undefined}
          onMouseUp={puedeSeleccionar ? capturarSeleccion : undefined}
          onKeyUp={puedeSeleccionar ? capturarSeleccion : undefined}
          placeholder={placeholder}
          aria-label={label}
          style={
            conflicto === null && estadoCorr
              ? { boxShadow: ANILLO[estadoCorr], borderColor: ANILLO_BORDE[estadoCorr] }
              : undefined
          }
          className={cn(
            "relative w-full resize-y rounded-md border px-2.5 py-1.5 text-sm leading-relaxed outline-none transition-colors [scrollbar-gutter:stable]",
            hayResaltado ? "bg-transparent" : "bg-background",
            "placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring",
            mono && "font-mono",
            conflicto !== null ? "border-status-corrections" : "border-input",
            soloLectura && "cursor-default",
            soloLectura && !hayResaltado && "bg-secondary/40",
          )}
        />

        {/* Al resaltar texto (sólo revisor): "Pedir cambio aquí" anclado a la frase. */}
        {seleccion && puedeSeleccionar && !componiendoSel && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setComponiendoSel(true); setTextoSel(""); }}
            className="absolute left-1.5 top-1.5 z-30 inline-flex items-center gap-1 rounded-full border border-status-corrections/50 bg-card px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--status-corrections)_72%,#000)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--status-corrections)_80%,#000)] hover:text-white"
          >
            <Plus className="size-3" /> Pedir cambio aquí
          </button>
        )}
      </div>

      {/* Compositor de la corrección anclada a la selección. */}
      {componiendoSel && seleccion && (
        <div className="relative z-30 mt-2 rounded-lg border border-border-strong bg-secondary p-2.5 shadow-sm">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Cambio para <b className="text-status-corrections">&laquo;{seleccion.quote}&raquo;</b> en {etiqueta}
          </p>
          <textarea
            value={textoSel}
            onChange={(e) => setTextoSel(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe el cambio que quieres para este texto…"
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={ctx?.pendiente || !textoSel.trim()}
              onClick={fijarSeleccion}
              className="rounded-md bg-[color-mix(in_srgb,var(--status-corrections)_78%,#000)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Fijar cambio
            </button>
            <button
              type="button"
              onClick={() => { setComponiendoSel(false); setSeleccion(null); }}
              className="rounded-md border border-border px-3 py-1 text-[12px] font-medium hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {conflicto !== null && (
        <PanelConflicto valorAjeno={conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
      )}

      {ctx && (
        <CampoCorrecciones
          tabla={tabla}
          filaId={filaId}
          campo={campo}
          etiqueta={etiqueta}
          cs={cs}
          campoVacio={valor.trim() === ""}
        />
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
  // key={estado} re-monta el span en cada cambio → re-dispara la animación de
  // entrada. El "guardado" se auto-descarta (timer en useAutoguardado).
  return (
    <span key={estado} className={cn("gl-rise-in inline-flex items-center gap-1 text-[10px]", color)}>
      {estado === "guardado" && <Check className="size-3" />}
      {texto}
    </span>
  );
}
