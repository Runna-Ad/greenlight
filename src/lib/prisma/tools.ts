/**
 * HÜE Prisma — ficha de cada herramienta destino: en qué idioma quiere el prompt,
 * qué límites tiene, dónde se abre. Es la "verdad" que usan compilers, validators y
 * la pantalla de resultado. Módulo puro.
 */
import { TOOLS, TOOL_SUCESORA, type Tool, type JobType, type JobKind, type Aspect } from "./spec.ts";

export type Idioma = "es" | "en";

export type ToolInfo = {
  id: Tool;
  nombre: string;
  /** Idioma del prompt. Hoy TODAS van en inglés (es lo que los modelos leen mejor y
   *  permite recompilar un mismo spec a cualquier herramienta); el diálogo conserva
   *  su idioma original. El campo queda por si una herramienta futura prefiere otro. */
  idioma: Idioma;
  /** Formato que devuelve el compiler. */
  formato: "texto" | "json";
  /** Tope duro del compiler/validator (palabras o caracteres). null = sin tope. */
  maxPalabras: number | null;
  maxCaracteres: number | null;
  /** Dónde se pega el prompt. */
  url: string;
  /** Acepta imágenes de referencia como entrada. */
  imagenes: boolean;
  /** Es de video. */
  video: boolean;
  /** Duraciones que ofrece (segundos). [] = imagen. */
  duraciones: number[];
  /** El tono de la herramienta en el espectro de Prisma (color = información: la UI
   *  tiñe la tarjeta, la cabecera del resultado y el haz con él). Hex literal a
   *  propósito: se usa en estilos en línea (`--p-tool`), donde var() sí resuelve. */
  color: string;
};

export const TOOL_INFO: Record<Tool, ToolInfo> = {
  nanobanana: {
    id: "nanobanana",
    nombre: "Nano Banana",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: "https://gemini.google.com/",
    imagenes: true,
    video: false,
    duraciones: [],
    color: "#f7c948",
  },
  chatgpt: {
    id: "chatgpt",
    nombre: "ChatGPT Images",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: "https://chatgpt.com/",
    imagenes: true,
    video: false,
    duraciones: [],
    // Verde: el sexto tono cierra el círculo del espectro (cian → verde → amarillo).
    color: "#3dd68c",
  },
  veo: {
    id: "veo",
    nombre: "Veo 3.1",
    idioma: "en",
    formato: "json",
    maxPalabras: null,
    maxCaracteres: null,
    url: "https://labs.google/flow/",
    imagenes: true,
    video: true,
    duraciones: [8, 6, 4], // 8 primero = default (y obligatorio con referencias); ver duracionVeo
    color: "#29b6f6",
  },
  kling: {
    id: "kling",
    nombre: "Kling",
    idioma: "en",
    formato: "texto",
    maxPalabras: 60,
    maxCaracteres: null,
    url: "https://app.klingai.com/",
    imagenes: true,
    video: true,
    duraciones: [5, 10],
    color: "#ff5a6e",
  },
  higgsfield: {
    id: "higgsfield",
    nombre: "Higgsfield",
    idioma: "en",
    formato: "texto",
    maxPalabras: 60,
    maxCaracteres: null,
    url: "https://higgsfield.ai/",
    imagenes: true,
    video: true,
    duraciones: [5],
    color: "#ff8a3d",
  },
};

/** Tono de cada "puerta" de inicio (imagen / edición / video): el espectro también
 *  ordena la entrada. */
export const COLOR_KIND: Record<JobKind, string> = {
  imagen: "#f7c948",
  edicion: "#e24cb4",
  video: "#29b6f6",
};

/** Qué herramientas pueden hacer cada trabajo (la primera es la sugerida por defecto).
 *  Imagen y edición: Nano Banana (mejor con referencias e identidad) y ChatGPT Images
 *  (mejor pintando texto exacto). routing.ts decide cuál sugerir. */
