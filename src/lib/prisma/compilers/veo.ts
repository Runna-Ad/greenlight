/**
 * Compiler → Veo 3.1 (Google Flow). JSON en inglés con timeline por bloques: Veo sigue
 * muy bien una estructura de campos + beats con tiempo (lo mismo que hace fuerte al
 * prompt de Sora). El diálogo va en su idioma original; el resto en inglés.
 */
import { comas, negativosDe, sinPronombre, textoDe, type Beat, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import { beatsDe } from "./beats.ts";
import { duracionValida } from "../tools.ts";

type VeoJson = {
  description: string;
  style: string;
  camera: string;
  lighting: string;
  environment: string;
  elements: string[];
  motion: string;
  ending: string;
  /** "none" o el texto exacto que debe verse en pantalla (con posición/estilo si los hay). */
  text: string;
  dialogue?: { text: string; language: string; voice: string };
  keywords: string[];
  timeline: { timestamp: string; action: string }[];
  negative_prompts: string[];
};

const mmss = (s: number): string => `00:${String(Math.max(0, Math.round(s))).padStart(2, "0")}`;

function descripcion(spec: PromptSpec): string {
  switch (spec.job) {
    case "animar_foto":
      return `Animate the reference image: ${spec.sujeto || "the subject"} ${spec.accion ? sinPronombre(spec.accion) : "with subtle natural motion: breathing, slight head movement, hair and fabric reacting to air"}. Keep the subject's identity, framing and setting exactly as in the image${spec.entorno ? `; ${spec.entorno}` : ""}.`;
    case "transicion":
      return `Seamless single-shot transition from the start image to the end image. ${spec.accion || "Connect elements, colors and themes between the two scenes so the camera or the world morphs organically from one to the other, with no cut"}.`;
    default:
      return `${spec.estilo ? `${spec.estilo} shot of ` : ""}${spec.sujeto || spec.idea}${spec.accion ? ` ${sinPronombre(spec.accion)}` : ""}${spec.entorno ? `, in ${spec.entorno}` : ""}.`;
  }
}

function elementos(spec: PromptSpec): string[] {
  const out: string[] = [];
  if (spec.sujeto) out.push(spec.sujeto);
  if (spec.entorno) out.push(spec.entorno);
  for (const t of spec.texturas) out.push(t);
  if (spec.marca?.paleta.length) out.push(`brand colors ${spec.marca.paleta.join(", ")}`);
  return out.slice(0, 6);
}

export function compilarVeo(spec: PromptSpec): Salida {
  const dur = duracionValida("veo", spec.duracion);
  const beats: Beat[] = beatsDe(spec, dur);
  const t = textoDe(spec);
  const negativos = new Set<string>(negativosDe(spec, [...(t ? [] : ["no subtitles", "no text overlays"]), "no hard cuts"]));
  if (!spec.dialogo) negativos.add("no music background");
  if (t) negativos.add("no other text");

  const json: VeoJson = {
    description: descripcion(spec),
    style: comas(spec.estilo || "cinematic, photorealistic", spec.mood),
    camera: comas(spec.camara.lente, spec.camara.angulo, spec.camara.movimiento || "slow continuous camera move, no cuts"),
    lighting: spec.luz || "soft natural light",
    environment: spec.entorno || (spec.job === "animar_foto" ? "as in the reference image" : ""),
    elements: elementos(spec),
    motion: beats.map((b) => b.accion).join(" → "),
    ending: beats[beats.length - 1]?.accion ?? "",
    text: t ? `"${t.contenido.trim()}"${t.posicion ? ` — ${t.posicion}` : ""}${t.estilo ? ` — ${t.estilo}` : ""} (exact spelling, stays legible)` : "none",
    ...(spec.dialogo?.texto.trim()
      ? { dialogue: { text: spec.dialogo.texto.trim(), language: spec.dialogo.idioma, voice: spec.dialogo.voz ?? "natural, conversational" } }
      : {}),
    keywords: [spec.aspect, ...spec.paleta.slice(0, 2), spec.estilo, spec.mood].filter((k): k is string => !!k).slice(0, 7),
    timeline: beats.map((b) => ({ timestamp: `${mmss(b.desde)}-${mmss(b.hasta)}`, action: comas(b.accion, b.camara, b.sfx && `sound: ${b.sfx}`) })),
    negative_prompts: [...negativos],
  };
  return { texto: JSON.stringify(json, null, 2), formato: "json" };
}
