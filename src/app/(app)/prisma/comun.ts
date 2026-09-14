import "server-only";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canSee, canVerTodoPrisma, type ViewRole } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { prismaActivo } from "@/lib/prisma/flags";
import { MAX_BYTES, EXT_POR_MIME, sniffImageMime } from "@/lib/referencia";
import { juzgarSpec, MODEL, PROMPT_VERSION, type MimeVision, type Uso } from "@/lib/prisma/writer";
import { compilarReglas, diagnosticar, type Aviso, type ReglaCompilada } from "@/lib/prisma/diagnostico";
import type { EntradaWriter } from "@/lib/prisma/prompts/writer";
import { plano, recortar } from "@/lib/prisma/texto";
import { BUCKET, cargarReglas, firmar } from "@/lib/prisma/data";
import { JOB_KIND, TOOLS, esDestino, esSpec, type PromptSpec, type Tool } from "@/lib/prisma/spec";
import { TOOLS_POR_JOB, herramientaVigente } from "@/lib/prisma/tools";
import type { PrismaEventoTipo, PrismaResultadoRow, PrismaSpecRow, PrismaVariante } from "@/lib/database.types";
import type { Salida } from "@/lib/prisma/compilers";
import { veredictoDe, type ResultadoVivo } from "@/lib/prisma/resultado";
import { faltaMigracion } from "@/lib/prisma/migracion";

export type { ResultadoVivo };
export { faltaMigracion };

/**
 * HÜE Prisma — lo que COMPARTEN las server actions (actions.ts y resultado-actions.ts): el gate,
 * el freno por identidad, los saneos, "¿puedo tocar esta fila?", leer/subir una imagen, guardar
 * un prompt, anotar un evento. UNA implementación de cada cosa: dos archivos que hicieran su
 * propio gate o su propia subida terminarían distintos (lección de paridad, 2026-08-27).
 * Módulo server-only SIN "use server": puede exportar tipos y constantes.
 */

export type Fail = { ok: false; error: string };
export type Sesion = { role: ViewRole; soyId: string };

/** Formatos que H.Ü.E puede MIRAR (Claude vision). AVIF se acepta en referencias de
 *  tareas pero aquí no: sin visión no hay ADN, y el ADN es la gracia. */
export const MIMES_VISION: MimeVision[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Lo que la API de visión acepta por imagen es 5 MB y el archivo viaja en base64 (×1.33): con 3.5 MB
 *  de archivo se queda debajo en cualquiera de las dos lecturas del límite. Por encima no hay
 *  comparación posible, y se dice ANTES de subir o pagar nada. */
export const MAX_BYTES_VISION = 3.5 * 1024 * 1024;
export const MAX_MB_VISION_TEXTO = "3.5 MB";

// ── Gate ─────────────────────────────────────────────────────
export async function gate(): Promise<Sesion | Fail> {
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
export function fallo(donde: string, detalle: string | undefined): Fail {
  console.error(`[prisma] ${donde}:`, detalle ?? "sin detalle");
  return { ok: false, error: "No se pudo guardar. Inténtalo otra vez y, si sigue fallando, avísale a Pedro." };
}


/** ¿Puede este usuario tocar esta fila (spec, personaje, resultado)? Lo suyo siempre; lead/admin/master, todo.
 *  UNA regla para todas las familias: si cada una decidiera por su cuenta, terminarían distintas. */
export function puedeTocar(row: { created_by: string | null }, g: Sesion): boolean {
  if (canVerTodoPrisma(g.role)) return true;
  return row.created_by === g.soyId;
}

/** Sólo la forma exacta que produce analizarImagen: nada de "prisma/../otro". La misma
 *  regla para las referencias de un prompt y para la foto de un personaje guardado. */
export const RUTA_REF = /^prisma\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
/** Un id de fila es un UUID o no es nada: se rechaza ANTES de preguntarle a la base. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CODIGO_AVISO = /^[a-z0-9_]{3,60}$/;

// ── Freno por identidad para lo que se COBRA (llamadas al modelo) ──
// Mismo patrón que `ipThrottled` en portal/login: ventana en memoria de la instancia. Una
// persona no genera 40 prompts en 10 minutos; un loop contra el endpoint sí. Best-effort
// (Fluid Compute reusa instancias, no las comparte todas), suficiente para cortar ráfagas.
const LLAMADAS_WINDOW_MS = 10 * 60_000;
const LLAMADAS_MAX = 40;
const cubos = new Map<string, Map<string, number[]>>();
/** Freno por identidad y por "cubo": lo facturable comparte uno (40 / 10 min); la revisión
 *  ortográfica (se dispara al salir de un campo) tiene el suyo, para que tabular por el
 *  formulario nunca gaste el cupo de generar. */
export function saturado(soyId: string, nowMs = Date.now(), cubo = "modelo", tope = LLAMADAS_MAX): boolean {
  const llamadas = cubos.get(cubo) ?? new Map<string, number[]>();
  cubos.set(cubo, llamadas);
  const recientes = (llamadas.get(soyId) ?? []).filter((t) => nowMs - t < LLAMADAS_WINDOW_MS);
  recientes.push(nowMs);
  llamadas.set(soyId, recientes);
  if (llamadas.size > 2000) for (const [k, v] of llamadas) if (v.every((t) => nowMs - t >= LLAMADAS_WINDOW_MS)) llamadas.delete(k);
  return recientes.length > tope;
}
export const FRENO: Fail = { ok: false, error: "Muchas llamadas a H.Ü.E en poco tiempo. Espera unos minutos." };

// Todo texto que viene del cliente sale de aquí en UNA línea y sin caracteres de control
// (plano): la regla de la casa se cumple en el saneo, no en cada sitio que lo usa.
export const s0 = (v: unknown, max = 2000): string => (typeof v === "string" ? recortar(plano(v), max) : "");
export const sn = (v: unknown, max = 400): string | null => {
  const p = typeof v === "string" ? recortar(plano(v), max) : "";
  return p || null;
};

// ── Imágenes: leer del form (por bytes, nunca por nombre) y subir al bucket privado ──
/** El archivo del form → bytes + mime real. Fail-closed: sólo lo que H.Ü.E puede mirar. */
export async function leerImagen(form: FormData, maxBytes = MAX_BYTES, mensajePeso = "La imagen pesa más de 10 MB."): Promise<{ bytes: Uint8Array; mime: MimeVision } | Fail> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No llegó ningún archivo." };
  if (file.size > maxBytes) return { ok: false, error: mensajePeso };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime || !(MIMES_VISION as string[]).includes(mime)) return { ok: false, error: "Sólo JPG, PNG, WebP o GIF." };
  return { bytes, mime: mime as MimeVision };
}

