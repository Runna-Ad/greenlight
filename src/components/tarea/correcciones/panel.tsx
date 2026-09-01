"use client";

import { useState } from "react";
import { Trash2, ChevronDown, Sparkles } from "lucide-react";
import { useCorrecciones } from "./contexto";
import { TagTipoCambio, BadgeCliente } from "../selector-tipo-cambio";
import { VeredictoChip } from "../veredicto-chip";
import { keyCampo, porRonda, sinResolver, type Correccion, type EstadoCorreccion } from "@/lib/correcciones";
import type { VeredictoCambio } from "@/app/(app)/[cliente]/tareas/[id]/validar-actions";
import { cn } from "@/lib/utils";

// Fondos sólidos de botón (texto blanco) — un pelín más oscuros para AA.
const BG_CORAL = "color-mix(in srgb, var(--status-corrections) 78%, #000)";
const BG_GREEN = "color-mix(in srgb, var(--status-completed) 92%, #000)";
// Pastilla de ESTADO: fondo sólido + texto blanco (texto-de-color-sobre-tinte-del-
// mismo-tono no pasa AA; lección de los chips). Amber va oscuro para el blanco.
const PILL: Record<EstadoCorreccion, string> = {
  open: BG_CORAL,
  done: "color-mix(in srgb, var(--status-progress) 80%, #000)",
  closed: BG_GREEN,
};
const ETIQUETA: Record<EstadoCorreccion, string> = {
  open: "Sin atender",
  done: "Atendido · por confirmar",
  closed: "Confirmado",
};

