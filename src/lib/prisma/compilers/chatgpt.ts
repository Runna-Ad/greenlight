/**
 * Compiler → ChatGPT Images (GPT Image dentro de ChatGPT). Mismo cuerpo que Nano Banana
 * (una instrucción en inglés, sin parámetros) con dos diferencias que sí importan:
 * 1) las referencias se nombran "the first attached image" (en ChatGPT las imágenes van
 *    adjuntas al mensaje, no numeradas), y
 * 2) el formato se pide como orientación + tamaño (ChatGPT sólo genera cuadrado,
 *    horizontal o vertical). Su punto fuerte es pintar texto exacto: routing.ts lo
 *    sugiere cuando el diseñador pidió texto en la imagen.
 */
import { frases, indiceRef, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import { cuerpoImagen, type Etiquetador } from "./nanobanana.ts";

const ORDINAL = ["first", "second", "third", "fourth"];

/** "the first attached image (a woman in a red dress)". */
const etiquetaGPT: Etiquetador = (spec, role) => {
  const n = indiceRef(spec, role);
  if (n === null) return null;
  const r = spec.refs[n - 1];
  const ord = ORDINAL[n - 1] ?? `#${n}`;
  return r.caption ? `the ${ord} attached image (${r.caption})` : `the ${ord} attached image`;
};

/** ChatGPT genera 1024×1024, 1536×1024 o 1024×1536: se traduce el aspect a eso. */
export function tamanoGPT(aspect: PromptSpec["aspect"]): string {
  if (aspect === "1:1") return "square (1024×1024)";
  if (aspect === "9:16" || aspect === "4:5" || aspect === "3:4") return `portrait (1024×1536), composed for ${aspect}`;
  return `landscape (1536×1024), composed for ${aspect}`;
}

export function compilarChatGPT(spec: PromptSpec): Salida {
  const texto = frases(
    ...cuerpoImagen(spec, etiquetaGPT),
    `Output: one ${tamanoGPT(spec.aspect)} image, photorealistic unless a style says otherwise`,
  );
  return { texto, formato: "texto" };
}