/** Sube al bucket privado bajo la carpeta dada, con nombre aleatorio (nunca el del cliente). */
export async function subirAlBucket(db: ReturnType<typeof supabaseAdmin>, carpeta: "prisma" | "prisma/out", bytes: Uint8Array, mime: MimeVision): Promise<string | Fail> {
  const path = `${carpeta}/${crypto.randomUUID()}.${EXT_POR_MIME[mime]}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return fallo("upload", up.error.message);
  return path;
}

// ── Prompts, reglas, diagnóstico, eventos ──
export async function guardarPrompt(specId: string, tool: Tool, salida: Salida, valido: boolean, errores: string[], usage: Uso | null, variante: PrismaVariante = "base", version: string = PROMPT_VERSION, modeloSug: string | null = null, avisos: Aviso[] = []): Promise<string | Fail> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prisma_prompts")
    .insert({ spec_id: specId, tool, variante, prompt_version: version, salida: salida.texto, formato: salida.formato, valido, errores, model: usage ? MODEL : null, usage, modelo_sug: modeloSug, avisos })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return fallo("prisma_prompts.insert", error?.message);
  return data.id;
}

/** Las reglas de la BD (clase "regla"), compiladas; las malas se descartan con aviso en el log. */
export const reglasDe = (r: Awaited<ReturnType<typeof cargarReglas>>): ReglaCompilada[] => compilarReglas(r.filas.filter((f) => f.clase === "regla"));

/** El diagnóstico del resultado: reglas + validador + (en video, siempre) el juicio de H.Ü.E.
 *  `entrada` sólo hace falta para el juicio; null = sin juicio (cambiar de herramienta, abrir). */
export async function diagnosticoDe(spec: PromptSpec, tool: Tool, salida: Salida, errores: string[], reglas: ReglaCompilada[], entrada: EntradaWriter | null): Promise<Aviso[]> {
  const base = diagnosticar(spec, tool, salida.texto, errores, reglas);
  if (!entrada || JOB_KIND[spec.job] !== "video") return base;
  const { avisos } = await juzgarSpec(entrada, spec, salida.texto);
  const codigos = new Set(base.map((a) => a.codigo));
  return [...base, ...avisos.filter((a) => !codigos.has(a.codigo))];
}

/** Registra lo que el diseñador HIZO (0066) — la señal con la que H.Ü.E aprende. Nunca
 *  bloquea: si la tabla aún no existe o falla el insert, queda en el log y la acción sigue. */
export async function anotarEvento(db: ReturnType<typeof supabaseAdmin>, e: { spec_id: string; prompt_id: string | null; client_id: string | null; job: string; tool: string; variante: PrismaVariante; user_id: string; tipo: PrismaEventoTipo; detalle: string | null }): Promise<void> {
  // Índice único (prompt, quién, tipo) — desde la 0067 es PARCIAL (sólo copiado/abierto), y
  // Postgres no infiere un índice parcial en ON CONFLICT sin su WHERE, cosa que PostgREST no
  // puede mandar: un upsert fallaría para TODOS los tipos. Insert llano y el duplicado
  // (23505) cuenta como "ya estaba": el mismo click repetido no suma señal.
  const { error } = await db.from("prisma_eventos").insert(e);
  if (error && error.code !== "23505") console.warn(`[prisma] evento ${e.tipo} no registrado (¿falta la 0066?): ${error.message}`);
}

/** Herramienta y versión del ÚLTIMO prompt de un spec. `cambiarHerramienta` no toca el spec
 *  (recompila y guarda otro prompt), así que "la herramienta actual" vive en el último prompt:
 *  refinar o pedir otra versión después de cambiar de herramienta debe seguir en ESA
 *  herramienta, y un spec nacido como "versión audaz" sigue siendo audaz al refinarlo. */
export async function estadoActual(db: ReturnType<typeof supabaseAdmin>, s: { row: PrismaSpecRow; spec: PromptSpec }): Promise<{ tool: Tool; variante: PrismaVariante }> {
  const { data } = await db.from("prisma_prompts").select("tool, variante").eq("spec_id", s.row.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ tool: string; variante: PrismaVariante }>();
  const tool = (data && herramientaVigente(data.tool, s.spec.job)) ?? s.spec.tool;
  return { tool, variante: data?.variante ?? "base" };
}

export type SpecCargado = { row: PrismaSpecRow; spec: PromptSpec; historica: string | null };

export async function specDeFila(specId: string, g: Sesion): Promise<SpecCargado | Fail> {
  if (!UUID.test(specId)) return { ok: false, error: "Ese prompt ya no existe." };
  const db = supabaseAdmin();
  const { data: row } = await db.from("prisma_specs").select("*").eq("id", specId).maybeSingle<PrismaSpecRow>();
  if (!row) return { ok: false, error: "Ese prompt ya no existe." };
  if (!puedeTocar(row, g)) return { ok: false, error: "Ese prompt lo hizo otra persona; no lo puedes editar." };
  // El jsonb se valida en runtime: una fila con una forma vieja no debe llegar a compilar().
  if (!esSpec(row.spec)) return fallo("prisma_specs.spec", `forma incompatible en ${specId}`);
  // Herramienta retirada (Sora 2): la fila se lee con su sucesora. Nada se reescribe en la
  // BD; el siguiente prompt que se guarde ya va con la herramienta nueva.
  const historica = (TOOLS as string[]).includes(row.spec.tool) ? null : (row.spec.tool as string);
  // Los specs de antes de F1 no traen destino dentro del jsonb: se toma de la fila.
  const conDestino: PromptSpec = { ...row.spec, destino: esDestino(row.spec.destino) ? row.spec.destino : esDestino(row.destino) ? row.destino : null };
  const spec = historica ? { ...conDestino, tool: herramientaVigente(historica, row.spec.job) ?? TOOLS_POR_JOB[row.spec.job][0] } : conDestino;
  return { row, spec, historica };
}

/** La entrada del writer reconstruida desde un spec guardado (refinar / otra versión). */
export function entradaDesdeSpec(s: { row: PrismaSpecRow; spec: PromptSpec }): EntradaWriter {
  const spec = s.spec;
  return {
    job: spec.job,
    tool: spec.tool,
    idea: spec.idea,
    destino: spec.destino ?? (esDestino(s.row.destino) ? s.row.destino : "libre"),
    aspect: spec.aspect,
    duracion: spec.duracion,
    refs: spec.refs,
    look: { luz: spec.luz || null, movimiento: spec.camara.movimiento, lente: spec.camara.lente, mood: spec.mood || null, estilo: spec.estilo || null },
    dialogo: spec.dialogo,
    marca: spec.marca,
    personaje: null,
    videoType: spec.video_type,
    texto: spec.texto?.contenido ?? null,
    aprendizaje: null, // refinar / otra versión: cambian SÓLO lo pedido; los ejemplares distraerían
  };
}

// ── F4: un resultado subido, como lo ve la UI ──
export async function resultadoVivoDe(db: ReturnType<typeof supabaseAdmin>, row: PrismaResultadoRow, job: PromptSpec["job"]): Promise<ResultadoVivo> {
  const urls = await firmar(db, [row.storage_path]);
  const veredicto = veredictoDe(row.veredicto);
  return {
    id: row.id,
    promptId: row.prompt_id,
    url: urls.get(row.storage_path) ?? "",
    modelo: row.modelo,
    veredicto,
    score: row.score,
    aceptado: row.aceptado,
    // Un cuadro de video no se edita con un prompt de imagen: ahí sólo cabe refinar el original.
    corregible: !!veredicto.correccion && JOB_KIND[job] !== "video",
  };
}

/** El último resultado subido para un prompt (para reabrir desde el historial), o null. Nunca
 *  lanza: antes de la 0070 la tabla no existe y el prompt se abre igual. */
export async function ultimoResultadoDe(db: ReturnType<typeof supabaseAdmin>, promptId: string, job: PromptSpec["job"]): Promise<ResultadoVivo | null> {
  const { data, error } = await db.from("prisma_resultados").select("*").eq("prompt_id", promptId).order("created_at", { ascending: false }).limit(1).maybeSingle<PrismaResultadoRow>();
  if (error) {
    console.warn(`[prisma] resultados no disponibles (¿falta la 0070?): ${error.message}`);
    return null;
  }
  return data ? resultadoVivoDe(db, data, job) : null;
}
