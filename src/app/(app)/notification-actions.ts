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

  const { data } = await supabaseAdmin()
    .from("notifications")
    .select("id, type, title, body, url, read_at, created_at")
    .or(buzones)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Aviso[]>();

  return data ?? [];
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
