/**
 * HÜE Prisma — ficha de cada herramienta destino: en qué idioma quiere el prompt,
 * qué límites tiene, dónde se abre. Es la "verdad" que usan compilers, validators y
 * la pantalla de resultado. Módulo puro.
 */
import type { Tool, JobType, JobKind } from "./spec.ts";

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
    duraciones: [8],
    color: "#29b6f6",
  },
  kling: {
    id: "kling",
    nombre: "Kling",
    idioma: "en",
    formato: "texto",
    maxPalabras: 50,
    maxCaracteres: null,
    url: "https://app.klingai.com/",
    imagenes: true,
    video: true,
    duraciones: [5, 10],
    color: "#ff5a6e",
  },
  sora: {
    id: "sora",
    nombre: "Sora 2",
    idioma: "en",
    formato: "texto",
    maxPalabras: null,
    maxCaracteres: null,
    url: "https://sora.chatgpt.com/",
    imagenes: true,
    video: true,
    duraciones: [10, 15],
    color: "#e24cb4",
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

/** Qué herramientas pueden hacer cada trabajo (la primera es la sugerida por defecto). */
export const TOOLS_POR_JOB: Record<JobType, Tool[]> = {
  foto_producto: ["nanobanana"],
  escena_persona: ["nanobanana"],
  imagen_libre: ["nanobanana"],
  cambio_outfit: ["nanobanana"],
  cambio_fondo: ["nanobanana"],
  cambio_pose: ["nanobanana"],
  agregar_objeto: ["nanobanana"],
  cambio_angulo: ["nanobanana"],
  restaurar_foto: ["nanobanana"],
  mejora_foto: ["nanobanana"],
  aplicar_logo: ["nanobanana"],
  dos_personajes: ["nanobanana"],
  cambio_epoca: ["nanobanana"],
  figura_coleccionable: ["nanobanana"],
  animar_foto: ["veo", "kling", "higgsfield"],
  texto_a_video: ["veo", "kling", "sora"],
  transicion: ["kling", "veo"],
  escena_sora: ["sora"],
};

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
