import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { specVacio, type PromptSpec, type Beat, type Camara, type Dialogo, type VideoType, type TextoEnImagen, type Tool } from "@/lib/prisma/spec";
import { VIDEO_TYPES } from "@/lib/prisma/spec";
import { cercado, plano } from "@/lib/prisma/texto";
import { compilar, type Salida } from "@/lib/prisma/compilers";
import { validar } from "@/lib/prisma/validators";
import { PRESETS_HIGGSFIELD } from "@/lib/prisma/compilers/higgsfield";
import { BLOQUE_ESTABLE, bloqueEstableCon, bloqueVariable, bloqueReparacion, bloqueRefinar, bloqueVariante, bloqueExplicar, bloqueDescribirPersonaje, bloqueJuicio, bloqueCorreccion, AVISOS_SCHEMA, CORRECCION_SCHEMA, PROMPT_VERSION, type EntradaWriter, type EntradaPersonaje, type NotaTool } from "@/lib/prisma/prompts/writer";
import type { Aviso } from "@/lib/prisma/diagnostico";
import type { Cambio, Idioma } from "@/lib/prisma/ortografia";
import type { PrismaVariante } from "@/lib/database.types";

/**
 * HÜE Prisma — el WRITER. H.Ü.E llena un PromptSpec (tool_use, esquema estricto), el
 * código lo compila al formato de la herramienta y lo VALIDA. Si el validador objeta,
 * UNA llamada de reparación con los errores exactos. Igual que el writer de guiones:
 * el prompt sugiere, el código mide y obliga.
 *
 * Cache: el bloque estable (rol + reglas + tabla de herramientas + ejemplos, ~2k tokens)
 * lleva cache_control; lo variable va después. En un retry o un refine el prefijo sigue
 * haciendo cache hit. Se verifica con `usage.cache_read_input_tokens` (ver Uso).
 */

export const MODEL = "claude-sonnet-5";

export type Uso = {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
};

export type ResultadoWriter =
  | { ok: true; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; usage: Uso; reparado: boolean }
  | { ok: false; error: string };

// ── Esquema de la herramienta emitir_spec ──
// Lo que el modelo puede llenar. Lo que NO está aquí (job, tool, refs, aspect, marca…)
// lo pone el código desde la entrada: el modelo no decide metadatos.
const CAMARA_SCHEMA = {
  type: "object",
  properties: {
    angulo: { type: ["string", "null"] },
    movimiento: { type: ["string", "null"] },
    lente: { type: ["string", "null"] },
  },
  required: ["angulo", "movimiento", "lente"],
};

const BEAT_SCHEMA = {
  type: "object",
  properties: {
    desde: { type: "number" },
    hasta: { type: "number" },
    accion: { type: "string" },
    camara: { type: "string" },
    sfx: { type: "string" },
  },
  required: ["desde", "hasta", "accion", "camara", "sfx"],
};

const SPEC_SCHEMA = {
  type: "object",
  properties: {
    sujeto: { type: "string" },
    accion: { type: "string" },
    entorno: { type: "string" },
    camara: CAMARA_SCHEMA,
    luz: { type: "string" },
    mood: { type: "string" },
    estilo: { type: "string" },
    paleta: { type: "array", items: { type: "string" } },
    texturas: { type: "array", items: { type: "string" } },
    negativos: { type: "array", items: { type: "string" } },
    preservar: { type: "array", items: { type: "string" } },
    beats: { type: ["array", "null"], items: BEAT_SCHEMA },
    video_type: { type: ["string", "null"], enum: [...VIDEO_TYPES, null] },
    preset: { type: ["string", "null"], enum: [...PRESETS_HIGGSFIELD, null] },
    dialogo_voz: { type: ["string", "null"], description: "Voice description for the dialogue, if any." },
    texto_en_imagen: {
      type: ["object", "null"],
      description: "Words that must appear inside the image/video, verbatim in the designer's language. null when no text was asked for.",
      properties: {
        contenido: { type: "string" },
        posicion: { type: ["string", "null"], description: "Where it sits, e.g. 'top third', 'bottom left corner'." },
        estilo: { type: ["string", "null"], description: "How it looks, e.g. 'bold white sans-serif'." },
      },
      required: ["contenido", "posicion", "estilo"],
    },
  },
  required: ["sujeto", "accion", "entorno", "camara", "luz", "mood", "estilo", "paleta", "texturas", "negativos", "preservar", "beats", "video_type", "preset", "dialogo_voz", "texto_en_imagen"],
};