export const TOOLS_POR_JOB: Record<JobType, Tool[]> = {
  foto_producto: ["nanobanana", "chatgpt"],
  escena_persona: ["nanobanana", "chatgpt"],
  imagen_libre: ["nanobanana", "chatgpt"],
  cambio_outfit: ["nanobanana", "chatgpt"],
  cambio_fondo: ["nanobanana", "chatgpt"],
  cambio_pose: ["nanobanana", "chatgpt"],
  agregar_objeto: ["nanobanana", "chatgpt"],
  cambio_angulo: ["nanobanana", "chatgpt"],
  restaurar_foto: ["nanobanana", "chatgpt"],
  mejora_foto: ["nanobanana", "chatgpt"],
  aplicar_logo: ["nanobanana", "chatgpt"],
  dos_personajes: ["nanobanana", "chatgpt"],
  cambio_epoca: ["nanobanana", "chatgpt"],
  figura_coleccionable: ["nanobanana", "chatgpt"],
  animar_foto: ["veo", "kling", "higgsfield"],
  texto_a_video: ["veo", "kling"],
  transicion: ["kling", "veo"],
  // Nació con Sora 2 (retirada el 24-sep-2026): la escena por bloques de tiempo la hacen Veo y Kling.
  escena_sora: ["veo", "kling"],
};

/** La herramienta VIGENTE para un job a partir de una guardada (que puede estar retirada):
 *  la misma si sigue existiendo y sirve para el job; si no, su sucesora si sirve; si no,
 *  null (el que llama decide el fallback). Un solo sitio para "sora → veo": specDeFila y
 *  estadoActual lo comparten, así no se separan cuando retiremos otra. */
export function herramientaVigente(tool: string, job: JobType): Tool | null {
  const candidatas = [tool, TOOL_SUCESORA[tool]].filter((t): t is Tool => !!t && (TOOLS as string[]).includes(t));
  return candidatas.find((t) => TOOLS_POR_JOB[job].includes(t)) ?? null;
}

/** Veo 3.1 exige 8 s cuando hay imágenes de referencia (también con primer/último cuadro y
 *  1080p): con refs la duración pedida se ignora y se fuerza a 8. Sin refs, la más cercana. */
export const VEO_SEGUNDOS_CON_REFS = 8;
export function duracionVeo(pedida: number | null, refs: number): number {
  return refs > 0 ? VEO_SEGUNDOS_CON_REFS : duracionValida("veo", pedida);
}

/** Formatos que cada herramienta acepta de verdad (verificado 2026-09-11). El diagnóstico
 *  avisa cuando el aspect elegido no está aquí. */
export const ASPECTS_POR_TOOL: Record<Tool, Aspect[]> = {
  nanobanana: ["1:1", "16:9", "9:16", "4:5", "4:3", "3:4"],
  chatgpt: ["1:1", "16:9", "9:16", "4:5", "4:3", "3:4"],
  veo: ["16:9", "9:16"],
  kling: ["16:9", "9:16", "1:1"],
  higgsfield: ["16:9", "9:16", "1:1", "4:5"],
};

/** Cuántas imágenes de referencia acepta cada herramienta (Veo y Kling: 3). */
export const REFS_MAX: Record<Tool, number> = { nanobanana: 14, chatgpt: 16, veo: 3, kling: 3, higgsfield: 1 };

/** Quién genera voz/sonido nativo (para "pediste diálogo en una herramienta sin voz"). */
export const TOOL_AUDIO: Record<Tool, boolean> = { nanobanana: false, chatgpt: false, veo: true, kling: true, higgsfield: false };

/** La duración que la herramienta acepta más cercana a la pedida (o su primera opción).
 *  Compiler y validator la usan igual: una sola regla, sin "=== 15 ? 15 : 10" repetido. */
export function duracionValida(tool: Tool, pedida: number | null): number {
  const opciones = TOOL_INFO[tool].duraciones;
  if (!opciones.length) return 0;
  if (pedida === null) return opciones[0];
  return opciones.reduce((mejor, d) => (Math.abs(d - pedida) < Math.abs(mejor - pedida) ? d : mejor), opciones[0]);
}

/** Límite de caracteres para transiciones en Kling (la herramienta corta el prompt). */
export const KLING_MAX_CHARS_TRANSICION = 500;
