/**
 * De negativo a positivo. Nano Banana y ChatGPT Images NO tienen campo negativo: "no busy
 * background" tiende a producir justo un fondo cargado (el modelo lee "busy background").
 * Kling 3.x tampoco lo tiene. Veo sí, pero pide SUSTANTIVOS ("subtitles"), no órdenes.
 *
 * `positivar` convierte los "qué evitar" más comunes en lo que se quiere EN SU LUGAR; lo
 * que no está en el mapa se devuelve aparte (`sinMapear`) para un "Avoid:" corto, y el
 * diagnóstico cuenta cuántos quedaron: así el mapa crece con datos, no con suposiciones.
 * Módulo puro.
 */

type Regla = [RegExp, string];

/** Orden importa: la primera que empata gana. Cada positivo es UNA frase corta. */
const MAPA: Regla[] = [
  [/\b(text overlay|text overlays|texts?|lettering|letters|captions?|typography|subtitles?|watermarks?|words on)\b/i, "clean, text-free image"],
  [/\b(extra|other|additional|more) (people|persons|person|faces|figures)\b|\bcrowds?\b|\bbystanders\b|\bpasser/i, "only the subject in frame, nobody else"],
  [/\b(busy|cluttered|messy|noisy|distracting) (background|backdrop|scene)\b|\bclutter\b/i, "a clean, simple, uncluttered background"],
  [/\bharsh (shadows?|light|lighting)\b|\bhard shadows?\b/i, "soft, even, flattering shadows"],
  [/\bblur(ry|red)?\b|\bout of focus\b|\bsoft focus\b/i, "tack-sharp focus on the subject"],
  [/\bdistort(ion|ed)?\b|\bdeform(ed|ities)?\b|\bwarp(ed|ing)?\b|\bmelting\b/i, "accurate proportions and straight, stable lines"],
  [/\b(extra|missing|six|deformed|bad|mangled|fused) fingers?\b|\b(bad|deformed|distorted|melted|broken) hands?\b/i, "natural hands with five fingers"],
  [/\blogos?\b|\bbrand marks?\b|\btrademarks?\b/i, "plain, unbranded surfaces"],
  [/\bhard cuts?\b|\bjump cuts?\b|\bfast cuts?\b|\bcuts between\b|\bediting\b/i, "one continuous take"],
  [/\bmusic\b|\bsoundtrack\b|\bscore\b/i, "natural ambient sound only"],
  [/\bcartoon(ish)?\b|\billustrat(ion|ed)\b|\banime\b|\bpainterly\b|\b3d render\b|\bcgi\b/i, "photorealistic rendering"],
  [/\boversaturat(ed|ion)\b|\bsaturated colors?\b|\bneon colors?\b/i, "natural, balanced color saturation"],
  [/\bnoise\b|\bgrain(y)?\b|\bartifacts?\b|\bjpeg\b/i, "a clean, noise-free image"],
  [/\blow (quality|res|resolution)\b|\bpixelat(ed|ion)\b|\blow-res\b/i, "high resolution, crisp fine detail"],
  [/\bduplicat(e|ed|es)\b|\bclones?\b|\btwins?\b|\bdouble (subject|person)\b/i, "a single instance of the subject"],
  [/\bcrop(ped|ping)?\b|\bcut off\b|\bout of frame\b/i, "the full subject inside the frame with breathing room"],
  [/\bflicker(ing)?\b|\bstrob(e|ing)\b/i, "stable, flicker-free lighting"],
  [/\bmorph(ing)?\b|\bidentity (drift|change)\b|\bface change\b/i, "a stable identity and shapes across every frame"],
  [/\bshak(y|ing)\b|\bcamera shake\b|\bjitter\b/i, "a smooth, steady camera"],
  [/\bfast (motion|movement|cuts?|pace)\b|\bfrantic\b|\bhectic\b/i, "slow, deliberate motion"],
  [/\blens flares?\b|\bflares?\b|\bglare\b/i, "a clean lens with controlled highlights"],
  [/\breflections?\b|\bmirror(s|ed)?\b/i, "matte surfaces with controlled reflections"],
  [/\bneon\b/i, "a natural light palette"],
  [/\bsmil(e|es|ing)\b|\bteeth\b/i, "a calm, closed-mouth expression"],
  [/\beye contact\b|\blooking at (the )?camera\b/i, "the gaze directed away from the camera"],
  [/\bprops?\b|\bextra objects?\b|\bclutter objects?\b/i, "an empty scene with just the subject"],
  [/\btoo dark\b|\bdark (image|photo|frame|exposure)\b|\bunderexpos(ed|ure)\b|\bmurky\b/i, "a well-exposed, bright image"],
  [/\boverexpos(ed|ure)\b|\bblown(-| )out\b|\bblown highlights\b/i, "balanced exposure with highlights retained"],
  [/\bnud(e|ity)\b|\bnsfw\b|\bexplicit\b/i, "fully clothed, tasteful"],
  [/\bstock(-| )photo\b|\bgeneric\b|\bcheesy\b/i, "an authentic, editorial look"],
];

/** Quita la marca de negación para dejar el sustantivo ("no subtitles" → "subtitles"). */
export function sustantivar(negativo: string): string {
  return negativo
    .trim()
    .replace(/^(no|without|avoid|never|don'?t|do not|not|sin|nada de|evita|evitar|ningún|ninguna)\s+/i, "")
    .replace(/^(any|the)\s+/i, "")
    .trim();
}

export type Positivado = { positivos: string[]; sinMapear: string[] };

/** Cada "qué evitar" → lo que se quiere en su lugar (mapa curado) o queda sin mapear. */
export function positivar(negativos: string[]): Positivado {
  const positivos: string[] = [];
  const sinMapear: string[] = [];
  for (const n of negativos) {
    const limpio = n.trim();
    if (!limpio) continue;
    const regla = MAPA.find(([re]) => re.test(limpio));
    if (regla) {
      if (!positivos.includes(regla[1])) positivos.push(regla[1]);
    } else {
      const s = sustantivar(limpio);
      if (s && !sinMapear.includes(s)) sinMapear.push(s);
    }
  }
  return { positivos, sinMapear };
}

/** Cuántas reglas trae el mapa (para el test que lo cubre entero). */
export const POSITIVO_REGLAS = MAPA.length;