const s0 = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
const sn = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function beatsDe(v: unknown): Beat[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out: Beat[] = [];
  for (const b of v) {
    const o = (b ?? {}) as Record<string, unknown>;
    out.push({ desde: Number(o.desde) || 0, hasta: Number(o.hasta) || 0, accion: s0(o.accion), camara: s0(o.camara), sfx: s0(o.sfx) });
  }
  return out.filter((b) => b.accion).length ? out : null;
}

/** El texto en imagen: lo que el diseñador escribió en su campo MANDA (tal cual); el
 *  modelo sólo aporta posición y estilo. Si no llenó el campo, vale lo que el modelo
 *  rescató de la idea (p. ej. una frase entre comillas). */
function textoDesde(input: Record<string, unknown>, e: EntradaWriter): TextoEnImagen | null {
  const m = (input.texto_en_imagen ?? null) as Record<string, unknown> | null;
  // Lo que escribió el diseñador manda; lo que propone el modelo se sanea igual que si fuera
  // humano (vuelve al writer en cada refine): una línea y con tope.
  const contenido = e.texto?.trim() || (m ? plano(s0(m.contenido)).slice(0, 200) : "");
  if (!contenido) return null;
  const corto = (v: unknown): string | null => {
    const p = m ? plano(sn(v) ?? "").slice(0, 120) : "";
    return p || null;
  };
  return { contenido, posicion: corto(m?.posicion), estilo: corto(m?.estilo) };
}

/** Mezcla lo que el modelo devolvió con lo que el código ya sabía (entrada). */
function specDesde(input: Record<string, unknown>, e: EntradaWriter): PromptSpec {
  const base = specVacio(e.job, e.tool, e.idea);
  const cam = (input.camara ?? {}) as Record<string, unknown>;
  const camara: Camara = { angulo: sn(cam.angulo), movimiento: sn(cam.movimiento), lente: sn(cam.lente) };
  const dialogo: Dialogo | null = e.dialogo?.texto.trim()
    ? { texto: e.dialogo.texto.trim(), idioma: e.dialogo.idioma, voz: e.dialogo.voz ?? sn(input.dialogo_voz) }
    : null;
  const vt = sn(input.video_type);
  return {
    ...base,
    sujeto: s0(input.sujeto),
    accion: s0(input.accion),
    entorno: s0(input.entorno),
    camara,
    luz: s0(input.luz),
    mood: s0(input.mood),
    estilo: s0(input.estilo),
    paleta: arr(input.paleta),
    texturas: arr(input.texturas),
    negativos: arr(input.negativos),
    preservar: arr(input.preservar),
    refs: e.refs.map((r) => ({ role: r.role, caption: r.caption, dna: r.dna })),
    aspect: e.aspect,
    duracion: e.duracion,
    dialogo,
    marca: e.marca,
    beats: beatsDe(input.beats),
    video_type: (VIDEO_TYPES as string[]).includes(vt ?? "") ? (vt as VideoType) : e.videoType && (VIDEO_TYPES as string[]).includes(e.videoType) ? (e.videoType as VideoType) : null,
    preset: sn(input.preset),
    texto: textoDesde(input, e),
    destino: e.destino,
  };
}

function usoDe(res: Anthropic.Message): Uso {
  const u = res.usage;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_creation_input_tokens ?? 0,
  };
}

