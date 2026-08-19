"use client";

import { useState } from "react";
import { Trash2, ChevronDown, Sparkles } from "lucide-react";
import { useCorrecciones } from "./contexto";
import { TagTipoCambio } from "../selector-tipo-cambio";
import { VeredictoChip } from "../veredicto-chip";
import { keyCampo, porRonda, sinResolver, type Correccion, type EstadoCorreccion } from "@/lib/correcciones";
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
  if (!ctx || !ctx.correcciones.length) return null;

  const grupos = porRonda(ctx.correcciones);
  const rondaActual = grupos[0]?.ronda;
  const pendientes = sinResolver(ctx.correcciones);

  return (
    <aside className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Correcciones
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
            ? "Confirma cada una al revisarla; la tarea se aprueba cuando no quede ninguna en rojo."
            : "Atiende cada cambio y márcalo; luego devuelve la tarea a revisión."}
        </p>
        {/* H.Ü.E revisa cada cambio de la ronda y da dictamen + sugerencia — ADVISORY,
            ayuda a revisar; el lead decide. Disponible siempre que haya cambios que
            revisar (no sólo mientras quedan sin confirmar). */}
        {ctx.esRevisor && (
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
                    n.has(ronda) ? n.delete(ronda) : n.add(ronda);
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
                  {items.map((c) => (
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
                        <TagTipoCambio slug={c.categoria} />
                        <VeredictoChip v={ctx.veredictos.get(c.id)} />
                        <span
                          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: PILL[c.estado] }}
                        >
                          {ETIQUETA[c.estado]}
                        </span>
                      </div>
                      {c.targetQuote && (
                        <p className="mb-0.5 text-[11px] italic text-status-corrections" title={c.targetQuote}>
                          En &laquo;{c.targetQuote}&raquo;:
                        </p>
                      )}
                      <p className="text-[12.5px] leading-snug text-foreground">{c.body}</p>
                      {c.autor && <p className="mt-1 text-[10.5px] text-muted-foreground">{c.autor}</p>}

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
                        {ctx.esRevisor && c.estado !== "closed" && (
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
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
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
