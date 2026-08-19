"use client";

import { MessageSquareText, ArrowRight } from "lucide-react";
import { keyCampo } from "@/lib/correcciones";

export type ComentarioCliente = {
  id: string;
  body: string;
  fecha: string | null;
  /** Ancla al campo (si el cambio del cliente vino localizado, 0037). */
  targetTabla?: string | null;
  targetFilaId?: string | null;
  targetCampo?: string | null;
  targetQuote?: string | null;
};

/** Salta al campo del plano y lo hace destellar — mismo gesto que "Ver campo" del
 *  panel interno. El resaltado ROJO ya vive en el plano (deCampo lo pinta); esto
 *  sólo lleva la vista hasta él. */
function verCampo(c: ComentarioCliente) {
  if (!c.targetCampo) return;
  const k = keyCampo(c.targetTabla ?? null, c.targetFilaId ?? null, c.targetCampo ?? null);
  const el = document.querySelector<HTMLElement>(`[data-campo-key="${k}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("gl-flash");
  void el.offsetWidth;
  el.classList.add("gl-flash");
}

/**
 * Lo que el CLIENTE pidió cambiar desde el portal (kind='client_change'). Ahora vive
 * en la columna derecha, junto al panel de correcciones, y cada cambio es CLICABLE:
 * salta a su campo en el plano (que ya se resalta en rojo). Los localizados muestran
 * la frase citada; los libres (legacy, sin ancla) sólo el texto.
 */
export function ClienteFeedback({ comentarios }: { comentarios: ComentarioCliente[] }) {
  if (!comentarios.length) return null;
  return (
    <div
      className="rounded-xl border p-3.5"
      style={{
        borderColor: "color-mix(in srgb, var(--status-corrections) 40%, var(--border))",
        background: "color-mix(in srgb, var(--status-corrections) 6%, transparent)",
      }}
    >
      <p
        className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
      >
        <MessageSquareText className="size-4" />
        {comentarios.length === 1 ? "El cliente pidió un cambio" : `El cliente pidió ${comentarios.length} cambios`}
      </p>
      <ul className="space-y-2">
        {comentarios.map((c) => {
          const anclado = !!c.targetCampo;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => verCampo(c)}
                disabled={!anclado}
                className="group w-full rounded-lg border border-border bg-card p-2.5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-[color-mix(in_srgb,var(--status-corrections)_45%,transparent)]"
              >
                {c.targetQuote && (
                  <p className="mb-0.5 truncate text-[11px] italic text-status-corrections" title={c.targetQuote}>
                    En &laquo;{c.targetQuote}&raquo;:
                  </p>
                )}
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{c.body}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {c.fecha && <p className="text-[11px] text-muted-foreground">{c.fecha}</p>}
                  {anclado && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold text-status-corrections opacity-0 transition-opacity group-hover:opacity-100">
                      Ver en el plano <ArrowRight className="size-3" />
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
