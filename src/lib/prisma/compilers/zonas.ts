/**
 * F5a — ZONAS SEGURAS. En una story de Instagram o un TikTok la app tapa la franja de arriba
 * (nombre, barra de progreso) y la de abajo (caption, botones): lo importante tiene que vivir en
 * el centro. Los compilers lo dicen SÓLO cuando el destino y el formato lo piden. Módulo puro.
 */
import type { Destino, PromptSpec } from "../spec.ts";

export const DESTINOS_CON_ZONA: Destino[] = ["ig_story", "tiktok"];

export const tieneZonaSegura = (spec: PromptSpec): boolean => !!spec.destino && DESTINOS_CON_ZONA.includes(spec.destino) && spec.aspect === "9:16";

/** Imagen (Nano Banana / ChatGPT): una frase con los porcentajes. */
export const zonaSeguraImagen = (spec: PromptSpec): string | null =>
  tieneZonaSegura(spec) ? "Keep the subject and all text in the central safe zone: the top 15% and bottom 20% of the frame stay clear for the app's interface" : null;

/** Video (Veo, Kling): corta, porque ahí cada palabra cuenta. */
export const zonaSeguraCorta = (spec: PromptSpec): string | null => (tieneZonaSegura(spec) ? "subject centered, top and bottom edges of the frame kept clear" : null);
