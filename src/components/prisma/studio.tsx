"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Clapperboard, ImageIcon, Languages, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/intake/chip-select";
import { cn } from "@/lib/utils";
import { abrirSpec, generarPrompt, type InputGenerar } from "@/app/(app)/prisma/actions";
import {
  DESTINO_LABEL,
  JOB_HINT,
  JOB_LABEL,
  KIND_HINT,
  KIND_LABEL,
  MENSAJES_GENERANDO,
  SWATCHES_CAMARA,
  SWATCHES_ESTILO,
  SWATCHES_LENTE,
  SWATCHES_LUZ,
  SWATCHES_MOOD,
  TOOL_LABEL,
  UI,
  tx,
  type Lang,
  type Swatch,
} from "@/lib/prisma/copy";
import {
  ASPECT_POR_DESTINO,
  JOBS_POR_KIND,
  REFS_POR_JOB,
  SORA_VIDEO_TYPES,
  esVideo,
  type Destino,
  type JobKind,
  type JobType,
  type MarcaPreset,
  type RefRole,
  type Tool,
} from "@/lib/prisma/spec";
import { COLOR_KIND, TOOL_INFO, TOOLS_POR_JOB } from "@/lib/prisma/tools";
import { elegirHerramienta } from "@/lib/prisma/routing";
import { useLang } from "./use-lang";
import { RefUploader, type RefLocal } from "./ref-uploader";
import { Resultado, type PromptVivo } from "./resultado";
import { Historial, type ItemHistorialUI } from "./historial";
import { Beam } from "./beam";

export type MarcaUI = { id: string; name: string; client_id: string; client_name: string; preset: MarcaPreset };
export type PersonajeUI = { id: string; name: string; client_id: string };

type Look = { luz: string | null; movimiento: string | null; lente: string | null; mood: string | null; estilo: string | null };
type Paso = "inicio" | "job" | 1 | 2 | 3 | "resultado";

const DESTINOS: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad", "yt", "web_banner", "print", "libre"];
const KINDS: { kind: JobKind; icon: typeof ImageIcon }[] = [
  { kind: "imagen", icon: ImageIcon },
  { kind: "edicion", icon: Wand2 },
  { kind: "video", icon: Clapperboard },
];

const lookVacio: Look = { luz: null, movimiento: null, lente: null, mood: null, estilo: null };

/** Un grupo de chips de selección única con su título. Fuera del componente padre a
 *  propósito: definirlo dentro lo remontaría en cada render (y perdería foco). */
function Chips({ titulo, opciones, valor, onChange, lang, permiteOtro = true }: { titulo: string; opciones: { value: string; label: string }[]; valor: string | null; onChange: (v: string | null) => void; lang: Lang; permiteOtro?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{titulo}</p>
      <ChipSelect
        options={opciones}
        selected={valor ? [valor] : []}
        onChange={(up) => onChange(up(valor ? [valor] : [])[0] ?? null)}
        ariaLabel={titulo}
        allowCustom={permiteOtro}
        customPlaceholder={lang === "es" ? "Escríbelo…" : "Type it…"}
      />
    </div>
  );
}

/**
 * HÜE Prisma — el estudio. Tres puertas → un trabajo → 3 pasos → resultado.
 * Etiquetas en palabras llanas; la jerga sólo aparece en el prompt final.
 */
