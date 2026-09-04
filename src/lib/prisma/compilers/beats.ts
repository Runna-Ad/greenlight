/**
 * Beats (bloques de tiempo) para los compilers de video. Si el spec ya trae beats
 * (los escribe H.Ü.E), se recortan a la duración; si no, se derivan tres bloques
 * deterministas: establecer → acción → cierre. Así el compiler NUNCA depende del
 * modelo para producir algo válido.
 */
import { sinPronombre, type Beat, type PromptSpec } from "../spec.ts";

/** Cortes estándar por duración (segundos). Sora exige exactamente estos. */
export function cortes(duracion: number): [number, number][] {
  if (duracion <= 5) return [[0, 2], [2, 4], [4, 5]];
  if (duracion <= 8) return [[0, 2], [2, 6], [6, 8]];
  if (duracion <= 10) return [[0, 3], [3, 7], [7, 10]];
  return [[0, 4], [4, 10], [10, 15]];
}

export function beatsDe(spec: PromptSpec, duracion: number): Beat[] {
  const c = cortes(duracion);
  if (spec.beats && spec.beats.length >= 3) {
    // Re-alinear a los cortes oficiales: el modelo a veces manda tiempos raros.
    return spec.beats.slice(0, c.length).map((b, i) => ({ ...b, desde: c[i][0], hasta: c[i][1] }));
  }
  const cam = spec.camara.movimiento || "slow push in";
  const sujeto = spec.sujeto || "the subject";
  const accion = spec.accion ? sinPronombre(spec.accion) : "moves naturally";
  const entorno = spec.entorno ? ` in ${spec.entorno}` : "";
  return [
    { desde: c[0][0], hasta: c[0][1], accion: `Establish ${sujeto}${entorno}`, camara: "static then " + cam, sfx: "ambient room tone" },
    { desde: c[1][0], hasta: c[1][1], accion: `${sujeto} ${accion}`, camara: cam, sfx: spec.dialogo ? "voice, clean" : "subtle movement sounds" },
    { desde: c[2][0], hasta: c[2][1], accion: `Hold on ${sujeto}, ${spec.mood || "calm"} final frame`, camara: "settle, hold", sfx: "fade out" },
  ];
}
