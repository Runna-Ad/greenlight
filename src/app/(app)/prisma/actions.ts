"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canSee, canVerTodoPrisma, type ViewRole } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { prismaActivo } from "@/lib/prisma/flags";
import { MAX_BYTES, EXT_POR_MIME, sniffImageMime } from "@/lib/referencia";
import { analizarReferencia } from "@/lib/prisma/vision";
import { escribirSpec, refinarSpec, recompilar, explicarPrompt, MODEL, PROMPT_VERSION, type Uso } from "@/lib/prisma/writer";
import type { EntradaWriter } from "@/lib/prisma/prompts/writer";
import { BUCKET, cargarMarcas, cargarPersonajes, firmar } from "@/lib/prisma/data";
import { ASPECTS, DESTINOS, JOB_KIND, SORA_VIDEO_TYPES, TOOLS, esSpec, type Aspect, type Destino, type JobType, type PromptSpec, type RefRole, type Tool, type VisualDNA } from "@/lib/prisma/spec";
import { TOOLS_POR_JOB } from "@/lib/prisma/tools";
import type { PrismaPromptRow, PrismaSpecRow, PrismaRefGuardada } from "@/lib/database.types";
import type { Salida } from "@/lib/prisma/compilers";

type Fail = { ok: false; error: string };

/** Formatos que H.Ü.E puede MIRAR (Claude vision). AVIF se acepta en referencias de
 *  tareas pero aquí no: sin visión no hay ADN, y el ADN es la gracia. */
type MimeVision = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const MIMES_VISION: MimeVision[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ── Gate ─────────────────────────────────────────────────────
async function gate(): Promise<{ role: ViewRole; soyId: string } | Fail> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!prismaActivo()) return { ok: false, error: "HÜE Prisma todavía no está activo." };
  const role = await getViewAs();
  if (!canSee(role, "prisma")) return { ok: false, error: "Tu rol no tiene acceso a HÜE Prisma." };
  // Identidad OBLIGATORIA (estándar de la casa: task-scope.ts). Sin sesión, getViewAs
  // cae a 'creative' y pasaría el gate: eso dejaría llamadas a H.Ü.E (facturables) y
  // specs huérfanos (created_by null) a cualquiera que llegue al endpoint.
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para usar HÜE Prisma." };
  return { role, soyId };
}

/** Un error de base o de proveedor NO se le enseña crudo al diseñador (nombres de
 *  tablas, constraints): se registra en el servidor y sale un mensaje llano. */
function fallo(donde: string, detalle: string | undefined): Fail {
  console.error(`[prisma] ${donde}:`, detalle ?? "sin detalle");
  return { ok: false, error: "No se pudo guardar. Inténtalo otra vez y, si sigue fallando, avísale a Pedro." };
}

/** ¿Puede este usuario tocar este spec? Los suyos siempre; lead/admin/master, todos. */
function puedeTocar(row: PrismaSpecRow, g: { role: ViewRole; soyId: string }): boolean {
  if (canVerTodoPrisma(g.role)) return true;
  return row.created_by === g.soyId;
}

// ── 1) Subir + leer una referencia ──────────────────────────
export type RefAnalizada = {
  ok: true;
  storage_path: string;
  url: string;
  caption: string | null;
  dna: VisualDNA | null;
  /** Si la imagen subió pero H.Ü.E no pudo leerla, va el motivo (la referencia sirve igual). */
  aviso: string | null;
};

