"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ChevronDown, Clapperboard, Cpu, ImageIcon, Languages, Loader2, Plus, Sparkles, Trash2, UserRound, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/intake/chip-select";
import { cn } from "@/lib/utils";
import { abrirSpec, generarPrompt, listarPersonajes, retirarPersonaje, revisarBien, type InputGenerar, revisarOrtografia, entrevistar } from "@/app/(app)/prisma/actions";
import { REF_LABEL,
  DESTINO_LABEL,
  JOB_HINT,
  JOB_LABEL,
  KIND_HINT,
  KIND_LABEL,
  MENSAJES_GENERANDO,
  SWATCHES_ANGULO,
  SWATCHES_CAMARA,
  SWATCHES_ESTILO,
  SWATCHES_LENTE,
  SWATCHES_LUZ,
  SWATCHES_MOOD,
  TOOL_LABEL,
  UI,
  etiquetaValor,
  tx,
  type Lang,
  type Par,
  type Swatch,
} from "@/lib/prisma/copy";
import { aplicarLook, lookActivo, lookSugerido, looksPara, ordenarPorHabitos, type Habitos, type LookElegido } from "@/lib/prisma/looks";
import { LooksGrid } from "./looks-grid";
import {
  MAX_REFS,
  ROLES_MULTI,
  ASPECT_POR_DESTINO,
  JOBS_POR_KIND,
  REFS_POR_JOB,
  VIDEO_TYPES,
  esVideo,
  type Aspect,
  type Destino,
  type JobKind,
  type JobType,
  type MarcaPreset,
  type RefRole,
  type Tool,
} from "@/lib/prisma/spec";
import { COLOR_KIND, duracionVeo, TOOL_INFO, TOOLS_POR_JOB, VEO_SEGUNDOS_CON_REFS } from "@/lib/prisma/tools";
import { elegirHerramienta } from "@/lib/prisma/routing";
import { recomendarModelo } from "@/lib/prisma/modelo";
import { costoCorto, textoCosto } from "@/lib/prisma/costo";
import { useCatalogo } from "./catalogo-contexto";
import { ACCIONES_PASO3, aplicarArreglo, avisoOrtografia, bloqueado, compilarReglas, diagnosticarEntrada, ordenarAvisos, resolucionDe, type Aviso, type EntradaDiagnostico, type ReglaCliente } from "@/lib/prisma/diagnostico";
import { compilarFusion } from "@/lib/prisma/compilers/fusion";
import type { Cambio } from "@/lib/prisma/ortografia";
import { PanelAvisos, SugerenciaTexto } from "./avisos";
import { Entrevista } from "./entrevista";
import { aplicarRespuestas, type Pregunta, type Respuesta } from "@/lib/prisma/entrevista";
import { MAX_RONDAS, necesitaEntrevista } from "@/lib/prisma/entrevista";
import { revisarAcentos } from "@/lib/prisma/ortografia";
import { useLang } from "./use-lang";
import { RefUploader, type RefLocal } from "./ref-uploader";
import { Resultado, type PromptVivo } from "./resultado";
import { Historial, type ItemHistorialUI } from "./historial";
import { Beam } from "./beam";
import { PersonajeForm } from "./personaje-form";
import { aplicarFotoDePersonaje, slotParaFoto, type PersonajeUI } from "@/lib/prisma/personajes";

export type MarcaUI = { id: string; name: string; client_id: string; client_name: string; preset: MarcaPreset };

type Look = LookElegido;
type Paso = "inicio" | "job" | 1 | "entrevista" | 2 | 3 | "resultado";
/** Preferencia local: el diseñador apagó la entrevista en este navegador. */
const SIN_PREGUNTAS_KEY = "prisma:sin-preguntas";
const leerSinPreguntas = (): boolean => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SIN_PREGUNTAS_KEY) === "1";
  } catch {
    return false;
  }
};
// localStorage como "store externo": el servidor siempre ve false (sin desajuste de hidratación)
// y el cliente lee el valor real sin un setState dentro de un efecto.
const suscribirStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const sinPreguntasServidor = () => false;

const DESTINOS: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad", "yt", "web_banner", "print", "libre"];
const KINDS: { kind: JobKind; icon: typeof ImageIcon }[] = [
  { kind: "imagen", icon: ImageIcon },
  { kind: "edicion", icon: Wand2 },
  { kind: "video", icon: Clapperboard },
];

