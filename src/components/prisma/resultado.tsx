"use client";

import { useState, type CSSProperties } from "react";
import { Check, Copy, Cpu, ExternalLink, Eye, Flame, Lightbulb, Minus, RefreshCw, Shield, ThumbsDown, ThumbsUp, Wand2, AlertTriangle, ShieldCheck, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { adaptarFormato, arreglarAviso, cambiarHerramienta, calificar, explicar, refinarPrompt, registrarEvento, revisarBien, variar } from "@/app/(app)/prisma/actions";
import { PanelAvisos } from "./avisos";
import { ComoSalio } from "./como-salio";
import type { ResultadoVivo } from "@/lib/prisma/resultado";
import type { ResultadoCorregir } from "@/app/(app)/prisma/resultado-actions";
import { compilarFusion } from "@/lib/prisma/compilers/fusion";
import { ACCIONES_RESULTADO, resolucionDe, type Aviso } from "@/lib/prisma/diagnostico";
import { DESTINO_LABEL, PEDIR_VERSION_LABEL, TOOL_LABEL, UI, VARIANTE_LABEL, tx, type Lang, type Par } from "@/lib/prisma/copy";
import type { PrismaVariante } from "@/lib/database.types";
import { TOOL_INFO, TOOLS_POR_JOB } from "@/lib/prisma/tools";
import { pistasModelo, recomendarModelo } from "@/lib/prisma/modelo";
import { useCatalogo } from "./catalogo-contexto";
import { DESTINOS, JOB_KIND, type Destino, type PromptSpec, type Tool } from "@/lib/prisma/spec";
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
  porque: Par | null;
  /** base | segura | audaz | minima (chip). */
  variante?: PrismaVariante | null;
  /** Cuánto aprendizaje de la marca entró a esta generación (sólo al generar). */
  aprendio?: { ganadores: number; preferencias: number } | null;
  /** F2: el diagnóstico del resultado (lo calcula el servidor y se guarda con el prompt). */
  avisos?: Aviso[];
  /** F4: es un prompt de corrección (edita un resultado subido). */
  correccion?: boolean;
  /** F4: el último resultado subido para este prompt (al reabrir desde el historial). */
  resultado?: ResultadoVivo | null;
};

/** Las versiones que se pueden pedir, con su ícono. Fuera del componente: no cambian. */
const VERSIONES: { v: Exclude<PrismaVariante, "base">; Icon: typeof Shield }[] = [
  { v: "segura", Icon: Shield },
  { v: "audaz", Icon: Flame },
  { v: "minima", Icon: Minus },
];

/** Copiar/abrir SIEMPRE es instantáneo: el evento se registra por detrás y, si falla, no molesta. */
const anotar = (promptId: string, tipo: "copiado" | "abierto") => {
  if (promptId === "demo") return;
  void registrarEvento(promptId, tipo).catch(() => undefined);
};

/**
 * La pantalla de resultado: el prompt en el formato exacto de la herramienta, Copiar,
 * Abrir en la herramienta, cambiar de herramienta (recompila sin modelo), explicar,
 * refinar y calificar. Sin dead-ends: siempre hay "Nueva idea".
 */