const sumar = (a: Uso, b: Uso): Uso => ({ input: a.input + b.input, output: a.output + b.output, cache_read: a.cache_read + b.cache_read, cache_write: a.cache_write + b.cache_write });

/** Una llamada a emitir_spec. `extra` va DESPUÉS del bloque variable (reparación/refine). */
/**
 * El bloque estable con las TOOL NOTES del Hub, cacheado en memoria de la instancia por
 * `clave` (= max(updated_at) de prisma_reglas): se reconstruye SÓLO cuando cambia una nota,
 * así el prefijo cacheable del modelo es idéntico entre llamadas y sigue pegando en caché.
 */
/** La versión que se guarda con cada prompt: la del writer + la huella del conocimiento
 *  (TOOL NOTES) que tenía ese día. Un solo sitio: generar, refinar y variar la comparten. */
export const versionCon = (clave: string): string => `${PROMPT_VERSION}+${clave}`;

let estableCache: { clave: string; texto: string } | null = null;
export function estableCon(notas: NotaTool[], clave: string): string {
  if (estableCache?.clave === clave) return estableCache.texto;
  const texto = bloqueEstableCon(notas);
  estableCache = { clave, texto };
  return texto;
}

async function llamarSpec(e: EntradaWriter, extra: string | null, estable: string = BLOQUE_ESTABLE): Promise<{ input: Record<string, unknown>; usage: Uso } | { error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: estable, cache_control: { type: "ephemeral" } }],
      tools: [{ name: "emitir_spec", description: "Report the filled PromptSpec.", input_schema: SPEC_SCHEMA as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "emitir_spec" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: bloqueVariable(e) }, ...(extra ? [{ type: "text" as const, text: extra }] : [])],
        },
      ],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!bloque) return { error: "H.Ü.E no respondió bien. Inténtalo otra vez." };
    return { input: bloque.input as Record<string, unknown>, usage: usoDe(res) };
  } catch (err) {
    console.error("[prisma] llamarSpec:", err instanceof Error ? err.message : err);
    return { error: "H.Ü.E no respondió. Inténtalo otra vez." };
  }
}

/** Escribe el spec, compila, valida y repara UNA vez si hace falta. */
export async function escribirSpec(e: EntradaWriter, estable: string = BLOQUE_ESTABLE): Promise<ResultadoWriter> {
  const r1 = await llamarSpec(e, null, estable);
  if ("error" in r1) return { ok: false, error: r1.error };
  let spec = specDesde(r1.input, e);
  let salida = compilar(spec);
  let v = validar(salida.texto, spec);
  let usage = r1.usage;
  let reparado = false;

  if (!v.ok) {
    const r2 = await llamarSpec(e, bloqueReparacion(v.errores, JSON.stringify(r1.input)), estable);
    if (!("error" in r2)) {
      const spec2 = specDesde(r2.input, e);
      const salida2 = compilar(spec2);
      const v2 = validar(salida2.texto, spec2);
      usage = sumar(usage, r2.usage);
      // Nos quedamos con la versión con MENOS errores (la reparación no debe empeorar).
      const e1 = v.ok ? 0 : v.errores.length;
      const e2 = v2.ok ? 0 : v2.errores.length;
      if (e2 <= e1) {
        spec = spec2;
        salida = salida2;
        v = v2;
        reparado = true;
      }
    }
  }
  return { ok: true, spec, salida, valido: v.ok, errores: v.ok ? [] : v.errores, usage, reparado };
}

/** Aplica un cambio pedido por el diseñador sobre un spec existente (cambia SÓLO eso). */
export async function refinarSpec(e: EntradaWriter, specActual: PromptSpec, cambio: string, estable: string = BLOQUE_ESTABLE): Promise<ResultadoWriter> {
  const r = await llamarSpec(e, bloqueRefinar(JSON.stringify(specActual), cambio), estable);
  if ("error" in r) return { ok: false, error: r.error };
  const spec = specDesde(r.input, e);
  const salida = compilar(spec);
  const v = validar(salida.texto, spec);
  return { ok: true, spec, salida, valido: v.ok, errores: v.ok ? [] : v.errores, usage: r.usage, reparado: false };
}

