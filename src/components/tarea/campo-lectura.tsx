"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Check, ArrowRight } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react-dom";
import { desmarcarNegrita, type RangoNegrita } from "@/lib/negrita";
import { useCorrecciones } from "./correcciones/contexto";
import { SelectorTipoCambio, TagTipoCambio, BadgeCliente } from "./selector-tipo-cambio";
import { VeredictoChip } from "./veredicto-chip";
import { type CategoriaCambio } from "@/lib/tipos-cambio";
import {
  resaltadosEnTexto,
  keyCampo,
  PIN_BG,
  MARCA,
  ETIQUETA_ESTADO,
  type Correccion,
} from "@/lib/correcciones";

/**
 * Pinta el tramo [a, b) del texto LIMPIO aplicando negrita POR RANGO (los `negritas`
 * vienen en coordenadas de `limpio`, ordenados y sin traslape). Se usa por segmento
 * de corrección: como la negrita y los resaltados comparten el mismo espacio, un
 * resaltado puede quedar dentro/encima de una negrita sin partir ningún marcador `**`.
 */
function pintarNegrita(limpio: string, negritas: RangoNegrita[], a: number, b: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = a;
  let k = 0;
  for (const r of negritas) {
    if (r.end <= a || r.start >= b) continue; // sin traslape con este segmento
    const bs = Math.max(r.start, a);
    const be = Math.min(r.end, b);
    if (bs > i) nodes.push(<span key={k++}>{limpio.slice(i, bs)}</span>);
    nodes.push(
      <strong key={k++} className="font-semibold">
        {limpio.slice(bs, be)}
      </strong>,
    );
    i = be;
  }
  if (i < b) nodes.push(<span key={k++}>{limpio.slice(i, b)}</span>);
  return nodes;
}

/**
 * Campo de SÓLO LECTURA en "Vista cliente", pero con correcciones para el
 * REVISOR: la vista sigue limpia (sin textareas, sin cajas debajo), y el lead
 * puede
 *   1. VER las frases ya corregidas resaltadas (verde = confirmado, rojo = sin
 *      atender, ámbar = por confirmar), y al PASAR EL RATÓN sobre el resaltado
 *      ver el cambio pedido «de qué» → «a qué» en una tarjeta flotante,
 *   2. gestionar ahí mismo (confirmar / descartar) sin cajas que ensucien,
 *   3. SELECCIONAR texto → "Pedir cambio aquí" (ancla por cita).
 * Para el PARTNER real (no revisor) se pinta `pretty` tal cual — la vista bonita
 * (Linkify / diálogo formateado) intacta.
 */
