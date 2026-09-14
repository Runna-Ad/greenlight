/**
 * "Úsalo en…": qué modelo/nivel de la herramienta conviene para ESTE prompt, y cómo llegar
 * a él. El diseñador pega a mano, así que Prisma le dice dónde pegar y por qué, con el
 * conocimiento verificado el 2026-09-11 (ver TOOL NOTES en prisma_reglas). Módulo puro:
 * lo llaman el cliente (anticipo en el paso 3, chip en el resultado) y el servidor (se
 * guarda en prisma_prompts.modelo_sug y viaja al writer como TARGET MODEL).
 */
import { JOB_KIND, textoDe, type Destino, type JobType, type PromptSpec, type Tool } from "./spec.ts";
import { t, type Par } from "./copy.ts";
import type { CampoVeredicto } from "./resultado.ts";

export type PistasModelo = {
  job: JobType;
  tool: Tool;
  destino: Destino;
  refs: number;
  texto: boolean;
  dialogo: boolean;
  duracion: number | null;
  /** F4: lo que a ESTA marca le viene fallando en esta herramienta (de los resultados subidos). */
  fallos?: CampoVeredicto[];
};

/** Los modelos/niveles reales de cada herramienta (para "¿en cuál lo generaste?"). El id es el
 *  mismo que devuelve recomendarModelo: así "recomendado vs usado" se compara sin traducir. */
export const MODELOS_POR_TOOL: Record<Tool, { id: string; etiqueta: string }[]> = {
  nanobanana: [
    { id: "gemini-3.1-flash-image", etiqueta: "Nano Banana 2" },
    { id: "gemini-3-pro-image", etiqueta: "Nano Banana Pro" },
  ],
  chatgpt: [
    { id: "gpt-image-2.5-flare", etiqueta: "ChatGPT Images · flare" },
    { id: "gpt-image-2.5-sunburst", etiqueta: "ChatGPT Images · sunburst" },
  ],
  veo: [
    { id: "veo-3.1-generate-preview", etiqueta: "Veo 3.1" },
    { id: "veo-3.1-fast-generate-preview", etiqueta: "Veo 3.1 Fast" },
  ],
  kling: [
    { id: "kling-3.0", etiqueta: "Kling 3.0" },
    { id: "kling-3.0-turbo", etiqueta: "Kling 3.0 Turbo" },
  ],
  higgsfield: [{ id: "higgsfield", etiqueta: "Higgsfield" }],
};

export type Recomendacion = {
  /** Identificador estable (se guarda y se mide): gemini-3-pro-image, gpt-image-2.5-sunburst… */
  modelo: string;
  etiqueta: Par;
  porque: Par;
  comoLlegar: Par;
};

const SOCIAL: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad"];

