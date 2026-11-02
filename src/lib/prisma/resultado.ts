/**
 * HÜE Prisma — F4 "sube lo que salió". El diseñador sube la imagen que le dio la herramienta;
 * H.Ü.E la compara con lo pedido y devuelve un VEREDICTO: qué cumplió y qué no (puntos fijos,
 * en palabras llanas), qué pedirle al prompt original (refine) y UNA edición concreta sobre esa
 * misma imagen (corrección). Aquí vive lo puro: el saneo del veredicto, el puntaje, el detalle
 * que va al evento y el spec HERMANO de corrección. Las llamadas viven en writer.ts / actions.
 */
import { specVacio, type PromptSpec, type Tool } from "./spec.ts";
import { cercado } from "./texto.ts";
import { listaDe, objetoDe } from "./json.ts";

/** Los puntos que H.Ü.E revisa. Fijos: así se pueden CONTAR por marca y herramienta. */
export const CAMPOS_VEREDICTO = ["sujeto", "texto", "encuadre", "luz", "estilo", "identidad", "marca"] as const;
export type CampoVeredicto = (typeof CAMPOS_VEREDICTO)[number];
export const esCampoVeredicto = (v: unknown): v is CampoVeredicto => typeof v === "string" && (CAMPOS_VEREDICTO as readonly string[]).includes(v);

export type Cumple = { campo: CampoVeredicto; ok: boolean; nota: { es: string; en: string } };
export type Veredicto = {
  /** Una frase de lo que hay en la imagen (para el historial y para el spec de corrección). */
  caption: string | null;
  cumple: Cumple[];
  /** Qué pedirle al prompt ORIGINAL para que la próxima generación salga bien (en los dos idiomas). */
  refine: { es: string; en: string } | null;
  /** UNA edición sobre ESTA imagen (inglés, para el compiler de edición). null = no aplica. */
  correccion: string | null;
};

const NOTA_MAX = 200;
const REFINE_MAX = 300;
const CORRECCION_MAX = 400;
const CAPTION_MAX = 300;
// `cercado` (sin < >): lo que vuelve de la visión pudo venir de texto PINTADO en la imagen subida y
// vuelve a un prompt (la corrección como `accion` del spec hermano; el caption como etiqueta de la ref).
const corto = (v: unknown, max: number): string => (typeof v === "string" ? cercado(v).slice(0, max) : "");

/**
 * La salida del tool_use `emitir_veredicto`, saneada: tolera lista / string JSON / envoltorio
 * (lección 2026-09-14), sólo campos del enum, un campo una vez, textos en una línea y con tope.
 * Un punto mal formado se descarta, no el veredicto. Un raw vacío da un veredicto vacío
 * (cumple = [] → sin puntaje), nunca lanza.
 */
export function sanearVeredicto(raw: unknown): Veredicto {
  const o0 = objetoDe(raw) ?? {};
  // Envoltorio con una sola clave ({veredicto: {…}}): se desenvuelve, igual que listaDe.
  const o = o0.cumple === undefined && Object.keys(o0).length === 1 ? (objetoDe(Object.values(o0)[0]) ?? o0) : o0;
  const vistos = new Set<CampoVeredicto>();
  const cumple: Cumple[] = [];
  for (const item of listaDe(o.cumple, "cumple").slice(0, 12)) {
    const c = objetoDe(item);
    if (!c || !esCampoVeredicto(c.campo) || vistos.has(c.campo)) continue;
    const ok = c.ok === true || c.ok === "true";
    const es = corto(c.nota_es, NOTA_MAX);
    const en = corto(c.nota_en, NOTA_MAX);
    vistos.add(c.campo);
    cumple.push({ campo: c.campo, ok, nota: { es: es || en, en: en || es } });
  }
  const rEs = corto(o.refine_es, REFINE_MAX);
  const rEn = corto(o.refine_en, REFINE_MAX);
  const correccion = corto(o.correccion_en, CORRECCION_MAX) || null;
  const fallidos = cumple.some((c) => !c.ok);
  return {
    caption: corto(o.caption, CAPTION_MAX) || null,
    cumple,
    // Sin fallos no hay nada que pedir: un refine/corrección "por si acaso" confunde.
    refine: fallidos && (rEs || rEn) ? { es: rEs || rEn, en: rEn || rEs } : null,
    correccion: fallidos ? correccion : null,
  };
}

/** Un resultado subido tal como lo ve la UI (la fila + la URL firmada + lo que se puede hacer). */
export type ResultadoVivo = {
  id: string;
  promptId: string | null;
  /** URL firmada (1 h) de la imagen subida. */
  url: string;
  modelo: string | null;
  veredicto: Veredicto;
  score: number | null;
  aceptado: boolean;
  /** Hay una edición concreta con la que armar el prompt de corrección (sólo imagen/edición). */
  corregible: boolean;
};

/** El jsonb guardado → Veredicto (misma tolerancia: la fila pudo escribirla otra versión). */
export const veredictoDe = (raw: unknown): Veredicto => sanearVeredicto(raw);

