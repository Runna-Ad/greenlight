/**
 * Compiler → ChatGPT Images (gpt-image-2.5 dentro de ChatGPT). Mismo cuerpo que Nano
 * Banana (una instrucción en inglés, sin parámetros) con lo que sí cambia (guía oficial,
 * verificada 2026-09-08):
 * 1) las referencias se nombran "the first attached image" (van adjuntas, no numeradas);
 * 2) el tamaño se pide en píxeles reales del aspect (múltiplos de 16, ratio ≤ 3:1);
 * 3) el texto corto va además DELETREADO (la guía pide deletrear lo raro);
 * 4) una edición pide UN cambio ("Change ONLY this") y repite qué no se toca;
 * 5) una línea de calidad: high para lo final, medium para iterar.
 */
import { frases, indiceRef, textoDe, JOB_KIND, type Aspect, type PromptSpec } from "../spec.ts";
import { deletrear } from "../texto-imagen.ts";
import type { Salida } from "./salida.ts";
import { cuerpoImagen, type Etiquetador } from "./nanobanana.ts";

export const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth"];

/** "the first attached image (a woman in a red dress)". */
const etiquetaGPT: Etiquetador = (spec, role) => {
  const n = indiceRef(spec, role);
  if (n === null) return null;
  const r = spec.refs[n - 1];
  const ord = ORDINAL[n - 1] ?? `#${n}`;
  return r.caption ? `the ${ord} attached image (${r.caption})` : `the ${ord} attached image`;
};

/** Tamaño real por aspect para gpt-image-2.5: lados múltiplos de 16, ratio ≤ 3:1, y el
 *  lado largo ≤ 1536 (arriba de 2K la calidad es "experimental" según OpenAI). */
export const TAMANO_GPT: Record<Aspect, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1536, 864],
  "9:16": [864, 1536],
  "4:5": [1024, 1280],
  "4:3": [1360, 1024],
  "3:4": [1024, 1360],
};

/** "landscape (1536×864, 16:9)". */
export function tamanoGPT(aspect: Aspect): string {
  const [w, h] = TAMANO_GPT[aspect];
  const orientacion = w === h ? "square" : w > h ? "landscape" : "portrait";
  return `${orientacion} (${w}×${h}, ${aspect})`;
}

/** El texto corto, además, deletreado (la guía de OpenAI lo pide para palabras raras). */
function deletreo(spec: PromptSpec): string | null {
  const t = textoDe(spec);
  const d = t && deletrear(t.contenido);
  return d ? `The text, spelled out letter by letter so every glyph is right: ${d}` : null;
}

export function compilarChatGPT(spec: PromptSpec): Salida {
  const cuerpo = cuerpoImagen(spec, etiquetaGPT);
  const edicion = JOB_KIND[spec.job] === "edicion";
  // Una edición = UN cambio, dicho al principio, y al final qué se queda igual (gpt-image-2.5
  // acierta mucho más así que con una lista de cambios).
  if (edicion && cuerpo[0]) cuerpo[0] = `Change ONLY this: ${cuerpo[0]}`;
  const final = spec.destino === "print" || spec.destino === "web_banner" || spec.destino === "fb_ad" || !!textoDe(spec);
  const texto = frases(
    ...cuerpo,
    deletreo(spec),
    edicion ? "Everything else in the attached image stays exactly as it is" : null,
    `Output: one ${tamanoGPT(spec.aspect)} image, photorealistic unless a style says otherwise`,
    `Quality: ${final ? "high (final asset)" : "medium (quick iteration)"}`,
  );
  return { texto, formato: "texto" };
}
