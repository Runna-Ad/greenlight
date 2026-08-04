"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getSoy } from "@/lib/soy";
import { getViewAs } from "@/lib/view-as";
import { canOverrideStatus } from "@/lib/roles";

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
 * Un aviso puede llegar por dos vías: a una persona del pool
 * (recipient_member_id) o a un perfil (recipient_id) — a los leads se les avisa
 * por perfil, porque no están en el pool del sheet.
 *
 * Sin login, el único perfil es el admin. Así que quien mira con rol de lead
 * también tiene que ver los avisos de ese perfil, o "Mandar a revisión" avisaría
 * a un buzón que nadie abre. Se detectó justo así: la notificación se creaba
 * bien y la campanita seguía en cero.
 */
async function misBuzones(): Promise<string | null> {
  const [soy, role] = await Promise.all([getSoy(), getViewAs()]);
  const clauses: string[] = [];

  if (soy) clauses.push(`recipient_member_id.eq.${soy.id}`);

  if (canOverrideStatus(role) && hasSupabase()) {
    const { data } = await supabaseAdmin()
      .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (data?.id) clauses.push(`recipient_id.eq.${data.id}`);
  }

  return clauses.length ? clauses.join(",") : null;
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
