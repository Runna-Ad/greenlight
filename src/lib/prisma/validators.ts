/**
 * HÜE Prisma — validadores DETERMINISTAS del prompt compilado. El prompt (a H.Ü.E)
 * sugiere; el código mide y obliga (misma regla que el guard de tiempo del writer).
 * Si falla, el writer hace UNA llamada de reparación con estos errores como feedback.
 * Módulo puro.
 */
import { contarPalabras, type PromptSpec, type Tool } from "./spec.ts";
import { KLING_MAX_CHARS_TRANSICION, TOOL_INFO, duracionValida } from "./tools.ts";
import { PRESETS_HIGGSFIELD } from "./compilers/higgsfield.ts";
import { SORA_TYPE_EN } from "./compilers/sora.ts";

export type Veredicto = { ok: true } | { ok: false; errores: string[] };

/** Parejas de luz que no pueden coexistir en un mismo prompt. */
const CONTRADICCIONES: [RegExp, RegExp, string][] = [
  [/golden hour|sunset|atardecer/i, /neon/i, "golden hour y neón a la vez"],
  [/\bnight\b|noche|moonlit/i, /\bmidday\b|noon|mediodía|harsh sun/i, "noche y mediodía a la vez"],
  [/\bsnow\b|nieve/i, /\bdesert heat\b|tropical/i, "nieve y calor tropical a la vez"],
];

/** Palabras muy frecuentes del español que no deberían aparecer en un prompt en inglés
 *  (fuera del diálogo). Un par sueltas pasan (nombres propios); muchas = fuga. */
const STOP_ES = /\b(el|la|los|las|una|unos|unas|con|para|por|que|pero|también|desde|hacia|sobre|mientras|donde|cuando)\b/gi;

function sinDialogo(texto: string): string {
  // Quita lo que va entre comillas (diálogo en su idioma original) antes de medir idioma.
  return texto.replace(/"[^"]*"/g, "").replace(/“[^”]*”/g, "");
}

function comunes(texto: string, spec: PromptSpec): string[] {
  const e: string[] = [];
  if (!texto.trim()) e.push("El prompt salió vacío.");
  if (/\s--[a-z]/i.test(texto) || /::\d/.test(texto)) e.push("Trae parámetros de Midjourney (--ar, --v, ::) que esta herramienta no entiende.");
  const refsMax = spec.refs.length;
  for (const m of texto.matchAll(/\[Imagen (\d+)/g)) {
    if (Number(m[1]) > refsMax) e.push(`Menciona [Imagen ${m[1]}] pero sólo hay ${refsMax} referencia(s).`);
  }
  const cuerpo = sinDialogo(texto);
  const hits = cuerpo.match(STOP_ES)?.length ?? 0;
  if (hits >= 4) e.push(`Parece haber español fuera del diálogo (${hits} palabras): el prompt debe ir en inglés.`);
  for (const [a, b, msg] of CONTRADICCIONES) {
    if (a.test(cuerpo) && b.test(cuerpo)) e.push(`Luz contradictoria: ${msg}.`);
  }
  return e;
}

function kling(texto: string, spec: PromptSpec): string[] {
  const e: string[] = [];
  if (spec.job === "transicion") {
    if (texto.length > KLING_MAX_CHARS_TRANSICION) e.push(`Transición de ${texto.length} caracteres; Kling corta en ${KLING_MAX_CHARS_TRANSICION}.`);
    return e;
  }
  const max = TOOL_INFO.kling.maxPalabras ?? 50;
  const n = contarPalabras(texto);
  if (n > max) e.push(`${n} palabras; Kling rinde con ≤${max}.`);
  if ((texto.match(/\./g)?.length ?? 0) > 2) e.push("Debe ser una sola oración (separa con comas, no con puntos).");
  return e;
}

function veo(texto: string, spec: PromptSpec): string[] {
  const e: string[] = [];
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return ["El JSON de Veo no es válido."];
  }
  for (const k of ["description", "style", "camera", "lighting", "environment", "elements", "motion", "ending", "text", "keywords", "timeline", "negative_prompts"]) {
    if (!(k in j)) e.push(`Falta el campo "${k}" en el JSON de Veo.`);
  }
  const kw = Array.isArray(j.keywords) ? (j.keywords as unknown[]) : [];
  if (!kw.includes(spec.aspect)) e.push(`keywords debe incluir el formato ${spec.aspect}.`);
  if (j.text !== "none") e.push('text debe ser "none" (sin texto en pantalla).');
  const tl = Array.isArray(j.timeline) ? (j.timeline as unknown[]) : [];
  if (tl.length < 3) e.push("El timeline debe tener 3 bloques.");
  const neg = Array.isArray(j.negative_prompts) ? (j.negative_prompts as unknown[]) : [];
  if (!neg.length) e.push("negative_prompts no puede ir vacío.");
  return e;
}

function sora(texto: string, spec: PromptSpec): string[] {
  const e: string[] = [];
  const tipos = Object.values(SORA_TYPE_EN);
  if (!tipos.some((t) => texto.startsWith(`${t}:`))) e.push("Debe empezar con el tipo de video seguido de dos puntos.");
  const bloques = texto.match(/^\d+–\d+s:/gm)?.length ?? 0;
  if (bloques !== 3) e.push(`El timeline debe tener exactamente 3 bloques (tiene ${bloques}).`);
  const dur = duracionValida("sora", spec.duracion);
  if (!texto.includes(`Timeline (${dur}s)`)) e.push(`La duración del timeline debe ser ${dur}s.`);
  if (!/^Sound & voice:/m.test(texto)) e.push('Falta la sección "Sound & voice".');
  for (const s of ["Look:", "Camera:", "Light:", "Pace:"]) if (!texto.includes(`\n${s}`)) e.push(`Falta la sección "${s}".`);
  return e;
}

function higgsfield(texto: string): string[] {
  const e: string[] = [];
  const [cuerpo, presetLinea] = texto.split("\nCamera preset: ");
  const max = TOOL_INFO.higgsfield.maxPalabras ?? 60;
  const n = contarPalabras(cuerpo ?? "");
  if (n > max) e.push(`${n} palabras; Higgsfield rinde con ≤${max}.`);
  if (!presetLinea || !(PRESETS_HIGGSFIELD as readonly string[]).includes(presetLinea.trim())) e.push("Falta un preset de cámara válido de Higgsfield.");
  return e;
}

function nanobanana(texto: string, spec: PromptSpec): string[] {
  const e: string[] = [];
  spec.refs.forEach((_, i) => {
    if (!texto.includes(`[Imagen ${i + 1}`)) e.push(`No usa la referencia [Imagen ${i + 1}].`);
  });
  if (spec.refs.length && !/Keep unchanged:/.test(texto)) e.push('Falta la cláusula "Keep unchanged" (qué se conserva).');
  if (!texto.includes(spec.aspect)) e.push(`Falta el formato ${spec.aspect}.`);
  return e;
}

export function validar(texto: string, spec: PromptSpec, tool: Tool = spec.tool): Veredicto {
  const errores = [...comunes(texto, spec)];
  switch (tool) {
    case "kling":
      errores.push(...kling(texto, spec));
      break;
    case "veo":
      errores.push(...veo(texto, spec));
      break;
    case "sora":
      errores.push(...sora(texto, spec));
      break;
    case "higgsfield":
      errores.push(...higgsfield(texto));
      break;
    case "nanobanana":
      errores.push(...nanobanana(texto, spec));
      break;
  }
  return errores.length ? { ok: false, errores } : { ok: true };
}
