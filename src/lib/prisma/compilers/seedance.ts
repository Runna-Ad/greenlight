/**
 * Compiler → Seedance 2.0 / 2.0 Mini (ByteDance, en Higgsfield). Prosa corta en inglés que abre con
 * el PLANO (así escribe Higgsfield sus ejemplos: "Handheld medium close-up at golden hour…"), luego
 * sujeto + acción + lugar, el look, las referencias por número ("Image 1") y el SONIDO dicho claro:
 * Seedance genera audio con el video por default (diálogo con lip-sync, ambiente, música).
 * La escena por bloques de tiempo va como planos con tiempo ("Shot 1 (0-2s): …"): Seedance encadena
 * planos en una sola generación. Sin campo negativo documentado: lo que se evita va en positivo.
 * Fuentes: higgsfield.ai/seedance/2.0 y el MODELS.md del CLI de Higgsfield (2026-09-16).
 */
import { comas, frases, negativosDe, sinPronombre, textoDe, type PromptSpec } from "../spec.ts";
import type { Salida } from "./salida.ts";
import type { Limites } from "../catalogo.ts";
import { duracionValida } from "../tools.ts";
import { positivar } from "../positivo.ts";
import { beatsDe } from "./beats.ts";
import { lookDeTipo, tipoEn } from "./video-tipos.ts";
import { zonaSeguraCorta } from "./zonas.ts";
import { etiquetaImagen } from "./seedream.ts";

/** "Medium close-up, slow push in" — el plano que abre el prompt. */
export function planoDe(spec: PromptSpec): string {
  const c = spec.camara;
  return comas(c.angulo, c.lente, c.movimiento || "slow continuous camera move") || "slow continuous camera move";
}

/** Qué hace cada imagen en el video: primer cuadro, último cuadro, o a quién/qué respetar. */
export function referenciasVideo(spec: PromptSpec): string | null {
  // Sin caption en la transición: las dos imágenes describen escenas distintas a propósito (día → noche) y
  // juntas dispararían "luz contradictoria". Kling tampoco las describe.
  const ini = etiquetaImagen(spec, "inicio", true);
  const fin = etiquetaImagen(spec, "fin", true);
  if (ini && fin) return `${ini} is the first frame and ${fin} the last frame: one continuous shot from one to the other, no cut`;
  const suj = etiquetaImagen(spec, "sujeto");
  if (!suj) return null;
  return spec.job === "animar_foto"
    ? `${suj} is the first frame: keep the subject's identity, framing and setting`
    : `Keep the identity of the subject in ${suj}: same face, body and clothing`;
}

/** El diálogo tal como va entre comillas: una comilla recta adentro cerraría la cita antes de tiempo,
 *  así que se vuelve tipográfica. El validador busca exactamente esto. */
export const dialogoCitado = (texto: string): string => `"${texto.trim().replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "”")}"`;

/** Lo que se oye. Con diálogo: el texto tal cual, en su idioma, con lip-sync. Sin él: ambiente y nada más. */
export function sonidoDe(spec: PromptSpec): string {
  const d = spec.dialogo;
  if (d?.texto.trim()) {
    const voz = d.voz ? `${d.voz} voice` : "natural voice";
    return `Dialogue in ${d.idioma}, ${voz}, lip-synced: ${dialogoCitado(d.texto)} (keep it exactly as written, do not translate)`;
  }
  return "Sound: natural ambient sound only, no dialogue, no music";
}

const mayuscula = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

function accionPrincipal(spec: PromptSpec): string {
  if (spec.job === "transicion") return spec.accion || "the scene transforms organically, connecting colors and shapes of both frames";
  // Escena por bloques: la acción la cuentan los planos con tiempo; aquí sólo quién y dónde.
  if (spec.job === "escena_sora") return `${spec.sujeto || spec.idea}${spec.entorno ? `, ${spec.entorno}` : ""}`;
  const sujeto = spec.sujeto || (spec.job === "animar_foto" ? "the subject" : spec.idea);
  const accion = spec.accion ? sinPronombre(spec.accion) : spec.job === "animar_foto" ? "comes alive with subtle natural motion" : "";
  return `${sujeto} ${accion}${spec.entorno && spec.job !== "animar_foto" ? `, in ${spec.entorno}` : ""}`.trim();
}

export function compilarSeedance(spec: PromptSpec, lim?: Limites): Salida {
  const dur = duracionValida("seedance", spec.duracion, lim?.duraciones);
  const t = textoDe(spec);
  // Planos con tiempo sólo en la escena por bloques: en un clip simple un plano claro rinde más.
  const planos =
    spec.job === "escena_sora"
      ? beatsDe(spec, dur).map((b, i) => `Shot ${i + 1} (${b.desde}-${b.hasta}s): ${comas(b.accion, b.camara)}`)
      : [];
  const look = comas(tipoEn(spec.video_type), spec.estilo || "cinematic, photorealistic", spec.luz && `lighting ${spec.luz}`, spec.mood && `mood ${spec.mood}`, lookDeTipo(spec.video_type));
  const positivos = positivar(negativosDe(spec)).positivos.slice(0, 2);
  const texto = frases(
    `${mayuscula(planoDe(spec))}: ${accionPrincipal(spec)}`,
    ...planos,
    `Look: ${look}`,
    referenciasVideo(spec),
    spec.marca?.paleta.length ? `Brand colors ${spec.marca.paleta.join(", ")}` : null,
    t ? `On-screen text: "${t.contenido.trim()}"${t.posicion ? `, ${t.posicion}` : ""}, exact spelling, stays legible` : "No captions or on-screen text",
    sonidoDe(spec),
    positivos.length ? `Keep the frame: ${positivos.join("; ")}` : null,
    zonaSeguraCorta(spec) && `Keep the ${zonaSeguraCorta(spec)}`,
    `Format: ${spec.aspect}, ${dur} seconds`,
  );
  return { texto, formato: "texto" };
}