export function CampoLectura({
  tabla,
  filaId,
  campo,
  label,
  grupo,
  valor,
  icono,
  pretty,
}: {
  tabla: "planos" | "estaticos";
  filaId: string;
  campo: string;
  /** El nombre del campo, que se muestra en la etiqueta (p. ej. "Diálogos"). */
  label: string;
  /** El grupo del campo (p. ej. "Plano 5"), para que la corrección se guarde con
   *  la MISMA etiqueta que en el editor ("Plano 5 · Diálogos") y el panel las
   *  distinga entre planos. */
  grupo?: string;
  valor: string;
  icono: ReactNode;
  /** La vista bonita para el partner (Linkify o diálogo formateado). */
  pretty: ReactNode;
}) {
  const ctx = useCorrecciones();
  const contRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ quote: string; start: number; end: number } | null>(null);
  const [componiendo, setComponiendo] = useState(false);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaCambio | null>(null);

  // --- Tarjeta flotante en hover (reemplaza las cajas de antes) ---
  // `abierta` = id de la corrección cuya tarjeta se muestra. Un pequeño timer al
  // salir permite cruzar el hueco marca→tarjeta sin que se cierre (la tarjeta es
  // interactiva: lleva confirmar/descartar).
  const [abierta, setAbierta] = useState<string | null>(null);
  const cerrarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marcaRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [referenceEl, setReferenceEl] = useState<HTMLElement | null>(null);
  const [floatingEl, setFloatingEl] = useState<HTMLElement | null>(null);

  // Quién puede fijar cambios aquí: el revisor (correcciones internas) o el
  // cliente en el portal (sus pins). Ambos comparten el mismo mecanismo.
  const puedeCorregir = !!ctx && (ctx.esRevisor || ctx.esCliente);
  // Correcciones/pins del campo (vacío si no hay contexto o es sólo-lectura — así
  // los hooks de abajo corren siempre, sin condicionar el orden).
  const cs = puedeCorregir ? ctx!.deCampo(tabla, filaId, campo) : [];
  // Trabajamos TODO el modo interactivo en "espacio limpio" (sin marcadores `**`):
  // el DOM muestra `limpio`, la selección/cita/offsets se calculan sobre `limpio`, y
  // la negrita se re-aplica POR RANGO (pintarNegrita). Así un resaltado de corrección
  // nunca parte un par `**` (no hay marcadores que partir) — el cliente ve negrita
  // real Y el resaltado limpio, y la cita/offset guardada vive en el mismo espacio
  // que el texto que se ve y se selecciona.
  const { texto: limpio, negritas } = desmarcarNegrita(valor);
  const resaltados = resaltadosEnTexto(limpio, cs);
  const byId = new Map(cs.map((c) => [c.id, c]));

  // Partir el texto en segmentos [normal | resaltado] (coordenadas de `limpio`) para
  // pintar las frases corregidas sin perder el resto. Cada resaltado lleva su
  // corrección para anclar la tarjeta.
  const segmentos: { start: number; end: number; corr?: Correccion }[] = [];
  {
    let i = 0;
    for (const r of resaltados) {
      if (r.start > i) segmentos.push({ start: i, end: r.start });
      segmentos.push({ start: r.start, end: r.end, corr: byId.get(r.id) });
      i = r.end;
    }
    if (i < limpio.length) segmentos.push({ start: i, end: limpio.length });
  }

  // Correcciones que ya no se pueden ubicar en el texto (la frase citada se
  // editó). No se pierden: se listan como chips diminutos "sin ubicar" con la
  // misma tarjeta al pasar el ratón, para poder verlas/descartarlas.
  const ubicadas = new Set(resaltados.map((r) => r.id));
  const huerfanas = cs.filter((c) => !ubicadas.has(c.id));
  // Un huérfano SIN confirmar (open/done) casi siempre es "el especialista ya lo
  // cambió → revisa si quedó". Uno YA confirmado (closed) no debe volver a pedir
  // revisión: se muestra aparte como "confirmado" para no confundir (Pedro).
  const huerfanasPend = huerfanas.filter((c) => c.estado !== "closed");
  const huerfanasOk = huerfanas.filter((c) => c.estado === "closed");

  const corrAbierta = abierta ? byId.get(abierta) : undefined;
  const cardAbierta = !!corrAbierta && !componiendo && !sel;

  // Floating UI: ancla la tarjeta a la marca (o chip) y la mantiene posicionada;
  // flip/shift para que nunca tape la frase ni se recorte.
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

  useEffect(() => {
    if (!cardAbierta || !abierta) return;
    const el = marcaRefs.current.get(abierta);
    if (el) setReferenceEl(el);
  }, [cardAbierta, abierta, valor, cs.length]);

  useEffect(() => () => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current);
  }, []);

  const abrir = (id: string) => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current);
    setAbierta(id);
  };
  const cerrarPronto = () => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current);
    cerrarTimer.current = setTimeout(() => setAbierta(null), 140);
  };

  const fila = (contenido: ReactNode) => (
    <div
      // Ancla para "Ver campo" del panel de correcciones (mismo data-campo-key que
      // el editor) — así el salto+flash también funciona en la Vista cliente.
      data-campo-key={ctx ? keyCampo(tabla, filaId, campo) : undefined}
      className="grid scroll-mt-24 grid-cols-[80px_minmax(0,1fr)] items-start gap-x-2"
    >
      <span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-muted-foreground">
        {icono}
        <span className="whitespace-nowrap">{label}</span>
      </span>
      <div className="min-w-0">{contenido}</div>
    </div>
  );

  // Partner en sólo-lectura (o fuera del workspace): la vista bonita, sin tocar.
  // Interactivo para el revisor (correcciones) o el cliente del portal (pins).
  if (!ctx || (!ctx.esRevisor && !ctx.esCliente)) return fila(pretty);

  // Captura la selección DEL NAVEGADOR dentro de este campo y calcula la cita +
  // offsets exactos (rango desde el inicio del contenedor hasta el inicio de la
  // selección). La cita es el ancla de registro; los offsets son best-effort.
  const capturar = () => {
    const s = window.getSelection();
    const cont = contRef.current;
    if (!s || s.isCollapsed || s.rangeCount === 0 || !cont) {
      if (!componiendo) setSel(null);
      return;
    }
    const range = s.getRangeAt(0);
    if (!cont.contains(range.commonAncestorContainer)) return;
    const quote = s.toString();
    if (!quote.trim()) {
      if (!componiendo) setSel(null);
      return;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(cont);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    setSel({ quote, start, end: start + quote.length });
  };

  // Misma etiqueta que el editor: "Plano 5 · Diálogos" (no sólo "Diálogos"), para
  // que la corrección se registre distinguiendo entre planos.
  const etiqueta = grupo ? `${grupo} · ${label}` : label;

  const fijar = () => {
    if (!sel || !texto.trim()) return;
    // El tipo de cambio es obligatorio SÓLO para el revisor (alimenta Evaluación);
    // el cliente pide cambios sin categoría.
    if (ctx.esRevisor && !categoria) return;
    ctx.pedir(
      {
        tabla,
        filaId,
        campo,
        label: etiqueta,
        quote: sel.quote,
        start: sel.start,
        end: sel.end,
        categoria: ctx.esRevisor ? categoria : null,
      },
      texto.trim(),
    );
    setTexto("");
    setCategoria(null);
    setComponiendo(false);
    setSel(null);
  };

  // Un chip de huérfana (frase citada que ya no está en el texto), con su tarjeta
  // flotante al pasar el ratón (misma que los resaltados: lleva el veredicto de
  // H.Ü.E y confirmar/descartar).
  const chipHuerfana = (c: Correccion) => (
    <button
      key={c.id}
      type="button"
      ref={(el) => {
        if (el) marcaRefs.current.set(c.id, el);
        else marcaRefs.current.delete(c.id);
      }}
      onMouseEnter={() => abrir(c.id)}
      onMouseLeave={cerrarPronto}
      className="max-w-[140px] truncate rounded-full px-1.5 py-0.5 text-[10px] italic text-foreground"
      style={{ background: MARCA[c.estado] }}
    >
      &laquo;{c.targetQuote ?? "campo"}&raquo;
    </button>
  );

  return fila(
    <div className="relative">
      <div
        ref={contRef}
        onMouseUp={capturar}
        className="whitespace-pre-wrap px-1.5 py-1 text-[13px] leading-relaxed text-foreground"
      >
        {segmentos.map((sg, i) =>
          sg.corr ? (
            <mark
              key={i}
              ref={(el) => {
                const id = sg.corr!.id;
                if (el) marcaRefs.current.set(id, el);
                else marcaRefs.current.delete(id);
              }}
              onMouseEnter={() => abrir(sg.corr!.id)}
              onMouseLeave={cerrarPronto}
              style={{ background: MARCA[sg.corr.estado], borderRadius: "2px" }}
              className="cursor-help text-foreground"
            >
              {pintarNegrita(limpio, negritas, sg.start, sg.end)}
            </mark>
          ) : (
            <span key={i}>{pintarNegrita(limpio, negritas, sg.start, sg.end)}</span>
          ),
        )}
      </div>

      {/* Huérfanas (frase citada ya no está en el texto) — del lado del revisor.
          Incluye cambios del cliente (mismo lifecycle): si su cita ya no está, el
          "El texto cambió — revisa si ya quedó" aplica igual, y se pueden confirmar. */}
      {ctx.esRevisor && huerfanasPend.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            El texto cambió — revisa si ya quedó:
          </span>
          {huerfanasPend.map((c) => chipHuerfana(c))}
        </div>
      )}
      {ctx.esRevisor && huerfanasOk.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-status-completed">
            <Check className="size-3" /> Ya confirmado:
          </span>
          {huerfanasOk.map((c) => chipHuerfana(c))}
        </div>
      )}

      {/* "Pedir cambio aquí" — flota ARRIBA (no tapa el texto), como en el editor. */}
      {sel && !componiendo && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setComponiendo(true);
            setTexto("");
          }}
          className="absolute bottom-full right-0 z-30 mb-1 inline-flex items-center gap-1 rounded-full border border-status-corrections/50 bg-card px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--status-corrections)_72%,#000)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--status-corrections)_80%,#000)] hover:text-white"
        >
          <Plus className="size-3" /> Pedir cambio aquí
        </button>
      )}

      {/* Compositor de la corrección anclada a la selección. */}
      {componiendo && sel && (
        <div className="relative z-20 mt-2 rounded-lg border border-border bg-secondary p-2.5 shadow-sm">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Cambio para{" "}
            <b className="text-status-corrections">&laquo;{sel.quote}&raquo;</b> en {etiqueta}
          </p>
          {/* El tipo de cambio es SÓLO interno (rúbrica de Evaluación). El cliente
              no lo ve — pide el cambio y ya. */}
          {ctx.esRevisor && (
            <>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de cambio
              </p>
              <SelectorTipoCambio value={categoria} onChange={setCategoria} />
            </>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe el cambio que quieres…"
            className="mt-2 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={ctx.pendiente || !texto.trim() || (ctx.esRevisor && !categoria)}
              onClick={fijar}
              style={{ background: PIN_BG.open }}
              className="rounded-md px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {ctx.esCliente ? "Anotar cambio" : "Fijar cambio"}
            </button>
            <button
              type="button"
              onClick={() => {
                setComponiendo(false);
                setSel(null);
                setCategoria(null);
              }}
              className="rounded-md border border-border px-3 py-1 text-[12px] font-medium hover:bg-background"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tarjeta flotante de la corrección resaltada: se abre en hover, esquiva la
          frase (flip/shift), va en portal para que ningún overflow la recorte, y
          es interactiva (confirmar / descartar) — sin cajas debajo del texto. */}
      {cardAbierta &&
        corrAbierta &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setFloatingEl}
            role="tooltip"
            onMouseEnter={() => abrir(corrAbierta.id)}
            onMouseLeave={cerrarPronto}
            style={{
              ...floatingStyles,
              opacity: isPositioned ? 1 : 0,
              borderColor: `color-mix(in srgb, ${PIN_BG[corrAbierta.estado]} 45%, var(--border))`,
            }}
            className="z-[60] w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-3 shadow-lg transition-opacity"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              {ctx.esRevisor ? (
                // Interno: correcciones Y cambios del cliente comparten el MISMO
                // lifecycle (confirmar/descartar). La única diferencia visible es el
                // badge — "Cliente" (morado) en vez de la categoría de rúbrica.
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: PIN_BG[corrAbierta.estado] }}
                    >
                      {ETIQUETA_ESTADO[corrAbierta.estado]}
                    </span>
                    {corrAbierta.cliente ? (
                      <BadgeCliente />
                    ) : (
                      <>
                        <TagTipoCambio slug={corrAbierta.categoria} />
                        <VeredictoChip v={ctx.veredictos.get(corrAbierta.id)} />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {corrAbierta.estado === "done" && (
                      <button
                        type="button"
                        disabled={ctx.pendiente}
                        onClick={() => ctx.marcar(corrAbierta.id, "closed")}
                        aria-label="Confirmar corrección"
                        title="Confirmar"
                        className="rounded p-0.5 text-status-completed hover:bg-secondary disabled:opacity-50"
                      >
                        <Check className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={ctx.pendiente}
                      onClick={() => {
                        ctx.descartar(corrAbierta.id);
                        setAbierta(null);
                      }}
                      aria-label="Descartar corrección"
                      title="Descartar"
                      className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-status-corrections disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </>
              ) : (
                // El cliente: su cambio, con la opción de quitarlo antes de enviar.
                <>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-status-corrections">
                    Tu cambio
                  </span>
                  <button
                    type="button"
                    disabled={ctx.pendiente}
                    onClick={() => {
                      ctx.descartar(corrAbierta.id);
                      setAbierta(null);
                    }}
                    aria-label="Quitar cambio"
                    title="Quitar"
                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-status-corrections disabled:opacity-50"
                  >
                    <X className="size-3.5" /> Quitar
                  </button>
                </>
              )}
            </div>

            {/* El cambio: «de qué» → «a qué». */}
            <div className="text-[12.5px] leading-snug">
              {corrAbierta.targetQuote && (
                <>
                  <span className="italic text-muted-foreground">
                    &laquo;{corrAbierta.targetQuote}&raquo;
                  </span>
                  <ArrowRight className="mx-1 inline size-3 align-[-1px] text-muted-foreground" />
                </>
              )}
              <span className="font-medium text-foreground">{corrAbierta.body}</span>
            </div>
            {corrAbierta.autor && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">{corrAbierta.autor}</p>
            )}
          </div>,
          document.body,
        )}
    </div>,
  );
}
