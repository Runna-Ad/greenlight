"use client";

import { useState } from "react";
import { PlayCircle, Pencil, Check } from "lucide-react";

import { parseReferencias, type TrendSegmento } from "@/lib/referencia";
import { CampoIntake } from "./campo-intake";

type RefLink = Extract<TrendSegmento, { tipo: "ref" }>;

/**
 * El "Trend / Referencias" del mockup, ahora como BOTÓN (Pedro): "Ver referencia"
 * abre la liga en otra pestaña. La agencia edita las ligas con el lápiz (que
 * revela el textarea crudo — lo que se guarda en `ideas.trend`). El cliente y la
 * vista de lectura sólo ven el botón. Si hay varias referencias, una por botón.
 */
export function BotonReferencia({
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
  const refs = parseReferencias(valor).filter((r): r is RefLink => r.tipo === "ref");

  if (!soloLectura && editando) {
    return (
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            Referencia
          </span>
          <button
            type="button"
            onClick={() => setEditando(false)}
            aria-label="Listo"
            className="text-muted-foreground/60 hover:text-foreground"
          >
            <Check className="size-3" />
          </button>
        </div>
        <CampoIntake
          ideaId={ideaId}
          campo="trend"
          label=""
          valorInicial={valorInicial}
          placeholder="Pega aquí la liga de referencia (una por línea)…"
          rows={2}
          caja
          onCambio={setValor}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {refs.map((r, i) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noreferrer"
          title={r.url}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {refs.length > 1 ? r.label : "Ver referencia"} <PlayCircle className="size-4" />
        </a>
      ))}
      {refs.length === 0 && !soloLectura && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary/45 hover:text-foreground"
        >
          <Pencil className="size-3.5" /> Agregar referencia
        </button>
      )}
      {refs.length > 0 && !soloLectura && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label="Editar referencia"
          className="text-muted-foreground/60 hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}
