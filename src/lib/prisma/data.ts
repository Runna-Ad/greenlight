import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PrismaCharacterRow, PrismaPromptRow, PrismaSpecRow } from "@/lib/database.types";
import type { MarcaPreset } from "@/lib/prisma/spec";
import { presetDeMarca } from "@/lib/prisma/preset";
import type { JobType } from "@/lib/prisma/spec";
import { resumirAprendizaje, type Aprendizaje, type EventoRow, type PromptCandidato, type Voto } from "@/lib/prisma/aprendizaje";

/**
 * HÜE Prisma — lecturas de servidor (marcas con preset, personajes, historial, URLs
 * firmadas). Todo por service_role (la app es el servidor de confianza) y filtrado por
 * lo que el rol puede ver: el historial es POR AUTOR salvo para lead/admin/master.
 */

export const BUCKET = "greenlight-referencias";

type Db = ReturnType<typeof supabaseAdmin>;

export type MarcaConPreset = {
  id: string;
  name: string;
  slug: string;
  client_id: string;
  client_name: string;
  client_slug: string;
  preset: MarcaPreset;
};

/** Todas las marcas activas con su preset (para el selector "Marca"). */
export async function cargarMarcas(db: Db): Promise<MarcaConPreset[]> {
  type Fila = { id: string; name: string; slug: string; client_id: string; prisma_presets?: unknown; clients: { name: string; slug: string; brand_color: string | null; active: boolean } };
  const base = "id, name, slug, client_id, clients!inner(name, slug, brand_color, active)";
  let res = await db.from("marcas").select(`${base.replace("client_id,", "client_id, prisma_presets,")}`).eq("active", true).order("name").returns<Fila[]>();
  // Antes de aplicar la 0063 la columna prisma_presets no existe: en vez de dejar el
  // selector vacío en silencio, se re-consulta sin ella (preset = color de marca) y se
  // deja constancia en el log del servidor.
  if (res.error && /prisma_presets/.test(res.error.message)) {
    console.warn("[prisma] marcas.prisma_presets no existe todavía (falta la migración 0063); usando color de marca.");
    res = await db.from("marcas").select(base).eq("active", true).order("name").returns<Fila[]>();
  }
  if (res.error) {
    console.error("[prisma] cargarMarcas:", res.error.message);
    return [];
  }
  const data = res.data;
  return (data ?? [])
    .filter((m) => m.clients?.active !== false)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      client_id: m.client_id,
      client_name: m.clients.name,
      client_slug: m.clients.slug,
      // La MISMA normalización que usa el Admin al guardar (lib/prisma/preset.ts).
      preset: presetDeMarca(`${m.clients.name} ${m.name}`.trim(), m.prisma_presets, m.clients.brand_color),
    }));
}

/** Personajes/productos guardados (activos) de un cliente, o de todos. */
export async function cargarPersonajes(db: Db, clientId: string | null): Promise<PrismaCharacterRow[]> {
  let q = db.from("prisma_characters").select("*").eq("active", true).order("name");
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q.returns<PrismaCharacterRow[]>();
  return data ?? [];
}

export type ItemHistorial = {
  spec: PrismaSpecRow;
  prompt: PrismaPromptRow | null; // el más reciente
  thumb: string | null; // URL firmada de la primera referencia
};

/** Historial: los specs del autor (o de todos si `todos`), con su último prompt y un thumb. */
export async function cargarHistorial(db: Db, autorId: string | null, todos: boolean, limite = 30): Promise<ItemHistorial[]> {
  let q = db.from("prisma_specs").select("*").order("created_at", { ascending: false }).limit(limite);
  if (!todos) {
    if (!autorId) return [];
    q = q.eq("created_by", autorId);
  }
  const { data: specs } = await q.returns<PrismaSpecRow[]>();
  if (!specs?.length) return [];

  const ids = specs.map((s) => s.id);
  const { data: prompts } = await db
    .from("prisma_prompts")
    .select("*")
    .in("spec_id", ids)
    .order("created_at", { ascending: false })
    .returns<PrismaPromptRow[]>();
  const ultimo = new Map<string, PrismaPromptRow>();
  for (const p of prompts ?? []) if (!ultimo.has(p.spec_id)) ultimo.set(p.spec_id, p);

  const paths = [...new Set(specs.map((s) => s.refs?.[0]?.storage_path).filter((p): p is string => !!p))];
  const urls = await firmar(db, paths);
  return specs.map((s) => ({ spec: s, prompt: ultimo.get(s.id) ?? null, thumb: s.refs?.[0]?.storage_path ? urls.get(s.refs[0].storage_path) ?? null : null }));
}

