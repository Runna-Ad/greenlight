"use client";

import { ArrowLeft, MessageCircleQuestion, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "@/components/intake/chip-select";
import { UI, tx, type Lang } from "@/lib/prisma/copy";
import type { Pregunta } from "@/lib/prisma/entrevista";

/**
 * La entrevista: hasta 3 preguntas con chips (2–4 opciones + "otra…"). Cada pregunta es
 * opcional; "Saltar" sigue sin responder; "Sin preguntas, sorpréndeme" apaga la entrevista
 * en este navegador (localStorage) hasta que el diseñador la vuelva a encender.
 */
export function Entrevista({ preguntas, respuestas, lang, onCambio, onSeguir, onSaltar, onSinPreguntas, onAtras }: { preguntas: Pregunta[]; respuestas: Record<string, string>; lang: Lang; onCambio: (id: string, valor: string | null) => void; onSeguir: () => void; onSaltar: () => void; onSinPreguntas: () => void; onAtras: () => void }) {
  const contestadas = preguntas.filter((p) => respuestas[p.id]).length;
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{tx(UI.entrevistaIntro, lang).replace("{n}", String(preguntas.length))}</span>
      </p>
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
      <p className="sr-only" aria-live="polite">{contestadas} / {preguntas.length}</p>
      <button type="button" onClick={onSinPreguntas} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        {tx(UI.sinPreguntas, lang)}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <Button variant="ghost" size="sm" onClick={onAtras}>
          <ArrowLeft className="size-4" /> {tx(UI.atras, lang)}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSaltar}>
            <SkipForward className="size-4" /> {tx(UI.saltar, lang)}
          </Button>
          <Button size="sm" onClick={onSeguir}>
            {contestadas > 0 ? tx(UI.seguirConRespuestas, lang).replace("{n}", String(contestadas)) : tx(UI.siguiente, lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}
