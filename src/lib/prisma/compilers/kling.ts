/**
 * Compiler → Kling. Una sola oración en inglés, ≤50 palabras, orden estricto:
 * estilo, sujeto+acción, movimiento de cámara, atmósfera. Sin conectores largos.
 * Transiciones: prosa corta, ≤500 caracteres (Kling corta el prompt).
 */
import { comas, contarPalabras, sinPronombre, type PromptSpec } from "../spec.ts";
import { KLING_MAX_CHARS_TRANSICION, TOOL_INFO } from "../tools.ts";
import type { Salida } from "./salida.ts";

const MAX = TOOL_INFO.kling.maxPalabras ?? 50;

function transicion(spec: PromptSpec): string {
  let t = `Seamless single continuous shot transitioning from the start image to the end image. ${spec.accion || "Connect elements, colors and themes between both scenes: the camera moves or the world morphs organically, no cut"}.${spec.camara.movimiento ? ` ${spec.camara.movimiento}.` : ""}${spec.mood ? ` ${spec.mood}.` : ""}`;
  if (t.length > KLING_MAX_CHARS_TRANSICION) t = t.slice(0, KLING_MAX_CHARS_TRANSICION - 1).replace(/\s+\S*$/, "") + ".";
  return t;
}

export function compilarKling(spec: PromptSpec): Salida {
  if (spec.job === "transicion") return { texto: transicion(spec), formato: "texto" };

  const estilo = spec.estilo || "cinematic video";
  const sujeto =
    spec.job === "animar_foto"
      ? `${spec.sujeto || "the subject from the reference image"} ${spec.accion ? sinPronombre(spec.accion) : "with subtle natural movement"}`
      : `${spec.sujeto || spec.idea} ${sinPronombre(spec.accion)}`.trim();
  const camara = spec.camara.movimiento || "camera slowly pushes in";
  const atmosfera = comas(spec.luz, spec.entorno && spec.job !== "animar_foto" ? spec.entorno : null, spec.mood);

  // Se recorta de atrás hacia adelante: la atmósfera es lo primero que se sacrifica,
  // el estilo y el sujeto nunca.
  const capas = [estilo, sujeto, camara, atmosfera];
  let texto = comas(...capas);
  while (contarPalabras(texto) > MAX && capas.length > 2) {
    capas.pop();
    texto = comas(...capas);
  }
  if (contarPalabras(texto) > MAX) texto = texto.split(/\s+/).slice(0, MAX).join(" ");
  texto = texto.charAt(0).toUpperCase() + texto.slice(1) + ".";
  return { texto, formato: "texto" };
}