export function recomendarModelo(p: PistasModelo): Recomendacion {
  switch (p.tool) {
    case "nanobanana": {
      // Lo que a esta marca le falló en los resultados que subió (texto, parecido) pide Pro.
      const porFallos = fallaFino(p.fallos);
      const pro = p.texto || p.job === "aplicar_logo" || p.job === "dos_personajes" || p.job === "correccion" || p.destino === "print" || p.refs >= 3 || porFallos;
      return pro
        ? {
            modelo: "gemini-3-pro-image",
            etiqueta: t("Nano Banana Pro", "Nano Banana Pro"),
            porque: p.job === "correccion"
              ? t("Corregir sin mover lo demás: Pro respeta mejor la imagen original.", "Fixing without moving the rest: Pro respects the original image better.")
              : porFallos
              ? t("A esta marca le ha fallado el texto o el parecido en Nano Banana 2: Pro lo cuida mejor.", "This brand's results kept missing the text or the likeness in Nano Banana 2: Pro handles them better.")
              : t("Texto exacto, logos, impresión o varias referencias: Pro los resuelve mejor y sale hasta 4K.", "Exact text, logos, print or several references: Pro handles them better and goes up to 4K."),
            comoLlegar: t("En Gemini elige el modo Thinking (Nano Banana Pro) antes de pegar; en AI Studio, el modelo gemini-3-pro-image.", "In Gemini pick Thinking mode (Nano Banana Pro) before pasting; in AI Studio, the gemini-3-pro-image model."),
          }
        : {
            modelo: "gemini-3.1-flash-image",
            etiqueta: t("Nano Banana 2", "Nano Banana 2"),
            porque: t("Para iterar rápido y barato. Cuando tengas la versión buena, ciérrala en Pro.", "Fast and cheap to iterate. Once you have the right version, finish it in Pro."),
            comoLlegar: t("En Gemini es el modelo de imagen por default; en AI Studio, gemini-3.1-flash-image.", "In Gemini it is the default image model; in AI Studio, gemini-3.1-flash-image."),
          };
    }
    case "chatgpt": {
      const porFallos = fallaFino(p.fallos);
      const preciso = JOB_KIND[p.job] === "edicion" || p.texto || porFallos;
      return preciso
        ? {
            modelo: "gpt-image-2.5-sunburst",
            etiqueta: t("ChatGPT Images · sunburst", "ChatGPT Images · sunburst"),
            porque: porFallos
              ? t("A esta marca le ha fallado el texto o el parecido en flare: sunburst lo cuida mejor.", "This brand's results kept missing the text or the likeness in flare: sunburst handles them better.")
              : t("Ediciones precisas y texto exacto: sunburst respeta mejor lo que no debe cambiar.", "Precise edits and exact text: sunburst is better at leaving the rest untouched."),
            comoLlegar: t("En ChatGPT pega el prompt con la imagen adjunta; por API usa el modelo gpt-image-2.5-sunburst.", "In ChatGPT paste the prompt with the image attached; via API use the gpt-image-2.5-sunburst model."),
          }
        : {
            modelo: "gpt-image-2.5-flare",
            etiqueta: t("ChatGPT Images · flare", "ChatGPT Images · flare"),
            porque: t("Imagen nueva sin texto: flare es el modo rápido de todos los días.", "A new image with no text: flare is the everyday fast mode."),
            comoLlegar: t("En ChatGPT pega el prompt tal cual; por API, gpt-image-2.5-flare.", "In ChatGPT paste the prompt as is; via API, gpt-image-2.5-flare."),
          };
    }
    case "veo": {
      const fast = !p.dialogo && SOCIAL.includes(p.destino);
      return fast
        ? {
            modelo: "veo-3.1-fast-generate-preview",
            etiqueta: t("Veo 3.1 Fast", "Veo 3.1 Fast"),
            porque: t("Clip para redes sin voz: Fast cuesta una fracción y se ve igual en el celular.", "A social clip with no voice: Fast costs a fraction and looks the same on a phone."),
            comoLlegar: t("En Flow elige la calidad Fast antes de generar.", "In Flow choose Fast quality before generating."),
          }
        : {
            modelo: "veo-3.1-generate-preview",
            etiqueta: t("Veo 3.1", "Veo 3.1"),
            porque: t(p.dialogo ? "Hay voz: la versión completa cuida el diálogo y el sonido." : "Pieza para pantalla grande: la versión completa rinde más detalle.", p.dialogo ? "There is voice: the full model takes care of dialogue and sound." : "A piece for a big screen: the full model renders more detail."),
            comoLlegar: t("En Flow deja la calidad estándar (Quality).", "In Flow keep the standard quality (Quality)."),
          };
    }
    case "kling": {
      const turbo = (p.duracion ?? 5) <= 5 && !p.dialogo;
      return turbo
        ? {
            modelo: "kling-3.0-turbo",
            etiqueta: t("Kling 3.0 Turbo", "Kling 3.0 Turbo"),
            porque: t("Clip corto sin voz: Turbo tarda y cuesta la mitad con casi la misma calidad.", "A short clip with no voice: Turbo takes and costs half with almost the same quality."),
            comoLlegar: t("En Kling elige el modelo 3.0 y el modo Turbo (o Standard).", "In Kling pick model 3.0 and Turbo mode (or Standard)."),
          }
        : {
            modelo: "kling-3.0",
            etiqueta: t("Kling 3.0", "Kling 3.0"),
            porque: t("Clip largo o con voz: el modelo completo mantiene mejor la coherencia.", "A long clip or one with voice: the full model keeps coherence better."),
            comoLlegar: t("En Kling elige el modelo 3.0 en modo Professional.", "In Kling pick model 3.0 in Professional mode."),
          };
    }
    case "higgsfield":
    default:
      return {
        modelo: "higgsfield",
        etiqueta: t("Higgsfield", "Higgsfield"),
        porque: t("El preset de cámara que va al final del prompt es el que manda.", "The camera preset at the end of the prompt is what matters."),
        comoLlegar: t("En Higgsfield: Create → elige ese preset de cámara → pega el texto.", "In Higgsfield: Create → pick that camera preset → paste the text."),
      };
  }
}

/** ¿Le falla lo "fino" (texto exacto, parecido)? Es lo que el nivel alto resuelve mejor. */
const fallaFino = (fallos: CampoVeredicto[] | undefined): boolean => !!fallos && (fallos.includes("texto") || fallos.includes("identidad"));

/** Pistas desde un spec ya compilado (resultado, refinar, cambiar de herramienta). */
export function pistasModelo(spec: PromptSpec, tool: Tool = spec.tool, fallos: CampoVeredicto[] = []): PistasModelo {
  return {
    job: spec.job,
    tool,
    destino: spec.destino ?? "libre",
    refs: spec.refs.length,
    texto: !!textoDe(spec),
    dialogo: !!spec.dialogo?.texto.trim(),
    duracion: spec.duracion,
    fallos,
  };
}
