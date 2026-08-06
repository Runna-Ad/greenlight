"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Check } from "lucide-react";

import { parseReferencias } from "@/lib/referencia";
import { CampoIntake } from "./campo-intake";

/**
 * El campo Trend, pero mostrando las referencias CORTAS: "Referencia 1",
 * "Referencia 2"… en vez del URL largo (Pedro). Cada una se abre si es link.
 *
 * Por defecto muestra los chips; el lápiz abre el textarea para editar el texto
 * crudo (que es lo que se guarda). Los chips se re-parsean del valor en vivo,
 * así que al editar se actualizan sin recargar.
 */
export function CampoReferencias({
  ideaId,
  valorInicial,
  soloLectura,
}: {
  ideaId: string;
  valorInicial: string | null;
  soloLectura?: boolean;
}) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [editando, setEditando] = useState(false);
  const refs = parseReferencias(valor);

  // Sin nada escrito, o mientras se edita, se muestra el textarea normal.
  const mostrarEditor = editando || refs.length === 0;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          Trend
        </span>
        {!soloLectura && (
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            aria-label={editando ? "Listo" : "Editar trend"}
            className="text-muted-foreground/60 hover:text-foreground"
          >
            {editando ? <Check className="size-3" /> : <Pencil className="size-2.5" />}
          </button>
        )}
      </div>

      {mostrarEditor ? (
        <CampoIntake
          ideaId={ideaId}
          campo="trend"
          label=""
          valorInicial={valorInicial}
          placeholder="Pega aquí links de referencia (uno por línea) o el asset a recrear…"
          rows={2}
          caja
          soloLectura={soloLectura}
          onCambio={setValor}
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {refs.map((r) =>
            r.url ? (
              <a
                key={r.label}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                title={r.texto}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                {r.label} <ExternalLink className="size-3" />
              </a>
            ) : (
              <span
                key={r.label}
                title={r.texto}
                className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
              >
                {r.label}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
