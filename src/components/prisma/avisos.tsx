"use client";

import { AlertTriangle, Check, ExternalLink, Lightbulb, Loader2, OctagonAlert, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NIVEL_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import type { Aviso, Nivel, Resolucion } from "@/lib/prisma/diagnostico";
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
 * de H.Ü.E). Cada tarjeta: qué pasa · por qué · el arreglo · la fuente (así "H.Ü.E dice" se
 * vuelve "está documentado") · y F5c: SIEMPRE una salida — "Arreglarlo" (un click), "Arreglarlo
 * con H.Ü.E" / "Que H.Ü.E lo arregle" (al generar), o "Entendido". Color + ícono + texto: el
 * nivel nunca se comunica sólo con color.
 */
export function PanelAvisos({
  avisos: todos,
  lang,
  onArreglar,
  aplicando = null,
  titulo,
  resolver,
  onHue,
  onEntendido,
  pedidos,
  ocultos = 0,
  onMostrarOcultos,
}: {
  avisos: Aviso[];
  lang: Lang;
  onArreglar?: (a: Aviso) => void;
  aplicando?: string | null;
  titulo?: string;
  /** F5c: qué salida lleva cada aviso en ESTA pantalla (sin él: sólo "Arreglarlo", como antes). */
  resolver?: (a: Aviso) => Resolucion;
  onHue?: (a: Aviso) => void;
  onEntendido?: (a: Aviso) => void;
  /** Paso 3: los avisos que H.Ü.E arreglará al generar (el botón queda marcado y se puede quitar). */
  pedidos?: ReadonlySet<string>;
  /** Cuántos se ocultaron con "Entendido" (para poder volver a verlos). */
  ocultos?: number;
  onMostrarOcultos?: () => void;
}) {
  // Los avisos internos (señales para el Hub) no se le enseñan al diseñador.
  const avisos = todos.filter((a) => !a.interno);
  if (!avisos.length && !ocultos) return null;
  const salida = (a: Aviso): Resolucion => resolver?.(a) ?? (a.accion && a.accion.tipo !== "nota" ? "arreglar" : "ninguna");
  const boton = "h-7 gap-1.5 px-2.5 text-xs";
  return (
    <section aria-label={titulo ?? tx(UI.avisosTitulo, lang)} aria-live="polite" className="space-y-2">
      {titulo && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{titulo}</p>}
      <ul className="space-y-2">
        {avisos.map((a, i) => {
          const Icono = ICONO[a.nivel] ?? AlertTriangle;
          const r = salida(a);
          const conAccion = r === "arreglar" && !!onArreglar;
          const pedido = !!pedidos?.has(a.codigo);
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
                      <Button size="sm" variant={a.nivel === "bloquea" ? "destructive" : "secondary"} disabled={aplicando !== null} onClick={() => onArreglar?.(a)} className={boton} aria-label={`${tx(UI.arreglarlo, lang)}: ${tx(a.que, lang)}`}>
                        {aplicando === a.codigo ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                        {tx(UI.arreglarlo, lang)}
                      </Button>
                    )}
                    {r === "hue" && onHue && !pedidos && (
                      <Button size="sm" variant="secondary" disabled={aplicando !== null} onClick={() => onHue(a)} className={boton} aria-label={`${tx(UI.arreglarConHue, lang)}: ${tx(a.que, lang)}`}>
                        {aplicando === a.codigo ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        {tx(UI.arreglarConHue, lang)}
                      </Button>
                    )}
                    {r === "hue" && onHue && pedidos && (
                      <Button size="sm" variant={pedido ? "default" : "secondary"} aria-pressed={pedido} onClick={() => onHue(a)} className={boton} aria-label={`${tx(pedido ? UI.hueLoArreglara : UI.queHueLoArregle, lang)}: ${tx(a.que, lang)}`}>
                        {pedido ? <Check className="size-3.5" /> : <Sparkles className="size-3.5" />}
                        {tx(pedido ? UI.hueLoArreglara : UI.queHueLoArregle, lang)}
                      </Button>
                    )}
                    {r === "entendido" && onEntendido && (
                      <Button size="sm" variant="ghost" onClick={() => onEntendido(a)} className={boton} aria-label={`${tx(UI.entendido, lang)}: ${tx(a.que, lang)}`}>
                        <Check className="size-3.5" />
                        {tx(UI.entendido, lang)}
                      </Button>
                    )}
                    {a.fuente && /^https?:\/\//i.test(a.fuente.url) && (
                      <a href={a.fuente.url} target="_blank" rel="noopener noreferrer" aria-label={`${a.fuente.tipo === "comunidad" ? tx(UI.fuenteComunidad, lang) : tx(UI.fuenteOficial, lang)}: ${tx(a.que, lang)}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
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
      {ocultos > 0 && onMostrarOcultos && (
        <button type="button" onClick={onMostrarOcultos} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {tx(UI.avisosOcultos, lang).replace("{n}", String(ocultos))}
        </button>
      )}
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
