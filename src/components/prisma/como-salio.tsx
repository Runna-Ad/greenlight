"use client";

import { useState } from "react";
import { Check, CheckCircle2, ImagePlus, Loader2, RefreshCw, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aceptarResultado, corregirResultado, subirResultado, type ResultadoCorregir } from "@/app/(app)/prisma/resultado-actions";
import { CAMPO_VEREDICTO_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import { useCatalogo } from "./catalogo-contexto";
import type { ResultadoVivo } from "@/lib/prisma/resultado";
import { JOB_KIND, type JobType, type Tool } from "@/lib/prisma/spec";

/**
 * "¿Cómo salió?" — el diseñador sube la imagen que le dio la herramienta (o un cuadro, si es
 * video) y H.Ü.E la compara con lo pedido: lista ✓/✗ con una nota por punto, y tres salidas:
 * corregir ESE resultado (prompt hermano de edición), refinar el original con el cambio que
 * H.Ü.E sugiere, o marcarlo como resultado final aceptado. Va con `key={promptId}`: un prompt
 * nuevo empieza sin resultado.
 */
export function ComoSalio({
  specId,
  promptId,
  tool,
  job,
  lang,
  inicial,
  modeloSugerido,
  ocupado,
  onCorreccion,
  onRefinar,
}: {
  specId: string;
  promptId: string;
  tool: Tool;
  job: JobType;
  lang: Lang;
  /** El último resultado subido para este prompt (al reabrir desde el historial). */
  inicial: ResultadoVivo | null;
  /** El id del modelo que "Úsalo en…" recomendó: prellena "¿en cuál lo generaste?". */
  modeloSugerido: string;
  /** Otra acción del resultado va al servidor: aquí se espera. */
  ocupado: boolean;
  onCorreccion: (r: ResultadoCorregir) => void;
  /** Refinar el original con el cambio sugerido; devuelve si se aplicó. */
  onRefinar: (texto: string) => Promise<boolean>;
}) {
  const [resultado, setResultado] = useState<ResultadoVivo | null>(inicial);
  const [modelo, setModelo] = useState(modeloSugerido);
  const [subiendo, setSubiendo] = useState(false);
  const [over, setOver] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [refinando, setRefinando] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const video = JOB_KIND[job] === "video";
  const esDemo = specId === "demo";
  // F6a: los modelos de hoy (Hub › Herramientas); el servidor valida contra los mismos.
  const modelos = useCatalogo()[tool].modelos;
  const bloqueado = ocupado || subiendo || corrigiendo || refinando || aceptando;

  const subir = async (file: File) => {
    if (esDemo) return;
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("specId", specId);
      form.append("promptId", promptId);
      form.append("modelo", modelo);
      const r = await subirResultado(form);
      if (!r.ok) return void toast.error(r.error);
      setResultado(r.resultado);
      toast.success(tx(UI.resultadoGuardado, lang));
    } catch {
      toast.error(tx(UI.error, lang));
    } finally {
      setSubiendo(false);
    }
  };

  const corregir = async () => {
    if (!resultado) return;
    setCorrigiendo(true);
    try {
      const r = await corregirResultado(resultado.id);
      if (!r.ok) return void toast.error(r.error);
      onCorreccion(r);
    } catch {
      toast.error(tx(UI.error, lang));
    } finally {
      setCorrigiendo(false);
    }
  };

  const refinar = async () => {
    const texto = resultado?.veredicto.refine ? tx(resultado.veredicto.refine, lang) : "";
    if (!texto) return;
    setRefinando(true);
    try {
      await onRefinar(texto);
    } finally {
      setRefinando(false);
    }
  };

  const aceptar = async (si: boolean) => {
    if (!resultado) return;
    setAceptando(true);
    // Optimista: el click se ve al instante; si el servidor dice que no, vuelve.
    const antes = resultado.aceptado;
    setResultado({ ...resultado, aceptado: si });
    try {
      const r = await aceptarResultado(resultado.id, si);
      if (!r.ok) {
        setResultado((prev) => (prev ? { ...prev, aceptado: antes } : prev));
        toast.error(r.error);
      }
    } catch {
      setResultado((prev) => (prev ? { ...prev, aceptado: antes } : prev));
      toast.error(tx(UI.error, lang));
    } finally {
      setAceptando(false);
    }
  };

  const okN = resultado ? resultado.veredicto.cumple.filter((c) => c.ok).length : 0;
  const totalN = resultado ? resultado.veredicto.cumple.length : 0;
  const todoBien = totalN > 0 && okN === totalN;

  return (
    <section aria-label={tx(UI.comoSalio, lang)} className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Upload className="size-4 text-primary" aria-hidden="true" />
        {tx(UI.comoSalio, lang)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{tx(video ? UI.comoSalioVideo : UI.comoSalioAyuda, lang)}</p>

      {!resultado ? (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`prisma-modelo-${promptId}`} className="block text-xs font-medium text-foreground">
              {tx(UI.modeloUsado, lang)}
            </label>
            <select
              id={`prisma-modelo-${promptId}`}
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              disabled={bloqueado || esDemo}
              className="mt-1 h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.etiqueta}
                </option>
              ))}
              <option value="otro">{tx(UI.modeloOtro, lang)}</option>
            </select>
          </div>
          {/* <label>, no <button>: mismo patrón (y motivo) que RefUploader. */}
          <label
            aria-busy={subiendo}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !bloqueado) void subir(f);
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              over ? "border-primary bg-primary/8" : "border-border bg-card/50 hover:border-primary",
              (subiendo || esDemo) && "cursor-wait opacity-70",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              {subiendo ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{subiendo ? tx(UI.comparando, lang) : tx(UI.subirResultado, lang)}</span>
              <span className="block text-xs text-muted-foreground">JPG · PNG · WebP · GIF · &lt; 3.5 MB</span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              aria-label={tx(UI.subirResultado, lang)}
              disabled={bloqueado || esDemo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void subir(f);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultado.url} alt={resultado.veredicto.caption ?? tx(UI.comoSalio, lang)} className="size-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(UI.veredictoTitulo, lang)}</p>
              <p className={cn("mt-1 text-sm font-medium", todoBien ? "text-status-completed" : "text-foreground")}>
                {todoBien ? tx(UI.veredictoTodoBien, lang) : tx(UI.veredictoPuntos, lang).replace("{ok}", String(okN)).replace("{n}", String(totalN))}
              </p>
              {resultado.veredicto.caption && <p className="mt-0.5 text-xs text-muted-foreground">{resultado.veredicto.caption}</p>}
              {resultado.aceptado && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-status-completed/40 bg-status-completed/10 px-2.5 py-0.5 text-xs font-medium text-status-completed">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" /> {tx(UI.aceptado, lang)}
                </p>
              )}
            </div>
          </div>

          {/* Un punto por fila: ícono + palabra + nota — el estado nunca va sólo en el color. */}
          <ul className="space-y-1.5" aria-label={tx(UI.veredictoTitulo, lang)}>
            {resultado.veredicto.cumple.map((c) => (
              <li key={c.campo} className="flex items-start gap-2 text-sm">
                {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-status-completed" aria-hidden="true" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{tx(CAMPO_VEREDICTO_LABEL[c.campo], lang)}</span>
                  <span className="sr-only">: {c.ok ? tx(UI.cumple, lang) : tx(UI.noCumple, lang)}</span>
                  {tx(c.nota, lang) && <span className="text-muted-foreground"> · {tx(c.nota, lang)}</span>}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            {resultado.corregible && (
              <Button size="sm" onClick={corregir} disabled={bloqueado || esDemo} aria-busy={corrigiendo} title={tx(UI.corregirAyuda, lang)}>
                {corrigiendo ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {corrigiendo ? tx(UI.corrigiendo, lang) : tx(UI.corregirResultado, lang)}
              </Button>
            )}
            {resultado.veredicto.refine && (
              <Button size="sm" variant="outline" onClick={refinar} disabled={bloqueado || esDemo} aria-busy={refinando} title={tx(UI.refinarOriginalAyuda, lang)}>
                {refinando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {tx(UI.refinarOriginal, lang)}
              </Button>
            )}
            <Button size="sm" variant={resultado.aceptado ? "ghost" : "secondary"} onClick={() => aceptar(!resultado.aceptado)} disabled={bloqueado || esDemo} aria-pressed={resultado.aceptado} aria-busy={aceptando}>
              <CheckCircle2 className="size-4" />
              {resultado.aceptado ? tx(UI.quitarAceptado, lang) : tx(UI.aceptarFinal, lang)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResultado(null)} disabled={bloqueado} className="ml-auto">
              {tx(UI.subirOtro, lang)}
            </Button>
          </div>
          {resultado.veredicto.refine && <p className="text-xs text-muted-foreground">{tx(UI.refinarOriginal, lang)}: «{tx(resultado.veredicto.refine, lang)}»</p>}
        </div>
      )}
    </section>
  );
}
