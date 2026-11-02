/**
 * Compiler → Gemini Omni Flash (Google, en Higgsfield). Una INSTRUCCIÓN en lenguaje natural, en el orden
 * que publica Higgsfield (blog "How to use Gemini Omni Flash — multi-shot"): (1) sujeto y acción,
 * (2) lugar y restricciones, (3) cámara. Las referencias se nombran EN LA FRASE con su etiqueta
 * (`@image1 standing at…`), y las restricciones de marca se dicen como candados ("the label color stays
 * consistent"): Omni las trata como tales. Sonido explícito. En Higgsfield: 16:9 o 9:16, 4/6/8/10 s,
 * 720p, hasta 7 imágenes. Fuentes: tasks/higgsfield-blog-guias-2026-09-16.md.
 */
import { comas, frases, negativosDe, textoDe, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import type { Limites } from "../catalogo.ts";
import { duracionValida } from "../tools.ts";
import { positivar } from "../positivo.ts";
import { tipoEn } from "./video-tipos.ts";
import { zonaSeguraCorta } from "./zonas.ts";
import { arroba, captionSegura, opticaDe, sonidoDe } from "./seedance.ts";

/** "@image1 (a man in a navy suit)" — cada referencia con su etiqueta y un ancla corta. */
function conEtiqueta(spec: PromptSpec, i: number): string {
  const r = spec.refs[i];
  return r.caption ? `${arroba(i + 1)} (${captionSegura(r.caption)})` : arroba(i + 1);
}

function pedido(spec: PromptSpec, dur: number): string {
  const formato = `${dur}-second ${spec.aspect} video`;
  const iSujeto = spec.refs.findIndex((r) => r.role === "sujeto");
  const accion = spec.accion || (spec.job === "animar_foto" ? "comes alive with subtle natural motion" : "");
  if (spec.job === "animar_foto") {
    const foto = iSujeto >= 0 ? conEtiqueta(spec, iSujeto) : "the image";
    return `Animate ${foto} into a ${formato}: ${spec.sujeto || "the subject"} ${accion}, keeping the first frame exactly as the image`;
  }
  const quien = iSujeto >= 0 ? `${spec.sujeto || "the subject"} from ${conEtiqueta(spec, iSujeto)}` : spec.sujeto || spec.idea;
  return `Create a ${formato} of ${quien}${accion ? ` ${accion}` : ""}`;
}

/** Las demás referencias (estilo, objeto…) con su papel, en una frase. */
function otras(spec: PromptSpec): string | null {
  const primera = spec.refs.findIndex((r) => r.role === "sujeto");
  const partes = spec.refs.flatMap((r, i) =>
    i === primera
      ? []
      : r.role === "sujeto"
        ? [`match the same person in ${conEtiqueta(spec, i)}`]
        : [r.role === "estilo" ? `borrow only the look of ${conEtiqueta(spec, i)} (light, palette, texture)` : `include ${conEtiqueta(spec, i)} exactly as shown`],
  );
  return partes.length ? `Also ${partes.join("; ")}` : null;
}

export function compilarOmni(spec: PromptSpec, lim?: Limites): Salida {
  const dur = duracionValida("gemini_omni", spec.duracion, lim?.duraciones);
  const t = textoDe(spec);
  const positivos = positivar(negativosDe(spec)).positivos.slice(0, 2);
  const zona = zonaSeguraCorta(spec);
  const candados = [
    ...(spec.refs.length ? ["the face, wardrobe and product shape stay identical in every frame"] : []),
    ...(spec.marca?.paleta.length ? [`the brand colors ${spec.marca.paleta.join(", ")} stay consistent`] : []),
    ...spec.preservar,
  ];
  const texto = frases(
    // (1) sujeto y acción
    pedido(spec, dur),
    otras(spec),
    // (2) lugar y restricciones
    spec.entorno && spec.job !== "animar_foto" ? `Setting: ${spec.entorno}` : null,
    `Look: ${comas(tipoEn(spec.video_type), spec.estilo || "cinematic, photorealistic", spec.luz, spec.mood)}`,
    candados.length ? `Constraints: ${candados.join("; ")}` : null,
    t ? `Show this exact on-screen text: ${comas(`"${t.contenido.trim()}"`, t.posicion, t.estilo)}` : "No captions or on-screen text",
    positivos.length ? `Keep ${positivos.join("; ")}` : null,
    zona && `Keep the ${zona}`,
    // (3) cámara
    `Camera: ${comas(spec.camara.angulo, opticaDe(spec.camara.lente), spec.camara.movimiento || "slow continuous move")}, one continuous shot`,
    sonidoDe(spec),
  );
  return { texto, formato: "texto" };
}
