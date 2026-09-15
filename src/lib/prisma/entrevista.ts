/**
 * HÜE Prisma — la ENTREVISTA: hasta 3 preguntas rápidas (chips) que H.Ü.E hace ANTES de
 * escribir el prompt, y CERO cuando la idea y las referencias ya lo dicen todo. Este módulo
 * es puro: decide si hace falta preguntar (heurística sin modelo), sanea las preguntas que
 * devuelve el modelo y las respuestas que manda el cliente, y vuelca las respuestas con
 * `campo` en los campos del wizard (el código llena luz/duración/formato; el modelo sólo
 * lee las demás como datos). La llamada al modelo vive en writer.ts (preguntarFaltante).
 */
import { ASPECTS, contarPalabras, type Aspect } from "./spec.ts";
import { plano, recortar } from "./texto.ts";
import type { Par } from "./copy.ts";
import { listaDe, objetoDe } from "./json.ts";

// F5c: los 7 últimos dan espacio a las rondas profundas (ánimo, composición, EL detalle a lucir, hora/clima,
// vestuario, qué hace el sujeto, color): cada id se pregunta UNA vez en toda la entrevista.
export const PREGUNTA_IDS = ["angulo", "personas", "fondo", "texto", "ritmo", "voz", "producto", "luz", "otro", "mood", "composicion", "detalle", "hora", "vestuario", "accion", "color"] as const;
export type PreguntaId = (typeof PREGUNTA_IDS)[number];
/** Campos que el CÓDIGO llena con la respuesta (los demás viajan sólo como texto al writer). */
export const CAMPOS_RESPUESTA = ["luz", "movimiento", "lente", "angulo", "mood", "estilo", "duracion", "aspect", "dialogo.idioma"] as const;
export type CampoRespuesta = (typeof CAMPOS_RESPUESTA)[number];

export type Opcion = { valor: string; label: Par };
export type Pregunta = { id: PreguntaId; pregunta: Par; opciones: Opcion[]; campo: CampoRespuesta | null };
export type Respuesta = { id: PreguntaId; valor: string; campo: CampoRespuesta | null; /** F5c: la ronda en que se contestó (sólo si es 2 o 3). */ ronda?: number };

export const MAX_PREGUNTAS = 3;
/** F5c: "Profundizar" — hasta 3 rondas de 3 preguntas (Pedro, 2026-09-15). */
export const MAX_RONDAS = 3;
export const MAX_OPCIONES = 4;
export const MIN_OPCIONES = 2;
export const MAX_CHARS_RESPUESTA = 120;
/** Con menos palabras la idea es un titular, no un brief: siempre se pregunta. */
export const IDEA_CORTA = 8;
/** Con esto o más (y las referencias obligatorias puestas) la idea ya lo dice todo: no se pregunta. */
export const IDEA_COMPLETA = 25;
/** Una idea media (≥ 15) también basta si el look ya está elegido (el diseñador volvió del paso 2)
 *  o si una referencia trae ADN visual (luz, lente, mood ya vistos por H.Ü.E). */
export const IDEA_MEDIA = 15;
export const LOOK_COMPLETO = 3;

/** ¿Vale la pena preguntar? Sin modelo: es lo que decide si se paga la llamada. La entrevista
 *  corre ANTES del paso del look, así que la decisión se apoya en lo que existe en el paso 1:
 *  la idea, las referencias y su ADN; los chips del look sólo cuentan si ya se eligieron. */
export function necesitaEntrevista(p: { idea: string; refsFaltan: boolean; chipsLook: number; refsConDna?: number; sinPreguntas: boolean }): boolean {
  if (p.sinPreguntas) return false;
  const palabras = contarPalabras(p.idea);
  if (palabras < IDEA_CORTA) return true;
  if (p.refsFaltan) return true;
  if (palabras >= IDEA_COMPLETA) return false;
  if (palabras >= IDEA_MEDIA && (p.chipsLook >= LOOK_COMPLETO || (p.refsConDna ?? 0) >= 1)) return false;
  return true;
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? recortar(plano(v), max) : "");
const par = (es: unknown, en: unknown, max: number): Par | null => {
  const a = texto(es, max);
  const b = texto(en, max);
  return a || b ? { es: a || b, en: b || a } : null;
};

/** Lo que devuelve el modelo → preguntas limpias. Una pregunta mal formada se descarta (no
 *  la entrevista); las de ids que la marca "ya sabe" se omiten; tope de 3. */
