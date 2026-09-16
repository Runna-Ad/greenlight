/**
 * Compiler → Gemini Omni Flash (Google, en Higgsfield). Una INSTRUCCIÓN conversacional en inglés
 * ("Create a…", "Animate…"), no una lista de planos: Omni trabaja por turnos y cada edición construye
 * sobre la anterior (guía oficial: deepmind.google/models/gemini-omni/prompt-guide, 2026-09-16).
 * Vocabulario de cine para la cámara y el sonido dicho explícito ("no music, just realistic sound").
 * En Higgsfield: 16:9 o 9:16, 4/6/8/10 s, 720p, hasta 7 imágenes (MODELS.md del CLI).
 */
import { comas, frases, negativosDe, textoDe, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import type { Limites } from "../catalogo.ts";
import { duracionValida } from "../tools.ts";
import { positivar } from "../positivo.ts";
import { tipoEn } from "./video-tipos.ts";
import { zonaSeguraCorta } from "./zonas.ts";
import { planoDe, referenciasVideo, sonidoDe } from "./seedance.ts";
import { etiquetaImagen } from "./seedream.ts";

function pedido(spec: PromptSpec, dur: number): string {
  const formato = `${dur}-second ${spec.aspect} video`;
  const sujeto = spec.sujeto || spec.idea;
  const accion = spec.accion ? ` ${spec.accion}` : "";
  if (spec.job === "animar_foto") {
    const foto = etiquetaImagen(spec, "sujeto", true) ?? "the image";
    return `Animate ${foto} into a ${formato}: ${spec.sujeto || "the subject"}${spec.accion ? ` ${spec.accion}` : " comes alive with subtle natural motion"}`;
  }
  return `Create a ${formato} of ${sujeto}${accion}${spec.entorno ? `, in ${spec.entorno}` : ""}`;
}

export function compilarOmni(spec: PromptSpec, lim?: Limites): Salida {
  const dur = duracionValida("gemini_omni", spec.duracion, lim?.duraciones);
  const t = textoDe(spec);
  const positivos = positivar(negativosDe(spec)).positivos.slice(0, 2);
  const texto = frases(
    pedido(spec, dur),
    referenciasVideo(spec),
    `Camera: ${planoDe(spec)}, one continuous shot`,
    `Look: ${comas(tipoEn(spec.video_type), spec.estilo || "cinematic, photorealistic", spec.luz, spec.mood)}`,
    spec.marca?.paleta.length ? `Use the brand colors ${spec.marca.paleta.join(", ")}` : null,
    t ? `Show this exact on-screen text: "${t.contenido.trim()}"${t.posicion ? `, ${t.posicion}` : ""}` : "No captions or on-screen text",
    sonidoDe(spec),
    positivos.length ? `Keep ${positivos.join("; ")}` : null,
    zonaSeguraCorta(spec) && `Keep the ${zonaSeguraCorta(spec)}`,
  );
  return { texto, formato: "texto" };
}
