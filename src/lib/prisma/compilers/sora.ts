/**
 * Compiler → Sora 2. Siete secciones en orden fijo + bloques de tiempo con acción,
 * cámara y SFX entre asteriscos. Estilo técnico y táctil: frases cortas, sin poesía.
 * Empieza SIEMPRE con el tipo de video (Sora lo respeta como guía estética).
 */
import type { PromptSpec, SoraVideoType } from "../spec.ts";
import { comas, sinPronombre } from "../spec.ts";
import type { Salida } from "./salida.ts";
import { beatsDe } from "./beats.ts";
import { duracionValida } from "../tools.ts";

/** Etiqueta en inglés de cada tipo de video (la UI enseña la española). */
export const SORA_TYPE_EN: Record<SoraVideoType, string> = {
  "Trailer cinematográfico": "Cinematic trailer",
  "Comercial de producto": "Product commercial",
  "Video de celular sin cortes": "Handheld phone video, one take",
  "GoPro POV": "GoPro POV",
  "Cámara de seguridad": "Security camera footage",
  "Tomas aéreas de drone": "Aerial drone shots",
  ASMR: "ASMR",
  "Vlog Selfie": "Selfie vlog",
  "Unboxing de producto": "Product unboxing",
  "Story Vertical": "Vertical story",
  "Video Old VHS": "Old VHS tape",
};

/** Pistas de look por tipo, para que el compiler sea útil aun sin H.Ü.E. */
const LOOK_POR_TIPO: Record<SoraVideoType, string> = {
  "Trailer cinematográfico": "epic scale, cinema camera, fluid moves, dramatic contrast",
  "Comercial de producto": "product is the hero, macro details, clean background, studio light",
  "Video de celular sin cortes": "handheld, casual, realistic imperfections, one continuous take",
  "GoPro POV": "wide FOV, action camera, subjective, fast and energetic",
  "Cámara de seguridad": "fixed angle, slight distortion and noise, CCTV timestamp look",
  "Tomas aéreas de drone": "wide establishing shots, smooth travelling, altitude, landscape",
  ASMR: "macro on hands and textures, slow movements, sound is the protagonist",
  "Vlog Selfie": "front camera, natural arm movement, breathing, facial micro-gestures",
  "Unboxing de producto": "hands, table, product, focus on opening and details",
  "Story Vertical": "9:16, agile pace, clear actions, made for social",
  "Video Old VHS": "tape texture, glitches, washed colors, analog noise",
};

export function compilarSora(spec: PromptSpec): Salida {
  const tipo: SoraVideoType = spec.video_type ?? (spec.aspect === "9:16" ? "Story Vertical" : "Trailer cinematográfico");
  const dur = duracionValida("sora", spec.duracion);
  const beats = beatsDe(spec, dur);
  const sujeto = spec.sujeto || spec.idea;

  const lineas: string[] = [];
  lineas.push(`${SORA_TYPE_EN[tipo]}: ${sujeto}${spec.accion ? ` ${sinPronombre(spec.accion)}` : ""}${spec.entorno ? `, ${spec.entorno}` : ""}.`);
  lineas.push("");
  lineas.push(`Look: ${comas(LOOK_POR_TIPO[tipo], spec.estilo, spec.paleta.length ? `palette ${spec.paleta.join(", ")}` : null, spec.marca?.paleta.length ? `brand colors ${spec.marca.paleta.join(", ")}` : null)}.`);
  lineas.push(`Camera: ${comas(spec.camara.lente, spec.camara.angulo, spec.camara.movimiento || "continuous, no cuts")}.`);
  lineas.push(`Light: ${spec.luz || "natural, coherent with the location"}.`);
  lineas.push(`Pace: ${spec.mood || "steady"}, ${dur} seconds, one scene, no variants.`);
  lineas.push("");
  lineas.push(`Timeline (${dur}s):`);
  for (const b of beats) {
    lineas.push(`${b.desde}–${b.hasta}s: ${b.accion}. Camera: ${b.camara}. *${b.sfx || "ambient"}*`);
  }
  lineas.push("");
  const voz = spec.dialogo?.texto.trim()
    ? `Voice (${spec.dialogo.idioma}${spec.dialogo.voz ? `, ${spec.dialogo.voz}` : ""}): "${spec.dialogo.texto.trim()}"`
    : "No dialogue";
  lineas.push(`Sound & voice: ${voz}. ${spec.negativos.includes("no music") || !spec.dialogo ? "No background music unless stated." : ""}`.trim());
  const evitar = [...spec.negativos, ...(spec.marca?.evitar ?? []), "no subtitles", "no on-screen text"];
  lineas.push(`Avoid: ${[...new Set(evitar)].join(", ")}.`);

  return { texto: lineas.join("\n"), formato: "texto" };
}
