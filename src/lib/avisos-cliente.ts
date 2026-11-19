import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import type { CurrentUser } from "@/lib/identity";
import { cargarArchivoPaquetes } from "@/app/(app)/[cliente]/portal/portal-data";
import { contarNovedades } from "@/lib/archivo-novedad";

/** Los números rojos del menú del cliente (0101, Pedro 2026-11-19). */
export type AvisosCliente = {
  /** El slug de SU empresa: el menú sólo pinta los números en esa sección. */
  slug: string;
  /** Piezas que esperan su aprobación (lo mismo que «Por revisar» de su portal). */
  porRevisar: number;
  /** Paquetes aprobados o con carpeta de Drive nueva desde su última visita al Archivo. */
  archivoNuevos: number;
};

/** Cuándo abrió este perfil su Archivo por última vez (null = nunca). */
export async function leerArchivoVisto(userId: string): Promise<string | null> {
  if (!hasSupabase()) return null;
  const { data } = await supabaseAdmin()
    .from("profiles").select("archivo_visto_at").eq("id", userId)
    .maybeSingle<{ archivo_visto_at: string | null }>();
  return data?.archivo_visto_at ?? null;
}

/**
 * Sólo para un CLIENTE de verdad (no para el Master que mira su portal): los números son
 * de su propia visita. Cualquier error da null y el menú sale sin números, nunca roto.
 */
export async function cargarAvisosCliente(user: CurrentUser | null): Promise<AvisosCliente | null> {
  if (!hasSupabase() || !user || user.role !== "client" || !user.clientId) return null;
  try {
    const db = supabaseAdmin();
    const { data: cli } = await db.from("clients").select("slug").eq("id", user.clientId).maybeSingle<{ slug: string }>();
    if (!cli) return null;

    const [{ data: briefs, error: eB }, visto] = await Promise.all([
      db.from("briefs").select("id").eq("client_id", user.clientId).is("deleted_at", null).returns<{ id: string }[]>(),
      leerArchivoVisto(user.userId),
    ]);
    if (eB) throw eB;

    // Las mismas reglas que el portal: enviada (published, con published_at), no en la papelera,
    // de un brief vivo. No sigue «Mis tareas»: el número es de toda la empresa.
    // Se cuenta en la BD (head), sin traer filas: no le afecta el tope de ~1000 de PostgREST.
    const ids = (briefs ?? []).map((b) => b.id);
    const lotes = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));
    const conteos = await Promise.all(lotes.map((l) =>
      db.from("ideas").select("id", { count: "exact", head: true })
        .in("brief_id", l).eq("status", "published").not("published_at", "is", null).is("deleted_at", null)));
    const malo = conteos.find((c) => c.error)?.error;
    if (malo) throw malo;
    const porRevisar = conteos.reduce((n, c) => n + (c.count ?? 0), 0);

    const paquetes = await cargarArchivoPaquetes(cli.slug, {});
    return { slug: cli.slug, porRevisar, archivoNuevos: contarNovedades(paquetes, visto) };
  } catch (e) {
    console.error("cargarAvisosCliente:", e instanceof Error ? e.message : e);
    return null;
  }
}
