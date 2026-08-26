"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react-dom";
import { guardarCampo, type Tabla } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";
import { useCorrecciones } from "./correcciones/contexto";
import { CampoCorrecciones } from "./correcciones/campo-correcciones";
import { SelectorTipoCambio, TagTipoCambio, BadgeCliente } from "./selector-tipo-cambio";
import { VeredictoChip } from "./veredicto-chip";
import { type CategoriaCambio } from "@/lib/tipos-cambio";
import {
  estadoCampo,
  keyCampo,
  resaltadosEnTexto,
  PIN_BG,
  MARCA,
  ETIQUETA_ESTADO,
  type EstadoCorreccion,
} from "@/lib/correcciones";

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
// React.memo: dentro del subárbol del documento, DocumentoTarea re-renderiza en cada
// tecla (el cuerpo vivo cambia). Con las props del campo ya estabilizadas por CampoDoc
// (onCambio vía useCallback, resto por-valor/estable), el memo hace que un campo NO se
// re-renderice cuando lo que cambió fue OTRO campo. (reap perf 2026-08-26)
export const Campo = memo(function Campo({
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
  inline,
  icono,
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
  /** Variante "documento": campo sin bordes, auto-alto, con ícono a la izquierda,
   *  para que EDITAR se vea igual que el slide del cliente (WYSIWYG). */
  inline?: boolean;
  /** Ícono que precede la etiqueta en la variante inline (del mockup de Pedro). */
  icono?: ReactNode;
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
  const [categoriaSel, setCategoriaSel] = useState<CategoriaCambio | null>(null);

  const resaltados = ctx ? resaltadosEnTexto(valor, cs) : [];
  const hayResaltado = resaltados.length > 0;

  // Partir el texto en segmentos [texto | frase resaltada] para el mirror. Cada
  // segmento resaltado lleva el id de su corrección para poder anclar la tarjeta.
  const segmentos: { texto: string; estado?: EstadoCorreccion; id?: string }[] = [];
  {
    let i = 0;
    for (const r of resaltados) {
      if (r.start > i) segmentos.push({ texto: valor.slice(i, r.start) });
      segmentos.push({ texto: valor.slice(r.start, r.end), estado: r.estado, id: r.id });
      i = r.end;
    }
    if (i < valor.length) segmentos.push({ texto: valor.slice(i) });
  }

  // --- Tarjeta de lectura de correcciones (B-proper) ---
  // Se ancla a la FRASE resaltada (no a una esquina fija) y esquiva el texto con
  // flip/shift; y CEDE EL PASO: se esconde mientras editas (foco), seleccionas o
  // compones — para que llegar a la palabra nunca invoque lo que la tapa.
  const [editando, setEditando] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [fijado, setFijado] = useState(false);
  const marcaRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pinRef = useRef<HTMLButtonElement>(null);
  const hayCorr = cs.length > 0;

  // La corrección "primaria" a la que se ancla la tarjeta: la primera sin cerrar
  // con un resaltado vivo; si ninguna, la primera con resaltado; si nada está
  // anclado a texto (campo entero / quote no encontrado), cae al pin.
  const idsResaltados = new Set(resaltados.map((r) => r.id));
  const primaria =
    cs.find((c) => c.estado !== "closed" && idsResaltados.has(c.id)) ??
    cs.find((c) => idsResaltados.has(c.id)) ??
    null;
  const anchorId = primaria?.id ?? null;
  const cardAbierta =
    hayCorr && !editando && !seleccion && !componiendoSel && (fijado || hovering);

  // Elementos controlados por estado (en vez del objeto `refs` de Floating UI):
  // así no leemos un ref-like en render y la posición vive en floatingStyles.
  const [referenceEl, setReferenceEl] = useState<HTMLElement | null>(null);
  const [floatingEl, setFloatingEl] = useState<HTMLElement | null>(null);
  // `open` es clave: al cerrar resetea isPositioned → al reabrir la tarjeta espera
  // a una posición fresca antes de aparecer (opacity), evitando un flash en 0,0 si
  // el ancla anterior se quedó viejo/desmontado (p. ej. tras Descartar/Confirmar).
  const { floatingStyles, isPositioned } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    open: cardAbierta,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ["top-start", "right-start", "left-start"] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
    elements: { reference: referenceEl, floating: floatingEl },
  });

  // Ancla la tarjeta a la marca primaria (o al pin como respaldo) cuando está
  // abierta; autoUpdate la mantiene posicionada al hacer scroll/resize. Re-corre
  // si cambia el texto o el conjunto de correcciones (la marca se remonta al
  // editar → hay que re-apuntar al nodo fresco).
  useEffect(() => {
    if (!cardAbierta) return;
    const el = (anchorId && marcaRefs.current.get(anchorId)) || pinRef.current;
    if (el) setReferenceEl(el);
  }, [cardAbierta, anchorId, valor, cs.length]);

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
    if (!ctx || !seleccion || !textoSel.trim() || !categoriaSel) return;
    ctx.pedir(
      { tabla, filaId, campo, label: etiqueta, quote: seleccion.quote, start: seleccion.start, end: seleccion.end, categoria: categoriaSel },
      textoSel.trim(),
    );
    setTextoSel("");
    setCategoriaSel(null);
    setComponiendoSel(false);
    setSeleccion(null);
  };

  // Clases del textarea y su mirror. La variante INLINE (documento WYSIWYG) va sin
  // bordes, auto-alto y compacta para verse como el slide; la normal conserva el
  // look de formulario. Ambas comparten padding/tamaño para que el <mark> alinee.
  const taClass = cn(
    "relative w-full outline-none transition-colors",
    inline
      ? "resize-none rounded border border-transparent px-1.5 py-1 text-[13px] leading-relaxed [field-sizing:content] [scrollbar-gutter:stable] focus:border-input focus-visible:ring-2 focus-visible:ring-ring"
      : "resize-y rounded-md border px-2.5 py-1.5 text-sm leading-relaxed [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring",
    inline
      ? hayResaltado
        ? "bg-transparent"
        : "bg-transparent hover:bg-secondary/30 focus:bg-background"
      : hayResaltado
        ? "bg-transparent"
        : "bg-background",
    inline ? "placeholder:text-muted-foreground/45 placeholder:italic" : "placeholder:text-muted-foreground/55",
    mono && "font-mono",
    conflicto !== null ? "border-status-corrections" : inline ? "" : "border-input",
    soloLectura && "cursor-default",
    soloLectura && !inline && !hayResaltado && "bg-secondary/40",
    soloLectura && inline && "hover:bg-transparent",
  );
  const mirrorClass = cn(
    "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent text-transparent",
    inline
      ? "rounded px-1.5 py-1 text-[13px] leading-relaxed [scrollbar-gutter:stable]"
      : "rounded-md bg-background px-2.5 py-1.5 text-sm leading-relaxed [scrollbar-gutter:stable]",
    mono && "font-mono",
  );

  return (
    <div
      className={cn(
        "group relative min-w-0 scroll-mt-24",
        inline && "grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-2",
      )}
      data-campo-key={ctx ? keyCampo(tabla, filaId, campo) : undefined}
      onMouseEnter={ctx ? () => setHovering(true) : undefined}
      onMouseLeave={ctx ? () => setHovering(false) : undefined}
    >
      {inline ? (
        <span className="flex items-center gap-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">
          {icono}
          <span className="whitespace-nowrap">{label}</span>
        </span>
      ) : (
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Indicador estado={estado} />
        </div>
      )}

      <div className="relative min-w-0">
        {/* En inline el indicador de guardado va como marca sutil en la esquina
            (no cabe junto a la etiqueta de 64px). */}
        {inline && (
          <div className="pointer-events-none absolute right-1 top-1 z-10">
            <Indicador estado={estado} />
          </div>
        )}
        {/* Mirror BAJO el textarea: pinta el fondo del <mark> de cada frase
            corregida; el texto real (y el cursor) van en el textarea de encima
            (fondo transparente). Best-effort: si el texto cambia y la frase ya
            no está, no se pinta (el quote sigue en el panel). */}
        {hayResaltado && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={mirrorClass}
          >
            {segmentos.map((sg, i) =>
              sg.estado ? (
                <mark
                  key={i}
                  ref={
                    sg.id
                      ? (el) => {
                          const id = sg.id!;
                          if (el) marcaRefs.current.set(id, el);
                          else marcaRefs.current.delete(id);
                        }
                      : undefined
                  }
                  style={{ background: MARCA[sg.estado], color: "transparent", borderRadius: "2px" }}
                >
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
          onFocus={() => setEditando(true)}
          onBlur={() => { setEditando(false); g.alSalir(); }}
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
          className={taClass}
        />

        {/* Al resaltar texto (sólo revisor): "Pedir cambio aquí" anclado a la frase.
            Flota ARRIBA del campo (bottom-full), alineado a la derecha, para NO
            taparle el texto — antes salía encima de la primera línea. */}
        {seleccion && puedeSeleccionar && !componiendoSel && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setComponiendoSel(true); setTextoSel(""); }}
            className="absolute bottom-full right-0 z-30 mb-1 inline-flex items-center gap-1 rounded-full border border-status-corrections/50 bg-card px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--status-corrections)_72%,#000)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--status-corrections)_80%,#000)] hover:text-white"
          >
            <Plus className="size-3" /> Pedir cambio aquí
          </button>
        )}

        {/* Pin de corrección — anclado a la esquina SUP-IZQ del CAMPO (no tapa el
            ícono de la etiqueta). Es el respaldo de ancla de la tarjeta; clic = fija.
            El círculo visible mide 20px, por debajo del mínimo de 24px de WCAG 2.5.8;
            `before:-inset-1` le suma un anillo invisible de 4px → área táctil de 28px
            sin tocar el tamaño del ícono ni la maquetación. (reap a11y 2026-08-26) */}
        {ctx && hayCorr && estadoCorr && (
          <button
            type="button"
            ref={pinRef}
            onClick={() => setFijado((v) => !v)}
            aria-label={`${cs.length} corrección(es) en ${etiqueta}`}
            aria-expanded={cardAbierta}
            className="gl-pop absolute -left-1.5 -top-1.5 z-20 grid size-[20px] place-items-center rounded-full border-2 border-background text-[10px] font-extrabold text-white shadow-sm before:absolute before:-inset-1 before:content-['']"
            style={{ background: PIN_BG[estadoCorr] }}
          >
            {estadoCorr === "open" ? cs.length : "✓"}
          </button>
        )}
      </div>

      {/* Compositor de la corrección anclada a la selección. */}
      {componiendoSel && seleccion && (
        <div className={cn("relative z-30 mt-2 rounded-lg border border-border-strong bg-secondary p-2.5 shadow-sm", inline && "col-span-2")}>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Cambio para <b className="text-status-corrections">&laquo;{seleccion.quote}&raquo;</b> en {etiqueta}
          </p>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tipo de cambio
          </p>
          <SelectorTipoCambio value={categoriaSel} onChange={setCategoriaSel} />
          <textarea
            value={textoSel}
            onChange={(e) => setTextoSel(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe el cambio que quieres para este texto…"
            className="mt-2 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={ctx?.pendiente || !textoSel.trim() || !categoriaSel}
              onClick={fijarSeleccion}
              className="rounded-md bg-[color-mix(in_srgb,var(--status-corrections)_78%,#000)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Fijar cambio
            </button>
            <button
              type="button"
              onClick={() => { setComponiendoSel(false); setSeleccion(null); setCategoriaSel(null); }}
              className="rounded-md border border-border px-3 py-1 text-[12px] font-medium hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {conflicto !== null &&
        (inline ? (
          <div className="col-span-2">
            <PanelConflicto valorAjeno={conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
          </div>
        ) : (
          <PanelConflicto valorAjeno={conflicto} quedarme={g.quedarme} tomarSuyo={g.tomarSuyo} />
        ))}

      {/* Tarjeta de lectura: portal al body + posición de Floating UI, así nunca
          la recorta un overflow y siempre esquiva la frase que describe. */}
      {ctx &&
        cardAbierta &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setFloatingEl}
            role="tooltip"
            style={{
              ...floatingStyles,
              opacity: isPositioned ? 1 : 0,
              borderColor: "color-mix(in srgb, var(--status-corrections) 40%, var(--border))",
            }}
            className="pointer-events-none z-[60] w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-lg transition-opacity"
          >
            {cs.map((c) => (
              <div key={c.id} className="border-t border-border p-2.5 first:border-t-0">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: PIN_BG[c.estado] }}
                  >
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                  {c.cliente ? (
                    <BadgeCliente color={ctx.marcaColor} />
                  ) : (
                    <TagTipoCambio slug={c.categoria} />
                  )}
                  <VeredictoChip v={ctx.veredictos.get(c.id)} />
                </div>
                {c.targetQuote && (
                  <p className="mb-1 truncate text-[11px] italic text-status-corrections" title={c.targetQuote}>
                    &laquo;{c.targetQuote}&raquo;
                  </p>
                )}
                <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>
                {c.autor && <p className="mt-1 text-[10px] text-muted-foreground">{c.autor}</p>}
              </div>
            ))}
          </div>,
          document.body,
        )}

      {ctx &&
        (inline ? (
          <div className="col-span-2">
            <CampoCorrecciones
              tabla={tabla}
              filaId={filaId}
              campo={campo}
              etiqueta={etiqueta}
              cs={cs}
              campoVacio={valor.trim() === ""}
            />
          </div>
        ) : (
          <CampoCorrecciones
            tabla={tabla}
            filaId={filaId}
            campo={campo}
            etiqueta={etiqueta}
            cs={cs}
            campoVacio={valor.trim() === ""}
          />
        ))}
    </div>
  );
});

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
  // role="status"/aria-live: NO hay botón de guardar — este indicador ES la única
  // afordancia de guardado, así que un lector de pantalla necesita oír
  // "guardando…/guardado/no se pudo guardar" al teclear en cualquier campo. (reap 2026-08-26)
  return (
    <span
      key={estado}
      role="status"
      aria-live="polite"
      className={cn("gl-rise-in inline-flex items-center gap-1 text-[10px]", color)}
    >
      {estado === "guardado" && <Check className="size-3" />}
      {texto}
    </span>
  );
}
