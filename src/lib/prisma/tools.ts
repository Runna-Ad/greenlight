/**
 * HÜE Prisma — ficha de cada herramienta destino: en qué idioma quiere el prompt,
 * qué límites tiene, dónde se abre. Es la "verdad" que usan compilers, validators y
 * la pantalla de resultado. Módulo puro.
 */
import { TOOLS, TOOL_SUCESORA, type Tool, type JobType, type JobKind, type Aspect } from "./spec.ts";

export type Idioma = "es" | "en";

/** Las dos páginas de generación de Higgsfield (verificadas 2026-09-16 en su sitio: `?model=` elige el
 *  modelo; los slugs de cada uno viven en el catálogo). */
export const HF_IMAGEN = "https://higgsfield.ai/ai/image";
export const HF_VIDEO = "https://higgsfield.ai/ai/video";

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
  /** Dónde se pega el prompt: la página de la familia EN HIGGSFIELD (la plataforma del equipo). El
   *  modelo recomendado puede traer su propia página (catálogo › modelos › url), que manda. */
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
    url: HF_IMAGEN,
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
    url: HF_IMAGEN,
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
    url: `${HF_VIDEO}?model=veo-3-1-preview`,
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
    url: `${HF_VIDEO}?model=kling3_0`,
    imagenes: true,
    video: true,
    // Kling 3.0 en Higgsfield: cualquier segundo de 3 a 15 (Pedro, 2026-09-16). 5 primero = el default.
    duraciones: [5, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    color: "#ff5a6e",
  },
  higgsfield: {
    id: "higgsfield",
    // Todo se genera en Higgsfield: esta familia es su modelo DoP (foto → video con preset de cámara).
    nombre: "Higgsfield DoP",
    idioma: "en",
    formato: "texto",
    maxPalabras: 60,
    maxCaracteres: null,
    url: HF_VIDEO,
    imagenes: true,
    video: true,
    duraciones: [5],
    color: "#ff8a3d",
  },
  seedream: {
    id: "seedream",
    nombre: "Seedream",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: `${HF_IMAGEN}?model=seedream_v4_5`,
    imagenes: true,
    video: false,
    duraciones: [],
    color: "#b58cff",
  },
  seedance: {
    id: "seedance",
    nombre: "Seedance",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: `${HF_VIDEO}?model=seedance_2_0`,
    imagenes: true,
    video: true,
    // Seedance 2.0 / Mini en Higgsfield: cualquier segundo de 4 a 15 (Help Center "How do I use Seedance?").
    duraciones: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    color: "#e24cb4",
  },
  gemini_omni: {
    id: "gemini_omni",
    nombre: "Gemini Omni",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: `${HF_VIDEO}?model=gemini-omni-flash-1-1`,
    imagenes: true,
    video: true,
    duraciones: [8, 3, 4, 5, 6, 7, 9, 10],
    color: "#4f8cff",
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
 *  (mejor pintando texto exacto). routing.ts decide cuál sugerir. Las familias nuevas (Seedream,
 *  Seedance, Gemini Omni) van AL FINAL: el empate lo gana la primera, así el routing de antes no cambia. */
export const TOOLS_POR_JOB: Record<JobType, Tool[]> = {
  foto_producto: ["nanobanana", "chatgpt", "seedream"],
  escena_persona: ["nanobanana", "chatgpt", "seedream"],
  imagen_libre: ["nanobanana", "chatgpt", "seedream"],
  cambio_outfit: ["nanobanana", "chatgpt", "seedream"],
  cambio_fondo: ["nanobanana", "chatgpt", "seedream"],
  cambio_pose: ["nanobanana", "chatgpt", "seedream"],
  agregar_objeto: ["nanobanana", "chatgpt", "seedream"],
  cambio_angulo: ["nanobanana", "chatgpt", "seedream"],
  restaurar_foto: ["nanobanana", "chatgpt", "seedream"],
  mejora_foto: ["nanobanana", "chatgpt", "seedream"],
  aplicar_logo: ["nanobanana", "chatgpt", "seedream"],
  dos_personajes: ["nanobanana", "chatgpt", "seedream"],
  cambio_epoca: ["nanobanana", "chatgpt", "seedream"],
  figura_coleccionable: ["nanobanana", "chatgpt", "seedream"],
  correccion: ["nanobanana", "chatgpt", "seedream"], // F4: se corrige en la misma herramienta de imagen
  animar_foto: ["veo", "kling", "higgsfield", "seedance", "gemini_omni"],
  texto_a_video: ["veo", "kling", "seedance", "gemini_omni"],
  transicion: ["kling", "veo", "seedance"],
  // Nació con Sora 2 (retirada el 24-sep-2026): la escena por bloques de tiempo la hacen Veo y Kling.
  escena_sora: ["veo", "kling", "seedance"],
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
export function duracionVeo(pedida: number | null, refs: number, opciones: number[] = TOOL_INFO.veo.duraciones): number {
  return refs > 0 ? VEO_SEGUNDOS_CON_REFS : duracionValida("veo", pedida, opciones);
}

/** Formatos que cada herramienta acepta de verdad (verificado 2026-09-11). El diagnóstico
 *  avisa cuando el aspect elegido no está aquí. */
export const ASPECTS_POR_TOOL: Record<Tool, Aspect[]> = {
  nanobanana: ["1:1", "16:9", "9:16", "4:5", "4:3", "3:4"],
  chatgpt: ["1:1", "16:9", "9:16", "4:5", "4:3", "3:4"],
  veo: ["16:9", "9:16"],
  kling: ["16:9", "9:16", "1:1"],
  higgsfield: ["16:9", "9:16", "1:1", "4:5"],
  // Higgsfield (CLI MODELS.md, 2026-09-16): Seedream 4.5 sin 4:5; Seedance sin 4:5; Omni sólo 16:9 y 9:16.
  seedream: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  seedance: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  gemini_omni: ["16:9", "9:16"],
};

/** Cuántas imágenes de referencia acepta cada herramienta (Veo y Kling: 3). */
export const REFS_MAX: Record<Tool, number> = { nanobanana: 14, chatgpt: 16, veo: 3, kling: 3, higgsfield: 1, seedream: 14, seedance: 9, gemini_omni: 7 };

/** Quién genera voz/sonido nativo (para "pediste diálogo en una herramienta sin voz"). */
export const TOOL_AUDIO: Record<Tool, boolean> = { nanobanana: false, chatgpt: false, veo: true, kling: true, higgsfield: false, seedream: false, seedance: true, gemini_omni: true };

/** La duración que la herramienta acepta más cercana a la pedida (o su primera opción).
 *  Compiler y validator la usan igual: una sola regla, sin "=== 15 ? 15 : 10" repetido.
 *  F6a: `opciones` = las del catálogo (Hub › Herramientas); por defecto, las constantes. */
export function duracionValida(tool: Tool, pedida: number | null, opciones: number[] = TOOL_INFO[tool].duraciones): number {
  if (!opciones.length) return 0;
  if (pedida === null) return opciones[0];
  return opciones.reduce((mejor, d) => (Math.abs(d - pedida) < Math.abs(mejor - pedida) ? d : mejor), opciones[0]);
}

/** Límite de caracteres para transiciones en Kling (la herramienta corta el prompt). */
export const KLING_MAX_CHARS_TRANSICION = 500;
