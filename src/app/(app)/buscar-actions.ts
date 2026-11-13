"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { tracksVisibles } from "@/lib/roles";
import { contextoDeTareas } from "@/lib/paquetes-data";
import { ddmm } from "@/lib/paquetes";

export type ResultadoBusqueda = {
  tipo: "tarea" | "paquete" | "brief";
  id: string;
  titulo: string;
  sub: string | null;
  href: string;
};

/**
 * Búsqueda global desde el topbar: tareas (por naming/código/concepto), paquetes (por
 * nombre; fase 3, Pedro 2026-11-13: abre el tablero ya filtrado) y briefs (por título). Acotada por identidad, IGUAL que el tablero/bundle — un cliente no busca
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

  // Cada tarea dice de qué paquete y pestaña es (fase 3): "LT AfterBF · Brief 30/10 · Real".
  const primeras = tareas.slice(0, 8);
  const contexto = await contextoDeTareas(primeras.map((t) => t.id));
  const rTareas: ResultadoBusqueda[] = primeras.map((t) => ({
    tipo: "tarea",
    id: t.id,
    titulo: t.naming_base || t.code || "Tarea sin nombre",
    sub: contexto.get(t.id) ?? t.concepto?.slice(0, 60) ?? null,
    href: t.client_slug ? `/${t.client_slug}/tareas/${t.id}` : "#",
  }));

  // ── Paquetes (lead/admin/master, como los briefs): por nombre. Sólo los que tienen tareas
  //    vivas que esta persona ve (un lead, las de su equipo). Abren el tablero de su cliente
  //    ya filtrado a ese paquete. ──
  const rPaquetes: ResultadoBusqueda[] = [];
  if (u.role !== "creative") {
    const { data: paqs } = await db
      .from("paquetes")
      .select("id, nombre, brief_date, clients(slug)")
      .ilike("nombre", patron)
      // Holgado: los que no tienen tareas que esta persona ve se descartan DESPUÉS.
      .limit(100)
      .returns<{ id: string; nombre: string; brief_date: string | null; clients: { slug: string } | { slug: string }[] | null }[]>();
    const ids = (paqs ?? []).map((p) => p.id);
    let iq = ids.length
      ? db.from("ideas").select("paquete_id, track").in("paquete_id", ids).is("deleted_at", null)
      : null;
    if (iq && tracks) iq = iq.in("track", tracks);
    const { data: vivas } = iq ? await iq.returns<{ paquete_id: string; track: string }[]>() : { data: [] };
    const cuantas = new Map<string, number>();
    for (const v of vivas ?? []) cuantas.set(v.paquete_id, (cuantas.get(v.paquete_id) ?? 0) + 1);
    for (const p of paqs ?? []) {
      const n = cuantas.get(p.id) ?? 0;
      if (!n) continue;
      const slug = (Array.isArray(p.clients) ? p.clients[0] : p.clients)?.slug ?? null;
      rPaquetes.push({
        tipo: "paquete",
        id: p.id,
        titulo: p.nombre,
        sub: [p.brief_date ? `Brief ${ddmm(p.brief_date)}` : null, `${n} tarea${n === 1 ? "" : "s"}`, slug]
          .filter(Boolean).join(" · "),
        href: slug ? `/${slug}/tablero?paquete=${p.id}` : "#",
      });
      if (rPaquetes.length >= 5) break;
    }
  }

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

  return [...rPaquetes, ...rTareas, ...rBriefs];
}
