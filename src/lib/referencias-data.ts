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

/** Firma la URL de una imagen (bucket privado) o deja el link del video tal cual. */
async function firmar(db: Db, r: RefRow): Promise<RefVista> {
  let displayUrl: string | null = r.kind === "video" ? r.url : null;
  if (r.kind === "imagen" && r.storage_path) {
    const { data } = await db.storage
      .from("greenlight-referencias")
      .createSignedUrl(r.storage_path, 60 * 60); // 1h
    displayUrl = data?.signedUrl ?? null;
  }
  return { id: r.id, kind: r.kind, displayUrl, thumbnail: r.thumbnail_url, platform: r.platform };
}

/** Referencias por plano (imágenes firmadas + videos por link), firmadas en paralelo. */
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
  const firmados = await Promise.all(
    (data ?? []).map(async (v) => (v.references ? { plano_id: v.plano_id, ref: await firmar(db, v.references) } : null)),
  );
  for (const f of firmados) if (f) (out[f.plano_id] ??= []).push(f.ref);
  return out;
}

/** Referencias del estático, firmadas en paralelo. */
export async function cargarRefsEstatico(db: Db, estaticoId: string): Promise<RefVista[]> {
  const { data } = await db
    .from("estatico_references")
    .select("position, references(id, kind, url, storage_path, thumbnail_url, platform)")
    .eq("estatico_id", estaticoId)
    .order("position")
    .returns<{ references: RefRow | null }[]>();
  const firmados = await Promise.all(
    (data ?? []).map(async (v) => (v.references ? await firmar(db, v.references) : null)),
  );
  return firmados.filter((x): x is RefVista => !!x);
}