function verCampo(c: Correccion) {
  const k = keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo);
  const el = document.querySelector<HTMLElement>(`[data-campo-key="${k}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("gl-flash");
  void el.offsetWidth;
  el.classList.add("gl-flash");
  // Además del scroll+flash, RELOCALIZA el foco (teclado/lector de pantalla) al campo:
  // si el ancla no es enfocable de origen, la hacemos enfocable con tabindex="-1"
  // (fuera del orden de tabulación) antes de enfocarla. preventScroll evita pisar el
  // scroll suave de arriba.
  if (el.tabIndex < 0) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * El panel "Correcciones": la lista completa, agrupada por ronda (la actual
 * arriba, las pasadas colapsadas). El especialista marca atendido; el revisor
 * confirma. Clic en una corrección salta a su campo.
 */
export function PanelCorrecciones() {
  const ctx = useCorrecciones();
  const [colapsadas, setColapsadas] = useState<Set<number>>(new Set());
  // Confirmación en dos pasos del descarte: el id de la corrección cuyo botón
  // "Descartar" está pidiendo confirmación (sólo una a la vez).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  // Intención EXPANDIDO/compacto elegida a mano por el lead, por id — valor ABSOLUTO, no un
  // XOR contra el default. (Si guardáramos "alternado" y el default de una tarjeta se moviera
  // —al confirmar otra y correrse la frontera de los 5 abiertos— una tarjeta que el lead
  // expandió a mano se colapsaría sola. La intención absoluta lo evita.) reap 2026-08-20.
  // Sin entrada => sigue el default (resueltos y abiertos >5 compactos). Un panel con muchos
  // cambios no se hace gigante y encoge al ir resolviendo (Pedro).
  const [expandidoManual, setExpandidoManual] = useState<Map<string, boolean>>(new Map());
  const fijarExpandido = (id: string, expandido: boolean) =>
    setExpandidoManual((prev) => new Map(prev).set(id, expandido));
  if (!ctx || !ctx.correcciones.length) return null;

  const grupos = porRonda(ctx.correcciones);
  const rondaActual = grupos[0]?.ronda;
  const pendientes = sinResolver(ctx.correcciones);
  // H.Ü.E "Validar" sólo lee texto de planos/estáticos — para copies (correcciones
  // que apuntan a copies/copies_temas) o para el LEGAL (tabla "ideas") daría
  // dictámenes sobre "(campo vacío)". Se oculta hasta que el validador sea
  // copies/legal-aware (follow-on). El validador del servidor ya rechaza esos
  // targets; esto evita ofrecer el botón para no dar un veredicto falso. (reap 2026-08-26)
  const esCopies = ctx.correcciones.some(
    (c) => c.targetTabla === "copies" || c.targetTabla === "copies_temas",
  );
  const esLegal = ctx.correcciones.some((c) => c.targetTabla === "ideas");

  return (
    <aside className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Control de Cambios
          {pendientes > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ background: PILL.open }}
            >
              {pendientes} pendiente{pendientes === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {ctx.esRevisor
            ? ctx.borrador
              // Ronda en BORRADOR: todavía no se manda nada. Nada que confirmar ni revisar.
              ? "Anota los cambios que quieras y mándalos cuando termines: hasta entonces sólo los ves tú."
              : "Confirma cada una al revisarla; la tarea se aprueba cuando no quede ninguna en rojo."
            : "Atiende cada cambio y márcalo; luego devuelve la tarea a revisión."}
        </p>
        {/* H.Ü.E revisa cada cambio de la ronda y da dictamen + sugerencia — ADVISORY,
            ayuda a revisar; el lead decide. Disponible siempre que haya cambios que
            revisar (no sólo mientras quedan sin confirmar). */}
        {ctx.esRevisor && !ctx.borrador && !esCopies && !esLegal && (
          <button
            type="button"
            disabled={ctx.validando}
            onClick={() => ctx.validar()}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-card px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            {ctx.validando ? "Revisando con H.Ü.E…" : "Revisar cambios con H.Ü.E"}
          </button>
        )}
      </div>

      <div>
        {grupos.map(({ ronda, items }) => {
          const cerrada = items.every((c) => c.estado === "closed");
          // Por defecto: la ronda actual abierta, las pasadas colapsadas. El
          // toggle invierte ese default para esa ronda (XOR).
          const visible = (ronda === rondaActual) !== colapsadas.has(ronda);
          return (
            <div key={ronda} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  setColapsadas((prev) => {
                    const n = new Set(prev);
                    if (n.has(ronda)) n.delete(ronda);
                    else n.add(ronda);
                    return n;
                  })
                }
                className="flex w-full items-center gap-2 px-3.5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", visible ? "" : "-rotate-90")} />
                Ronda {ronda}
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-white"
                  style={{ background: ronda === rondaActual ? PILL.open : PILL.closed }}
                >
                  {ronda === rondaActual ? "actual" : cerrada ? "cerrada" : "previa"}
                </span>
              </button>

              {visible && (
                <div className="grid gap-2 px-2.5 pb-2.5">
                  {(() => {
                    // Resueltos (atendido/confirmado) → compactos siempre. Abiertos (rojo) →
                    // los primeros 5 expandidos, el resto compacto. El default se invierte con
                    // el toggle manual (alternados). Así el panel encoge al ir resolviendo.
                    let abiertasVistas = 0;
                    return items.map((c) => {
                      const resuelta = c.estado !== "open";
                      let compactaDefault: boolean;
                      if (resuelta) compactaDefault = true;
                      else {
                        compactaDefault = abiertasVistas >= 5;
                        abiertasVistas++;
                      }
                      const manual = expandidoManual.get(c.id); // boolean | undefined
                      const compacta = manual === undefined ? compactaDefault : !manual;
                      if (compacta) {
                        return (
                          <TarjetaCompacta
                            key={c.id}
                            c={c}
                            borrador={ctx.borrador}
                            veredicto={ctx.veredictos.get(c.id)}
                            onExpandir={() => fijarExpandido(c.id, true)}
                          />
                        );
                      }
                      return (
                        <div
                          key={c.id}
                          className="cursor-pointer rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-[color-mix(in_srgb,var(--status-corrections)_50%,transparent)]"
                          onClick={() => verCampo(c)}
                        >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {c.targetLabel && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                            {c.targetLabel}
                          </span>
                        )}
                        {/* Cambio del cliente: badge "Cliente" (color de marca) donde iría
                            la categoría de rúbrica. El veredicto de H.Ü.E aplica a AMBOS. */}
                        {c.cliente ? (
                          <BadgeCliente color={ctx.marcaColor} />
                        ) : (
                          <TagTipoCambio slug={c.categoria} />
                        )}
                        <VeredictoChip v={ctx.veredictos.get(c.id)} />
                        <span
                          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: PILL[c.estado] }}
                        >
                          {ctx.borrador && c.estado === "open" ? "Por enviar" : ETIQUETA[c.estado]}
                        </span>
                        {/* Cualquier tarjeta expandida se puede volver a compactar. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fijarExpandido(c.id, false);
                          }}
                          aria-label="Compactar"
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      </div>
                      {c.targetQuote && (
                        <p className="mb-0.5 text-[11px] italic text-status-corrections" title={c.targetQuote}>
                          En &laquo;{c.targetQuote}&raquo;:
                        </p>
                      )}
                      <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>
                      {c.autor && <p className="mt-1 text-[10.5px] text-muted-foreground">{c.autor}</p>}

                      {/* H.Ü.E propuso un texto concreto → el lead lo aplica de un clic
                          directo al campo (ADVISORY→acción; el lead decide). */}
                      {ctx.esRevisor && ctx.veredictos.get(c.id)?.aplicar && (
                        <div className="mt-2 rounded-md border border-primary/30 bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] p-2">
                          <p className="text-[11px] leading-snug text-foreground">
                            <b className="text-primary">H.Ü.E sugiere:</b> {ctx.veredictos.get(c.id)!.sugerencia}
                          </p>
                          {/* H.Ü.E reescribe TODO el campo — se muestra el texto COMPLETO que
                              quedaría para que el lead lo LEA antes de aplicar (no un overwrite a
                              ciegas): "Aplicar" escribe exactamente esto. */}
                          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            El campo quedaría así:
                          </p>
                          <p className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-card px-1.5 py-1 text-[11px] leading-snug text-foreground">
                            {ctx.veredictos.get(c.id)!.aplicar}
                          </p>
                          <button
                            type="button"
                            disabled={ctx.pendiente}
                            onClick={() => ctx.aplicarSugerencia?.(c, ctx.veredictos.get(c.id)!.aplicar!)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
                            style={{ background: "color-mix(in srgb, var(--primary) 82%, #000)" }}
                            title="Reemplaza el campo con el texto de arriba"
                          >
                            <Sparkles className="size-3" /> Aplicar
                          </button>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* Especialista: marca atendido (rojo→ámbar) o reabre (ámbar→rojo) */}
                        {ctx.esEquipo && !ctx.esRevisor && c.estado === "open" && (
                          <BtnAccion disabled={ctx.pendiente} tone="primary" onClick={() => ctx.marcar(c.id, "done")}>
                            Marcar atendido
                          </BtnAccion>
                        )}
                        {ctx.esEquipo && !ctx.esRevisor && c.estado === "done" && (
                          <BtnAccion disabled={ctx.pendiente} onClick={() => ctx.marcar(c.id, "open")}>
                            Reabrir
                          </BtnAccion>
                        )}
                        {/* Revisor: confirma cualquiera sin cerrar; reabre lo que ya
                            tocó (ámbar o verde) — un confirm por error tiene vuelta. */}
                        {ctx.esRevisor && !ctx.borrador && c.estado !== "closed" && (
                          <BtnAccion disabled={ctx.pendiente} tone="go" onClick={() => ctx.marcar(c.id, "closed")}>
                            Confirmar
                          </BtnAccion>
                        )}
                        {ctx.esRevisor && c.estado !== "open" && (
                          <BtnAccion disabled={ctx.pendiente} onClick={() => ctx.marcar(c.id, "open")}>
                            Reabrir
                          </BtnAccion>
                        )}
                        <BtnAccion onClick={() => verCampo(c)}>Ver campo</BtnAccion>

                        {/* Revisor: descarta la corrección que fijó (borrado duro).
                            Dos pasos — un clic pide confirmación en el mismo sitio. */}
                        {ctx.esRevisor &&
                          (confirmando === c.id ? (
                            <span className="ml-auto inline-flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                ¿Descartar?
                              </span>
                              <BtnAccion
                                disabled={ctx.pendiente}
                                tone="danger"
                                onClick={() => {
                                  ctx.descartar(c.id);
                                  setConfirmando(null);
                                }}
                              >
                                Sí, descartar
                              </BtnAccion>
                              <BtnAccion autoFocus onClick={() => setConfirmando(null)}>Cancelar</BtnAccion>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={ctx.pendiente}
                              onClick={() => setConfirmando(c.id)}
                              aria-label="Descartar corrección"
                              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--status-corrections)_45%,transparent)] hover:text-status-corrections disabled:opacity-50"
                            >
                              <Trash2 className="size-3" /> Descartar
                            </button>
                          ))}
                      </div>
                    </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * Fila compacta de una corrección (label + veredicto + estado). Un clic la expande.
 * Es el formato "encogido" del panel para que 30+ cambios no lo hagan gigante (Pedro).
 */
function TarjetaCompacta({
  borrador,
  c,
  veredicto,
  onExpandir,
}: {
  /** Misma etiqueta que la tarjeta expandida (ver panel): en borrador, "Por enviar". */
  borrador: boolean;
  c: Correccion;
  veredicto: VeredictoCambio | undefined;
  onExpandir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpandir}
      className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-secondary/40"
    >
      {c.targetLabel && (
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
          {c.targetLabel}
        </span>
      )}
      <VeredictoChip v={veredicto} />
      <span
        className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
        style={{ background: PILL[c.estado] }}
      >
        {borrador && c.estado === "open" ? "Por enviar" : ETIQUETA[c.estado]}
      </span>
      <ChevronDown className="size-3.5 -rotate-90 text-muted-foreground" />
    </button>
  );
}

function BtnAccion({
  children,
  onClick,
  disabled,
  tone,
  autoFocus,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "go" | "danger";
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
        tone ? "border-transparent text-white" : "border-border bg-card text-foreground hover:bg-secondary",
      )}
      style={
        tone === "primary" || tone === "danger"
          ? { background: BG_CORAL }
          : tone === "go"
            ? { background: BG_GREEN }
            : undefined
      }
    >
      {children}
    </button>
  );
}
