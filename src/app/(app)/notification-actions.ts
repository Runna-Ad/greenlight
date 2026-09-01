"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";

export type Aviso = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Un aviso puede llegar por dos vías: a la PERSONA del equipo (recipient_member_id
 * → track_member) o al PERFIL (recipient_id → cuenta). Con login real, cada quien
 * ve los suyos: los avisos a su track_member Y los avisos a su perfil (así es como
 * llegan, p.ej., las solicitudes de acceso de clientes a los admins). Antes esto
 * miraba "el primer admin" — con login eso enseñaba el buzón de otra persona.
 */
async function misBuzones(): Promise<string | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  const clauses: string[] = [`recipient_id.eq.${u.userId}`];
  if (u.member) clauses.push(`recipient_member_id.eq.${u.member.id}`);
  return clauses.join(",");
}

/**
 * Los avisos de quien dice ser el usuario. Se resuelve la identidad en el
 * SERVIDOR: si el id viniera del cliente, cualquiera leería los avisos ajenos.
 *
 * Hoy los destinatarios son track_members (nadie tiene cuenta). Cuando se
 * encienda el login se añade el filtro por recipient_id sin cambiar la firma.
 */
export async function listAvisos(limit = 30): Promise<Aviso[]> {
  const buzones = await misBuzones();
  if (!buzones || !hasSupabase()) return [];
  const u = await getCurrentUser();

  const db = supabaseAdmin();
  const { data } = await db
    .from("notifications")
    .select("id, type, title, body, url, read_at, created_at, entity_type, entity_id")
    .or(buzones)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<(Aviso & { entity_type: string | null; entity_id: string | null })[]>();

  const avisos = data ?? [];

  // ── El aviso lleva A LA TAREA, no al tablero ────────────────────────────────
  // El trigger guarda `url = /{slug}/tablero` para TODOS (misma línea en 4 migraciones),
  // aunque ya guarda `entity_id` = la tarea. Resultado: te avisan de una tarea concreta
  // y aterrizas en el tablero a buscarla (Pedro 2026-09-01).
  // Se resuelve al LEER en vez de con una migración: así también se arreglan los avisos
  // que YA estaban guardados, no sólo los nuevos.
  // El CLIENTE queda fuera a propósito: su aviso apunta al PORTAL y no entra a /tareas.
  const esCliente = u?.role === "client";
  const ideaIds = esCliente
    ? []
    : [...new Set(avisos.filter((a) => a.entity_type === "idea" && a.entity_id).map((a) => a.entity_id!))];

  if (!ideaIds.length) return avisos.map(({ ...a }) => a);

  // slug del cliente por tarea, en lote (idea → brief → client). Sin N+1.
  const { data: ideas } = await db
    .from("ideas")
    .select("id, briefs(clients(slug))")
    .in("id", ideaIds)
    .is("deleted_at", null); // una tarea en la papelera no tiene a dónde llevar

  const slugPorIdea = new Map<string, string>();
  for (const fila of (ideas ?? []) as unknown as {
    id: string;
    briefs: { clients: { slug: string } | { slug: string }[] | null } | { clients: unknown }[] | null;
  }[]) {
    // El embed de PostgREST llega como objeto en muchos-a-uno, pero los tipos generados
    // lo declaran array: se aceptan las dos formas (si falla la conjetura, el aviso
    // simplemente cae a su `url` de siempre — degrada, no rompe).
    const brief = Array.isArray(fila.briefs) ? fila.briefs[0] : fila.briefs;
    const cliente = brief && "clients" in brief ? brief.clients : null;
    const slug = (Array.isArray(cliente) ? cliente[0] : cliente)?.slug;
    if (slug) slugPorIdea.set(fila.id, slug);
  }

  return avisos.map(({ entity_type, entity_id, ...a }) => {
    const slug = entity_type === "idea" && entity_id ? slugPorIdea.get(entity_id) : undefined;
    return slug ? { ...a, url: `/${slug}/tareas/${entity_id}` } : a;
  });
}

export async function countSinLeer(): Promise<number> {
  const buzones = await misBuzones();
  if (!buzones || !hasSupabase()) return 0;

  const { count } = await supabaseAdmin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .or(buzones)
    .is("read_at", null);

  return count ?? 0;
}

export async function marcarLeidas(ids?: string[]): Promise<void> {
  const buzones = await misBuzones();
  if (!buzones || !hasSupabase()) return;

  let qy = supabaseAdmin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .or(buzones)
    .is("read_at", null);

  if (ids?.length) qy = qy.in("id", ids);
  await qy;

  revalidatePath("/", "layout");
}