export async function analizarImagen(form: FormData): Promise<RefAnalizada | Fail> {
  const g = await gate();
  if ("ok" in g) return g;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No llegó ningún archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "La imagen pesa más de 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime || !(MIMES_VISION as string[]).includes(mime)) return { ok: false, error: "Sólo JPG, PNG, WebP o GIF." };

  const db = supabaseAdmin();
  const path = `prisma/${crypto.randomUUID()}.${EXT_POR_MIME[mime]}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return fallo("upload", up.error.message);

  const [urls, vision] = await Promise.all([
    firmar(db, [path]),
    analizarReferencia(Buffer.from(bytes).toString("base64"), mime as MimeVision),
  ]);
  const url = urls.get(path) ?? "";
  if (!vision.ok) return { ok: true, storage_path: path, url, caption: null, dna: null, aviso: vision.error };
  return { ok: true, storage_path: path, url, caption: vision.vision.caption, dna: vision.vision.dna, aviso: null };
}

// ── 2) Generar el prompt ─────────────────────────────────────
export type RefEntrada = { role: RefRole; storage_path: string; caption: string | null; dna: VisualDNA | null };

export type InputGenerar = {
  job: JobType;
  tool: Tool;
  idea: string;
  destino: Destino;
  aspect: Aspect;
  duracion: number | null;
  refs: RefEntrada[];
  look: { luz: string | null; movimiento: string | null; lente: string | null; mood: string | null; estilo: string | null };
  dialogo: { texto: string; idioma: string; voz: string | null } | null;
  marcaId: string | null;
  personajeId: string | null;
  videoType: string | null;
  /** Texto que debe verse en la pieza (campo propio del wizard). */
  texto: string | null;
};

export type ResultadoGenerar = {
  ok: true;
  specId: string;
  promptId: string;
  spec: PromptSpec;
  salida: Salida;
  valido: boolean;
  errores: string[];
  usage: Uso;
  reparado: boolean;
};

const ROLES_REF: RefRole[] = ["sujeto", "producto", "outfit", "pose", "escena", "objeto", "logo", "estilo", "empaque", "personaje2", "inicio", "fin"];

const s0 = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sn = (v: unknown, max = 400): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Sanea el ADN que viene del cliente (no se confía en él aunque lo haya escrito H.Ü.E). */
function dnaLimpio(v: unknown): VisualDNA | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const paleta = Array.isArray(o.paleta) ? o.paleta.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  const d: VisualDNA = { luz: s0(o.luz, 200), lente: s0(o.lente, 200), paleta, mood: s0(o.mood, 100), composicion: s0(o.composicion, 200), textura: s0(o.textura, 200) };
  return d.luz || d.lente || d.mood ? d : null;
}

/** Valida y normaliza la entrada del wizard. Fail-closed: nada se completa con un default
 *  silencioso si el valor viene mal (lección 2026-09-02, "default en write-path"). */
function normalizar(raw: InputGenerar): InputGenerar | Fail {
  if (!(raw.job in JOB_KIND)) return { ok: false, error: "Ese tipo de trabajo no existe." };
  if (!TOOLS.includes(raw.tool) || !TOOLS_POR_JOB[raw.job].includes(raw.tool)) return { ok: false, error: "Esa herramienta no sirve para este trabajo." };
  if (!ASPECTS.includes(raw.aspect)) return { ok: false, error: "Formato no válido." };
  if (!DESTINOS.includes(raw.destino)) return { ok: false, error: "Destino no válido." };
  const videoType = sn(raw.videoType, 60);
  if (videoType && !(SORA_VIDEO_TYPES as string[]).includes(videoType)) return { ok: false, error: "Tipo de video no válido." };
  const refs: RefEntrada[] = [];
  for (const r of raw.refs ?? []) {
    if (!ROLES_REF.includes(r.role)) return { ok: false, error: "Una de las referencias no es válida." };
    // Sólo la forma exacta que produce analizarImagen: nada de "prisma/../otro".
    if (typeof r.storage_path !== "string" || !/^prisma\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(r.storage_path)) return { ok: false, error: "Referencia inválida." };
    refs.push({ role: r.role, storage_path: r.storage_path, caption: sn(r.caption), dna: dnaLimpio(r.dna) });
  }
  if (refs.length > 4) return { ok: false, error: "Puedes subir hasta 4 referencias." };
  const dur = raw.duracion === null || raw.duracion === undefined ? null : Number(raw.duracion);
  if (dur !== null && (!Number.isFinite(dur) || dur < 1 || dur > 60)) return { ok: false, error: "Duración no válida." };
  return {
    job: raw.job,
    tool: raw.tool,
    idea: s0(raw.idea),
    destino: raw.destino,
    aspect: raw.aspect,
    duracion: dur,
    refs,
    look: {
      luz: sn(raw.look?.luz),
      movimiento: sn(raw.look?.movimiento),
      lente: sn(raw.look?.lente),
      mood: sn(raw.look?.mood),
      estilo: sn(raw.look?.estilo),
    },
    dialogo: raw.dialogo && s0(raw.dialogo.texto, 600) ? { texto: s0(raw.dialogo.texto, 600), idioma: s0(raw.dialogo.idioma, 12) || "es-MX", voz: sn(raw.dialogo.voz, 120) } : null,
    marcaId: sn(raw.marcaId, 64),
    personajeId: sn(raw.personajeId, 64),
    videoType,
    texto: sn(raw.texto, 200),
  };
}

async function entradaDe(inp: InputGenerar): Promise<{ entrada: EntradaWriter; clientId: string | null } | Fail> {
  const db = supabaseAdmin();
  let marca: EntradaWriter["marca"] = null;
  let clientId: string | null = null;
  if (inp.marcaId) {
    const m = (await cargarMarcas(db)).find((x) => x.id === inp.marcaId);
    if (!m) return { ok: false, error: "Esa marca ya no existe." };
    marca = m.preset;
    clientId = m.client_id;
  }
  let personaje: string | null = null;
  if (inp.personajeId) {
    // Un personaje pertenece a UN cliente: sin marca (→ sin cliente) no hay forma de
    // comprobar que sea suyo, así que no se acepta (no se cargan los de todos).
    if (!clientId) return { ok: false, error: "Primero elige la marca para usar un personaje guardado." };
    const p = (await cargarPersonajes(db, clientId)).find((x) => x.id === inp.personajeId);
    if (!p) return { ok: false, error: "Ese personaje ya no existe." };
    personaje = p.descripcion;
  }
  return {
    clientId,
    entrada: {
      job: inp.job,
      tool: inp.tool,
      idea: inp.idea,
      destino: inp.destino,
      aspect: inp.aspect,
      duracion: inp.duracion,
      refs: inp.refs.map((r) => ({ role: r.role, caption: r.caption, dna: r.dna })),
      look: inp.look,
      dialogo: inp.dialogo,
      marca,
      personaje,
      videoType: inp.videoType,
      texto: inp.texto,
    },
  };
}

async function guardarPrompt(specId: string, tool: Tool, salida: Salida, valido: boolean, errores: string[], usage: Uso | null): Promise<string | Fail> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prisma_prompts")
    .insert({ spec_id: specId, tool, variante: "base", prompt_version: PROMPT_VERSION, salida: salida.texto, formato: salida.formato, valido, errores, model: usage ? MODEL : null, usage })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return fallo("prisma_prompts.insert", error?.message);
  return data.id;
}

export async function generarPrompt(raw: InputGenerar): Promise<ResultadoGenerar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const inp = normalizar(raw);
  if ("ok" in inp) return inp;
  const ent = await entradaDe(inp);
  if ("ok" in ent) return ent;

  const r = await escribirSpec(ent.entrada);
  if (!r.ok) return r;

  const db = supabaseAdmin();
  const refsGuardadas: PrismaRefGuardada[] = inp.refs.map((x) => ({ role: x.role, storage_path: x.storage_path, caption: x.caption, dna: x.dna as Record<string, unknown> | null }));
  const { data: specRow, error } = await db
    .from("prisma_specs")
    .insert({ client_id: ent.clientId, marca_id: inp.marcaId, job: inp.job, tool: inp.tool, destino: inp.destino, idea: inp.idea, spec: r.spec, refs: refsGuardadas, created_by: g.soyId })
    .select("id")
    .single<{ id: string }>();
  if (error || !specRow) return fallo("prisma_specs.insert", error?.message);

  const promptId = await guardarPrompt(specRow.id, inp.tool, r.salida, r.valido, r.errores, r.usage);
  if (typeof promptId !== "string") return promptId;

  return { ok: true, specId: specRow.id, promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, usage: r.usage, reparado: r.reparado };
}

// ── 3) Misma idea, otra herramienta (sin modelo) ─────────────
export type ResultadoRecompilar = { ok: true; promptId: string; salida: Salida; valido: boolean; errores: string[] };

async function specDeFila(specId: string, g: { role: ViewRole; soyId: string }): Promise<{ row: PrismaSpecRow; spec: PromptSpec } | Fail> {
  const db = supabaseAdmin();
  const { data: row } = await db.from("prisma_specs").select("*").eq("id", specId).maybeSingle<PrismaSpecRow>();
  if (!row) return { ok: false, error: "Ese prompt ya no existe." };
  if (!puedeTocar(row, g)) return { ok: false, error: "Ese prompt lo hizo otra persona; no lo puedes editar." };
  // El jsonb se valida en runtime: una fila con una forma vieja no debe llegar a compilar().
  if (!esSpec(row.spec)) return fallo("prisma_specs.spec", `forma incompatible en ${specId}`);
  return { row, spec: row.spec };
}

export async function cambiarHerramienta(specId: string, tool: Tool): Promise<ResultadoRecompilar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (!TOOLS.includes(tool)) return { ok: false, error: "Herramienta no válida." };
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  if (!TOOLS_POR_JOB[s.spec.job].includes(tool)) return { ok: false, error: "Esa herramienta no sirve para este trabajo." };

  const r = recompilar(s.spec, tool);
  const promptId = await guardarPrompt(specId, tool, r.salida, r.valido, r.errores, null);
  if (typeof promptId !== "string") return promptId;
  return { ok: true, promptId, salida: r.salida, valido: r.valido, errores: r.errores };
}

// ── 4) Refinar ("que sea de día") ────────────────────────────
export type ResultadoRefinar = { ok: true; promptId: string; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; usage: Uso };

export async function refinarPrompt(specId: string, cambio: string): Promise<ResultadoRefinar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const texto = s0(cambio, 600);
  if (!texto) return { ok: false, error: "Escribe qué quieres cambiar." };
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;

  const spec = s.spec;
  const entrada: EntradaWriter = {
    job: spec.job,
    tool: spec.tool,
    idea: spec.idea,
    destino: (s.row.destino as Destino | null) ?? "libre",
    aspect: spec.aspect,
    duracion: spec.duracion,
    refs: spec.refs,
    look: { luz: spec.luz || null, movimiento: spec.camara.movimiento, lente: spec.camara.lente, mood: spec.mood || null, estilo: spec.estilo || null },
    dialogo: spec.dialogo,
    marca: spec.marca,
    personaje: null,
    videoType: spec.video_type,
    texto: spec.texto?.contenido ?? null,
  };
  const r = await refinarSpec(entrada, spec, texto);
  if (!r.ok) return r;

  const db = supabaseAdmin();
  const { error } = await db.from("prisma_specs").update({ spec: r.spec }).eq("id", specId);
  if (error) return fallo("prisma_specs.update", error.message);
  const promptId = await guardarPrompt(specId, spec.tool, r.salida, r.valido, r.errores, r.usage);
  if (typeof promptId !== "string") return promptId;
  return { ok: true, promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, usage: r.usage };
}

// ── 5) Explicar (se genera una vez por idioma y se guarda) ───
export async function explicar(promptId: string, lang: "es" | "en"): Promise<{ ok: true; texto: string } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const db = supabaseAdmin();
  const { data: p } = await db.from("prisma_prompts").select("*").eq("id", promptId).maybeSingle<PrismaPromptRow>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  const s = await specDeFila(p.spec_id, g);
  if ("ok" in s) return s;

  // Cache por idioma dentro del mismo campo: "[es]\n…". Barato y sin otra columna.
  const tag = `[${lang}]\n`;
  if (p.explicacion?.startsWith(tag)) return { ok: true, texto: p.explicacion.slice(tag.length) };

  const r = await explicarPrompt(p.salida, p.tool as Tool, lang);
  if (!r.ok) return r;
  await db.from("prisma_prompts").update({ explicacion: tag + r.texto }).eq("id", promptId);
  return { ok: true, texto: r.texto };
}

// ── 5b) Reabrir desde el historial ───────────────────────────
export type ResultadoAbrir = { ok: true; promptId: string; tool: Tool; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[] };

export async function abrirSpec(specId: string): Promise<ResultadoAbrir | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  const db = supabaseAdmin();
  const { data: p } = await db
    .from("prisma_prompts")
    .select("*")
    .eq("spec_id", specId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PrismaPromptRow>();
  if (!p) return { ok: false, error: "Ese prompt no tiene texto guardado." };
  return { ok: true, promptId: p.id, tool: p.tool as Tool, spec: s.spec, salida: { texto: p.salida, formato: p.formato }, valido: p.valido, errores: p.errores ?? [] };
}

// ── 6) Calificar (pulgar arriba/abajo) ───────────────────────
export async function calificar(promptId: string, score: 1 | -1, nota?: string): Promise<{ ok: true } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (score !== 1 && score !== -1) return { ok: false, error: "Calificación no válida." };
  const db = supabaseAdmin();
  // Mismo cerco que el resto: sólo se califica un prompt que se puede tocar (IDOR).
  const { data: p } = await db.from("prisma_prompts").select("spec_id").eq("id", promptId).maybeSingle<{ spec_id: string }>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  const s = await specDeFila(p.spec_id, g);
  if ("ok" in s) return s;
  const { error } = await db
    .from("prisma_ratings")
    .upsert({ prompt_id: promptId, user_id: g.soyId, score, nota: sn(nota, 300) }, { onConflict: "prompt_id,user_id" });
  if (error) return fallo("prisma_ratings.upsert", error.message);
  return { ok: true };
}