export function PrismaStudio({ marcas, personajes, historial, demo = null }: { marcas: MarcaUI[]; personajes: PersonajeUI[]; historial: ItemHistorialUI[]; demo?: PromptVivo | null }) {
  const router = useRouter();
  const [lang, setLang] = useLang();

  // `demo` (sólo dev) arranca directo en el resultado para poder verlo sin sesión.
  const [paso, setPaso] = useState<Paso>(demo ? "resultado" : "inicio");
  const [kind, setKind] = useState<JobKind | null>(null);
  const [job, setJob] = useState<JobType | null>(null);
  const [idea, setIdea] = useState("");
  const [refs, setRefs] = useState<Partial<Record<RefRole, RefLocal | null>>>({});
  const [look, setLook] = useState<Look>(lookVacio);
  const [destino, setDestino] = useState<Destino>("ig_story");
  const [marcaId, setMarcaId] = useState<string | null>(null);
  const [personajeId, setPersonajeId] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState("");
  const [dialogoLang, setDialogoLang] = useState<"es-MX" | "en" | null>(null);
  const [voz, setVoz] = useState("");
  const [duracion, setDuracion] = useState<number | null>(null);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [toolOverride, setToolOverride] = useState<Tool | null>(null);
  const [generando, setGenerando] = useState(false);
  const [vivo, setVivo] = useState<PromptVivo | null>(demo);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  // Mientras H.Ü.E escribe, el botón rota por las etapas (1.8 s cada una). El
  // intervalo se limpia al terminar (y en StrictMode el cleanup evita duplicados).
  const [etapa, setEtapa] = useState(0);
  useEffect(() => {
    if (!generando) return;
    const id = window.setInterval(() => setEtapa((e) => (e + 1) % MENSAJES_GENERANDO.length), 1800);
    return () => window.clearInterval(id);
  }, [generando]);

  // Foco al encabezado al cambiar de paso: el lector de pantalla (y el teclado) aterrizan
  // en el paso nuevo en vez de quedarse en el botón "Siguiente" que ya no existe.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    tituloRef.current?.focus();
  }, [paso]);

  const marca = marcas.find((m) => m.id === marcaId) ?? null;
  const personajesDeMarca = marca ? personajes.filter((p) => p.client_id === marca.client_id) : [];
  const video = job ? esVideo(job) : false;
  const slots = job ? REFS_POR_JOB[job] : [];
  const refsLista = slots.map((s) => refs[s.role] ?? null).filter((r): r is RefLocal => !!r);
  const dnaPrincipal = refsLista.find((r) => r.dna)?.dna ?? null;

  // Sin useMemo a propósito: el React Compiler ya memoiza, y una dependencia derivada
  // (refsLista.length) hacía que el compilador saltara el componente entero.
  const sugerencia = job ? elegirHerramienta({ job, destino, tieneDialogo: dialogo.trim().length > 0, tieneRefs: refsLista.length > 0, movimientoMarcado: !!look.movimiento }) : null;
  const tool: Tool | null = toolOverride ?? sugerencia?.tool ?? null;
  const aspect = marca?.preset.aspect_default ?? ASPECT_POR_DESTINO[destino];
  const duraciones = tool ? TOOL_INFO[tool].duraciones : [];
  const duracionEfectiva = video ? (duracion && duraciones.includes(duracion) ? duracion : duraciones[0] ?? null) : null;

  const faltanRefs = slots.filter((s) => !s.opcional && !refs[s.role]).length > 0;
  const paso1Listo = !faltanRefs && (idea.trim().length > 0 || refsLista.length > 0);

  const reset = () => {
    setPaso("inicio");
    setKind(null);
    setJob(null);
    setIdea("");
    setRefs({});
    setLook(lookVacio);
    setDialogo("");
    setVoz("");
    setDialogoLang(null);
    setPersonajeId(null);
    setDuracion(null);
    setVideoType(null);
    setToolOverride(null);
    setVivo(null);
  };

  // Cambiar de trabajo limpia TODO lo que dependía del anterior (look, diálogo,
  // duración, tipo de video, personaje): si no, un "look" elegido para animar una foto
  // se colaba en una foto de producto. La marca se conserva (es del cliente, no del job).
  const elegirJob = (j: JobType) => {
    setJob(j);
    setRefs({});
    setLook(lookVacio);
    setDialogo("");
    setVoz("");
    setDialogoLang(null);
    setDuracion(null);
    setVideoType(null);
    setPersonajeId(null);
    setToolOverride(null);
    setPaso(1);
  };

  const generar = async () => {
    if (!job || !tool) return;
    setGenerando(true);
    const idiomaDialogo = dialogoLang ?? (lang === "en" ? "en" : "es-MX");
    const input: InputGenerar = {
      job,
      tool,
      idea,
      destino,
      aspect,
      duracion: duracionEfectiva,
      refs: refsLista.map((r) => ({ role: r.role, storage_path: r.storage_path, caption: r.caption, dna: r.dna })),
      look,
      dialogo: dialogo.trim() ? { texto: dialogo, idioma: idiomaDialogo, voz: voz.trim() || null } : null,
      marcaId,
      personajeId,
      videoType: tool === "sora" ? videoType : null,
    };
    // try/finally: si la llamada REVIENTA (red), el botón no se queda en "Generando…".
    let r: Awaited<ReturnType<typeof generarPrompt>>;
    try {
      r = await generarPrompt(input);
    } catch {
      toast.error(tx(UI.error, lang));
      return;
    } finally {
      setGenerando(false);
    }
    if (!r.ok) return toast.error(r.error);
    setVivo({ specId: r.specId, promptId: r.promptId, tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: sugerencia?.tool === tool ? sugerencia.porque : null });
    setPaso("resultado");
    router.refresh(); // el historial (props del servidor) se re-lee
  };

  const abrirDeHistorial = async (specId: string) => {
    if (abriendo) return;
    setAbriendo(specId);
    let r: Awaited<ReturnType<typeof abrirSpec>>;
    try {
      r = await abrirSpec(specId);
    } catch {
      toast.error(tx(UI.error, lang));
      return;
    } finally {
      setAbriendo(null);
    }
    if (!r.ok) return toast.error(r.error);
    setVivo({ specId, promptId: r.promptId, tool: r.tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: null });
    setJob(r.spec.job);
    setKind(null);
    setPaso("resultado");
  };

  // Opción "sugerido desde tus referencias" para un swatch, si hay ADN.
  const conSugerido = (base: Swatch[], sugerido: string | null): { value: string; label: string }[] => {
    const opts = base.map((s) => ({ value: s.valor, label: tx(s.label, lang) }));
    if (sugerido && !opts.some((o) => o.value === sugerido)) opts.unshift({ value: sugerido, label: `${tx(UI.sugeridoDeTusRefs, lang)}: ${sugerido}` });
    return opts;
  };

  // El color activo del módulo: la herramienta elegida tiñe tarjeta, haz y resultado.
  const colorActivo = vivo ? TOOL_INFO[vivo.tool].color : tool ? TOOL_INFO[tool].color : null;
  const estadoHaz: "idle" | "escribiendo" | "listo" = generando ? "escribiendo" : paso === "resultado" && vivo ? "listo" : "idle";

  return (
    <div className="prisma-root mx-auto max-w-6xl" style={colorActivo ? ({ "--p-tool": colorActivo } as CSSProperties) : undefined}>
      {/* Cabecera: el nombre en la tipografía del wordmark (Unbounded) y, debajo, el
          haz: la firma del módulo. Su estado sigue al flujo (idle → escribiendo → listo). */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{tx(UI.titulo, lang)}</p>
          <h1 className="font-wordmark mt-1 text-[26px] font-semibold leading-tight tracking-tight text-foreground md:text-[32px]">{tx(UI.tagline, lang)}</h1>
          <Beam estado={estadoHaz} color={colorActivo} className="mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
          >
            <Languages className="size-3.5" /> {lang === "es" ? "EN" : "ES"}
          </button>
          {paso !== "inicio" && (
            <Button variant="ghost" size="sm" onClick={reset}>
              {lang === "es" ? "Empezar de nuevo" : "Start over"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {/* INICIO: tres puertas */}
          {paso === "inicio" && (
            <section key="inicio" className="p-enter" aria-label={tx(UI.queQuieres, lang)}>
              <h2 className="mb-3 text-lg font-semibold text-foreground">{tx(UI.queQuieres, lang)}</h2>
              <div className="p-stagger grid gap-3 sm:grid-cols-3">
                {KINDS.map(({ kind: k, icon: Icon }, i) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setPaso("job");
                    }}
                    style={{ "--hue": COLOR_KIND[k], "--i": i } as CSSProperties}
                    className="p-door cursor-pointer rounded-2xl border border-border bg-card p-5 text-left shadow-sm"
                  >
                    <span className="p-door-icon flex size-11 items-center justify-center rounded-xl">
                      <Icon className="size-5" />
                    </span>
                    <span className="mt-4 block text-base font-semibold text-foreground">{tx(KIND_LABEL[k], lang)}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{tx(KIND_HINT[k], lang)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* JOB: los trabajos en lenguaje humano */}
          {paso === "job" && kind && (
            <section key="job" className="p-enter">
              <button type="button" onClick={() => setPaso("inicio")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" /> {tx(UI.atras, lang)}
              </button>
              <h2 ref={tituloRef} tabIndex={-1} className="mb-3 text-lg font-semibold text-foreground outline-none">
                {tx(KIND_LABEL[kind], lang)}
              </h2>
              <div className="p-stagger grid gap-2 sm:grid-cols-2">
                {JOBS_POR_KIND[kind].map((j, i) => (
                  <button key={j} type="button" onClick={() => elegirJob(j)} style={{ "--hue": COLOR_KIND[kind], "--i": i } as CSSProperties} className="p-door cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-left">
                    <span className="block text-sm font-medium text-foreground">{tx(JOB_LABEL[j], lang)}</span>
                    <span className="block text-xs text-muted-foreground">{tx(JOB_HINT[j], lang)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* PASOS 1-3 */}
          {typeof paso === "number" && job && (
            <section key={`paso-${paso}`} className="p-enter rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{tx(JOB_LABEL[job], lang)}</p>
                  <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
                    {paso === 1 ? tx(UI.paso1, lang) : paso === 2 ? tx(UI.paso2, lang) : tx(UI.paso3, lang)}
                  </h2>
                </div>
                <p className="sr-only" aria-live="polite">
                  {tx(UI.pasoDe, lang)} {paso} {tx(UI.de, lang)} 3
                </p>
                <ol className="flex items-center gap-1.5" aria-hidden="true">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className={cn("h-2 rounded-full transition-all duration-300", n === paso ? "w-6 bg-primary" : n < paso ? "w-2 bg-primary/40" : "w-2 bg-border")} aria-current={n === paso ? "step" : undefined} />
                  ))}
                </ol>
              </div>

              {paso === 1 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="prisma-idea" className="block text-sm font-medium text-foreground">
                      {tx(UI.ideaLabel, lang)}
                    </label>
                    <Textarea id="prisma-idea" autoFocus value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={tx(UI.ideaPlaceholder, lang)} rows={3} className="mt-2" />
                  </div>
                  {slots.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {slots.map((s) => (
                        <RefUploader key={s.role} role={s.role} opcional={s.opcional} value={refs[s.role] ?? null} onChange={(v) => setRefs((prev) => ({ ...prev, [s.role]: v }))} lang={lang} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {paso === 2 && (
                <div className="space-y-5">
                  <Chips lang={lang} titulo={tx(UI.luz, lang)} opciones={conSugerido(SWATCHES_LUZ, dnaPrincipal?.luz ?? null)} valor={look.luz} onChange={(v) => setLook((l) => ({ ...l, luz: v }))} />
                  {video && <Chips lang={lang} titulo={tx(UI.camara, lang)} opciones={conSugerido(SWATCHES_CAMARA, null)} valor={look.movimiento} onChange={(v) => setLook((l) => ({ ...l, movimiento: v }))} />}
                  <Chips lang={lang} titulo={lang === "es" ? "Lente" : "Lens"} opciones={conSugerido(SWATCHES_LENTE, dnaPrincipal?.lente ?? null)} valor={look.lente} onChange={(v) => setLook((l) => ({ ...l, lente: v }))} />
                  <Chips lang={lang} titulo={tx(UI.mood, lang)} opciones={conSugerido(SWATCHES_MOOD, dnaPrincipal?.mood ?? null)} valor={look.mood} onChange={(v) => setLook((l) => ({ ...l, mood: v }))} />
                  <Chips lang={lang} titulo={tx(UI.estilo, lang)} opciones={conSugerido(SWATCHES_ESTILO, null)} valor={look.estilo} onChange={(v) => setLook((l) => ({ ...l, estilo: v }))} />
                </div>
              )}

              {paso === 3 && (
                <div className="space-y-5">
                  <Chips lang={lang} titulo={tx(UI.paso3, lang)} opciones={DESTINOS.map((d) => ({ value: d, label: tx(DESTINO_LABEL[d], lang) }))} valor={destino} onChange={(v) => v && setDestino(v as Destino)} permiteOtro={false} />
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tx(UI.marca, lang)}</p>
                    <ChipSelect
                      options={[{ value: "", label: tx(UI.sinMarca, lang) }, ...marcas.map((m) => ({ value: m.id, label: `${m.client_name} · ${m.name}` }))]}
                      selected={[marcaId ?? ""]}
                      onChange={(up) => {
                        const v = up([marcaId ?? ""])[0] ?? "";
                        setMarcaId(v || null);
                        setPersonajeId(null);
                      }}
                      ariaLabel={tx(UI.marca, lang)}
                      allowCustom={false}
                    />
                  </div>
                  {personajesDeMarca.length > 0 && (
                    <Chips lang={lang} titulo={lang === "es" ? "Personaje o producto guardado" : "Saved character or product"} opciones={[{ value: "", label: lang === "es" ? "Ninguno" : "None" }, ...personajesDeMarca.map((p) => ({ value: p.id, label: p.name }))]} valor={personajeId ?? ""} onChange={(v) => setPersonajeId(v || null)} permiteOtro={false} />
                  )}
                  {video && (
                    <div>
                      <label htmlFor="prisma-dialogo" className="block text-sm font-medium text-foreground">
                        {tx(UI.dialogo, lang)}
                      </label>
                      <Textarea id="prisma-dialogo" value={dialogo} onChange={(e) => setDialogo(e.target.value)} placeholder={tx(UI.dialogoPlaceholder, lang)} rows={2} className="mt-2" />
                      {dialogo.trim() && (
                        <div className="mt-2">
                          <Chips lang={lang} titulo={tx(UI.idiomaDialogo, lang)} opciones={[{ value: "es-MX", label: "Español" }, { value: "en", label: "English" }]} valor={dialogoLang ?? (lang === "en" ? "en" : "es-MX")} onChange={(v) => setDialogoLang(v === "en" ? "en" : "es-MX")} permiteOtro={false} />
                        </div>
                      )}
                      {dialogo.trim() && (
                        <input value={voz} onChange={(e) => setVoz(e.target.value)} placeholder={lang === "es" ? "¿Cómo es la voz? (ej: cálida, acento mexicano neutro)" : "What is the voice like?"} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" aria-label={lang === "es" ? "Voz" : "Voice"} />
                      )}
                    </div>
                  )}

                  {/* Herramienta sugerida + override */}
                  {sugerencia && tool && (
                    <div className="p-tool-card rounded-xl border border-border bg-card p-4 pl-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(UI.herramienta, lang)}</p>
                      <p className="mt-1.5">
                        <span className="p-tool-chip inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold">{tx(TOOL_LABEL[tool], lang)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{toolOverride ? (lang === "es" ? "La elegiste tú." : "You picked it.") : sugerencia.porque}</p>
                      {TOOLS_POR_JOB[job].length > 1 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.cambiarHerramienta, lang)}</p>
                          <ChipSelect options={TOOLS_POR_JOB[job].map((t) => ({ value: t, label: tx(TOOL_LABEL[t], lang) }))} selected={[tool]} onChange={(up) => setToolOverride((up([tool])[0] as Tool | undefined) ?? null)} ariaLabel={tx(UI.herramienta, lang)} allowCustom={false} />
                        </div>
                      )}
                      {video && duraciones.length > 1 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.duracion, lang)}</p>
                          <ChipSelect options={duraciones.map((d) => ({ value: String(d), label: `${d} s` }))} selected={[String(duracionEfectiva)]} onChange={(up) => setDuracion(Number(up([String(duracionEfectiva)])[0]) || null)} ariaLabel={tx(UI.duracion, lang)} allowCustom={false} />
                        </div>
                      )}
                      {tool === "sora" && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.tipoVideo, lang)}</p>
                          <ChipSelect options={SORA_VIDEO_TYPES.map((v) => ({ value: v }))} selected={videoType ? [videoType] : []} onChange={(up) => setVideoType(up(videoType ? [videoType] : [])[0] ?? null)} ariaLabel={tx(UI.tipoVideo, lang)} allowCustom={false} />
                        </div>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {lang === "es" ? "Formato" : "Format"}: {aspect}
                        {duracionEfectiva ? ` · ${duracionEfectiva} s` : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Navegación del paso */}
              <div className="mt-6 flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => (paso === 1 ? setPaso("job") : setPaso((paso - 1) as Paso))}>
                  <ArrowLeft className="size-4" /> {tx(UI.atras, lang)}
                </Button>
                {paso < 3 ? (
                  <Button onClick={() => setPaso((paso + 1) as Paso)} disabled={paso === 1 && !paso1Listo}>
                    {tx(UI.siguiente, lang)} <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button onClick={generar} disabled={generando || !tool} aria-live="polite" className="min-w-[200px]">
                    {generando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {generando ? tx(MENSAJES_GENERANDO[etapa], lang) : tx(UI.generar, lang)}
                  </Button>
                )}
              </div>
            </section>
          )}

          {paso === "resultado" && vivo && (
            <section key="resultado" className="p-enter rounded-2xl border border-border bg-card p-5 shadow-sm">
              <Resultado vivo={vivo} lang={lang} onCambio={setVivo} onNueva={reset} />
            </section>
          )}
        </div>

        <Historial items={historial} lang={lang} onAbrir={abrirDeHistorial} abriendo={abriendo} />
      </div>
    </div>
  );
}
