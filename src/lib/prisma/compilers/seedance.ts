/**
 * Compiler → Seedance 2.0 / 2.0 Mini / 2.5 (ByteDance, en Higgsfield). Un solo bloque de texto partido
 * en SECCIONES CON ETIQUETA, en el orden que publica Higgsfield (blog "Seedance 2.5 prompting guide":
 * GLOBAL STYLE → SCENE → CHARACTERS/REFERENCES → LOCATION → FIRST FRAME → shots → OPTICS/CAMERA →
 * PHYSICS → LIGHTING → AUDIO, con POSITIVE LOCKS al cierre) y el skill de Seedance que usa el equipo
 * (tasks/higgsfield-blog-guias-2026-09-16.md):
 * - las referencias se etiquetan `@image1`, `@image2`… por orden de carga, con un ancla mínima y
 *   "100% matches the reference" (describir de más pelea con la imagen);
 * - se escribe LO VISIBLE; la cámara como setup físico (FOV en grados, no mm) y un solo plano continuo
 *   salvo que la escena pida cortes con tiempo ("0.0s to 3.0s — …", "3.0s HARD CUT");
 * - el sonido se dice siempre (Seedance genera audio por default) y todo en positivo.
 */
import { comas, negativosDe, sinPronombre, textoDe, type PromptSpec, type RefRole } from "../spec.ts";
import type { Salida } from "./salida.ts";
import type { Limites } from "../catalogo.ts";
import { duracionValida } from "../tools.ts";
import { positivar } from "../positivo.ts";
import { beatsDe } from "./beats.ts";
import { lookDeTipo, tipoEn } from "./video-tipos.ts";
import { zonaSeguraCorta } from "./zonas.ts";

/** `@image1` — la etiqueta que Higgsfield asigna por orden de carga (video: "Add references using @"). */
export const arroba = (n: number): string => `@image${n}`;

/** Los números (1-based) de las referencias de un papel. */
const numerosDe = (spec: PromptSpec, role: RefRole): number[] => spec.refs.flatMap((r, i) => (r.role === role ? [i + 1] : []));

/** FOV diagonal por escalón (tabla del skill de Seedance): el modelo lee grados mejor que milímetros. */
const FOV: [maxMm: number, grados: number, uso: string][] = [
  [16, 107, "ultra-wide"],
  [24, 84, "wide"],
  [35, 63, "observational wide"],
  [50, 47, "neutral human perspective"],
  [85, 29, "portrait compression"],
  [135, 18, "close portrait"],
  [200, 12, "tele detail"],
  [Infinity, 8, "extreme compression"],
];

/** "85mm, shallow depth of field" → "29° field of view (portrait compression), shallow depth of field".
 *  Sin milímetros, palabras comunes (gran angular, tele, ojo de pez); si no reconoce nada, el texto tal cual. */
export function opticaDe(lente: string | null): string | null {
  // Tope antes de las regex (el recorte de bordes es cuadrático en una tira larga de comas).
  const l = lente?.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!l) return null;
  // La palabra reconocida SE QUITA del resto (si no, se repite la idea y el español se cuela al prompt).
  const PALABRAS: [RegExp, [number, number, string]][] = [
    [/\b(fish\s*eye|ojo de pez)\b/i, [0, 180, "fisheye"]],
    [/\b(ultra[\s-]*wide|ultra\s*gran\s*angular)\b/i, FOV[0]],
    [/\b(wide[\s-]*angle|wide|gran\s*angular)\b/i, FOV[1]],
    [/\b(tele(photo|objetivo)?(\s*lens)?)\b/i, FOV[5]],
    [/\b(portrait\s*lens|portrait|retrato)\b/i, FOV[4]],
  ];
  const mm = /(\d{1,3})\s*mm\b/i.exec(l);
  const quitar: RegExp = mm ? /\d{1,3}\s*mm\b/i : (PALABRAS.find(([re]) => re.test(l))?.[0] ?? /$^/);
  const fila = mm ? FOV.find(([max]) => Number(mm[1]) <= max) : PALABRAS.find(([re]) => re.test(l))?.[1];
  if (!fila) return l;
  const resto = l.replace(quitar, "").replace(/^[\s,;·-]+|[\s,;·-]+$/g, "");
  return comas(`${fila[1]}° field of view (${fila[2]})`, resto || null);
}

/** El diálogo tal como va entre comillas: una comilla recta adentro cerraría la cita antes de tiempo,
 *  así que se vuelve tipográfica. El validador busca exactamente esto. */
export const dialogoCitado = (texto: string): string => `"${texto.replace(/\s+/g, " ").trim().replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "”")}"`;

/** Una caption (texto de la visión o del diseñador) no puede fingir estructura: sin etiquetas @imageN,
 *  sin "HARD CUT" y en una línea. */
export const captionSegura = (c: string): string => c.replace(/@image\d+/gi, "image").replace(/hard\s+cut/gi, "cut").replace(/\s+/g, " ").trim();

/** Lo que se oye. Con diálogo: el texto tal cual, en su idioma, con lip-sync. Sin él: ambiente y nada más. */
export function sonidoDe(spec: PromptSpec): string {
  const d = spec.dialogo;
  if (d?.texto.trim()) {
    const voz = d.voz ? `${d.voz} voice` : "natural voice";
    return `Dialogue in ${d.idioma}, ${voz}, lip-synced: ${dialogoCitado(d.texto)} (keep it exactly as written, do not translate). No music`;
  }
  return "Natural ambient sound only, no dialogue, no music";
}

