/**
 * HÜE Prisma — el "PromptSpec": UNA descripción intermedia de lo que el diseñador
 * quiere, independiente de la herramienta. Cada compiler (nanobanana/veo/kling/
 * sora/higgsfield) la convierte al formato exacto de su herramienta.
 *
 * Por qué así (lección del teardown de Roco Prompts): allá cada bot tenía su propio
 * prompt y su propio formulario; cambiar de herramienta era volver a empezar. Con un
 * spec único, cambiar de herramienta es RECOMPILAR, no re-capturar, y una campaña
 * entera queda consistente.
 *
 * Módulo PURO: sin server-only, sin React, sin DB — se prueba con node directo
 * (scripts/test-prisma.mjs).
 */

export type Tool = "nanobanana" | "veo" | "kling" | "sora" | "higgsfield";
export const TOOLS: Tool[] = ["nanobanana", "veo", "kling", "sora", "higgsfield"];

/** Las tres "puertas" de la pantalla de inicio. */
export type JobKind = "imagen" | "video" | "edicion";

/** Los trabajos en lenguaje humano. El id es estable; la etiqueta vive en copy.ts. */
export type JobType =
  // Crear imagen
  | "foto_producto"
  | "escena_persona"
  | "imagen_libre"
  // Editar imagen (Nano Banana)
  | "cambio_outfit"
  | "cambio_fondo"
  | "cambio_pose"
  | "agregar_objeto"
  | "cambio_angulo"
  | "restaurar_foto"
  | "mejora_foto"
  | "aplicar_logo"
  | "dos_personajes"
  | "cambio_epoca"
  | "figura_coleccionable"
  // Crear video
  | "animar_foto"
  | "texto_a_video"
  | "transicion"
  | "escena_sora";

export const JOB_KIND: Record<JobType, JobKind> = {
  foto_producto: "imagen",
  escena_persona: "imagen",
  imagen_libre: "imagen",
  cambio_outfit: "edicion",
  cambio_fondo: "edicion",
  cambio_pose: "edicion",
  agregar_objeto: "edicion",
  cambio_angulo: "edicion",
  restaurar_foto: "edicion",
  mejora_foto: "edicion",
  aplicar_logo: "edicion",
  dos_personajes: "edicion",
  cambio_epoca: "edicion",
  figura_coleccionable: "edicion",
  animar_foto: "video",
  texto_a_video: "video",
  transicion: "video",
  escena_sora: "video",
};

export const JOBS_POR_KIND: Record<JobKind, JobType[]> = {
  imagen: ["foto_producto", "escena_persona", "imagen_libre"],
  edicion: [
    "cambio_outfit",
    "cambio_fondo",
    "cambio_pose",
    "agregar_objeto",
    "cambio_angulo",
    "restaurar_foto",
    "mejora_foto",
    "aplicar_logo",
    "dos_personajes",
    "cambio_epoca",
    "figura_coleccionable",
  ],
  video: ["animar_foto", "texto_a_video", "transicion", "escena_sora"],
};

/** Qué papel juega cada imagen de referencia. El orden en `refs` es el orden
 *  "[Imagen 1]", "[Imagen 2]"… con el que la nombra el prompt. */
export type RefRole =
  | "sujeto"
  | "producto"
  | "outfit"
  | "pose"
  | "escena"
  | "objeto"
  | "logo"
  | "estilo"
  | "empaque"
  | "personaje2"
  | "inicio"
  | "fin";

/** Qué imágenes pide cada trabajo, en orden. `opcional` = puede faltar. */
export const REFS_POR_JOB: Record<JobType, { role: RefRole; opcional?: boolean }[]> = {
  foto_producto: [{ role: "producto" }],
  escena_persona: [{ role: "sujeto" }],
  imagen_libre: [{ role: "estilo", opcional: true }],
  cambio_outfit: [{ role: "sujeto" }, { role: "outfit" }],
  cambio_fondo: [{ role: "sujeto" }],
  cambio_pose: [{ role: "sujeto" }, { role: "pose" }],
  agregar_objeto: [{ role: "escena" }, { role: "objeto" }],
  cambio_angulo: [{ role: "escena" }],
  restaurar_foto: [{ role: "sujeto" }],
  mejora_foto: [{ role: "sujeto" }],
  aplicar_logo: [{ role: "producto" }, { role: "logo" }],
  dos_personajes: [{ role: "sujeto" }, { role: "personaje2" }, { role: "pose", opcional: true }],
  cambio_epoca: [{ role: "sujeto" }],
  figura_coleccionable: [{ role: "sujeto" }, { role: "empaque", opcional: true }],
  animar_foto: [{ role: "sujeto" }],
  texto_a_video: [],
  transicion: [{ role: "inicio" }, { role: "fin" }],
  escena_sora: [{ role: "sujeto", opcional: true }],
};