/** Otra versión del spec, bajo demanda (segura / audaz / mínima). Una llamada, sólo si se pide. */
export async function variarSpec(e: EntradaWriter, specActual: PromptSpec, variante: Exclude<PrismaVariante, "base">, estable: string = BLOQUE_ESTABLE): Promise<ResultadoWriter> {
  const r = await llamarSpec(e, bloqueVariante(JSON.stringify(specActual), variante), estable);
  if ("error" in r) return { ok: false, error: r.error };
  const spec = specDesde(r.input, e);
  const salida = compilar(spec);
  const v = validar(salida.texto, spec);
  return { ok: true, spec, salida, valido: v.ok, errores: v.ok ? [] : v.errores, usage: r.usage, reparado: false };
}

/** Recompila el mismo spec a otra herramienta (sin modelo). */
/**
 * El juicio de H.Ü.E sobre un spec ya compilado: hasta 3 avisos que una regla mecánica no ve.
 * Saneo a la vuelta: cada texto en una línea y con tope, nivel del enum, código como slug con
 * prefijo "hue_"; un aviso mal formado se descarta (no la lista). Nunca lanza.
 */
export async function juzgarSpec(e: EntradaWriter, spec: PromptSpec, salida: string): Promise<{ avisos: Aviso[]; usage: Uso | null }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      // 3 avisos × 8 campos cortos caben de sobra; con 900 el modelo se quedaba a medias y no
      // llegaba a cerrar el tool_use (smoke 2026-09-11) → lista vacía sin error visible.
      max_tokens: 1600,
      thinking: { type: "disabled" },
      tools: [{ name: "emitir_avisos", description: "Report the judgment-only warnings.", input_schema: AVISOS_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "emitir_avisos" },
      messages: [{ role: "user", content: bloqueJuicio(e, JSON.stringify(spec), salida) }],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!bloque || res.stop_reason === "max_tokens") console.warn(`[prisma] juzgarSpec: ${bloque ? "cortado por max_tokens" : "sin tool_use"} (stop_reason=${res.stop_reason})`);
    const lista = Array.isArray((bloque?.input as { avisos?: unknown } | undefined)?.avisos) ? ((bloque!.input as { avisos: unknown[] }).avisos) : [];
    const corto = (v: unknown, max = 240): string => (typeof v === "string" ? plano(v).slice(0, max) : "");
    const avisos: Aviso[] = [];
    for (const raw of lista.slice(0, 3)) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const codigo = "hue_" + corto(o.codigo, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const nivel = o.nivel === "advierte" || o.nivel === "sugiere" ? o.nivel : null;
      const que_es = corto(o.que_es);
      const que_en = corto(o.que_en);
      if (!nivel || codigo === "hue_" || !que_es || !que_en || avisos.some((a) => a.codigo === codigo)) continue;
      const porque_es = corto(o.porque_es);
      const porque_en = corto(o.porque_en);
      const arreglo_es = corto(o.arreglo_es);
      const arreglo_en = corto(o.arreglo_en);
      avisos.push({ codigo, nivel, que: { es: que_es, en: que_en }, porque: porque_es || porque_en ? { es: porque_es || porque_en, en: porque_en || porque_es } : null, arreglo: arreglo_es || arreglo_en ? { es: arreglo_es || arreglo_en, en: arreglo_en || arreglo_es } : null, accion: null, fuente: null });
    }
    return { avisos, usage: usoDe(res) };
  } catch (err) {
    console.error("[prisma] juzgarSpec:", err instanceof Error ? err.message : err);
    return { avisos: [], usage: null };
  }
}

/** Corrección de ortografía y gramática de un texto corto, en su idioma. Devuelve el texto
 *  corregido (saneado: una línea, con tope) y los cambios; sin cambios = igual al original. */