/** Cada referencia con su papel. Ancla mínima: la imagen ya dice cómo se ve. */
export function referenciasVideo(spec: PromptSpec): string[] {
  const ini = numerosDe(spec, "inicio");
  const fin = numerosDe(spec, "fin");
  // Sin caption en la transición: las dos imágenes describen escenas distintas a propósito (día → noche) y
  // juntas dispararían "luz contradictoria".
  if (ini.length && fin.length) return [`${arroba(ini[0])} is the first frame and ${arroba(fin[0])} is the last frame`];
  const primeraSujeto = numerosDe(spec, "sujeto")[0];
  return spec.refs.map((r, i) => {
    const tag = arroba(i + 1);
    const ancla = r.caption ? ` — ${captionSegura(r.caption)}` : "";
    if (spec.job === "animar_foto" && i + 1 === primeraSujeto) return `${tag}${ancla}: it is the first frame, 100% matches the reference`;
    if (r.role === "estilo") return `${tag}${ancla}: style reference only (light, palette, texture), its subject stays out of the video`;
    return `${tag}${ancla}: same identity, shape and details, 100% matches the reference`;
  });
}

/** Lo que pasa, en visible. La transición la cuentan los dos cuadros; la escena por bloques, los planos. */
function accionDe(spec: PromptSpec): string {
  if (spec.job === "transicion") return spec.accion || "the first frame transforms organically into the last one, shapes and colors connecting";
  if (spec.job === "animar_foto") return `${spec.sujeto || "the subject"} ${spec.accion ? sinPronombre(spec.accion) : "comes alive with subtle natural motion: breathing, a slight head turn, fabric reacting to air"}`;
  return `${spec.sujeto || spec.idea} ${sinPronombre(spec.accion)}`.trim();
}

const seg = (s: number): string => `${s.toFixed(1)}s`;

export function compilarSeedance(spec: PromptSpec, lim?: Limites): Salida {
  const dur = duracionValida("seedance", spec.duracion, lim?.duraciones);
  const t = textoDe(spec);
  const escena = spec.job === "escena_sora";
  const planos = escena
    ? beatsDe(spec, dur).flatMap((b, i) => [...(i ? [`${seg(b.desde)} HARD CUT`] : []), `${seg(b.desde)} to ${seg(b.hasta)} — ${comas(b.accion, b.camara, b.sfx && `sound: ${b.sfx}`)}`])
    : [];
  const { positivos } = positivar(negativosDe(spec));
  const zona = zonaSeguraCorta(spec);
  const locks = [
    ...spec.preservar,
    // Una transición CAMBIA del primer cuadro al último a propósito: ahí este candado se contradice.
    ...(spec.refs.length && spec.job !== "transicion" ? ["identity, wardrobe and product details stay identical from the first frame to the last"] : []),
    ...(t ? [`the text "${t.contenido.trim()}" keeps its exact spelling and stays legible`] : []),
    ...positivos.slice(0, 2),
    ...(zona ? [zona] : []),
  ];
  const secciones: [string, string | null][] = [
    ["GLOBAL STYLE", comas(tipoEn(spec.video_type), spec.estilo || "photoreal live-action, natural color", lookDeTipo(spec.video_type), spec.mood && `${spec.mood} mood`)],
    // Una línea: QUÉ pasa, sólo donde hay planos (la escena por bloques) o dos cuadros; en un plano único
    // lo dice ACTION y repetirlo sólo gasta palabras. El lugar va en LOCATION.
    ["SCENE", spec.job === "transicion" ? "a single continuous transition between two frames" : escena ? `${spec.sujeto || spec.idea}${spec.accion ? ` ${sinPronombre(spec.accion)}` : ""}`.trim() : null],
    ["ACTIVE REFERENCES", referenciasVideo(spec).join("; ") || null],
    ["LOCATION", spec.job === "animar_foto" ? "exactly as in the first frame" : spec.entorno || null],
    ["FORMAT", escena ? "timed shots; cuts only at the stated points, the camera does not cut on its own" : "one continuous shot, the camera does not cut on its own"],
    ["SHOTS", planos.length ? planos.join("\n") : null],
    ["OPTICS", comas(spec.camara.angulo, opticaDe(spec.camara.lente)) || null],
    ["CAMERA", spec.camara.movimiento || "slow steady push in, constant speed, settling into a hold"],
    ["ACTION", escena ? null : accionDe(spec)],
    ["LIGHTING", spec.luz || "one soft key light with a consistent direction, natural falloff"],
    ["COLOR", spec.marca?.paleta.length ? `brand colors ${spec.marca.paleta.join(", ")} carried by the materials and the light` : null],
    ["TEXT", t ? comas(`on-screen text "${t.contenido.trim()}"`, t.posicion, t.estilo) : "no captions or on-screen text"],
    ["AUDIO", sonidoDe(spec)],
    ["OUTPUT", `${spec.aspect}, ${dur} seconds`],
    ["POSITIVE LOCKS", locks.length ? locks.join("; ") : null],
  ];
  const texto = secciones
    .filter((s): s is [string, string] => !!s[1]?.trim())
    .map(([k, v]) => (k === "SHOTS" ? `${k}\n${v}` : `${k}: ${v}.`))
    .join("\n");
  return { texto, formato: "texto" };
}
