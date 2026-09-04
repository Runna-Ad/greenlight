import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { specVacio, type PromptSpec, type Beat, type Camara, type Dialogo, type SoraVideoType, type Tool } from "@/lib/prisma/spec";
import { SORA_VIDEO_TYPES } from "@/lib/prisma/spec";
import { compilar, type Salida } from "@/lib/prisma/compilers";
import { validar } from "@/lib/prisma/validators";
import { PRESETS_HIGGSFIELD } from "@/lib/prisma/compilers/higgsfield";
import { BLOQUE_ESTABLE, bloqueVariable, bloqueReparacion, bloqueRefinar, bloqueExplicar, PROMPT_VERSION, type EntradaWriter } from "@/lib/prisma/prompts/writer";

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
    video_type: { type: ["string", "null"], enum: [...SORA_VIDEO_TYPES, null] },
    preset: { type: ["string", "null"], enum: [...PRESETS_HIGGSFIELD, null] },
    dialogo_voz: { type: ["string", "null"], description: "Voice description for the dialogue, if any." },
  },
  required: ["sujeto", "accion", "entorno", "camara", "luz", "mood", "estilo", "paleta", "texturas", "negativos", "preservar", "beats", "video_type", "preset", "dialogo_voz"],
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
    video_type: (SORA_VIDEO_TYPES as string[]).includes(vt ?? "") ? (vt as SoraVideoType) : e.videoType && (SORA_VIDEO_TYPES as string[]).includes(e.videoType) ? (e.videoType as SoraVideoType) : null,
    preset: sn(input.preset),
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
async function llamarSpec(e: EntradaWriter, extra: string | null): Promise<{ input: Record<string, unknown>; usage: Uso } | { error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: BLOQUE_ESTABLE, cache_control: { type: "ephemeral" } }],
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
    if (!bloque) return { error: "H.Ü.E no devolvió el spec. Intenta de nuevo." };
    return { input: bloque.input as Record<string, unknown>, usage: usoDe(res) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al llamar a H.Ü.E." };
  }
}

/** Escribe el spec, compila, valida y repara UNA vez si hace falta. */
export async function escribirSpec(e: EntradaWriter): Promise<ResultadoWriter> {
  const r1 = await llamarSpec(e, null);
  if ("error" in r1) return { ok: false, error: r1.error };
  let spec = specDesde(r1.input, e);
  let salida = compilar(spec);
  let v = validar(salida.texto, spec);
  let usage = r1.usage;
  let reparado = false;

  if (!v.ok) {
    const r2 = await llamarSpec(e, bloqueReparacion(v.errores, JSON.stringify(r1.input)));
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
export async function refinarSpec(e: EntradaWriter, specActual: PromptSpec, cambio: string): Promise<ResultadoWriter> {
  const r = await llamarSpec(e, bloqueRefinar(JSON.stringify(specActual), cambio));
  if ("error" in r) return { ok: false, error: r.error };
  const spec = specDesde(r.input, e);
  const salida = compilar(spec);
  const v = validar(salida.texto, spec);
  return { ok: true, spec, salida, valido: v.ok, errores: v.ok ? [] : v.errores, usage: r.usage, reparado: false };
}

/** Recompila el mismo spec a otra herramienta (sin modelo). */
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
    if (!texto) return { ok: false, error: "H.Ü.E no devolvió la explicación." };
    return { ok: true, texto, usage: usoDe(res) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al llamar a H.Ü.E." };
  }
}

export { PROMPT_VERSION };
