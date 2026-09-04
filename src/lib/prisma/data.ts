import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PrismaCharacterRow, PrismaPromptRow, PrismaSpecRow } from "@/lib/database.types";
import type { MarcaPreset, Aspect } from "@/lib/prisma/spec";
import { ASPECTS } from "@/lib/prisma/spec";

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

/** Convierte marcas.prisma_presets (jsonb libre) a un MarcaPreset seguro. Sin preset,
 *  se siembra con el color de marca del cliente: mejor un mínimo real que nada. */
function presetDe(name: string, raw: unknown, brandColor: string | null): MarcaPreset {
  const o = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const paleta = arr(o.paleta);
  const aspect = typeof o.aspect_default === "string" && (ASPECTS as string[]).includes(o.aspect_default) ? (o.aspect_default as Aspect) : null;
  return {
    nombre: name,
    paleta: paleta.length ? paleta : brandColor ? [brandColor] : [],
    tono: typeof o.tono === "string" ? o.tono : "",
    evitar: arr(o.evitar),
    aspect_default: aspect,
  };
}

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
      preset: presetDe(`${m.clients.name} ${m.name}`.trim(), m.prisma_presets, m.clients.brand_color),
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
