import "server-only";
import type { supabaseAdmin } from "@/lib/supabase-admin";
type Db = ReturnType<typeof supabaseAdmin>;
import { fetchLegalesFromNotion, fetchTree } from "@/lib/notion-legales";
import { PAGINAS_MARCA, llaveNotion, renderNotion } from "@/lib/notion-render";

export type SyncLegalesResultado =
  | {
      ok: true;
      nuevos: number;
      actualizados: number;
      desactivados: number;
      sinMarca: string[];
      /** Páginas de marca (Onboarding / Lineamientos) que H.Ü.E lee, actualizadas. */
      paginas: number;
      /** Páginas que no se pudieron leer (la conexión no las ve, Notion caído…). */
      paginasConError: string[];
    }
  | { ok: false; error: string };

/**
 * Sincroniza desde Notion (fuente de verdad):
 *  1. LEGALES → snippets (kind='legal'), upsert por `notion_block_id`; uno que ya no está en
 *     el doc se DESACTIVA (no se borra). Los creados a mano nunca se tocan.
 *  2. PÁGINAS DE MARCA (Onboarding y Lineamientos de Card y Préstamos) → hue_kb_documents,
 *     una fila por página (llave `notion:<tipo>:<id>` en storage_path), reemplazando su texto.
 *     Así H.Ü.E escribe y revisa con los selling points y cifras de HOY (Pedro, 2026-11-06).
 * Sin permisos: quien llama ya validó (admin en el botón, secreto en el reloj).
 */
export async function sincronizarNotion(db: Db): Promise<SyncLegalesResultado> {
  let parsed: Awaited<ReturnType<typeof fetchLegalesFromNotion>>;
  try {
    parsed = await fetchLegalesFromNotion();
  } catch (e) {
    return { ok: false, error: `No se pudo leer Notion: ${e instanceof Error ? e.message : String(e)}` };
  }

  
  // Resolver marca_id + client_id por slug (card / prestamos).
  const slugs = [...new Set(parsed.legales.map((l) => l.marcaSlug))];
  const { data: marcaRows } = await db
    .from("marcas").select("id, slug, client_id").in("slug", slugs);
  const marcaBySlug = new Map(
    ((marcaRows ?? []) as { id: string; slug: string; client_id: string }[]).map((m) => [m.slug, m]),
  );

  // Construir filas; un legal cuya marca no exista en la DB se reporta, no se pierde en silencio.
  const sinMarca: string[] = [];
  const filas = parsed.legales
    .map((l) => {
      const marca = marcaBySlug.get(l.marcaSlug);
      if (!marca) {
        sinMarca.push(`${l.marcaSlug}: ${l.title}`);
        return null;
      }
      return {
        kind: "legal" as const,
        title: l.title,
        body: l.body,
        marca_id: marca.id,
        // INVARIANTE: una fila scope='marca' guarda client_id = NULL. Si llevara el
        // client_id de la marca, el filtro OR del writer (`client_id.eq.<cliente>`)
        // la pescaría para OTRA marca del MISMO cliente (Card → Préstamos). Espeja
        // cómo hue_instructions/hue_kb_documents guardan las filas de marca. (reap 2026-08-26)
        client_id: null,
        scope: "marca",
        active: true,
        notion_block_id: l.blockId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (filas.length === 0) {
    return { ok: false, error: "Notion no devolvió legales con marca reconocible." };
  }

  const blockIds = filas.map((f) => f.notion_block_id);

  // ¿Cuáles ya existían? (para reportar nuevos vs actualizados — observabilidad).
  const { data: existentes } = await db
    .from("snippets").select("notion_block_id").in("notion_block_id", blockIds);
  const yaExisten = new Set(
    ((existentes ?? []) as { notion_block_id: string }[]).map((x) => x.notion_block_id),
  );

  const { error: upErr } = await db
    .from("snippets")
    .upsert(filas, { onConflict: "notion_block_id" });
  if (upErr) return { ok: false, error: `Upsert falló: ${upErr.message}` };

  // Desactivar legales que ANTES venían de Notion pero YA NO están en el doc. Sólo
  // toca los notion-sourced (block_id not null); los manuales quedan intactos. Se
  // DESACTIVA (active=false), no se borra → reversible. Se cuenta (no es silencioso).
  const { data: activos } = await db
    .from("snippets")
    .select("id, notion_block_id")
    .eq("kind", "legal")
    .not("notion_block_id", "is", null)
    .eq("active", true);
  const aDesactivar = ((activos ?? []) as { id: string; notion_block_id: string }[])
    .filter((s) => !blockIds.includes(s.notion_block_id))
    .map((s) => s.id);
  if (aDesactivar.length) {
    await db.from("snippets").update({ active: false }).in("id", aDesactivar);
  }

  const pag = await sincronizarPaginas(db);
  return {
    ok: true,
    paginas: pag.ok,
    paginasConError: pag.errores,
    nuevos: filas.filter((f) => !yaExisten.has(f.notion_block_id)).length,
    actualizados: filas.filter((f) => yaExisten.has(f.notion_block_id)).length,
    desactivados: aDesactivar.length,
    sinMarca,
  };

}

/** Baja cada página de marca y la guarda como documento de H.Ü.E (texto con estructura). */
async function sincronizarPaginas(db: Db): Promise<{ ok: number; errores: string[] }> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { ok: 0, errores: ["Falta NOTION_TOKEN"] };
  const { data: marcas } = await db.from("marcas").select("id, slug").in("slug", ["card", "prestamos"]);
  const idPorSlug = new Map(((marcas ?? []) as { id: string; slug: string }[]).map((m) => [m.slug, m.id]));
  let ok = 0;
  const errores: string[] = [];
  for (const p of PAGINAS_MARCA) {
    const marcaId = idPorSlug.get(p.marca);
    if (!marcaId) { errores.push(`${p.titulo}: no existe la marca ${p.marca}`); continue; }
    try {
      const texto = `# ${p.titulo} (Notion, sincronizado ${new Date().toISOString().slice(0, 10)})\n` + renderNotion(await fetchTree(token, p.id));
      if (texto.length < 500) throw new Error("la página llegó casi vacía");
      const llave = llaveNotion(p);
      const fila = {
        title: `Notion · ${p.titulo}`,
        extracted_text: texto,
        size_bytes: texto.length,
        mime_type: "text/markdown",
        indexed_at: new Date().toISOString(),
      };
      const { data: ya } = await db.from("hue_kb_documents").select("id").eq("storage_path", llave).maybeSingle();
      const { error } = ya
        ? await db.from("hue_kb_documents").update(fila).eq("id", (ya as { id: string }).id)
        : await db.from("hue_kb_documents").insert({ ...fila, storage_path: llave, scope: "marca", marca_id: marcaId, client_id: null });
      if (error) throw new Error(error.message);
      ok++;
    } catch (e) {
      errores.push(`${p.titulo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok, errores };
}