export async function revisarTexto(texto: string, idioma: Idioma, campo: "texto" | "dialogo", max = 200): Promise<{ ok: true; corregido: string; cambios: Cambio[]; usage: Uso } | { ok: false; error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      thinking: { type: "disabled" },
      tools: [{ name: "emitir_correccion", description: "Report the corrected text.", input_schema: CORRECCION_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "emitir_correccion" },
      messages: [{ role: "user", content: bloqueCorreccion(texto, idioma, campo) }],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const o = (bloque?.input ?? {}) as Record<string, unknown>;
    const corregido = typeof o.corregido === "string" ? plano(o.corregido).slice(0, max) : "";
    if (!corregido) return { ok: false, error: "H.Ü.E no pudo revisarlo. Inténtalo otra vez." };
    const cambios: Cambio[] = [];
    for (const c of Array.isArray(o.cambios) ? o.cambios.slice(0, 6) : []) {
      if (!c || typeof c !== "object") continue;
      const x = c as Record<string, unknown>;
      const de = typeof x.de === "string" ? plano(x.de).slice(0, 80) : "";
      const a = typeof x.a === "string" ? plano(x.a).slice(0, 80) : "";
      if (!de || !a || de === a) continue;
      const es = typeof x.motivo_es === "string" ? plano(x.motivo_es).slice(0, 60) : "";
      const en = typeof x.motivo_en === "string" ? plano(x.motivo_en).slice(0, 60) : "";
      cambios.push({ de, a, motivo: { es: es || en || "corrección", en: en || es || "correction" } });
    }
    // El modelo vio el texto cercado (sin < >): se compara contra esa misma base, si no un
    // "OFERTA <3" saldría siempre "corregido".
    const igual = corregido === cercado(texto);
    return { ok: true, corregido: igual ? texto : corregido, cambios: igual ? [] : cambios, usage: usoDe(res) };
  } catch (err) {
    console.error("[prisma] revisarTexto:", err instanceof Error ? err.message : err);
    return { ok: false, error: "H.Ü.E no respondió. Inténtalo otra vez." };
  }
}

export function recompilar(spec: PromptSpec, tool: Tool): { salida: Salida; valido: boolean; errores: string[] } {
  const s = { ...spec, tool };
  const salida = compilar(s);
  const v = validar(salida.texto, s);
  return { salida, valido: v.ok, errores: v.ok ? [] : v.errores };
}

/** Explica el prompt al diseñador, en su idioma. Llamada barata, sin herramienta. */
export async function explicarPrompt(salida: string, tool: Tool, lang: "es" | "en"): Promise<{ ok: true; texto: string; usage: Uso } | { ok: false; error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: bloqueExplicar(salida, tool, lang) }],
    });
    const texto = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!texto) return { ok: false, error: "H.Ü.E no pudo explicarlo. Inténtalo otra vez." };
    return { ok: true, texto, usage: usoDe(res) };
  } catch (err) {
    console.error("[prisma] explicarPrompt:", err instanceof Error ? err.message : err);
    return { ok: false, error: "H.Ü.E no respondió. Inténtalo otra vez." };
  }
}

export { PROMPT_VERSION };

/** Describe un personaje/producto guardado en inglés (una vez, al guardarlo). Llamada
 *  barata, sin herramienta; el diseñador la revisa antes de guardar (actions). */
export async function describirPersonajeIA(e: EntradaPersonaje): Promise<{ ok: true; texto: string; usage: Uso } | { ok: false; error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: bloqueDescribirPersonaje(e) }],
    });
    const texto = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
      .replace(/^["“]|["”]$/g, "");
    if (!texto) return { ok: false, error: "H.Ü.E no pudo describirlo. Inténtalo otra vez." };
    return { ok: true, texto, usage: usoDe(res) };
  } catch (err) {
    console.error("[prisma] describirPersonajeIA:", err instanceof Error ? err.message : err);
    return { ok: false, error: "H.Ü.E no respondió. Inténtalo otra vez." };
  }
}
