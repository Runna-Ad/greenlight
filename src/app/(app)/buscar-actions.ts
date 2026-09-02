"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { tracksVisibles } from "@/lib/roles";

export type ResultadoBusqueda = {
  tipo: "tarea" | "brief";
  id: string;
  titulo: string;
  sub: string | null;
  href: string;
};

/**
 * Búsqueda global desde el topbar: tareas (por naming/código/concepto) y briefs (por
 * título). Acotada por identidad, IGUAL que el tablero/bundle — un cliente no busca
 * (sólo su portal); un especialista sólo ve sus tareas; un lead, sus tracks;
 * admin/master, todo. Sin esto, el buscador sería una fuga cross-tenant. (reap 2026-09-02)
 */
export async function buscar(qRaw: string): Promise<ResultadoBusqueda[]> {
  if (!hasSupabase()) return [];
  const q = qRaw.trim();
  if (q.length < 2) return [];

  const u = await getCurrentUser();
  if (!u || u.role === "client") return []; // el cliente no usa el buscador interno

  const db = supabaseAdmin();
  // Escapa comodines de PostgREST ilike: %, _ y la coma (separa filtros en .or()).
  const patron = `%${q.replace(/[%_,]/g, (c) => `\\${c}`)}%`;

  const tracks = tracksVisibles(u.role, u.member?.tracks ?? null); // null = todos
  const soyId = u.member?.id ?? null;

  // ── Tareas (board_tasks ya trae slug, miembros y track) ──
  let tq = db
    .from("board_tasks")
    .select("id, naming_base, code, concepto, client_slug, track, member_ids")
    .or(`naming_base.ilike.${patron},code.ilike.${patron},concepto.ilike.${patron}`)
    .limit(30);
  if (tracks) tq = tq.in("track", tracks); // lead: sus tracks
  const { data: tareasRaw } = await tq.returns<{
    id: string; naming_base: string | null; code: string | null; concepto: string | null;
    client_slug: string | null; track: string; member_ids: string[];
  }[]>();

  let tareas = tareasRaw ?? [];
  // Especialista (sin visibilidad por track): sólo lo asignado a él.
  if (u.role === "creative") {
    tareas = soyId ? tareas.filter((t) => (t.member_ids ?? []).includes(soyId)) : [];
  }

  const rTareas: ResultadoBusqueda[] = tareas.slice(0, 8).map((t) => ({
    tipo: "tarea",
    id: t.id,
    titulo: t.naming_base || t.code || "Tarea sin nombre",
    sub: t.concepto?.slice(0, 60) ?? null,
    href: t.client_slug ? `/${t.client_slug}/tareas/${t.id}` : "#",
  }));

  // ── Briefs (sólo roles que ven /briefs con panorama; el creative igual entra por
  //    sus tareas). Acotado por los clientes que ya salieron en las tareas + búsqueda
  //    directa por título, y por track del lead vía sus tareas. Para simplificar y no
  //    filtrar de más, los briefs se buscan sólo para lead/admin/master. ──
  const rBriefs: ResultadoBusqueda[] = [];
  if (u.role !== "creative") {
    const { data: briefsRaw } = await db
      .from("board_tasks")
      .select("brief_id, brief_title, client_slug, track")
      .ilike("brief_title", patron)
      .limit(60)
      .returns<{ brief_id: string; brief_title: string | null; client_slug: string | null; track: string }[]>();
    const vistos = new Set<string>();
    for (const b of briefsRaw ?? []) {
      if (!b.brief_id || vistos.has(b.brief_id)) continue;
      if (tracks && !tracks.includes(b.track as "real" | "normal")) continue;
      vistos.add(b.brief_id);
      rBriefs.push({
        tipo: "brief",
        id: b.brief_id,
        titulo: b.brief_title || "Brief sin título",
        sub: b.client_slug,
        href: b.client_slug ? `/${b.client_slug}/briefs` : "#",
      });
      if (rBriefs.length >= 5) break;
    }
  }

  return [...rTareas, ...rBriefs];
}