export function sanearPreguntas(raw: unknown, yaSabidas: string[] = []): Pregunta[] {
  const out: Pregunta[] = [];
  // Tolerante con la forma: array, string JSON o {preguntas: …} (el modelo a veces lo manda así).
  for (const item of listaDe(raw, "preguntas")) {
    const o = objetoDe(item);
    if (!o) continue;
    const id = typeof o.id === "string" && (PREGUNTA_IDS as readonly string[]).includes(o.id) ? (o.id as PreguntaId) : null;
    if (!id || yaSabidas.includes(id) || out.some((q) => q.id === id)) continue;
    const pregunta = par(o.pregunta_es, o.pregunta_en, 140);
    if (!pregunta) continue;
    const opciones: Opcion[] = [];
    for (const op of listaDe(o.opciones, "opciones")) {
      const x = objetoDe(op);
      if (!x) continue;
      const valor = texto(x.valor, MAX_CHARS_RESPUESTA);
      const label = par(x.label_es, x.label_en, 60);
      if (!valor || !label || opciones.some((v) => v.valor === valor)) continue;
      opciones.push({ valor, label });
      if (opciones.length >= MAX_OPCIONES) break;
    }
    if (opciones.length < MIN_OPCIONES) continue;
    const campo = typeof o.campo === "string" && (CAMPOS_RESPUESTA as readonly string[]).includes(o.campo) ? (o.campo as CampoRespuesta) : null;
    out.push({ id, pregunta, opciones, campo });
    if (out.length >= MAX_PREGUNTAS) break;
  }
  return out;
}

/** Lo que manda el cliente → respuestas limpias (tope 3, una línea, 120 letras, campo del enum). */
export function sanearRespuestas(raw: unknown): Respuesta[] {
  const out: Respuesta[] = [];
  for (const item of listaDe(raw, "respuestas")) {
    const o = objetoDe(item);
    if (!o) continue;
    const id = typeof o.id === "string" && (PREGUNTA_IDS as readonly string[]).includes(o.id) ? (o.id as PreguntaId) : null;
    const valor = texto(o.valor, MAX_CHARS_RESPUESTA);
    if (!id || !valor || out.some((r) => r.id === id)) continue;
    const campo = typeof o.campo === "string" && (CAMPOS_RESPUESTA as readonly string[]).includes(o.campo) ? (o.campo as CampoRespuesta) : null;
    const ronda = typeof o.ronda === "number" && Number.isInteger(o.ronda) && o.ronda >= 2 && o.ronda <= MAX_RONDAS ? o.ronda : null;
    out.push(ronda ? { id, valor, campo, ronda } : { id, valor, campo });
    // F5c: hasta 3 rondas × 3 preguntas.
    if (out.length >= MAX_PREGUNTAS * MAX_RONDAS) break;
  }
  return out;
}

export type LookEntrada = { luz: string | null; movimiento: string | null; lente: string | null; angulo?: string | null; mood: string | null; estilo: string | null };

/** Las respuestas con `campo` llenan el wizard desde el CÓDIGO (no se depende del modelo).
 *  Sólo pisa lo que estaba vacío: lo que el diseñador ya eligió a mano manda.
 *  `alcance`: "look" (servidor: sólo luz/movimiento/lente/mood/estilo — el formato, la duración
 *  y el idioma los decide el wizard, que ya recibe el valor aplicado) o "todo" (cliente, al
 *  "Seguir", donde vacío = de verdad sin elegir: duración null, formato sin override, idioma null). */
export function aplicarRespuestas(base: { look: LookEntrada; duracion: number | null; aspect: Aspect; dialogoIdioma: string | null }, respuestas: Respuesta[], alcance: "look" | "todo" = "todo"): { look: LookEntrada; duracion: number | null; aspect: Aspect; dialogoIdioma: string | null } {
  const look = { ...base.look };
  let { duracion, aspect, dialogoIdioma } = base;
  for (const r of respuestas) {
    switch (r.campo) {
      case "luz": case "movimiento": case "lente": case "angulo": case "mood": case "estilo":
        if (!look[r.campo]) look[r.campo] = r.valor;
        break;
      case "duracion": {
        const n = Number(r.valor.replace(/[^\d.]/g, ""));
        if (alcance === "todo" && duracion === null && Number.isFinite(n) && n >= 1 && n <= 60) duracion = n;
        break;
      }
      case "aspect":
        if (alcance === "todo" && (ASPECTS as string[]).includes(r.valor)) aspect = r.valor as Aspect;
        break;
      case "dialogo.idioma":
        if (alcance === "todo" && !dialogoIdioma && (r.valor === "en" || r.valor === "es-MX")) dialogoIdioma = r.valor;
        break;
      default:
        break;
    }
  }
  return { look, duracion, aspect, dialogoIdioma };
}

/** Las respuestas como una sola línea para el evento `respondido` ("fondo=estudio limpio; luz=…"). */
/** Los separadores del formato (`;` `=`) y los ángulos se quitan del valor: si no, una respuesta
 *  libre podría fingir pares extra ("x; fake=y") que el aprendizaje leería como reales. */
export const detalleRespuestas = (respuestas: Respuesta[]): string => recortar(respuestas.map((r) => `${r.id}=${recortar(plano(r.valor).replace(/[;=<>]/g, " ").replace(/\s+/g, " ").trim(), 60)}`).join("; "), 300);

/** Lo contrario: de un `detalle` guardado a pares id → valor. */
export function pares(detalle: string | null): { id: string; valor: string }[] {
  if (!detalle) return [];
  return detalle.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return i > 0 ? { id: p.slice(0, i).trim(), valor: p.slice(i + 1).trim() } : null;
  }).filter((x): x is { id: string; valor: string } => !!x && !!x.valor && (PREGUNTA_IDS as readonly string[]).includes(x.id));
}
