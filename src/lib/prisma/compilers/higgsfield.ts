/**
 * Compiler → Higgsfield. Prompt corto en inglés (≤60 palabras) + el nombre del PRESET
 * de cámara que el diseñador elige en la herramienta. El movimiento del spec se mapea
 * al preset más cercano; si no hay match, se sugiere "Dolly In".
 */
import { comas, contarPalabras, sinPronombre, textoDe, type PromptSpec } from "../spec.ts";
import { TOOL_INFO } from "../tools.ts";
import type { Salida } from "./salida.ts";

/** Presets de cámara de Higgsfield (los nombres tal como aparecen en la herramienta).
 *  Lista editable: si Higgsfield agrega uno, se añade aquí y en el test. */
export const PRESETS_HIGGSFIELD = [
  "Dolly In",
  "Dolly Out",
  "Dolly Zoom",
  "Crash Zoom In",
  "Crash Zoom Out",
  "Zoom In",
  "Zoom Out",
  "Orbit",
  "360 Orbit",
  "Arc",
  "Crane Up",
  "Crane Down",
  "Handheld",
  "Whip Pan",
  "FPV Drone",
  "Bullet Time",
  "Snorricam",
  "Focus Change",
  "Static",
] as const;
export type PresetHiggsfield = (typeof PRESETS_HIGGSFIELD)[number];

/** Palabras clave (en inglés o español) → preset. Se evalúa en orden. */
const MAPA: [RegExp, PresetHiggsfield][] = [
  [/dolly\s*zoom|vertigo/i, "Dolly Zoom"],
  [/crash\s*zoom\s*out/i, "Crash Zoom Out"],
  [/crash\s*zoom/i, "Crash Zoom In"],
  [/dolly\s*(out|back)|alej/i, "Dolly Out"],
  [/dolly|push\s*in|acerc/i, "Dolly In"],
  [/360/i, "360 Orbit"],
  [/orbit|órbita|orbita|rotat|gira alrededor/i, "Orbit"],
  [/arc/i, "Arc"],
  [/crane\s*down|grúa.*baj|desciende/i, "Crane Down"],
  [/crane|grúa|tilt\s*up|sube/i, "Crane Up"],
  [/hand\s*held|en mano|shaky/i, "Handheld"],
  [/whip|latigazo|paneo rápido/i, "Whip Pan"],
  [/drone|dron|fpv|aéreo|aerial/i, "FPV Drone"],
  [/bullet|matrix|congel/i, "Bullet Time"],
  [/snorri|body\s*mount/i, "Snorricam"],
  [/focus|enfoque|rack/i, "Focus Change"],
  [/zoom\s*out/i, "Zoom Out"],
  [/zoom/i, "Zoom In"],
  [/static|estátic|fija|quieta/i, "Static"],
];

export function presetDe(movimiento: string | null): PresetHiggsfield {
  if (!movimiento) return "Dolly In";
  for (const [re, preset] of MAPA) if (re.test(movimiento)) return preset;
  return "Dolly In";
}

const MAX = TOOL_INFO.higgsfield.maxPalabras ?? 60;

export function compilarHiggsfield(spec: PromptSpec): Salida {
  const preset = (PRESETS_HIGGSFIELD as readonly string[]).includes(spec.preset ?? "")
    ? (spec.preset as PresetHiggsfield)
    : presetDe(spec.camara.movimiento);
  const sujeto =
    spec.job === "animar_foto"
      ? `${spec.sujeto || "the subject from the reference image"} ${spec.accion ? sinPronombre(spec.accion) : "comes alive with subtle natural motion"}`
      : `${spec.sujeto || spec.idea} ${sinPronombre(spec.accion)}`.trim();
  const t = textoDe(spec);
  const capas = [sujeto, t ? `on-screen text "${t.contenido.trim()}"` : null, spec.entorno && spec.job !== "animar_foto" ? spec.entorno : null, spec.luz, spec.mood, spec.estilo];
  let cuerpo = comas(...capas);
  while (contarPalabras(cuerpo) > MAX && capas.length > 1) {
    capas.pop();
    cuerpo = comas(...capas);
  }
  cuerpo = cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1);
  const texto = `${cuerpo}.\nCamera preset: ${preset}`;
  return { texto, formato: "texto" };
}