/** Lo que se guarda en la fila: la forma plana que el schema del tool_use produce. */
export function veredictoAFila(v: Veredicto): Record<string, unknown> {
  return {
    caption: v.caption,
    cumple: v.cumple.map((c) => ({ campo: c.campo, ok: c.ok, nota_es: c.nota.es, nota_en: c.nota.en })),
    refine_es: v.refine?.es ?? "",
    refine_en: v.refine?.en ?? "",
    correccion_en: v.correccion ?? "",
  };
}

/** % de puntos que cumplió (0–100), o null si no hubo puntos. */
export function scoreDe(v: Veredicto): number | null {
  if (!v.cumple.length) return null;
  return Math.round((100 * v.cumple.filter((c) => c.ok).length) / v.cumple.length);
}

export const fallosDe = (v: Veredicto): CampoVeredicto[] => v.cumple.filter((c) => !c.ok).map((c) => c.campo);

/** El `detalle` del evento `resultado_subido`: los campos fallidos ("texto,encuadre") u "ok". */
export const detalleFallos = (v: Veredicto): string => fallosDe(v).join(",") || "ok";

/** De vuelta: sólo campos del enum (un detalle forjado o de otra versión no cuela nada). */
export function fallosDeDetalle(detalle: string | null | undefined): CampoVeredicto[] {
  if (!detalle) return [];
  return [...new Set(detalle.split(",").map((s) => s.trim()).filter(esCampoVeredicto))];
}

/**
 * El spec HERMANO que corrige el resultado: job oculto `correccion`, la imagen subida como su
 * única referencia (rol `resultado`), la edición como `accion`. Hereda formato, destino y marca;
 * el texto exacto sólo viaja si fue el texto lo que falló (si no, "Keep unchanged" ya lo
 * protege y repetirlo invitaría a re-pintarlo). Sin luz/estilo/mood: el look es el de la imagen.
 */
export function specCorreccion(base: PromptSpec, tool: Tool, correccion: string, caption: string | null, fallos: CampoVeredicto[]): PromptSpec {
  const s = specVacio("correccion", tool, base.idea);
  s.accion = cercado(correccion).slice(0, CORRECCION_MAX);
  s.refs = [{ role: "resultado", caption: caption ? cercado(caption).slice(0, CAPTION_MAX) : null, dna: null }];
  s.aspect = base.aspect;
  s.destino = base.destino ?? null;
  s.marca = base.marca;
  s.texto = fallos.includes("texto") && base.texto?.contenido.trim() ? { ...base.texto } : null;
  return s;
}

/** Cuántos resultados subidos se miran hacia atrás por herramienta, y cuántos fallos del mismo
 *  punto hacen "patrón" (3 de los últimos 6: no es un mal día, es la herramienta con esta marca). */
export const FALLOS_VENTANA = 6;
export const FALLOS_MIN = 3;
export type FalloPatron = { tool: Tool; campo: CampoVeredicto; n: number; de: number };

/** De los eventos `resultado_subido` (más recientes primero) → qué punto le viene fallando a la
 *  marca en cada herramienta. Sólo herramientas conocidas (la columna no tiene check). */
export function patronFallos(eventos: { tool: string; tipo: string; detalle: string | null }[], tools: readonly string[]): FalloPatron[] {
  const porTool = new Map<string, CampoVeredicto[][]>();
  for (const e of eventos) {
    if (e.tipo !== "resultado_subido" || !tools.includes(e.tool)) continue;
    const lista = porTool.get(e.tool) ?? [];
    if (lista.length < FALLOS_VENTANA) lista.push(fallosDeDetalle(e.detalle));
    porTool.set(e.tool, lista);
  }
  const out: FalloPatron[] = [];
  for (const [tool, subidas] of porTool) {
    if (subidas.length < FALLOS_MIN) continue;
    for (const campo of CAMPOS_VEREDICTO) {
      const n = subidas.filter((f) => f.includes(campo)).length;
      if (n >= FALLOS_MIN) out.push({ tool: tool as Tool, campo, n, de: subidas.length });
    }
  }
  return out;
}

const CAMPO_EN: Record<CampoVeredicto, string> = {
  sujeto: "the subject or scene",
  texto: "the exact on-piece text",
  encuadre: "framing and format",
  luz: "the light",
  estilo: "style and colors",
  identidad: "likeness to the reference",
  marca: "the brand palette and tone",
};

/** Frase CALCULADA para el writer (sin texto humano dentro). null si no hay patrón. */
export function fraseFallos(fallos: FalloPatron[] | undefined): string | null {
  if (!fallos?.length) return null;
  const partes = fallos.slice(0, 6).map((f) => `${f.tool}: ${CAMPO_EN[f.campo]} missed in ${f.n} of the last ${f.de} uploaded results`);
  return `This brand's uploaded results keep failing on — ${partes.join("; ")}. Be extra explicit and literal about those points in the spec.`;
}
