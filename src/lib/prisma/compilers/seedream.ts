/**
 * Compiler → Seedream 4.5 / 5.0 Lite (ByteDance, en Higgsfield). Mismo cuerpo que Nano Banana
 * (instrucción en inglés, sin parámetros) con lo que cambia según la guía oficial de ByteDance
 * (BytePlus ModelArk, "Seedream 4.0-4.5 prompt guide", leída 2026-09-16):
 * 1) sujeto + acción + entorno primero, estilo/luz/composición después (el orden de cuerpoImagen);
 * 2) las referencias se nombran "Image 1", "Image 2"… y cada una dice qué se toma de ella
 *    ("replace the character in Image 2 with the character from Image 1");
 * 3) conciso gana a recargado: la salida cierra con el formato y nada más.
 */
import { frases, indicesRef, unirY, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import { cuerpoImagen, type Etiquetador } from "./nanobanana.ts";

/** "Image 1 (a red bottle)" la primera vez; "Image 1" en una segunda mención. Varias del mismo papel →
 *  "Image 1 (…) and Image 2 (…)". Lo usan también Seedance y Gemini Omni (misma convención). */
export const etiquetaImagen: Etiquetador = (spec, role, corto = false) => {
  const ns = indicesRef(spec, role);
  if (!ns.length) return null;
  return unirY(ns.map((n) => {
    const r = spec.refs[n - 1];
    return r.caption && !corto ? `Image ${n} (${r.caption})` : `Image ${n}`;
  }));
};

/** "Output: 4:5, 4K" — 4K sólo para impresión y banners (Seedream 4.5 es un modelo 4K; lo demás en 2K). */
function salidaSeedream(spec: PromptSpec): string {
  const alta = spec.destino === "print" || spec.destino === "web_banner";
  return `Output: ${spec.aspect} image, ${alta ? "4K" : "2K"}${spec.estilo || spec.job === "correccion" ? "" : ", photorealistic"}`;
}

export function compilarSeedream(spec: PromptSpec): Salida {
  return { texto: frases(...cuerpoImagen(spec, etiquetaImagen), salidaSeedream(spec)), formato: "texto" };
}
