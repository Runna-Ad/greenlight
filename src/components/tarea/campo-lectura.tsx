"use client";

import { useRef, useState, type ReactNode } from "react";
import { Plus, X, Check } from "lucide-react";
import { useCorrecciones } from "./correcciones/contexto";
import {
  resaltadosEnTexto,
  PIN_BG,
  MARCA,
  ETIQUETA_ESTADO,
  type EstadoCorreccion,
} from "@/lib/correcciones";

/**
 * Campo de SÓLO LECTURA en "Vista cliente", pero con correcciones para el
 * REVISOR: la vista sigue limpia (sin textareas), y el lead puede
 *   1. VER las frases ya corregidas resaltadas,
 *   2. SELECCIONAR texto → "Pedir cambio aquí" (ancla por cita),
 *   3. gestionar lo pedido (confirmar / descartar) en una lista compacta.
 * Para el PARTNER real (no revisor) se pinta `pretty` tal cual — la vista bonita
 * (Linkify / diálogo formateado) intacta. Así se puede pedir cambios desde la
 * Vista cliente sin volverla un editor.
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

  const fila = (contenido: ReactNode) => (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-2">
      <span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-muted-foreground">
        {icono}
        <span className="whitespace-nowrap">{label}</span>
      </span>
      <div className="min-w-0">{contenido}</div>
    </div>
  );

  // Partner real (o fuera del workspace): la vista bonita, sin tocar.
  if (!ctx || !ctx.esRevisor) return fila(pretty);

  const cs = ctx.deCampo(tabla, filaId, campo);
  const resaltados = resaltadosEnTexto(valor, cs);

  // Partir el texto en segmentos [normal | resaltado] para pintar las frases
  // corregidas sin perder el resto del texto.
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
  // que el panel de correcciones distinga entre planos.
  const etiqueta = grupo ? `${grupo} · ${label}` : label;

  const fijar = () => {
    if (!sel || !texto.trim()) return;
    ctx.pedir(
      { tabla, filaId, campo, label: etiqueta, quote: sel.quote, start: sel.start, end: sel.end },
      texto.trim(),
    );
    setTexto("");
    setComponiendo(false);
    setSel(null);
  };

  return fila(
    <div className="relative">
      <div
        ref={contRef}
        onMouseUp={capturar}
        className="whitespace-pre-wrap px-1.5 py-1 text-[13px] leading-relaxed text-foreground"
      >
        {segmentos.map((sg, i) =>
          sg.estado ? (
            <mark
              key={i}
              style={{ background: MARCA[sg.estado], borderRadius: "2px" }}
              className="text-foreground"
            >
              {sg.texto}
            </mark>
          ) : (
            <span key={i}>{sg.texto}</span>
          ),
        )}
      </div>

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
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe el cambio que quieres…"
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={ctx.pendiente || !texto.trim()}
              onClick={fijar}
              style={{ background: PIN_BG.open }}
              className="rounded-md px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Fijar cambio
            </button>
            <button
              type="button"
              onClick={() => {
                setComponiendo(false);
                setSel(null);
              }}
              className="rounded-md border border-border px-3 py-1 text-[12px] font-medium hover:bg-background"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista compacta de lo ya pedido: verla y gestionarla sin salir de aquí. */}
      {cs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {cs.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 rounded-md border border-border bg-card px-2 py-1 text-[11px]"
            >
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: PIN_BG[c.estado] }}
              />
              <div className="min-w-0 flex-1">
                {c.targetQuote && (
                  <p className="truncate italic text-status-corrections" title={c.targetQuote}>
                    &laquo;{c.targetQuote}&raquo;
                  </p>
                )}
                <p className="text-foreground">{c.body}</p>
                <p className="text-[10px] text-muted-foreground/70">{ETIQUETA_ESTADO[c.estado]}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {c.estado === "done" && (
                  <button
                    type="button"
                    disabled={ctx.pendiente}
                    onClick={() => ctx.marcar(c.id, "closed")}
                    aria-label="Confirmar corrección"
                    title="Confirmar"
                    className="rounded p-0.5 text-status-completed hover:bg-secondary disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={ctx.pendiente}
                  onClick={() => ctx.descartar(c.id)}
                  aria-label="Descartar corrección"
                  title="Descartar"
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-status-corrections disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>,
  );
}
