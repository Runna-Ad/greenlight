"use client";

import { ArrowLeft, Loader2, MessageCircleQuestion, SkipForward, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "@/components/intake/chip-select";
import { UI, tx, type Lang } from "@/lib/prisma/copy";
import type { Pregunta } from "@/lib/prisma/entrevista";

/**
 * La entrevista: hasta 3 preguntas con chips (2–4 opciones + "otra…"). Cada pregunta es
 * opcional; "Saltar" sigue sin responder (en la ronda 2 o 3 sólo se salta ESA ronda); "Sin
 * preguntas, sorpréndeme" apaga la entrevista en este navegador (localStorage) hasta que el
 * diseñador la vuelva a encender. F5c: "Profundizar (3 más)" pide otra ronda — hasta 3 — y lo
 * ya contestado queda a la vista. "Seguir" es siempre el botón principal: nadie queda obligado.
 */
export function Entrevista({
  preguntas,
  respuestas,
  lang,
  onCambio,
  onSeguir,
  onSaltar,
  onSinPreguntas,
  onAtras,
  ronda = 1,
  maxRondas = 1,
  anteriores = [],
  puedeProfundizar = false,
  profundizando = false,
  onProfundizar,
}: {
  preguntas: Pregunta[];
  respuestas: Record<string, string>;
  lang: Lang;
  onCambio: (id: string, valor: string | null) => void;
  onSeguir: () => void;
  onSaltar: () => void;
  onSinPreguntas: () => void;
  onAtras: () => void;
  ronda?: number;
  maxRondas?: number;
  /** Lo contestado en rondas anteriores, ya en palabras del diseñador. */
  anteriores?: { pregunta: string; respuesta: string }[];
  puedeProfundizar?: boolean;
  profundizando?: boolean;
  onProfundizar?: () => void;
}) {
  const contestadas = preguntas.filter((p) => respuestas[p.id]).length + anteriores.length;
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {ronda > 1
            ? tx(UI.entrevistaIntroRonda, lang).replace("{n}", String(ronda)).replace("{m}", String(maxRondas))
            : tx(UI.entrevistaIntro, lang).replace("{n}", String(preguntas.length))}
        </span>
      </p>
      {anteriores.length > 0 && (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{tx(UI.yaContestaste, lang)}</span> {anteriores.map((a) => `${a.pregunta} → ${a.respuesta}`).join(" · ")}
        </p>
      )}
      {preguntas.map((p, i) => (
        <div key={p.id} role="group" aria-labelledby={`prisma-pregunta-${p.id}`}>
          <p id={`prisma-pregunta-${p.id}`} className="mb-1.5 text-sm font-medium text-foreground">
            <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
            {tx(p.pregunta, lang)}
          </p>
          <ChipSelect
            options={p.opciones.map((o) => ({ value: o.valor, label: tx(o.label, lang) }))}
            selected={respuestas[p.id] ? [respuestas[p.id]] : []}
            onChange={(up) => onCambio(p.id, up(respuestas[p.id] ? [respuestas[p.id]] : [])[0] ?? null)}
            ariaLabel={tx(p.pregunta, lang)}
            allowCustom
            customPlaceholder={lang === "es" ? "Otra…" : "Other…"}
          />
        </div>
      ))}
      <p className="sr-only" aria-live="polite">
        {contestadas} / {preguntas.length + anteriores.length}
      </p>
      <button type="button" onClick={onSinPreguntas} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        {tx(UI.sinPreguntas, lang)}
      </button>
      {/* Las salidas "hacia atrás" a la izquierda, las que avanzan a la derecha: en una tarjeta angosta
          se parten en dos filas limpias en vez de tres (Seguir siempre a la derecha, abajo). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onAtras} disabled={profundizando}>
            <ArrowLeft className="size-4" /> {tx(UI.atras, lang)}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSaltar} disabled={profundizando}>
            <SkipForward className="size-4" /> {tx(UI.saltar, lang)}
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {puedeProfundizar && onProfundizar && (
            <Button variant="outline" size="sm" onClick={onProfundizar} disabled={profundizando} className="gap-1.5">
              {profundizando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {tx(profundizando ? UI.profundizando : UI.profundizar, lang)}
            </Button>
          )}
          <Button size="sm" onClick={onSeguir} disabled={profundizando}>
            {contestadas > 0 ? tx(UI.seguirConRespuestas, lang).replace("{n}", String(contestadas)) : tx(UI.siguiente, lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}
