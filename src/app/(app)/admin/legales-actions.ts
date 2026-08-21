"use server";

import { revalidatePath } from "next/cache";
import { getViewAs } from "@/lib/view-as";
import { canAdmin } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { fetchLegalesFromNotion, hasNotion } from "@/lib/notion-legales";

export type SyncLegalesResultado =
  | {
      ok: true;
      nuevos: number;
      actualizados: number;
      desactivados: number;
      sinMarca: string[];
    }
  | { ok: false; error: string };

/**
 * Sincroniza los LEGALES desde Notion → snippets (kind='legal'). Notion es la
 * fuente de verdad para los legales sincronizados: se upsertean por
 * `notion_block_id` (llave estable), y uno que YA NO está en el doc se DESACTIVA
 * (no se borra — reversible). Los legales creados A MANO (notion_block_id NULL)
 * NUNCA se tocan. Sólo admin+.
 */
export async function sincronizarLegales(): Promise<SyncLegalesResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!hasNotion()) return { ok: false, error: "Falta NOTION_TOKEN en el entorno (Vercel)." };
  if (!canAdmin(await getViewAs())) {
    return { ok: false, error: "Sólo un admin sincroniza la biblioteca." };
  }

  let parsed: Awaited<ReturnType<typeof fetchLegalesFromNotion>>;
  try {
    parsed = await fetchLegalesFromNotion();
  } catch (e) {
    return { ok: false, error: `No se pudo leer Notion: ${e instanceof Error ? e.message : String(e)}` };
  }

  const db = supabaseAdmin();

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
        client_id: marca.client_id,
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

  revalidatePath("/admin");
  return {
    ok: true,
    nuevos: filas.filter((f) => !yaExisten.has(f.notion_block_id)).length,
    actualizados: filas.filter((f) => yaExisten.has(f.notion_block_id)).length,
    desactivados: aDesactivar.length,
    sinMarca,
  };
}
