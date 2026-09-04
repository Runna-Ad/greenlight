"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Lightbulb, RefreshCw, ThumbsDown, ThumbsUp, Wand2, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cambiarHerramienta, calificar, explicar, refinarPrompt } from "@/app/(app)/prisma/actions";
import { TOOL_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import { TOOL_INFO, TOOLS_POR_JOB } from "@/lib/prisma/tools";
import type { PromptSpec, Tool } from "@/lib/prisma/spec";
import type { Salida } from "@/lib/prisma/compilers";
import { prismaGeneracionActiva } from "@/lib/prisma/flags";

export type PromptVivo = {
  specId: string;
  promptId: string;
  tool: Tool;
  spec: PromptSpec;
  salida: Salida;
  valido: boolean;
  errores: string[];
  porque: string | null;
};

/**
 * La pantalla de resultado: el prompt en el formato exacto de la herramienta, Copiar,
 * Abrir en la herramienta, cambiar de herramienta (recompila sin modelo), explicar,
 * refinar y calificar. Sin dead-ends: siempre hay "Nueva idea".
 */
export function Resultado({ vivo, lang, onCambio, onNueva }: { vivo: PromptVivo; lang: Lang; onCambio: (v: PromptVivo) => void; onNueva: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [verExplicacion, setVerExplicacion] = useState(false);
  const [cargandoExp, setCargandoExp] = useState(false);
  const [cambio, setCambio] = useState("");
  const [refinando, setRefinando] = useState(false);
  const [cambiando, setCambiando] = useState<Tool | null>(null);
  const [voto, setVoto] = useState<1 | -1 | null>(null);

  const info = TOOL_INFO[vivo.tool];
  const otras = TOOLS_POR_JOB[vivo.spec.job].filter((t) => t !== vivo.tool);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(vivo.salida.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      toast.error(tx(UI.error, lang));
    }
  };

  // Toda llamada a una server action pasa por aquí: si la llamada REVIENTA (red caída,
  // no un {ok:false}), el finally apaga el spinner igual y el diseñador ve un aviso.
  // Sin esto, un fallo de red dejaba "Generando…" encendido para siempre.
  const correr = async <T,>(fn: () => Promise<T>, apagar: () => void): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      toast.error(tx(UI.error, lang));
      return null;
    } finally {
      apagar();
    }
  };

  const toggleExplicar = async () => {
    if (verExplicacion) return setVerExplicacion(false);
    if (explicacion) return setVerExplicacion(true);
    setCargandoExp(true);
    const r = await correr(() => explicar(vivo.promptId, lang), () => setCargandoExp(false));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setExplicacion(r.texto);
    setVerExplicacion(true);
  };

  const cambiar = async (tool: Tool) => {
    setCambiando(tool);
    const r = await correr(() => cambiarHerramienta(vivo.specId, tool), () => setCambiando(null));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    onCambio({ ...vivo, tool, promptId: r.promptId, salida: r.salida, valido: r.valido, errores: r.errores, porque: null });
  };

  const refinar = async () => {
    if (!cambio.trim()) return;
    setRefinando(true);
    const r = await correr(() => refinarPrompt(vivo.specId, cambio), () => setRefinando(false));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setCambio("");
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    onCambio({ ...vivo, promptId: r.promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores });
  };

  const votar = async (score: 1 | -1) => {
    setVoto(score);
    const r = await correr(() => calificar(vivo.promptId, score), () => undefined);
    if (!r || !r.ok) {
      setVoto(null);
      if (r && !r.ok) toast.error(r.error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera: herramienta + por qué + estado de validación */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{tx(UI.herramienta, lang)}</p>
          <h2 className="text-xl font-semibold text-foreground">{tx(TOOL_LABEL[vivo.tool], lang)}</h2>
          {vivo.porque && <p className="mt-0.5 text-xs text-muted-foreground">{vivo.porque}</p>}
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            vivo.valido ? "border-status-completed/40 bg-status-completed/10 text-status-completed" : "border-status-warning/40 bg-status-warning/10 text-status-warning",
          )}
          title={vivo.valido ? undefined : vivo.errores.join(" · ")}
        >
          {vivo.valido ? <ShieldCheck className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {vivo.valido ? tx(UI.validado, lang) : tx(UI.conObservaciones, lang)}
        </span>
      </div>

      {!vivo.valido && vivo.errores.length > 0 && (
        <ul className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs text-foreground">
          {vivo.errores.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>
      )}

      {/* El prompt. Los botones van en su propia fila (no flotando sobre el texto): en
          móvil un botón absoluto tapaba la primera línea del prompt. */}
      <div>
        <div className="mb-2 flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={copiar} aria-live="polite">
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? tx(UI.copiado, lang) : tx(UI.copiar, lang)}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={info.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {tx(UI.abrirEn, lang)} {info.nombre}
            </a>
          </Button>
        </div>
        <pre
          tabIndex={0}
          aria-label={`Prompt ${info.nombre}`}
          className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-4 font-mono text-[13px] leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {vivo.salida.texto}
        </pre>
      </div>

      {/* Acciones secundarias */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={toggleExplicar} disabled={cargandoExp}>
          {cargandoExp ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
          {verExplicacion ? tx(UI.ocultarExplicacion, lang) : tx(UI.explicar, lang)}
        </Button>
        {otras.map((t) => (
          <Button key={t} variant="ghost" size="sm" onClick={() => cambiar(t)} disabled={cambiando !== null}>
            {cambiando === t ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {tx(TOOL_LABEL[t], lang)}
          </Button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => votar(1)}
            aria-pressed={voto === 1}
            aria-label={tx(UI.gustó, lang)}
            className={cn("rounded-full p-2 transition-colors hover:bg-secondary", voto === 1 ? "text-status-completed" : "text-muted-foreground")}
          >
            <ThumbsUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => votar(-1)}
            aria-pressed={voto === -1}
            aria-label={tx(UI.noGustó, lang)}
            className={cn("rounded-full p-2 transition-colors hover:bg-secondary", voto === -1 ? "text-destructive" : "text-muted-foreground")}
          >
            <ThumbsDown className="size-4" />
          </button>
        </span>
      </div>

      {verExplicacion && explicacion && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">{explicacion}</div>
      )}

      {/* Refinar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="prisma-refinar" className="block text-sm font-medium text-foreground">
          {tx(UI.refinar, lang)}
        </label>
        <Textarea
          id="prisma-refinar"
          value={cambio}
          onChange={(e) => setCambio(e.target.value)}
          placeholder={tx(UI.refinarPlaceholder, lang)}
          rows={2}
          className="mt-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void refinar();
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button size="sm" onClick={refinar} disabled={refinando || !cambio.trim()}>
            {refinando ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {refinando ? tx(UI.generando, lang) : tx(UI.aplicarCambio, lang)}
          </Button>
          <Button size="sm" variant="ghost" onClick={onNueva}>
            {lang === "es" ? "Nueva idea" : "New idea"}
          </Button>
        </div>
      </div>

      {/* v2: generar dentro de la app. El botón existe (para que se sienta el camino) pero apagado. */}
      {!prismaGeneracionActiva() && (
        <p className="text-center text-xs text-muted-foreground">{tx(UI.generarEnApp, lang)}</p>
      )}
    </div>
  );
}
