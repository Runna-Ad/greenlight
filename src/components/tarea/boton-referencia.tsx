"use client";

import { useState } from "react";
import { PlayCircle, Pencil, Check, BookOpenCheck, EyeOff, Info } from "lucide-react";

import { parseReferencias, type TrendSegmento } from "@/lib/referencia";
import { clasificarReferencia, etiquetaLectura, type Lectura } from "@/lib/referencia-lectura-url";
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
  lecturas,
  soloLectura,
}: {
  ideaId: string;
  valorInicial: string | null;
  /** Lo que H.Ü.E pudo leer de cada liga (caché, 0064). La página SÓLO la pasa al equipo:
   *  `undefined` = no eres equipo → el badge no se construye (el cliente no ve la cocina;
   *  `soloLectura` NO sirve de gate: una tarea abierta no es de sólo lectura para el cliente). */
  lecturas?: Lectura[];
  soloLectura?: boolean;
}) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [editando, setEditando] = useState(false);
  const refs = parseReferencias(valor).filter((r): r is RefLink => r.tipo === "ref");

  if (!soloLectura && editando) {
    return (
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            Referencia · una liga por línea
          </span>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
          >
            <Check className="size-3" /> Listo
          </button>
        </div>
        <CampoIntake
          ideaId={ideaId}
          campo="trend"
          label=""
          // El valor VIVO (no `valorInicial`), porque este editor se desmonta al
          // colapsar en botón: si re-sembramos `useAutoguardado` con el valor
          // ORIGINAL, su compare-and-set choca contra lo ya guardado en la 2ª
          // edición y NO escribe (conflicto espurio → "no se guardó"). Con el
          // valor vivo la base de comparación es lo que de verdad está en la BD.
          valorInicial={valor}
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
          key={`${i}-${r.url}`}
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
      {/* Qué pudo leer H.Ü.E (0064): sólo para el equipo — `lecturas` sólo llega si lo eres. */}
      {refs.length > 0 && lecturas !== undefined && (
        <ul role="list" className="basis-full space-y-0.5" aria-label="Lectura de referencias por H.Ü.E">
          {refs.map((r, i) => {
            const c = clasificarReferencia(r.url);
            const l = lecturas.find((x) => x.url === c.canonica) ?? null;
            const e = etiquetaLectura(l, c.tipo);
            const Icono = e.tono === "ok" ? BookOpenCheck : e.tono === "aviso" ? EyeOff : Info;
            return (
              <li
                key={`${i}-${r.url}`}
                className={`flex items-start gap-1.5 text-[11px] leading-snug ${
                  e.tono === "ok" ? "text-emerald-700 dark:text-emerald-400" : e.tono === "aviso" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                }`}
              >
                <Icono className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>
                  {refs.length > 1 && <span className="font-semibold">{r.label} · </span>}
                  {e.texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
