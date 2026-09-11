"use client";

import { AlertTriangle, ExternalLink, Lightbulb, Loader2, OctagonAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NIVEL_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import type { Aviso, Nivel } from "@/lib/prisma/diagnostico";
import type { Cambio } from "@/lib/prisma/ortografia";

const ICONO: Record<Nivel, typeof AlertTriangle> = { bloquea: OctagonAlert, advierte: AlertTriangle, sugiere: Lightbulb };
const TONO: Record<Nivel, string> = {
  bloquea: "border-destructive/40 bg-destructive/10 text-destructive",
  advierte: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  sugiere: "border-border bg-secondary text-muted-foreground",
};
const fecha = (iso: string | null, lang: Lang) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : null);

/**
 * El panel de avisos: un solo lenguaje de problemas (reglas, validador, ortografía, juicio
 * de H.Ü.E). Cada tarjeta: qué pasa · por qué · el arreglo · "Arreglarlo" si hay acción de un
 * click · la fuente (así "H.Ü.E dice" se vuelve "está documentado"). Color + ícono + texto:
 * el nivel nunca se comunica sólo con color.
 */
export function PanelAvisos({ avisos, lang, onArreglar, aplicando = null, titulo }: { avisos: Aviso[]; lang: Lang; onArreglar?: (a: Aviso) => void; aplicando?: string | null; titulo?: string }) {
  if (!avisos.length) return null;
  return (
    <section aria-label={titulo ?? tx(UI.avisosTitulo, lang)} aria-live="polite" className="space-y-2">
      {titulo && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{titulo}</p>}
      <ul className="space-y-2">
        {avisos.map((a, i) => {
          const Icono = ICONO[a.nivel] ?? AlertTriangle;
          const conAccion = !!a.accion && a.accion.tipo !== "nota" && !!onArreglar;
          return (
            <li key={`${i}:${a.codigo}`} className={cn("rounded-xl border px-3 py-2.5", TONO[a.nivel])}>
              <div className="flex items-start gap-2.5">
                <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    <span className="sr-only">{tx(NIVEL_LABEL[a.nivel], lang)}: </span>
                    {tx(a.que, lang)}
                  </p>
                  {a.porque && <p className="mt-0.5 text-xs text-muted-foreground">{tx(a.porque, lang)}</p>}
                  {a.arreglo && <p className="mt-1 text-xs text-foreground">{tx(a.arreglo, lang)}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {conAccion && (
                      <Button size="sm" variant={a.nivel === "bloquea" ? "destructive" : "secondary"} disabled={aplicando !== null} onClick={() => onArreglar?.(a)} className="h-7 gap-1.5 px-2.5 text-xs">
                        {aplicando === a.codigo ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                        {tx(UI.arreglarlo, lang)}
                      </Button>
                    )}
                    {a.fuente && /^https?:\/\//i.test(a.fuente.url) && (
                      <a href={a.fuente.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3" aria-hidden="true" />
                        {a.fuente.tipo === "comunidad" ? tx(UI.fuenteComunidad, lang) : tx(UI.fuenteOficial, lang)}
                        {fecha(a.fuente.fecha, lang) ? ` · ${fecha(a.fuente.fecha, lang)}` : ""}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** La sugerencia ortográfica bajo el campo: «texto sugerido» + cambios + Usar / Dejar así. */
export function SugerenciaTexto({ sugerido, cambios, lang, onUsar, onDejar }: { sugerido: string | null; cambios: Cambio[]; lang: Lang; onUsar: () => void; onDejar: () => void }) {
  if (!sugerido) return null;
  return (
    <div className="p-enter mt-2 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2.5" role="status">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        <span>
          <span className="font-medium">{tx(UI.sugiere, lang)}</span> «{sugerido}»
        </span>
      </p>
      {cambios.length > 0 && (
        <ul className="mt-1 pl-6 text-xs text-muted-foreground">
          {cambios.slice(0, 6).map((c, i) => (
            <li key={`${i}:${c.de}→${c.a}`}>
              {c.de} → <span className="text-foreground">{c.a}</span> · {tx(c.motivo, lang)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <Button size="sm" onClick={onUsar} className="h-7 px-2.5 text-xs">
          {tx(UI.usarSugerencia, lang)}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDejar} className="h-7 px-2.5 text-xs">
          {tx(UI.dejarAsi, lang)}
        </Button>
      </div>
    </div>
  );
}