export function Resultado({ vivo, lang, onCambio, onNueva, juicioEnCurso = false, onJuzgar }: { vivo: PromptVivo; lang: Lang; onCambio: (v: PromptVivo) => void; onNueva: () => void; /** F5a: el juicio de H.Ü.E corre en segundo plano para ESTE prompt. */ juicioEnCurso?: boolean; /** F5a: pedir el juicio en segundo plano para un prompt nuevo (video). */ onJuzgar?: (promptId: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [verExplicacion, setVerExplicacion] = useState(false);
  const [cargandoExp, setCargandoExp] = useState(false);
  const [cambio, setCambio] = useState("");
  const [refinando, setRefinando] = useState(false);
  const [cambiando, setCambiando] = useState<Tool | null>(null);
  const [voto, setVoto] = useState<1 | -1 | null>(null);
  const [variando, setVariando] = useState<PrismaVariante | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [juzgando, setJuzgando] = useState(false);
  const [juzgado, setJuzgado] = useState(false);
  const [fusion, setFusion] = useState<string | null>(null);
  const [adaptando, setAdaptando] = useState<Destino | null>(null);
  /** F5c: avisos ocultos con "Entendido", por prompt (`promptId:codigo`): un prompt nuevo trae los suyos. */
  const [ocultos, setOcultos] = useState<string[]>([]);

  const info = TOOL_INFO[vivo.tool];
  const esVideoJob = JOB_KIND[vivo.spec.job] === "video";
  const destinoActual: Destino = vivo.spec.destino ?? "libre";
  // "Úsalo en…": puro y en el cliente; el servidor guarda el mismo cálculo (sobre el spec
  // resultante) en prisma_prompts.modelo_sug para medir si se sigue.
  const catalogo = useCatalogo();
  const modelo = recomendarModelo(pistasModelo(vivo.spec, vivo.tool), catalogo);
  const otras = TOOLS_POR_JOB[vivo.spec.job].filter((t) => t !== vivo.tool);
  // Mientras CUALQUIER acción va al servidor, las demás esperan: dos respuestas cruzadas
  // (cambiar herramienta + otra versión) pisarían el resultado con un `vivo` viejo.
  // `juicioEnCurso` NO bloquea: la gracia de "prompt primero, juicio después" es seguir trabajando;
  // si el prompt cambia mientras tanto, studio descarta el juicio del prompt viejo.
  const ocupado = cambiando !== null || refinando || variando !== null || cargandoExp || aplicando !== null || juzgando || adaptando !== null;
  // Los avisos vienen del servidor; una fila de antes de F2 (o el demo) trae sólo `errores`.
  const avisos: Aviso[] = vivo.avisos ?? vivo.errores.map((e, i) => ({ codigo: `validador_${i + 1}`, nivel: "advierte", que: { es: e, en: e }, porque: null, arreglo: null, accion: null, fuente: null }));
  // El juicio de H.Ü.E ya corrió si hay avisos "hue_"; si no (imagen, o video tras cambiar de
  // herramienta, que recompila sin modelo), se ofrece "Revísalo bien".
  const yaJuzgado = juzgado || juicioEnCurso || avisos.some((a) => a.codigo.startsWith("hue_"));
  // El demo (sólo dev) no tiene filas en la BD: nada que llame al servidor.
  const esDemo = vivo.specId === "demo";
  const IconoVersion = vivo.variante && vivo.variante !== "base" ? VERSIONES.find((x) => x.v === vivo.variante)?.Icon : undefined;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(vivo.salida.texto);
      setCopiado(true);
      anotar(vivo.promptId, "copiado");
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
    setJuzgado(false);
    onCambio({ ...vivo, tool, promptId: r.promptId, salida: r.salida, valido: r.valido, errores: r.errores, porque: null, variante: r.variante, avisos: r.avisos, resultado: null });
  };

  const refinarCon = async (texto: string, apagar: () => void, codigoAviso?: string): Promise<boolean> => {
    // F5c: un aviso lo arregla el SERVIDOR (arma la instrucción desde el aviso guardado y lo anota
    // como aviso_aplicado, no como un refine del diseñador).
    const r = await correr(() => (codigoAviso ? arreglarAviso(vivo.specId, vivo.promptId, codigoAviso) : refinarPrompt(vivo.specId, texto)), apagar);
    if (!r) return false;
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setCambio("");
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    setJuzgado(false);
    onCambio({ ...vivo, promptId: r.promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, avisos: r.avisos, resultado: null });
    if (esVideoJob) onJuzgar?.(r.promptId);
    return true;
  };

  /** F5a: el mismo prompt para OTRO destino, sin modelo: formato nuevo (y zona segura). */
  const adaptar = async (d: Destino) => {
    setAdaptando(d);
    const r = await correr(() => adaptarFormato(vivo.specId, d), () => setAdaptando(null));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setCambio("");
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    setJuzgado(false);
    onCambio({ ...vivo, specId: r.specId, promptId: r.promptId, tool: r.tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: null, variante: r.variante, aprendio: null, avisos: r.avisos, correccion: r.correccion, resultado: null });
    toast.success(tx(UI.adaptado, lang).replace("{d}", tx(DESTINO_LABEL[d], lang)));
  };

  /** F4: "Corregir este resultado" creó un spec hermano de edición: desde aquí todo actúa sobre él. */
  const alCorregir = (r: ResultadoCorregir) => {
    setCambio("");
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    setJuzgado(false);
    onCambio({ ...vivo, specId: r.specId, promptId: r.promptId, tool: r.tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: null, variante: "base", aprendio: null, avisos: r.avisos, correccion: true, resultado: null });
    toast.success(tx(UI.correccion, lang));
  };

  const refinar = async () => {
    if (!cambio.trim()) return;
    setRefinando(true);
    await refinarCon(cambio, () => setRefinando(false));
  };

  /** "Arreglarlo" sobre el resultado: cambiar de herramienta o refinar con la instrucción del
   *  arreglo; se anota como evento aviso_aplicado (qué avisos ayudan de verdad). */
  const arreglar = async (a: Aviso) => {
    if (!a.accion || esDemo) return;
    const ac = a.accion;
    if (ac.tipo === "prompt_fusion") {
      const [r1, r2] = vivo.spec.refs;
      if (r1 && r2) setFusion(compilarFusion(r1, r2, vivo.spec.aspect));
      return;
    }
    const instruccion =
      ac.tipo === "tool" ? null
      : ac.tipo === "texto" ? `Usa exactamente este texto en la pieza: «${ac.texto}»`
      : ac.tipo === "dialogo" ? `El diálogo dice exactamente: «${ac.texto}»`
      : ac.tipo === "duracion" ? `Duración: ${ac.segundos} s`
      : ac.tipo === "aspect" ? `Formato ${ac.aspect}`
      : ac.tipo === "quitar_texto" ? "Quita todo el texto de la pieza"
      : ac.tipo === "recortar_texto" ? `Recorta el texto de la pieza a ${ac.palabras} palabras como máximo`
      : null;
    if (ac.tipo !== "tool" && !instruccion) return;
    setAplicando(a.codigo);
    const promptAntes = vivo.promptId;
    let hecho = false;
    if (ac.tipo === "tool") {
      const r = await correr(() => cambiarHerramienta(vivo.specId, ac.tool), () => undefined);
      if (r?.ok) {
        setExplicacion(null);
        setVerExplicacion(false);
        setVoto(null);
        setJuzgado(false);
        onCambio({ ...vivo, tool: ac.tool, promptId: r.promptId, salida: r.salida, valido: r.valido, errores: r.errores, porque: null, variante: r.variante, avisos: r.avisos, resultado: null });
        hecho = true;
      } else if (r && !r.ok) toast.error(r.error);
    } else if (instruccion) {
      hecho = await refinarCon(instruccion, () => undefined);
    }
    setAplicando(null);
    if (hecho) {
      toast.success(tx(UI.aplicado, lang));
      void registrarEvento(promptAntes, "aviso_aplicado", a.codigo).catch(() => undefined);
    }
  };

  /** F5c: "Arreglarlo con H.Ü.E" — un aviso SIN arreglo mecánico (juicio de H.Ü.E, validador, regla sin
   *  acción). Viaja sólo el código: el servidor busca el aviso en los guardados de ESE prompt, arma la
   *  instrucción y anota aviso_aplicado (el Hub lo mide; no cuenta como refine ni como gusto de la marca). */
  const arreglarConHue = async (a: Aviso) => {
    if (esDemo) return;
    setAplicando(a.codigo);
    const hecho = await refinarCon("", () => setAplicando(null), a.codigo);
    if (hecho) toast.success(tx(UI.aplicado, lang));
  };

  /** "Revísalo bien": el juicio de H.Ü.E a petición (en video ya corrió solo al generar). */
  const revisar = async () => {
    setJuzgando(true);
    const r = await correr(() => revisarBien(vivo.promptId), () => setJuzgando(false));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setJuzgado(true);
    if (r.avisos.length === avisos.length) toast.message(tx(UI.sinAvisosJuicio, lang));
    onCambio({ ...vivo, avisos: r.avisos });
  };

  const otraVersion = async (v: Exclude<PrismaVariante, "base">) => {
    setVariando(v);
    const r = await correr(() => variar(vivo.specId, v), () => setVariando(null));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    setCambio("");
    setExplicacion(null);
    setVerExplicacion(false);
    setVoto(null);
    // La versión es un spec hermano: desde aquí, refinar / cambiar herramienta / explicar actúan sobre ella.
    setJuzgado(false);
    onCambio({ ...vivo, specId: r.specId, promptId: r.promptId, tool: r.tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: null, variante: r.variante, aprendio: null, avisos: r.avisos, correccion: r.correccion, resultado: null });
    if (esVideoJob) onJuzgar?.(r.promptId);
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
    <div className="space-y-4" style={{ "--p-tool": info.color } as CSSProperties}>
      {/* Cabecera: herramienta (en su tono del espectro) + por qué + estado de validación */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(UI.herramienta, lang)}</p>
          <h2 className="font-heading mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <span className="p-tool-chip inline-flex items-center rounded-full px-3 py-0.5 text-base">{tx(TOOL_LABEL[vivo.tool], lang)}</span>
            {vivo.variante && vivo.variante !== "base" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {IconoVersion && <IconoVersion className="size-3.5" aria-hidden="true" />}
                {tx(UI.version, lang)}: {tx(VARIANTE_LABEL[vivo.variante], lang)}
              </span>
            )}
            {vivo.correccion && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <Wrench className="size-3.5" aria-hidden="true" />
                {tx(UI.correccion, lang)}
              </span>
            )}
          </h2>
          {vivo.porque && <p className="mt-0.5 text-xs text-muted-foreground">{tx(vivo.porque, lang)}</p>}
          {vivo.correccion && <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.correccionDe, lang)}</p>}
          {/* "Úsalo en…": en qué modelo/nivel de la herramienta pegar, por qué y cómo llegar. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground">
            <Cpu className="size-3.5 text-primary" aria-hidden="true" />
            <span className="font-medium">{tx(UI.usaloEn, lang)}</span>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-medium">{tx(modelo.etiqueta, lang)}</span>
            <span className="text-muted-foreground">{tx(modelo.porque, lang)}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{tx(modelo.comoLlegar, lang)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tx(UI.formato, lang)}: {vivo.spec.aspect} · {tx(DESTINO_LABEL[destinoActual], lang)}</p>
          {/* Aprendizaje visible: el diseñador sabe que H.Ü.E ya "conoce" a esta marca. */}
          {vivo.aprendio && vivo.aprendio.ganadores > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.aprendioDe, lang).replace("{n}", String(vivo.aprendio.ganadores))}</p>}
          {vivo.aprendio && vivo.aprendio.ganadores === 0 && vivo.aprendio.preferencias > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.aprendioPref, lang)}</p>}
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

      {/* F2: un solo lenguaje de problemas (reglas, validador, ortografía, juicio de H.Ü.E). */}
      {juicioEnCurso && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {tx(UI.revisandoJuicio, lang)}
        </p>
      )}
      <PanelAvisos
        avisos={avisos.filter((a) => a.nivel === "bloquea" || !ocultos.includes(`${vivo.promptId}:${a.codigo}`))}
        lang={lang}
        titulo={tx(UI.avisosResultado, lang)}
        onArreglar={esDemo ? undefined : arreglar}
        aplicando={aplicando}
        resolver={(a) => resolucionDe(a, ACCIONES_RESULTADO, "ahora")}
        onHue={esDemo ? undefined : arreglarConHue}
        onEntendido={(a) => setOcultos((prev) => [...prev, `${vivo.promptId}:${a.codigo}`])}
        ocultos={avisos.filter((a) => a.nivel !== "bloquea" && ocultos.includes(`${vivo.promptId}:${a.codigo}`)).length}
        onMostrarOcultos={() => setOcultos((prev) => prev.filter((k) => !k.startsWith(`${vivo.promptId}:`)))}
      />
      {fusion && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-foreground">{tx(UI.fusionTitulo, lang)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.fusionAyuda, lang)}</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary p-2 font-mono text-xs text-foreground">{fusion}</pre>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFusion(null)}>
            {tx(UI.cancelar, lang)}
          </Button>
        </div>
      )}

      {/* El prompt. Los botones van en su propia fila (no flotando sobre el texto): en
          móvil un botón absoluto tapaba la primera línea del prompt. */}
      <div key={vivo.promptId} className="p-reveal">
        <div className="mb-2 flex flex-wrap justify-end gap-1.5">
          <span className="p-burst rounded-md" data-on={copiado ? "true" : "false"}>
            <Button size="sm" onClick={copiar} aria-live="polite">
              {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiado ? tx(UI.copiado, lang) : tx(UI.copiar, lang)}
            </Button>
          </span>
          <Button size="sm" variant="outline" asChild>
            {/* Higgsfield es la plataforma del equipo: se abre la página del modelo recomendado (o la de la familia). */}
            <a href={modelo.url ?? info.url} target="_blank" rel="noopener noreferrer" onClick={() => anotar(vivo.promptId, "abierto")}>
              <ExternalLink className="size-4" />
              {tx(UI.abrirEnHiggsfield, lang).replace("{modelo}", tx(modelo.etiqueta, lang))}
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
        {!yaJuzgado && (
          <Button variant="outline" size="sm" onClick={revisar} disabled={ocupado || esDemo} aria-busy={juzgando} title={tx(UI.revisaloBienAyuda, lang)}>
            {juzgando ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            {tx(UI.revisaloBien, lang)}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={toggleExplicar} disabled={ocupado || esDemo} aria-busy={cargandoExp}>
          {cargandoExp ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
          {verExplicacion ? tx(UI.ocultarExplicacion, lang) : tx(UI.explicar, lang)}
        </Button>
        {otras.map((t) => (
          <Button key={t} variant="ghost" size="sm" onClick={() => cambiar(t)} disabled={ocupado || esDemo} aria-busy={cambiando === t}>
            {cambiando === t ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {tx(TOOL_LABEL[t], lang)}
          </Button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => votar(1)}
            disabled={esDemo}
            aria-pressed={voto === 1}
            aria-label={tx(UI.gustó, lang)}
            className={cn("rounded-full p-2 transition-colors hover:bg-secondary", voto === 1 ? "text-status-completed" : "text-muted-foreground")}
          >
            <ThumbsUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => votar(-1)}
            disabled={esDemo}
            aria-pressed={voto === -1}
            aria-label={tx(UI.noGustó, lang)}
            className={cn("rounded-full p-2 transition-colors hover:bg-secondary", voto === -1 ? "text-destructive" : "text-muted-foreground")}
          >
            <ThumbsDown className="size-4" />
          </button>
        </span>
      </div>

      {verExplicacion && explicacion && (
        <div className="p-enter rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap" style={{ boxShadow: "inset 4px 0 0 var(--p-tool)" }}>{explicacion}</div>
      )}

      {/* F4: "sube lo que salió" — con key: un prompt nuevo empieza sin resultado. Con prefijo:
          el bloque del prompt (arriba) ya usa promptId como key y son hermanos. */}
      <ComoSalio
        key={`salio-${vivo.promptId}`}
        specId={vivo.specId}
        promptId={vivo.promptId}
        tool={vivo.tool}
        job={vivo.spec.job}
        lang={lang}
        inicial={vivo.resultado ?? null}
        modeloSugerido={modelo.modelo}
        ocupado={ocupado}
        onCorreccion={alCorregir}
        onRefinar={(texto) => refinarCon(texto, () => undefined)}
      />

      {/* F5a: el mismo prompt para los demás destinos, sin modelo (formato + zona segura). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">{tx(UI.adaptarTitulo, lang)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.adaptarAyuda, lang)}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={tx(UI.adaptarTitulo, lang)}>
          {DESTINOS.filter((d) => d !== destinoActual).map((d) => (
            <Button key={d} size="sm" variant="outline" onClick={() => adaptar(d)} disabled={ocupado || esDemo} aria-busy={adaptando === d}>
              {adaptando === d ? <Loader2 className="size-4 animate-spin" /> : null}
              {tx(DESTINO_LABEL[d], lang)}
            </Button>
          ))}
        </div>
      </div>

      {/* Otra versión, bajo demanda: una llamada más SÓLO si se pide (y el click le enseña a H.Ü.E). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">{tx(UI.otraVersion, lang)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.otraVersionAyuda, lang)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VERSIONES.map(({ v, Icon }) => (
            <Button key={v} size="sm" variant="outline" onClick={() => otraVersion(v)} disabled={ocupado || esDemo} aria-busy={variando === v}>
              {variando === v ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
              {tx(PEDIR_VERSION_LABEL[v], lang)}
            </Button>
          ))}
        </div>
      </div>

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
          <Button size="sm" onClick={refinar} disabled={ocupado || esDemo || !cambio.trim()} aria-busy={refinando}>
            {refinando ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {refinando ? tx(UI.generando, lang) : tx(UI.aplicarCambio, lang)}
          </Button>
          <Button size="sm" variant="ghost" onClick={onNueva}>
            {lang === "es" ? "Otra idea" : "New idea"}
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