/** El "ADN visual" que H.Ü.E extrae de una referencia (pase de visión). Todo en
 *  palabras llanas y en español: el diseñador lo ve y lo edita como chips. */
export type VisualDNA = {
  luz: string; // "luz lateral suave de ventana, sombras largas"
  lente: string; // "teleobjetivo, fondo desenfocado"
  paleta: string[]; // hex o nombres: ["#1a1f1c", "beige cálido"]
  mood: string; // "íntimo, nostálgico"
  composicion: string; // "sujeto a la izquierda, mucho aire arriba"
  textura: string; // "grano fino de película"
};

export type Ref = {
  role: RefRole;
  /** Una frase corta de qué hay en la imagen ("una mujer con abrigo negro en un jardín"). */
  caption: string | null;
  dna: VisualDNA | null;
};

export type Aspect = "9:16" | "16:9" | "1:1" | "4:5" | "4:3" | "3:4";
export const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1", "4:5", "4:3", "3:4"];

/** Dónde va a vivir la pieza. Decide aspect y ayuda a elegir herramienta. */
export type Destino =
  | "ig_story"
  | "ig_feed"
  | "tiktok"
  | "fb_ad"
  | "yt"
  | "web_banner"
  | "print"
  | "libre";

export const DESTINOS: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad", "yt", "web_banner", "print", "libre"];

export const ASPECT_POR_DESTINO: Record<Destino, Aspect> = {
  ig_story: "9:16",
  ig_feed: "4:5",
  tiktok: "9:16",
  fb_ad: "1:1",
  yt: "16:9",
  web_banner: "16:9",
  print: "4:3",
  libre: "16:9",
};

export type Camara = {
  angulo: string | null; // "contrapicado", "cenital", "a la altura de los ojos"
  movimiento: string | null; // "dolly in lento", "órbita", "cámara en mano"
  lente: string | null; // "85mm, fondo desenfocado", "gran angular 24mm"
};

export type Dialogo = {
  texto: string;
  idioma: string; // "es-MX", "en"
  voz: string | null; // "voz neutra con acento mexicano, cálida"
};

/** Estilo de video para Sora 2 (taxonomía que Sora respeta muy bien). */
export type SoraVideoType =
  | "Trailer cinematográfico"
  | "Comercial de producto"
  | "Video de celular sin cortes"
  | "GoPro POV"
  | "Cámara de seguridad"
  | "Tomas aéreas de drone"
  | "ASMR"
  | "Vlog Selfie"
  | "Unboxing de producto"
  | "Story Vertical"
  | "Video Old VHS";

export const SORA_VIDEO_TYPES: SoraVideoType[] = [
  "Trailer cinematográfico",
  "Comercial de producto",
  "Video de celular sin cortes",
  "GoPro POV",
  "Cámara de seguridad",
  "Tomas aéreas de drone",
  "ASMR",
  "Vlog Selfie",
  "Unboxing de producto",
  "Story Vertical",
  "Video Old VHS",
];

/** Un "beat" (bloque de tiempo) de un video: qué pasa, cómo se mueve la cámara, qué suena. */
export type Beat = {
  desde: number; // segundos
  hasta: number;
  accion: string;
  camara: string;
  sfx: string; // onomatopeyas / ambiente: "*click* suave, viento"
};

/** Lo que la marca del cliente aporta a TODO prompt (viene de marcas.prisma_presets). */
export type MarcaPreset = {
  nombre: string;
  paleta: string[];
  tono: string; // "premium, cálido, directo"
  evitar: string[]; // ["texto en pantalla", "fondos morados"]
  aspect_default: Aspect | null;
};

