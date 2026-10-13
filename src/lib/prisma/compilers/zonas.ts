/**
 * F5a — ZONAS SEGURAS. En una story de Instagram o un TikTok la app tapa la franja de arriba
 * (nombre, barra de progreso) y la de abajo (caption, botones): lo importante tiene que vivir en
 * el centro. Los compilers lo dicen SÓLO cuando el destino y el formato lo piden. Módulo puro.
 */
import { JOB_KIND, type Destino, type PromptSpec } from "../spec.ts";

export const DESTINOS_CON_ZONA: Destino[] = ["ig_story", "tiktok"];

/** Lo que la app tapa en una historia 9:16, en % del alto. UNA fuente: la frase del prompt (abajo) y la guía de
 *  zona segura de Formatos (formatos/acomodo.ts). */
export const ZONA_HISTORIA_PCT = { arriba: 15, abajo: 20 } as const;

/** Sólo al CREAR (imagen o video): en una edición la composición ya la trae la foto original y
 *  mover el sujeto sería cambiarla; y los prompts de edición ya andan al tope de palabras. */
export const tieneZonaSegura = (spec: PromptSpec): boolean => !!spec.destino && DESTINOS_CON_ZONA.includes(spec.destino) && spec.aspect === "9:16" && JOB_KIND[spec.job] !== "edicion";

/** Imagen (Nano Banana / ChatGPT): corta a propósito (≤ 12 palabras): con texto y marca, un prompt de
 *  story ya anda cerca del tope de 160 y esta frase no debe empujarlo a una reparación. */
export const zonaSeguraImagen = (spec: PromptSpec): string | null =>
  tieneZonaSegura(spec) ? `Safe zone: subject and text centered, top ${ZONA_HISTORIA_PCT.arriba}% and bottom ${ZONA_HISTORIA_PCT.abajo}% clear` : null;

/** Video (Veo, Kling): corta, porque ahí cada palabra cuenta. */
export const zonaSeguraCorta = (spec: PromptSpec): string | null => (tieneZonaSegura(spec) ? "subject centered, top and bottom edges of the frame kept clear" : null);
