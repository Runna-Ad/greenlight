// Carga de referencias (imágenes + links de video) para las vistas que las
// muestran. Las imágenes viven en un bucket PRIVADO → se firma una URL por render
// (las páginas son dinámicas), nunca se expone el bucket. Compartido para no
// duplicar la lógica de firma entre la página interna y el portal del cliente.

import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { RefVista } from "@/components/tarea/referencias-plano";

type Db = ReturnType<typeof supabaseAdmin>;
type RefRow = {
  id: string;
  kind: "imagen" | "video";
  url: string;
  storage_path: string | null;
  thumbnail_url: string | null;
  platform: string | null;
};

/**
 * Firma en LOTE todas las imágenes (bucket privado) con UNA sola llamada
 * `createSignedUrls` en vez de una por imagen. Devuelve un mapa storage_path→URL.
 * (Antes: N round-trips de Storage por render, en cada carga de página interna y del
 * portal — reap perf.)
 */
async function firmarLote(db: Db, rows: RefRow[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const paths = [
    ...new Set(
      rows.filter((r) => r.kind === "imagen" && r.storage_path).map((r) => r.storage_path as string),
    ),
  ];
  if (!paths.length) return urls;
  const { data } = await db.storage.from("greenlight-referencias").createSignedUrls(paths, 60 * 60); // 1h
  for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  return urls;
}

/** RefRow → RefVista: link del video tal cual, imagen con su URL firmada del lote. */
function aVista(r: RefRow, urls: Map<string, string>): RefVista {
  const displayUrl =
    r.kind === "video" ? r.url : r.storage_path ? urls.get(r.storage_path) ?? null : null;
  return { id: r.id, kind: r.kind, displayUrl, thumbnail: r.thumbnail_url, platform: r.platform };
}

/** Referencias por plano (imágenes firmadas en lote + videos por link). */
export async function cargarRefsPorPlano(
  db: Db,
  planoIds: string[],
): Promise<Record<string, RefVista[]>> {
  const out: Record<string, RefVista[]> = {};
  if (!planoIds.length) return out;
  const { data } = await db
    .from("plano_references")
    .select("plano_id, position, references(id, kind, url, storage_path, thumbnail_url, platform)")
    .in("plano_id", planoIds)
    .order("position")
    .returns<{ plano_id: string; references: RefRow | null }[]>();
  const filas = (data ?? []).filter((v): v is { plano_id: string; references: RefRow } => !!v.references);
  const urls = await firmarLote(db, filas.map((v) => v.references));
  for (const v of filas) (out[v.plano_id] ??= []).push(aVista(v.references, urls));
  return out;
}

/** Referencias del estático (imágenes firmadas en lote). */
export async function cargarRefsEstatico(db: Db, estaticoId: string): Promise<RefVista[]> {
  const { data } = await db
    .from("estatico_references")
    .select("position, references(id, kind, url, storage_path, thumbnail_url, platform)")
    .eq("estatico_id", estaticoId)
    .order("position")
    .returns<{ references: RefRow | null }[]>();
  const refs = (data ?? []).map((v) => v.references).filter((r): r is RefRow => !!r);
  const urls = await firmarLote(db, refs);
  return refs.map((r) => aVista(r, urls));
}