export type PromptSpec = {
  job: JobType;
  tool: Tool;
  /** La idea del diseñador tal cual (para trazabilidad y para el refine). */
  idea: string;

  sujeto: string;
  accion: string;
  entorno: string;
  camara: Camara;
  luz: string;
  mood: string;
  estilo: string;
  paleta: string[];
  texturas: string[];
  negativos: string[];
  /** Qué NO debe cambiar: identidad del rostro, manos, texto del empaque… */
  preservar: string[];

  refs: Ref[];
  aspect: Aspect;
  /** Segundos. null para imagen. */
  duracion: number | null;
  dialogo: Dialogo | null;
  marca: MarcaPreset | null;

  /** Sólo video: beats por bloque de tiempo (Sora/Veo los usan; Kling los resume). */
  beats: Beat[] | null;
  /** Sólo Sora. */
  video_type: SoraVideoType | null;
  /** Sólo Higgsfield: nombre del preset de cámara (ver compilers/higgsfield.ts). */
  preset: string | null;
};

/** Un spec en blanco con valores seguros. El writer lo llena; la UI lo edita. */
export function specVacio(job: JobType, tool: Tool, idea = ""): PromptSpec {
  return {
    job,
    tool,
    idea,
    sujeto: "",
    accion: "",
    entorno: "",
    camara: { angulo: null, movimiento: null, lente: null },
    luz: "",
    mood: "",
    estilo: "",
    paleta: [],
    texturas: [],
    negativos: [],
    preservar: [],
    refs: [],
    aspect: "16:9",
    duracion: null,
    dialogo: null,
    marca: null,
    beats: null,
    video_type: null,
    preset: null,
  };
}

/**
 * ¿Este objeto (p. ej. el jsonb guardado en prisma_specs.spec) tiene la forma de un
 * PromptSpec? Comprobación de RUNTIME: un cast ciego dejaría pasar filas viejas con
 * otra forma y reventarían dentro de compilar(). Verifica lo que los compilers tocan.
 */
export function esSpec(v: unknown): v is PromptSpec {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const str = (k: string) => typeof o[k] === "string";
  const arr = (k: string) => Array.isArray(o[k]);
  const cam = o.camara as Record<string, unknown> | undefined;
  return (
    str("job") && (o.job as string) in JOB_KIND &&
    str("tool") && TOOLS.includes(o.tool as Tool) &&
    str("idea") && str("sujeto") && str("accion") && str("entorno") && str("luz") && str("mood") && str("estilo") &&
    !!cam && typeof cam === "object" &&
    arr("paleta") && arr("texturas") && arr("negativos") && arr("preservar") && arr("refs") &&
    str("aspect") && ASPECTS.includes(o.aspect as Aspect)
  );
}

/** Índice 1-based de la referencia con ese papel, o null. Es lo que los prompts
 *  escriben como "[Imagen N]". */
export function indiceRef(spec: PromptSpec, role: RefRole): number | null {
  const i = spec.refs.findIndex((r) => r.role === role);
  return i === -1 ? null : i + 1;
}

/** Etiqueta "[Imagen N]" o, si hay caption, "[Imagen N: caption]". */
export function etiquetaRef(spec: PromptSpec, role: RefRole): string | null {
  const n = indiceRef(spec, role);
  if (n === null) return null;
  const r = spec.refs[n - 1];
  return r.caption ? `[Imagen ${n}: ${r.caption}]` : `[Imagen ${n}]`;
}

/** ¿El trabajo es de video? */
export const esVideo = (job: JobType): boolean => JOB_KIND[job] === "video";

/** Une frases no vacías con ". " y cierra con punto — evita "..", espacios dobles
 *  y frases vacías cuando un campo del spec viene en blanco. */
export function frases(...partes: (string | null | undefined | false)[]): string {
  const limpias = partes
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim().replace(/[.\s]+$/, ""));
  return limpias.length ? limpias.join(". ") + "." : "";
}

/** Une piezas con coma (para prompts de una sola línea tipo Kling). */
export function comas(...partes: (string | null | undefined | false)[]): string {
  return partes
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim().replace(/[,.\s]+$/, ""))
    .join(", ");
}

/** Quita el pronombre inicial de una acción ("she breathes" → "breathes") para poder
 *  anteponer el sujeto sin que quede "the woman she breathes". */
export function sinPronombre(accion: string): string {
  return accion.replace(/^(he|she|they|it|the subject)\s+/i, "").trim();
}

export const contarPalabras = (s: string): number =>
  s.trim().split(/\s+/).filter(Boolean).length;