const lookVacio: Look = { luz: null, movimiento: null, lente: null, angulo: null, mood: null, estilo: null };
const todoVacio = (l: Look): boolean => Object.values(l).every((v) => !v);

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
export function PrismaStudio({ marcas, historial, demo = null, demoPreguntas = null, demoProfundas = null, verTodo = false, reglas = [] }: { marcas: MarcaUI[]; historial: ItemHistorialUI[]; demo?: PromptVivo | null; /** Sólo dev (`?demo=entrevista`): arranca en la entrevista con estas preguntas. */ demoPreguntas?: Pregunta[] | null; /** Sólo dev: las preguntas de "Profundizar" (rondas 2 y 3). */ demoProfundas?: Pregunta[] | null; verTodo?: boolean; reglas?: ReglaCliente[] }) {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const catalogo = useCatalogo();

  // `demo` (sólo dev) arranca directo en el resultado para poder verlo sin sesión.
  const [paso, setPaso] = useState<Paso>(demo ? "resultado" : demoPreguntas ? "entrevista" : "inicio");
  const [kind, setKind] = useState<JobKind | null>(null);
  const [job, setJob] = useState<JobType | null>(demoPreguntas ? "foto_producto" : null);
  const [idea, setIdea] = useState("");
  const [texto, setTexto] = useState("");
  const [refs, setRefs] = useState<Partial<Record<RefRole, RefLocal | null>>>({});
  /** F5c: las imágenes de "+ otra" de cada casilla (la principal sigue en `refs`: el personaje presta
   *  su foto a la principal y nada de eso cambia). Tope total MAX_REFS. */
  const [extras, setExtras] = useState<Partial<Record<RefRole, RefLocal[]>>>({});
  const [look, setLook] = useState<Look>(lookVacio);
  const [destino, setDestino] = useState<Destino>("ig_story");
  const [marcaId, setMarcaId] = useState<string | null>(null);
  const [personajeId, setPersonajeId] = useState<string | null>(null);
  // Personajes guardados de la marca elegida: se PIDEN al elegirla (listarPersonajes), no
  // llegan con la página — así nadie recibe las fotos de todos los clientes de entrada.
  const [personajes, setPersonajes] = useState<PersonajeUI[]>([]);
  const [cargandoPersonajes, setCargandoPersonajes] = useState(false);
  /** F5a: lo que la marca ya usó (looks y valores), para subirlo al frente en el paso 2. */
  const [habitos, setHabitos] = useState<Habitos | null>(null);
  /** F5a: "Ajustar" (las filas de siempre) abierto o plegado. */
  const [ajustar, setAjustar] = useState(false);
  /** F5a: el id del look que H.Ü.E aplicó solo (si sigue tal cual y la idea cambió, se vuelve a sugerir). */
  const [sugeridoAplicado, setSugeridoAplicado] = useState<string | null>(null);
  const [mostrarPersonajeForm, setMostrarPersonajeForm] = useState(false);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const [retirando, setRetirando] = useState(false);
  /** Slot al que el personaje elegido le PRESTÓ su foto (para devolverlo al soltarlo). */
  const [refDePersonaje, setRefDePersonaje] = useState<RefRole | null>(null);
  // Cambiar de marca invalida todo lo que estaba en vuelo (guardar/retirar un personaje): al
  // volver del servidor, si la marca ya es otra, el resultado no toca la UI (la BD sí cambió).
  const marcaGen = useRef(0);
  const [dialogo, setDialogo] = useState("");
  const [dialogoLang, setDialogoLang] = useState<"es-MX" | "en" | null>(null);
  const [voz, setVoz] = useState("");
  const [duracion, setDuracion] = useState<number | null>(null);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [toolOverride, setToolOverride] = useState<Tool | null>(null);
  /** F2: formato elegido por un arreglo ("genera en 9:16 y recorta"); null = el del destino/marca. */
  const [aspectOverride, setAspectOverride] = useState<Aspect | null>(null);
  /** F2: la sugerencia ortográfica viva (texto en la pieza o diálogo) y qué se está revisando. */
  const [revision, setRevision] = useState<{ campo: "texto" | "dialogo"; original: string; sugerido: string; cambios: Cambio[] } | null>(null);
  const [revisando, setRevisando] = useState<"texto" | "dialogo" | null>(null);
  /** "Dejar como está": el texto exacto que el diseñador decidió no corregir (no se insiste). */
  const [ignorada, setIgnorada] = useState<{ texto: string | null; dialogo: string | null }>({ texto: null, dialogo: null });
  /** Códigos de avisos cuyo arreglo se aplicó antes de generar (viajan como evento aviso_aplicado). */
  const [avisosAplicados, setAvisosAplicados] = useState<string[]>([]);
  /** F5c: avisos del paso 3 que H.Ü.E arreglará al generar (códigos) y los ocultos con "Entendido". */
  const [avisosPedidos, setAvisosPedidos] = useState<string[]>([]);
  const [ocultosPaso3, setOcultosPaso3] = useState<string[]>([]);
  /** El prompt de fusión (dos refs → una) cuando el arreglo lo pide. */
  const [fusion, setFusion] = useState<string | null>(null);
  /** F3: la entrevista — preguntas de H.Ü.E, respuestas (id → valor), y si se apagó en este navegador. */
  const [preguntas, setPreguntas] = useState<Pregunta[]>(demoPreguntas ?? []);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  /** F5c: la entrevista por rondas — TODAS las preguntas hechas (con su ronda), la ronda actual y si
   *  H.Ü.E ya dijo que no le falta nada (entonces "Profundizar" desaparece). */
  const [hechas, setHechas] = useState<(Pregunta & { ronda: number })[]>(() => (demoPreguntas ?? []).map((p) => ({ ...p, ronda: 1 })));
  const [ronda, setRonda] = useState(1);
  const [sinMas, setSinMas] = useState(false);
  const [profundizando, setProfundizando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const sinPreguntasGuardado = useSyncExternalStore(suscribirStorage, leerSinPreguntas, sinPreguntasServidor);
  // Lo que se cambia en ESTA pestaña manda sobre lo guardado (el evento storage no se dispara en la misma pestaña).
  const [sinPreguntasLocal, setSinPreguntasLocal] = useState<boolean | null>(null);
  const sinPreguntas = sinPreguntasLocal ?? sinPreguntasGuardado;
  // Último valor revisado por campo: no se vuelve a llamar a H.Ü.E por el mismo texto.
  const ultimoRevisado = useRef<{ texto: string; dialogo: string }>({ texto: "", dialogo: "" });
  const [generando, setGenerando] = useState(false);
  const [vivo, setVivo] = useState<PromptVivo | null>(demo);
  /** F5a: el prompt (id) cuyo juicio de H.Ü.E corre en segundo plano. */
  const [juzgando, setJuzgando] = useState<string | null>(null);
  /** Prompt primero, juicio después: el resultado ya está en pantalla; los avisos del juicio se
   *  suman cuando llegan — y sólo si el diseñador sigue viendo ESE prompt. */
  const juzgarLuego = (promptId: string) => {
    setJuzgando(promptId);
    revisarBien(promptId)
      .then((r) => {
        if (r.ok) setVivo((prev) => (prev && prev.promptId === promptId ? { ...prev, avisos: r.avisos } : prev));
      })
      .catch(() => undefined)
      .finally(() => setJuzgando((j) => (j === promptId ? null : j)));
  };
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
  const personaje = personajesDeMarca.find((p) => p.id === personajeId) ?? null;
  const video = job ? esVideo(job) : false;
  const slots = job ? REFS_POR_JOB[job] : [];
  // Orden estable: por casilla, la principal y luego sus "+ otra" (así se numeran [Imagen N]).
  const refsLista = slots.flatMap((s) => (refs[s.role] ? [refs[s.role] as RefLocal, ...(extras[s.role] ?? [])] : []));
  const dnaPrincipal = refsLista.find((r) => r.dna)?.dna ?? null;
  // F5a: los looks del trabajo (los que la marca ya usó, primero), cuál está elegido tal cual y
  // cuál sugiere H.Ü.E (sin modelo: idea + ADN + destino). Todo puro y barato: se calcula al render.
  const looksJob = job ? ordenarPorHabitos(looksPara(job), habitos) : [];
  const lookActivoId = job ? lookActivo(look, looksJob, esVideo(job)) : null;
  const sugerido = job ? lookSugerido({ job, idea, dna: dnaPrincipal, destino }) : null;
  // Etiquetas llanas de las respuestas de la entrevista (un valor elegido ahí se ve con su
  // etiqueta, no con la frase técnica en inglés — el chip crudo de la prueba de Pedro).
  const etiquetasEntrevista: Record<string, Par> = Object.fromEntries(hechas.flatMap((p) => p.opciones.map((o) => [o.valor, o.label])));
  /** Entrar al paso 2: si el look está vacío —o sigue siendo la sugerencia anterior, sin ajustar— H.Ü.E
   *  deja pre-elegido el que sugiere ahora (la idea pudo cambiar en el paso 1). Un look elegido a mano se respeta. */
  const entrarAlLook = () => {
    if (job && sugerido && (todoVacio(look) || (sugeridoAplicado !== null && lookActivoId === sugeridoAplicado))) {
      setLook(aplicarLook(sugerido.look, esVideo(job)));
      setSugeridoAplicado(sugerido.look.id);
    }
    setPaso(2);
  };

  // Sin useMemo a propósito: el React Compiler ya memoiza, y una dependencia derivada
  // (refsLista.length) hacía que el compilador saltara el componente entero.
  const sugerencia = job ? elegirHerramienta({ job, destino, tieneDialogo: dialogo.trim().length > 0, tieneRefs: refsLista.length > 0, movimientoMarcado: !!look.movimiento, tieneTexto: texto.trim().length > 0, refs: refsLista.length, duracion }, catalogo) : null;
  const tool: Tool | null = toolOverride ?? sugerencia?.tool ?? null;
  const aspect: Aspect = aspectOverride ?? marca?.preset.aspect_default ?? ASPECT_POR_DESTINO[destino];
  // Veo con imágenes de referencia sólo genera 8 s: el chip lo dice y no ofrece otra cosa.
  const veoForzado = tool === "veo" && refsLista.length > 0;
  const duraciones = veoForzado ? [VEO_SEGUNDOS_CON_REFS] : tool ? catalogo[tool].limites.duraciones : [];
  const duracionEfectiva = video ? (duracion && duraciones.includes(duracion) ? duracion : duraciones[0] ?? null) : null;
  // "Úsalo en…" anticipado: el mismo cálculo puro que verá en el resultado.
  const modelo = job && tool ? recomendarModelo({ job, tool, destino, refs: refsLista.length, texto: texto.trim().length > 0, dialogo: dialogo.trim().length > 0, duracion: duracionEfectiva }, catalogo) : null;

  // F2: el diagnóstico del paso 3, en el cliente y al instante (reglas base + reglas del Hub +
  // la ortografía si hay una sugerencia viva). Un "bloquea" apaga el botón de generar.
  // useMemo a propósito: compilar corre regexSegura (con su ensayo de tiempo) por regla, y
  // `reglas` es una prop estable — no debe repetirse en cada tecla.
  const reglasComp = useMemo(() => compilarReglas(reglas), [reglas]);
  const idiomaDialogoActual = dialogoLang ?? (lang === "en" ? "en" : "es-MX");
  const entradaDiag: EntradaDiagnostico | null = job && tool ? { job, tool, destino, aspect, duracion: duracionEfectiva, refs: refsLista.map((r) => ({ role: r.role })), texto: texto.trim() || null, dialogo: dialogo.trim() ? { texto: dialogo, idioma: idiomaDialogoActual } : null, movimiento: look.movimiento, idea } : null;
  const sugerenciaViva = (campo: "texto" | "dialogo") => (revision && revision.campo === campo && revision.original === (campo === "texto" ? texto : dialogo) && ignorada[campo] !== revision.original ? revision : null);
  const avisosOrtografia: Aviso[] = (["texto", "dialogo"] as const).flatMap((campo) => {
    const r = sugerenciaViva(campo);
    const a = r ? avisoOrtografia(campo, r.original, { idioma: "es", sugerido: r.sugerido, cambios: r.cambios }) : null;
    return a ? [a] : [];
  });
  const avisosPaso3: Aviso[] = entradaDiag ? ordenarAvisos([...diagnosticarEntrada(entradaDiag, reglasComp, catalogo), ...avisosOrtografia]) : [];
  const bloqueo = bloqueado(avisosPaso3);

  // Capa instantánea (sin servidor): el diccionario de acentos corre mientras escribe, con un
  // respiro de 500 ms; la sugerencia aparece bajo el campo sin esperar a H.Ü.E.
  useEffect(() => {
    const valor = texto;
    if (!valor.trim() || ignorada.texto === valor) return;
    const id = window.setTimeout(() => {
      const r = revisarAcentos(valor);
      if (r.cambios.length && r.sugerido !== valor) setRevision((prev) => (prev?.campo === "texto" && prev.original === valor ? prev : { campo: "texto", original: valor, sugerido: r.sugerido, cambios: r.cambios }));
    }, 500);
    return () => window.clearTimeout(id);
  }, [texto, ignorada.texto]);
  useEffect(() => {
    const valor = dialogo;
    if (!valor.trim() || ignorada.dialogo === valor) return;
    const id = window.setTimeout(() => {
      const r = revisarAcentos(valor, dialogoLang === "en" ? "en" : dialogoLang === "es-MX" ? "es" : undefined);
      if (r.cambios.length && r.sugerido !== valor) setRevision((prev) => (prev?.campo === "dialogo" && prev.original === valor ? prev : { campo: "dialogo", original: valor, sugerido: r.sugerido, cambios: r.cambios }));
    }, 500);
    return () => window.clearTimeout(id);
  }, [dialogo, dialogoLang, ignorada.dialogo]);

  // Revisar ortografía y gramática de un campo (al salir de él). Dos capas en el servidor:
  // diccionario de acentos + H.Ü.E. Es una sugerencia: nunca se reemplaza solo.
  const revisar = async (campo: "texto" | "dialogo") => {
    const valor = campo === "texto" ? texto : dialogo;
    if (!valor.trim() || valor === ultimoRevisado.current[campo] || ignorada[campo] === valor) return;
    ultimoRevisado.current[campo] = valor;
    setRevisando(campo);
    try {
      const r = await revisarOrtografia(campo, valor, campo === "dialogo" ? idiomaDialogoActual : undefined);
      if (!r.ok || !r.cambios.length || r.sugerido === valor) {
        setRevision((prev) => (prev?.campo === campo ? null : prev));
        return;
      }
      setRevision({ campo, original: valor, sugerido: r.sugerido, cambios: r.cambios });
    } catch {
      // La revisión es opcional: si falla, el diseñador sigue con su texto.
    } finally {
      setRevisando((v) => (v === campo ? null : v));
    }
  };
  const usarSugerencia = (campo: "texto" | "dialogo") => {
    const r = sugerenciaViva(campo);
    if (!r) return;
    if (campo === "texto") setTexto(r.sugerido);
    else setDialogo(r.sugerido);
    ultimoRevisado.current[campo] = r.sugerido;
    setAvisosAplicados((prev) => (prev.includes(`ortografia_${campo}`) ? prev : [...prev, `ortografia_${campo}`]));
    setRevision(null);
  };
  const dejarAsi = (campo: "texto" | "dialogo") => {
    const r = sugerenciaViva(campo);
    if (!r) return;
    setIgnorada((prev) => ({ ...prev, [campo]: r.original }));
    setRevision(null);
  };

  // "Arreglarlo": el arreglo de un click del aviso se vuelca en el estado del wizard.
  const arreglar = (a: Aviso) => {
    if (!entradaDiag || !a.accion) return;
    if (a.accion.tipo === "prompt_fusion") {
      const [r1, r2] = refsLista;
      if (r1 && r2) setFusion(compilarFusion({ role: r1.role, caption: r1.caption, dna: r1.dna }, { role: r2.role, caption: r2.caption, dna: r2.dna }, aspect));
    } else {
      const patch = aplicarArreglo(entradaDiag, a.accion);
      if (patch.tool !== undefined) setToolOverride(patch.tool);
      if (patch.duracion !== undefined) setDuracion(patch.duracion);
      if (patch.aspect !== undefined) setAspectOverride(patch.aspect);
      if ("texto" in patch) {
        setTexto(patch.texto ?? "");
        ultimoRevisado.current.texto = patch.texto ?? "";
        if (a.codigo.startsWith("ortografia")) setRevision(null);
      }
      if (patch.dialogo !== undefined) {
        setDialogo(patch.dialogo?.texto ?? "");
        ultimoRevisado.current.dialogo = patch.dialogo?.texto ?? "";
        if (a.codigo.startsWith("ortografia")) setRevision(null);
      }
      if (patch.refs !== undefined) {
        // F5c: cuántas quedan de cada casilla; se recorta desde el final (primero las de "+ otra").
        const cuenta = new Map<string, number>();
        for (const r of patch.refs) cuenta.set(r.role, (cuenta.get(r.role) ?? 0) + 1);
        const nuevasRefs: Partial<Record<RefRole, RefLocal | null>> = { ...refs };
        const nuevosExtras: Partial<Record<RefRole, RefLocal[]>> = { ...extras };
        for (const s of slots) {
          const lista = [refs[s.role], ...(extras[s.role] ?? [])].filter((x): x is RefLocal => !!x).slice(0, cuenta.get(s.role) ?? 0);
          nuevasRefs[s.role] = lista[0] ?? null;
          nuevosExtras[s.role] = lista.slice(1);
        }
        // Si la referencia que se suelta era la foto prestada por el personaje, se suelta el
        // personaje entero (foto + id): si no, viajaría su descripción sin su imagen.
        // Directo (sin elegirPersonaje, cuyo setRefs se pisaría): aquí las casillas ya se recalcularon.
        if (refDePersonaje && !nuevasRefs[refDePersonaje]) soltarPersonaje();
        setRefs(nuevasRefs);
        setExtras(nuevosExtras);
      }
    }
    setAvisosAplicados((prev) => (prev.includes(a.codigo) ? prev : [...prev, a.codigo]));
  };

  const faltanRefs = slots.filter((s) => !s.opcional && !refs[s.role]).length > 0;
  const paso1Listo = !faltanRefs && (idea.trim().length > 0 || refsLista.length > 0);

  // Elegir (o soltar) un personaje: su foto entra al slot de persona/producto si está vacío
  // y sale al soltarlo — sin tocar nunca una foto que subió el diseñador (personajes.ts).
  const elegirPersonaje = (nuevo: PersonajeUI | null, fotoLocal: RefLocal | null = null) => {
    const n = aplicarFotoDePersonaje(refs, personaje, nuevo, slotParaFoto(slots.map((s) => s.role)), refDePersonaje, fotoLocal);
    // F5c (reap): si el personaje se lleva la foto principal y quedan "+ otra", la siguiente toma su
    // lugar — si no, se verían en pantalla pero no viajarían al prompt (refsLista parte de la principal).
    let nuevas = n.refs;
    const masDelSlot = refDePersonaje ? extras[refDePersonaje] ?? [] : [];
    if (refDePersonaje && !nuevas[refDePersonaje] && masDelSlot.length) {
      const slot = refDePersonaje;
      nuevas = { ...nuevas, [slot]: masDelSlot[0] };
      setExtras((prev) => ({ ...prev, [slot]: masDelSlot.slice(1) }));
    }
    setRefs(nuevas);
    setRefDePersonaje(n.marcado);
    setPersonajeId(nuevo?.id ?? null);
    setConfirmarRetiro(false);
  };
  /** Suelta el personaje (id y marca de su foto) SIN tocar las casillas: para cuando ya se recalcularon. */
  const soltarPersonaje = () => {
    setPersonajeId(null);
    setRefDePersonaje(null);
    setConfirmarRetiro(false);
  };

  // Al cambiar de marca se piden sus personajes. Si la llamada falla (red, sesión) la lista
  // queda vacía y se avisa: el resto del paso 3 sigue funcionando sin personaje.
  const cargarPersonajesDe = async (id: string | null) => {
    setPersonajes([]);
    setHabitos(null);
    if (!id) return;
    const gen = marcaGen.current;
    setCargandoPersonajes(true);
    try {
      const r = await listarPersonajes(id);
      if (gen !== marcaGen.current) return; // respuesta de una marca que ya no es la elegida
      if (!r.ok) return toast.error(r.error);
      setPersonajes(r.personajes);
      setHabitos(r.habitos);
    } catch {
      if (gen === marcaGen.current) toast.error(tx(UI.error, lang));
    } finally {
      if (gen === marcaGen.current) setCargandoPersonajes(false);
    }
  };

  const alGuardarPersonaje = (p: PersonajeUI, fotoLocal: RefLocal | null) => {
    // Ya quedó guardado en la BD; si mientras tanto se cambió de marca, no se selecciona aquí
    // (aparecerá al volver a su marca). Doble candado: generación + cliente del personaje.
    if (p.client_id !== marca?.client_id) return;
    setPersonajes((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
    setMostrarPersonajeForm(false);
    elegirPersonaje(p, fotoLocal);
  };

  const retirar = async () => {
    if (!personaje) return;
    const gen = marcaGen.current;
    setRetirando(true);
    let r: Awaited<ReturnType<typeof retirarPersonaje>>;
    try {
      r = await retirarPersonaje(personaje.id);
    } catch {
      toast.error(tx(UI.error, lang));
      return;
    } finally {
      setRetirando(false);
    }
    if (!r.ok) return toast.error(r.error);
    toast.success(tx(UI.personajeRetirado, lang));
    if (gen !== marcaGen.current) return; // la marca cambió mientras tanto: la lista ya es otra
    setPersonajes((l) => l.filter((x) => x.id !== personaje.id));
    elegirPersonaje(null);
  };

  const reset = () => {
    setPaso("inicio");
    setKind(null);
    setJob(null);
    setIdea("");
    setRefs({});
    setExtras({});
    setLook(lookVacio);
    setDialogo("");
    setVoz("");
    setDialogoLang(null);
    setPersonajeId(null);
    setRefDePersonaje(null);
    setMostrarPersonajeForm(false);
    setConfirmarRetiro(false);
    setDuracion(null);
    setVideoType(null);
    setToolOverride(null);
    setAspectOverride(null);
    setRevision(null);
    setIgnorada({ texto: null, dialogo: null });
    setAvisosAplicados([]);
    setAvisosPedidos([]);
    setOcultosPaso3([]);
    setFusion(null);
    setTexto("");
    ultimoRevisado.current = { texto: "", dialogo: "" };
    setPreguntas([]);
    setHechas([]);
    setRonda(1);
    setSinMas(false);
    setRespuestas({});
    setAjustar(false);
    setSugeridoAplicado(null);
    setVivo(null);
  };

  // Cambiar de trabajo limpia TODO lo que dependía del anterior (look, diálogo,
  // duración, tipo de video, personaje): si no, un "look" elegido para animar una foto
  // se colaba en una foto de producto. La marca se conserva (es del cliente, no del job).
  const elegirJob = (j: JobType) => {
    setJob(j);
    setRefs({});
    setExtras({});
    setLook(lookVacio);
    setDialogo("");
    setVoz("");
    setDialogoLang(null);
    setDuracion(null);
    setVideoType(null);
    setPersonajeId(null);
    setRefDePersonaje(null);
    setMostrarPersonajeForm(false);
    setConfirmarRetiro(false);
    setToolOverride(null);
    setAspectOverride(null);
    setRevision(null);
    setIgnorada({ texto: null, dialogo: null });
    setAvisosAplicados([]);
    setAvisosPedidos([]);
    setOcultosPaso3([]);
    setFusion(null);
    ultimoRevisado.current = { texto: "", dialogo: "" };
    setPreguntas([]);
    setHechas([]);
    setRonda(1);
    setSinMas(false);
    setRespuestas({});
    setAjustar(false);
    setSugeridoAplicado(null);
    setPaso(1);
  };

  /** El input del servidor se arma en UN sitio: entrevistar y generar mandan lo mismo. */
  const armarInput = (j: JobType, t: Tool): InputGenerar => ({
    job: j,
    tool: t,
    idea,
    destino,
    aspect,
    duracion: duracionEfectiva,
    refs: refsLista.map((r) => ({ role: r.role, storage_path: r.storage_path, caption: r.caption, dna: r.dna })),
    look,
    dialogo: dialogo.trim() ? { texto: dialogo, idioma: idiomaDialogoActual, voz: voz.trim() || null } : null,
    marcaId,
    personajeId,
    videoType: video ? videoType : null,
    texto: texto.trim() || null,
    avisosAplicados,
    // Sólo los que siguen vivos: si la entrada cambió, un pedido viejo ya no aplica.
    avisosPedidos: avisosPedidos.filter((c) => avisosPaso3.some((a) => a.codigo === c)),
    respuestas: respuestasLista(),
    sinPreguntas,
  });

  /** Del paso 1 al 2 pasando (o no) por la entrevista: H.Ü.E decide sin modelo cuando la idea ya lo dice todo. */
  const irAlLook = async () => {
    if (!job || !tool) return;
    if (sinPreguntas) return entrarAlLook();
    setPreguntando(true);
    // ¿La heurística iba a preguntar? Si sí y no llegó nada, se le dice al diseñador (nunca "nada pasó").
    const refsFaltan = slots.some((s) => !s.opcional && !refs[s.role]);
    const iba = necesitaEntrevista({ idea, refsFaltan, chipsLook: Object.values(look).filter((v) => v && v.trim()).length, refsConDna: refsLista.filter((r) => r.dna).length, sinPreguntas });
    try {
      const r = await entrevistar(armarInput(job, tool));
      if (!r.ok) {
        // La entrevista es opcional: si falla (freno, red), se sigue sin preguntas — diciéndolo.
        toast.message(tx(UI.entrevistaFallo, lang), { description: r.error });
        entrarAlLook();
        return;
      }
      if (!r.preguntas.length) {
        if (iba) toast.message(tx(UI.sinPreguntasEstaVez, lang));
        entrarAlLook();
        return;
      }
      setPreguntas(r.preguntas);
      setHechas(r.preguntas.map((p) => ({ ...p, ronda: 1 })));
      setRonda(1);
      setSinMas(false);
      setRespuestas({});
      setPaso("entrevista");
    } catch {
      toast.message(tx(UI.entrevistaFallo, lang));
      entrarAlLook();
    } finally {
      setPreguntando(false);
    }
  };
  /** Las respuestas ya en forma de viaje (sólo las contestadas). */
  // F5c: de TODAS las rondas; la ronda viaja cuando es 2 o 3 (el informe mide si profundizar ayuda).
  const respuestasLista = (): Respuesta[] => hechas.filter((p) => respuestas[p.id]).map((p) => ({ id: p.id, valor: respuestas[p.id], campo: p.campo, ...(p.ronda > 1 ? { ronda: p.ronda } : {}) }));
  /** "Seguir": las respuestas con campo llenan los chips del look aquí mismo (y el servidor las
   *  vuelve a aplicar, idempotente): el diseñador ve en el paso 2 lo que acaba de contestar. */
  const seguirEntrevista = () => aplicarYSeguir(respuestasLista());
  const aplicarYSeguir = (lista: Respuesta[]) => {
    // Base: el look sugerido si el diseñador no tocó nada; y lo que CONTESTÓ manda sobre el look
    // (se vacía esa fila antes de aplicar, porque aplicarRespuestas sólo llena lo vacío).
    const desdeSugerencia = !!sugerido && !!job && (todoVacio(look) || (sugeridoAplicado !== null && lookActivoId === sugeridoAplicado));
    const base: Look = desdeSugerencia && sugerido && job ? aplicarLook(sugerido.look, esVideo(job)) : { ...look };
    if (desdeSugerencia && sugerido) setSugeridoAplicado(sugerido.look.id);
    for (const r of lista) if (r.campo && r.campo in base) base[r.campo as keyof Look] = null;
    const con = aplicarRespuestas({ look: base, duracion, aspect, dialogoIdioma: dialogoLang }, lista);
    setLook({ ...base, ...con.look });
    if (con.duracion !== duracion) setDuracion(con.duracion);
    if (con.aspect !== aspect) setAspectOverride(con.aspect);
    if (con.dialogoIdioma && !dialogoLang) setDialogoLang(con.dialogoIdioma as "es-MX" | "en");
    setPaso(2);
  };
  const apagarPreguntas = () => {
    try {
      window.localStorage.setItem(SIN_PREGUNTAS_KEY, "1");
    } catch {
      // sin localStorage (modo privado): sólo esta sesión
    }
    setSinPreguntasLocal(true);
    setPreguntas([]);
    setHechas([]);
    setRonda(1);
    setSinMas(false);
    setRespuestas({});
    entrarAlLook();
  };
  /** F5c: "Profundizar (3 más)": otra ronda (máx. MAX_RONDAS). La nueva no repite lo preguntado y
   *  recibe lo contestado; si a H.Ü.E no le falta nada, lo dice y el botón se va. */
  const profundizar = async () => {
    if (!job || !tool || ronda >= MAX_RONDAS) return;
    const siguiente = ronda + 1;
    setProfundizando(true);
    try {
      const r = demoProfundas
        ? { ok: true as const, preguntas: demoProfundas.filter((p) => !hechas.some((h) => h.id === p.id)).slice(0, 3) }
        : await entrevistar(armarInput(job, tool), { ronda: siguiente, preguntadas: hechas.map((p) => p.id) });
      if (!r.ok) {
        toast.message(tx(UI.profundizarFallo, lang), { description: r.error });
        return;
      }
      if (!r.preguntas.length) {
        setSinMas(true);
        toast.message(tx(UI.yaTieneTodo, lang));
        return;
      }
      setPreguntas(r.preguntas);
      setHechas((prev) => [...prev, ...r.preguntas.map((p) => ({ ...p, ronda: siguiente }))]);
      setRonda(siguiente);
    } catch {
      toast.message(tx(UI.profundizarFallo, lang));
    } finally {
      setProfundizando(false);
    }
  };
  const encenderPreguntas = () => {
    try {
      window.localStorage.removeItem(SIN_PREGUNTAS_KEY);
    } catch {
      // idem
    }
    setSinPreguntasLocal(false);
  };

  const generar = async () => {
    if (!job || !tool || bloqueo) return;
    setGenerando(true);
    const input = armarInput(job, tool);
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
    setVivo({ specId: r.specId, promptId: r.promptId, tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: sugerencia?.tool === tool ? sugerencia.porque : null, variante: "base", aprendio: r.aprendio, avisos: r.avisos, correccion: false, resultado: null });
    setPaso("resultado");
    if (video) juzgarLuego(r.promptId);
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
    setVivo({ specId, promptId: r.promptId, tool: r.tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, porque: r.nota, variante: r.variante, aprendio: null, avisos: r.avisos, correccion: r.correccion, resultado: r.resultado });
    setJob(r.spec.job);
    setKind(null);
    setPaso("resultado");
  };

  // Opción "sugerido desde tus referencias" para un swatch, si hay ADN.
  const conSugerido = (base: Swatch[], sugeridoAdn: string | null, actual: string | null = null, habituales: string[] = []): { value: string; label: string }[] => {
    const opts = base.map((s) => ({ value: s.valor, label: tx(s.label, lang) }));
    // Lo que esta marca suele usar, al frente (con su etiqueta llana).
    for (const h of [...habituales].reverse()) {
      const i = opts.findIndex((o) => o.value === h);
      if (i > 0) opts.unshift(...opts.splice(i, 1));
      else if (i === -1) opts.unshift({ value: h, label: etiquetaValor(h, lang, etiquetasEntrevista) });
    }
    if (sugeridoAdn && !opts.some((o) => o.value === sugeridoAdn)) opts.unshift({ value: sugeridoAdn, label: `${tx(UI.sugeridoDeTusRefs, lang)}: ${sugeridoAdn}` });
    // Lo que ya está elegido y no es un chip de la lista (un look, una respuesta de la entrevista,
    // "otro…") se ve como chip CON SU ETIQUETA, nunca con la frase técnica en inglés.
    if (actual && !opts.some((o) => o.value === actual)) opts.unshift({ value: actual, label: etiquetaValor(actual, lang, etiquetasEntrevista) });
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
          {/* El NOMBRE es el titular (Poppins, la fuente de títulos de la app); la palabra
              "Prisma" lleva el espectro como tinta. La tagline baja a subtítulo. (Pedro) */}
          <h1 className="font-heading text-[34px] font-bold leading-none tracking-tight text-foreground md:text-[44px]">
            HÜE <span className="p-spectrum-text">Prisma</span>
          </h1>
          <p className="mt-2 text-base text-muted-foreground md:text-lg">{tx(UI.tagline, lang)}</p>
          <Beam estado={estadoHaz} color={colorActivo} className="mt-3" />
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
          {(typeof paso === "number" || paso === "entrevista") && job && (
            <section key={`paso-${paso}`} className="p-enter rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{tx(JOB_LABEL[job], lang)}</p>
                  <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
                    {paso === 1 ? tx(UI.paso1, lang) : paso === "entrevista" ? tx(UI.entrevistaTitulo, lang) : paso === 2 ? tx(UI.paso2, lang) : tx(UI.paso3, lang)}
                  </h2>
                </div>
                <p className="sr-only" aria-live="polite">
                  {tx(UI.pasoDe, lang)} {paso === "entrevista" ? "1½" : paso} {tx(UI.de, lang)} 3
                </p>
                <ol className="flex items-center gap-1.5" aria-hidden="true">
                  {[1, ...(paso === "entrevista" ? ["e" as const] : []), 2, 3].map((n) => (
                    <li key={n} className={cn("h-2 rounded-full transition-all duration-300", n === "e" ? "w-4 animate-pulse bg-primary" : n === paso ? "w-6 bg-primary" : (paso === "entrevista" ? n < 2 : n < (paso as number)) ? "w-2 bg-primary/40" : "w-2 bg-border")} aria-current={n === paso || (n === "e" && paso === "entrevista") ? "step" : undefined} />
                  ))}
                </ol>
              </div>

              {paso === 1 && (
                <div className="space-y-4">
                  {/* La marca va PRIMERO: la entrevista (lo que la marca ya sabe) y el paso 2 (lo que la
                      marca suele usar) la necesitan antes de que el diseñador llegue al paso 3. */}
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tx(UI.marca, lang)}</p>
                    <ChipSelect
                      options={[{ value: "", label: tx(UI.sinMarca, lang) }, ...marcas.map((m) => ({ value: m.id, label: `${m.client_name} · ${m.name}` }))]}
                      selected={[marcaId ?? ""]}
                      onChange={(up) => {
                        const v = up([marcaId ?? ""])[0] ?? "";
                        marcaGen.current += 1;
                        setMarcaId(v || null);
                        elegirPersonaje(null);
                        setMostrarPersonajeForm(false);
                        void cargarPersonajesDe(v || null);
                      }}
                      ariaLabel={tx(UI.marca, lang)}
                      allowCustom={false}
                    />
                  </div>
                  <div>
                    <label htmlFor="prisma-idea" className="block text-sm font-medium text-foreground">
                      {tx(UI.ideaLabel, lang)}
                    </label>
                    <Textarea id="prisma-idea" autoFocus value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={tx(UI.ideaPlaceholder, lang)} rows={3} maxLength={2000} className="mt-2" />
                  </div>
                  {/* Texto en la pieza: campo PROPIO (no se saca de la idea). Lo que se
                      escribe aquí va tal cual al prompt, en el idioma en que se escribió. */}
                  <div>
                    <label htmlFor="prisma-texto" className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {tx(UI.textoLabel, lang)}
                      {/* El spinner vive en la etiqueta: revisar no mueve nada debajo del campo. */}
                      {revisando === "texto" && (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-live="polite">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {tx(UI.revisando, lang)}
                        </span>
                      )}
                    </label>
                    <input id="prisma-texto" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => void revisar("texto")} placeholder={tx(UI.textoPlaceholder, lang)} maxLength={200} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    <p className="mt-1 text-xs text-muted-foreground">{tx(UI.textoAyuda, lang)}</p>
                    {/* Ortografía: acentos y gramática del texto que se va a pintar. Sugerencia, nunca reemplazo. */}
                    <SugerenciaTexto sugerido={sugerenciaViva("texto")?.sugerido ?? null} cambios={sugerenciaViva("texto")?.cambios ?? []} lang={lang} onUsar={() => usarSugerencia("texto")} onDejar={() => dejarAsi("texto")} />
                  </div>
                  {slots.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {slots.map((s) => {
                        const mas = extras[s.role] ?? [];
                        return (
                          <div key={s.role} className="space-y-2">
                            <RefUploader
                              role={s.role}
                              opcional={s.opcional}
                              value={refs[s.role] ?? null}
                              onChange={(v) => {
                                // Quitar la foto que prestó el personaje = soltar el personaje entero (si no, su
                                // descripción viajaría con otra foto); elegirPersonaje ya promueve la siguiente.
                                if (!v && refDePersonaje === s.role && personaje?.foto && refs[s.role]?.storage_path === personaje.foto.storage_path) return elegirPersonaje(null);
                                if (v || !mas.length) return setRefs((prev) => ({ ...prev, [s.role]: v }));
                                // Se quitó la principal y hay más: la siguiente toma su lugar (sin huecos).
                                setRefs((prev) => ({ ...prev, [s.role]: mas[0] }));
                                setExtras((prev) => ({ ...prev, [s.role]: mas.slice(1) }));
                              }}
                              lang={lang}
                            />
                            {mas.map((m, i) => (
                              <RefUploader key={m.storage_path} role={s.role} value={m} onChange={(v) => { if (!v) setExtras((prev) => ({ ...prev, [s.role]: (prev[s.role] ?? []).filter((_, j) => j !== i) })); }} lang={lang} etiqueta={{ es: `${REF_LABEL[s.role].es} · ${i + 2}`, en: `${REF_LABEL[s.role].en} · ${i + 2}` }} />
                            ))}
                            {ROLES_MULTI.has(s.role) && refs[s.role] && refsLista.length < MAX_REFS && (
                              <RefUploader
                                key={`${s.role}-mas-${mas.length}`}
                                role={s.role}
                                opcional
                                value={null}
                                onChange={(v) => { if (v) setExtras((prev) => ({ ...prev, [s.role]: [...(prev[s.role] ?? []), v] })); }}
                                lang={lang}
                                etiqueta={{ es: `+ Otra imagen (${refsLista.length} de ${MAX_REFS})`, en: `+ Another image (${refsLista.length} of ${MAX_REFS})` }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {(paso === "entrevista" || paso === 2) && sugerenciaViva("texto") && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground">{tx(UI.textoLabel, lang)}: «{texto}»</p>
                  <SugerenciaTexto sugerido={sugerenciaViva("texto")?.sugerido ?? null} cambios={sugerenciaViva("texto")?.cambios ?? []} lang={lang} onUsar={() => usarSugerencia("texto")} onDejar={() => dejarAsi("texto")} />
                </div>
              )}
              {paso === "entrevista" && (
                <Entrevista
                  preguntas={preguntas}
                  respuestas={respuestas}
                  lang={lang}
                  onCambio={(id, valor) => setRespuestas((prev) => { const n = { ...prev }; if (valor) n[id] = valor; else delete n[id]; return n; })}
                  onSeguir={seguirEntrevista}
                  onSaltar={() => {
                    if (ronda === 1) {
                      setRespuestas({});
                      entrarAlLook();
                      return;
                    }
                    // Ronda 2+: se salta sólo ESTA ronda; lo contestado antes se queda y se aplica.
                    const deEstaRonda = new Set<string>(preguntas.map((p) => p.id));
                    setRespuestas((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !deEstaRonda.has(id))));
                    aplicarYSeguir(respuestasLista().filter((r) => !deEstaRonda.has(r.id)));
                  }}
                  ronda={ronda}
                  maxRondas={MAX_RONDAS}
                  anteriores={hechas.filter((p) => p.ronda < ronda && respuestas[p.id]).map((p) => ({ pregunta: tx(p.pregunta, lang), respuesta: tx(p.opciones.find((o) => o.valor === respuestas[p.id])?.label ?? { es: respuestas[p.id], en: respuestas[p.id] }, lang) }))}
                  puedeProfundizar={ronda < MAX_RONDAS && !sinMas}
                  profundizando={profundizando}
                  onProfundizar={profundizar}
                  onSinPreguntas={apagarPreguntas}
                  onAtras={() => setPaso(1)}
                />
              )}

              {paso === 2 && job && (
                <div className="space-y-5">
                  {sinPreguntas && (
                    <button type="button" onClick={encenderPreguntas} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      {tx(UI.conPreguntas, lang)}
                    </button>
                  )}
                  {/* F5a: un look = una receta completa con foto; H.Ü.E deja uno pre-elegido. */}
                  <LooksGrid looks={looksJob} activo={lookActivoId} sugerido={sugerido ? { id: sugerido.look.id, porque: sugerido.porque } : null} habituales={habitos?.looks ?? []} lang={lang} onElegir={(l) => setLook(aplicarLook(l, video))} />
                  {/* Las filas de siempre, plegadas: para cambiar UNA cosa sin perder el resto. */}
                  <details className="rounded-xl border border-border bg-card/60" open={ajustar} onToggle={(e) => setAjustar(e.currentTarget.open)}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      <span>
                        {tx(UI.ajustar, lang)}
                        {lookActivoId === null && !todoVacio(look) && <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{tx(UI.lookPersonalizado, lang)}</span>}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{tx(UI.ajustarAyuda, lang)}</span>
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ajustar && "rotate-180")} aria-hidden="true" />
                    </summary>
                    <div className="space-y-5 px-4 pb-4">
                      <Chips lang={lang} titulo={tx(UI.luz, lang)} opciones={conSugerido(SWATCHES_LUZ, dnaPrincipal?.luz ?? null, look.luz, habitos?.valores.luz)} valor={look.luz} onChange={(v) => setLook((l) => ({ ...l, luz: v }))} />
                      {video && <Chips lang={lang} titulo={tx(UI.camara, lang)} opciones={conSugerido(SWATCHES_CAMARA, null, look.movimiento, habitos?.valores.movimiento)} valor={look.movimiento} onChange={(v) => setLook((l) => ({ ...l, movimiento: v }))} />}
                      <Chips lang={lang} titulo={tx(UI.lente, lang)} opciones={conSugerido(SWATCHES_LENTE, dnaPrincipal?.lente ?? null, look.lente, habitos?.valores.lente)} valor={look.lente} onChange={(v) => setLook((l) => ({ ...l, lente: v }))} />
                      <Chips lang={lang} titulo={tx(UI.angulo, lang)} opciones={conSugerido(SWATCHES_ANGULO, null, look.angulo, habitos?.valores.angulo)} valor={look.angulo} onChange={(v) => setLook((l) => ({ ...l, angulo: v }))} />
                      <Chips lang={lang} titulo={tx(UI.mood, lang)} opciones={conSugerido(SWATCHES_MOOD, dnaPrincipal?.mood ?? null, look.mood, habitos?.valores.mood)} valor={look.mood} onChange={(v) => setLook((l) => ({ ...l, mood: v }))} />
                      <Chips lang={lang} titulo={tx(UI.estilo, lang)} opciones={conSugerido(SWATCHES_ESTILO, null, look.estilo, habitos?.valores.estilo)} valor={look.estilo} onChange={(v) => setLook((l) => ({ ...l, estilo: v }))} />
                    </div>
                  </details>
                </div>
              )}

              {paso === 3 && (
                <div className="space-y-5">
                  <Chips lang={lang} titulo={tx(UI.paso3, lang)} opciones={DESTINOS.map((d) => ({ value: d, label: tx(DESTINO_LABEL[d], lang) }))} valor={destino} onChange={(v) => { if (v) { setDestino(v as Destino); setAspectOverride(null); } }} permiteOtro={false} />
                  {/* Personaje o producto guardado: sólo con marca (pertenece a UN cliente). Se
                      puede elegir, guardar uno nuevo y retirar el elegido (el autor o un lead). */}
                  {marca && (
                    <div className="space-y-2">
                      {personajesDeMarca.length > 0 ? (
                        <Chips lang={lang} titulo={tx(UI.personajeTitulo, lang)} opciones={[{ value: "", label: tx(UI.personajeNinguno, lang) }, ...personajesDeMarca.map((p) => ({ value: p.id, label: p.name }))]} valor={personajeId ?? ""} onChange={(v) => elegirPersonaje(personajesDeMarca.find((p) => p.id === v) ?? null)} permiteOtro={false} />
                      ) : (
                        <div aria-busy={cargandoPersonajes}>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tx(UI.personajeTitulo, lang)}</p>
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
                            {cargandoPersonajes && <Loader2 className="size-3.5 animate-spin" />}
                            {cargandoPersonajes ? tx(UI.personajeCargando, lang) : tx(UI.personajeVacio, lang)}
                          </p>
                        </div>
                      )}
                      {personaje && (
                        <div className="p-enter flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                          {personaje.foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={personaje.foto.url} alt={personaje.name} className="size-14 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                              <UserRound className="size-5" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{personaje.name}</p>
                            <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{personaje.descripcion}</p>
                            {refDePersonaje && <p className="mt-1 text-xs text-primary">{tx(UI.personajeFotoComoRef, lang)}</p>}
                          </div>
                          {(personaje.mio || verTodo) &&
                            (confirmarRetiro ? (
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="destructive" onClick={retirar} disabled={retirando}>
                                  {retirando ? <Loader2 className="size-4 animate-spin" /> : null}
                                  {tx(UI.personajeRetirar, lang)}
                                </Button>
                                <button type="button" onClick={() => setConfirmarRetiro(false)} disabled={retirando} aria-label={tx(UI.cancelar, lang)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                                  <X className="size-4" />
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setConfirmarRetiro(true)} aria-label={`${tx(UI.personajeRetirar, lang)} ${personaje.name}`} title={tx(UI.personajeRetirar, lang)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive">
                                <Trash2 className="size-4" />
                              </button>
                            ))}
                        </div>
                      )}
                      {mostrarPersonajeForm ? (
                        <PersonajeForm marcaId={marca.id} lang={lang} onGuardado={alGuardarPersonaje} onCancelar={() => setMostrarPersonajeForm(false)} />
                      ) : (
                        <button type="button" onClick={() => setMostrarPersonajeForm(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                          <Plus className="size-3.5" /> {tx(UI.personajeNuevo, lang)}
                        </button>
                      )}
                    </div>
                  )}
                  {video && (
                    <div>
                      <label htmlFor="prisma-dialogo" className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {tx(UI.dialogo, lang)}
                        {revisando === "dialogo" && (
                          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-live="polite">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {tx(UI.revisando, lang)}
                          </span>
                        )}
                      </label>
                      <Textarea id="prisma-dialogo" value={dialogo} onChange={(e) => setDialogo(e.target.value)} onBlur={() => void revisar("dialogo")} placeholder={tx(UI.dialogoPlaceholder, lang)} rows={2} className="mt-2" />
                      <SugerenciaTexto sugerido={sugerenciaViva("dialogo")?.sugerido ?? null} cambios={sugerenciaViva("dialogo")?.cambios ?? []} lang={lang} onUsar={() => usarSugerencia("dialogo")} onDejar={() => dejarAsi("dialogo")} />
                      {dialogo.trim() && (
                        <div className="mt-2">
                          <Chips lang={lang} titulo={tx(UI.idiomaDialogo, lang)} opciones={[{ value: "es-MX", label: "Español" }, { value: "en", label: "English" }]} valor={dialogoLang ?? (lang === "en" ? "en" : "es-MX")} onChange={(v) => setDialogoLang(v === "en" ? "en" : "es-MX")} permiteOtro={false} />
                        </div>
                      )}
                      {dialogo.trim() && (
                        <input value={voz} onChange={(e) => setVoz(e.target.value)} placeholder={lang === "es" ? "¿Cómo suena la voz? (ej.: cálida, acento mexicano neutro)" : "What does the voice sound like?"} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" aria-label={lang === "es" ? "Voz" : "Voice"} />
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
                      <p className="mt-0.5 text-xs text-muted-foreground">{toolOverride ? (lang === "es" ? "La elegiste tú." : "You picked it.") : tx(sugerencia.porque, lang)}</p>
                      {modelo && (
                        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground">
                          <Cpu className="size-3.5 text-primary" aria-hidden="true" />
                          <span className="font-medium">{tx(UI.usaloEn, lang)}</span>
                          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-medium">{tx(modelo.etiqueta, lang)}</span>
                          <span className="text-muted-foreground">{tx(modelo.porque, lang)}</span>
                        </p>
                      )}
                      {modelo && <p className="mt-1 text-xs text-muted-foreground">{tx(textoCosto(modelo.costo, !!video, tool ?? undefined, tool === "veo" && duracionEfectiva ? duracionVeo(duracionEfectiva, refsLista.length) : duracionEfectiva), lang)}</p>}
                      {TOOLS_POR_JOB[job].length > 1 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.cambiarHerramienta, lang)}</p>
                          <ChipSelect options={TOOLS_POR_JOB[job].map((t) => {
                            // Paso 2: cada opción con lo que cuesta su modelo recomendado para ESTA pieza.
                            const c = tx(costoCorto(recomendarModelo({ job, tool: t, destino, refs: refsLista.length, texto: texto.trim().length > 0, dialogo: dialogo.trim().length > 0, duracion }, catalogo).costo), lang);
                            return { value: t, label: c ? `${tx(TOOL_LABEL[t], lang)} · ${c}` : tx(TOOL_LABEL[t], lang) };
                          })} selected={[tool]} onChange={(up) => setToolOverride((up([tool])[0] as Tool | undefined) ?? null)} ariaLabel={tx(UI.herramienta, lang)} allowCustom={false} />
                        </div>
                      )}
                      {video && (duraciones.length > 1 || veoForzado) && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.duracion, lang)}</p>
                          <ChipSelect options={[...duraciones].sort((a, b) => a - b).map((d) => ({ value: String(d), label: `${d} s` }))} selected={[String(duracionEfectiva)]} onChange={(up) => setDuracion(Number(up([String(duracionEfectiva)])[0]) || null)} ariaLabel={tx(UI.duracion, lang)} allowCustom={false} />
                          {veoForzado && <p className="mt-1 text-[11px] text-muted-foreground">{tx(UI.duracionConRefs, lang)}</p>}
                        </div>
                      )}
                      {video && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">{tx(UI.tipoVideo, lang)}</p>
                          <ChipSelect options={VIDEO_TYPES.map((v) => ({ value: v }))} selected={videoType ? [videoType] : []} onChange={(up) => setVideoType(up(videoType ? [videoType] : [])[0] ?? null)} ariaLabel={tx(UI.tipoVideo, lang)} allowCustom={false} />
                        </div>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {lang === "es" ? "Formato" : "Format"}: {aspect}
                        {duracionEfectiva ? ` · ${duracionEfectiva} s` : ""}
                      </p>
                    </div>
                  )}
                  {/* F2: avisos antes de generar, con arreglo de un click. Un "bloquea" apaga Generar. */}
                  {avisosPaso3.length > 0 && (
                    <PanelAvisos
                      // Un "bloquea" nunca se oculta; ocultar no toca el bloqueo (sale de avisosPaso3 completo).
                      avisos={avisosPaso3.filter((a) => a.nivel === "bloquea" || !ocultosPaso3.includes(a.codigo))}
                      lang={lang}
                      titulo={tx(UI.avisosTitulo, lang)}
                      onArreglar={arreglar}
                      resolver={(a) => resolucionDe(a, ACCIONES_PASO3, "al_generar")}
                      onHue={(a) => setAvisosPedidos((prev) => (prev.includes(a.codigo) ? prev.filter((c) => c !== a.codigo) : [...prev, a.codigo]))}
                      pedidos={new Set(avisosPedidos)}
                      onEntendido={(a) => setOcultosPaso3((prev) => [...prev, a.codigo])}
                      ocultos={avisosPaso3.filter((a) => a.nivel !== "bloquea" && ocultosPaso3.includes(a.codigo)).length}
                      onMostrarOcultos={() => setOcultosPaso3([])}
                    />
                  )}
                  {fusion && (
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-semibold text-foreground">{tx(UI.fusionTitulo, lang)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.fusionAyuda, lang)}</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary p-2 font-mono text-xs text-foreground">{fusion}</pre>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(fusion).then(() => toast.success(tx(UI.copiado, lang))).catch(() => toast.error(tx(UI.error, lang)))}>
                          {tx(UI.copiar, lang)}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setFusion(null)}>
                          {tx(UI.cancelar, lang)}
                        </Button>
                      </div>
                    </div>
                  )}
                  {bloqueo && <p className="text-xs font-medium text-destructive" role="alert">{tx(UI.bloqueadoPor, lang)}</p>}
                </div>
              )}

              {/* Navegación del paso (la entrevista trae sus propios botones) */}
              {paso !== "entrevista" && (
              <div className="mt-6 flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => (paso === 1 ? setPaso("job") : setPaso((paso - 1) as Paso))} disabled={preguntando}>
                  <ArrowLeft className="size-4" /> {tx(UI.atras, lang)}
                </Button>
                {paso === 1 ? (
                  <Button onClick={() => void irAlLook()} disabled={!paso1Listo || preguntando} aria-busy={preguntando} className="min-w-[160px]">
                    {preguntando ? <Loader2 className="size-4 animate-spin" /> : null}
                    {preguntando ? tx(UI.entrevistando, lang) : tx(UI.siguiente, lang)} {!preguntando && <ArrowRight className="size-4" />}
                  </Button>
                ) : paso < 3 ? (
                  <Button onClick={() => setPaso((paso + 1) as Paso)}>
                    {tx(UI.siguiente, lang)} <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button onClick={generar} disabled={generando || !tool || !!bloqueo} aria-live="polite" className="min-w-[200px]">
                    {generando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {generando ? tx(MENSAJES_GENERANDO[etapa], lang) : tx(UI.generar, lang)}
                  </Button>
                )}
              </div>
              )}
            </section>
          )}

          {paso === "resultado" && vivo && (
            <section key="resultado" className="p-enter rounded-2xl border border-border bg-card p-5 shadow-sm">
              <Resultado
                vivo={vivo}
                lang={lang}
                juicioEnCurso={juzgando === vivo.promptId}
                onJuzgar={juzgarLuego}
                onCambio={(v) => {
                  const specNuevo = v.specId !== vivo.specId; // "otra versión" crea un spec hermano
                  setVivo(v);
                  if (specNuevo) router.refresh(); // el historial (props del servidor) se re-lee
                }}
                onNueva={reset}
              />
            </section>
          )}
        </div>

        <Historial items={historial} lang={lang} onAbrir={abrirDeHistorial} abriendo={abriendo} />
      </div>
    </div>
  );
}
