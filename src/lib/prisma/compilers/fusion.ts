/**
 * "Fusión": cuando una herramienta de video acepta menos referencias de las que hay (Veo y
 * Kling: 3), el arreglo honesto sin generar nosotros es un prompt APARTE de Nano Banana que
 * funde dos referencias en una sola imagen; el diseñador la sube como referencia única.
 * Módulo puro; el diagnóstico (F2) lo ofrece como arreglo de un click.
 */
import { REF_LABEL } from "../copy.ts";
import type { Ref } from "../spec.ts";

/** Dos referencias → un prompt de Nano Banana que las combina en una imagen. */
export function compilarFusion(a: Ref, b: Ref, aspect: string): string {
  const que = (r: Ref, n: number) => `[Imagen ${n}] (${REF_LABEL[r.role].en.toLowerCase()}${r.caption ? `: ${r.caption}` : ""})`;
  return [
    `Combine ${que(a, 1)} and ${que(b, 2)} into one single photorealistic image`,
    `Keep the exact identity, shape, colors and any text of what each image shows; place both elements in one coherent scene with one light source and one perspective`,
    `Clean, simple background so the combined image works as a reference for a video tool`,
    `No text, letters or watermarks anywhere`,
    `Output format: ${aspect}`,
  ].join(". ") + ".";
}
