/**
 * Compiler → Kling 3. Una sola oración en inglés, ≤60 palabras, orden estricto:
 * estilo, sujeto+acción, UN movimiento de cámara, atmósfera. Sin conectores largos.
 * Kling 3.x no tiene campo negativo: lo que se evita entra como positivo en la atmósfera
 * (máximo 2, lo primero que se sacrifica si no cabe).
 * Transiciones: prosa corta, ≤500 caracteres (Kling corta el prompt).
 */
import { comas, contarPalabras, negativosDe, sinPronombre, textoDe, type PromptSpec } from "../spec.ts";
import { KLING_MAX_CHARS_TRANSICION, TOOL_INFO } from "../tools.ts";
import { positivar } from "../positivo.ts";
import type { Salida } from "./salida.ts";
import { tipoEn } from "./video-tipos.ts";

const MAX = TOOL_INFO.kling.maxPalabras ?? 60;

function transicion(spec: PromptSpec): string {
  let t = `Seamless single continuous shot transitioning from the start image to the end image. ${spec.accion || "Connect elements, colors and themes between both scenes: the camera moves or the world morphs organically, no cut"}.${spec.camara.movimiento ? ` ${spec.camara.movimiento}.` : ""}${spec.mood ? ` ${spec.mood}.` : ""}`;
  if (t.length > KLING_MAX_CHARS_TRANSICION) t = t.slice(0, KLING_MAX_CHARS_TRANSICION - 1).replace(/\s+\S*$/, "") + ".";
  return t;
}

export function compilarKling(spec: PromptSpec): Salida {
  if (spec.job === "transicion") return { texto: transicion(spec), formato: "texto" };

  // El tipo de video (si lo hay) abre la capa de estilo: corto, porque Kling cuenta palabras.
  const estilo = comas(tipoEn(spec.video_type), spec.estilo || "cinematic video");
  const sujeto =
    spec.job === "animar_foto"
      ? `${spec.sujeto || "the subject from the reference image"} ${spec.accion ? sinPronombre(spec.accion) : "with subtle natural movement"}`
      : `${spec.sujeto || spec.idea} ${sinPronombre(spec.accion)}`.trim();
  const camara = spec.camara.movimiento || "camera slowly pushes in";
  const atmosfera = comas(spec.luz, spec.entorno && spec.job !== "animar_foto" ? spec.entorno : null, spec.mood);
  // Sin campo negativo en Kling 3.x: hasta 2 "qué evitar" ya vueltos positivo, al final.
  const positivos = comas(...positivar(negativosDe(spec)).positivos.slice(0, 2));
  const t = textoDe(spec);
  const clausulaTexto = t ? `on-screen text "${t.contenido.trim()}"${t.posicion ? ` ${t.posicion}` : ""}` : null;

  // Se recorta de atrás hacia adelante: los positivos convertidos son lo primero que se
  // sacrifica, la atmósfera después; el estilo y el sujeto nunca. El texto pedido va ANTES
  // de la atmósfera: si el diseñador lo escribió, pesa más que el mood.
  const capas = [estilo, sujeto, camara, ...(clausulaTexto ? [clausulaTexto] : []), atmosfera, positivos];
  let texto = comas(...capas);
  while (contarPalabras(texto) > MAX && capas.length > 2) {
    capas.pop();
    texto = comas(...capas);
  }
  if (contarPalabras(texto) > MAX) texto = texto.split(/\s+/).slice(0, MAX).join(" ").replace(/[,;\s]+$/, "");
  texto = texto.charAt(0).toUpperCase() + texto.slice(1) + ".";
  return { texto, formato: "texto" };
}