/** Días hacia atrás que H.Ü.E mira para aprender de una marca. */
const DIAS_APRENDIZAJE = 90;

/**
 * Lo aprendido de UN cliente para un trabajo: sus eventos recientes + sus prompts recientes
 * (con votos) → resumirAprendizaje (puro). Nunca lanza: si la tabla de eventos aún no existe
 * (antes de la 0066) o algo falla, se genera SIN aprendizaje y queda constancia en el log.
 *
 * DECISIÓN (Pedro, 2026-09-11): la memoria es POR MARCA, no por autor — "que H.Ü.E aprenda"
 * significa que lo que le sirvió a un diseñador de DiDi le sirve al siguiente. El historial
 * sí es por autor (lo que cada quien ve); aquí sólo viajan recortes al MODELO (cercados, como
 * referencia de estructura) y al diseñador se le enseña únicamente el CONTEO.
 */
export async function cargarAprendizaje(db: Db, clientId: string, job: JobType): Promise<Aprendizaje | null> {
  const desde = new Date(Date.now() - DIAS_APRENDIZAJE * 86400e3).toISOString();
  type Fila = { id: string; spec_id: string; tool: string; variante: string; salida: string; valido: boolean; prisma_specs: { client_id: string | null; job: string }; prisma_ratings: { prompt_id: string; score: number }[] | null };
  // Las dos consultas no dependen entre sí: en paralelo (está en el camino caliente de generar).
  const [ev, pr] = await Promise.all([
    db
      .from("prisma_eventos")
      .select("spec_id, prompt_id, job, tool, variante, tipo, detalle, created_at")
      .eq("client_id", clientId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<EventoRow[]>(),
    db
      .from("prisma_prompts")
      .select("id, spec_id, tool, variante, salida, valido, prisma_specs!inner(client_id, job), prisma_ratings(prompt_id, score)")
      .eq("prisma_specs.client_id", clientId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<Fila[]>(),
  ]);
  if (ev.error) {
    console.warn(`[prisma] aprendizaje sin eventos (¿falta la 0066?): ${ev.error.message}`);
    return null;
  }
  if (pr.error) {
    console.warn(`[prisma] aprendizaje sin prompts: ${pr.error.message}`);
    return null;
  }
  // El filtro por cliente se REPITE en JS: si el filtro embebido no aplicara, nunca entraría
  // un prompt de otro cliente como "ganador" de esta marca.
  const filas = (pr.data ?? []).filter((f) => f.prisma_specs?.client_id === clientId);
  const prompts: PromptCandidato[] = filas.map((f) => ({ id: f.id, spec_id: f.spec_id, job: f.prisma_specs.job, tool: f.tool, variante: f.variante, salida: f.salida, valido: f.valido }));
  const votos: Voto[] = filas.flatMap((f) => f.prisma_ratings ?? []);
  return resumirAprendizaje(job, ev.data ?? [], prompts, votos);
}

/** URLs firmadas en lote (bucket privado), 1 h. */
export async function firmar(db: Db, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
  return out;
}

/** Un spec con TODOS sus prompts (para reabrir desde el historial). */
export async function cargarSpec(db: Db, specId: string): Promise<{ spec: PrismaSpecRow; prompts: PrismaPromptRow[]; urls: Map<string, string> } | null> {
  const { data: spec } = await db.from("prisma_specs").select("*").eq("id", specId).maybeSingle<PrismaSpecRow>();
  if (!spec) return null;
  const { data: prompts } = await db.from("prisma_prompts").select("*").eq("spec_id", specId).order("created_at", { ascending: false }).returns<PrismaPromptRow[]>();
  const urls = await firmar(db, (spec.refs ?? []).map((r) => r.storage_path));
  return { spec, prompts: prompts ?? [], urls };
}
