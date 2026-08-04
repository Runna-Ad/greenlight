"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getSoy } from "@/lib/soy";

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
 * Los avisos de quien dice ser el usuario. Se resuelve la identidad en el
 * SERVIDOR: si el id viniera del cliente, cualquiera leería los avisos ajenos.
 *
 * Hoy los destinatarios son track_members (nadie tiene cuenta). Cuando se
 * encienda el login se añade el filtro por recipient_id sin cambiar la firma.
 */
export async function listAvisos(limit = 30): Promise<Aviso[]> {
  const soy = await getSoy();
  if (!soy || !hasSupabase()) return [];

  const { data } = await supabaseAdmin()
    .from("notifications")
    .select("id, type, title, body, url, read_at, created_at")
    .eq("recipient_member_id", soy.id)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Aviso[]>();

  return data ?? [];
}

export async function countSinLeer(): Promise<number> {
  const soy = await getSoy();
  if (!soy || !hasSupabase()) return 0;

  const { count } = await supabaseAdmin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_member_id", soy.id)
    .is("read_at", null);

  return count ?? 0;
}

export async function marcarLeidas(ids?: string[]): Promise<void> {
  const soy = await getSoy();
  if (!soy || !hasSupabase()) return;

  let qy = supabaseAdmin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_member_id", soy.id)
    .is("read_at", null);

  if (ids?.length) qy = qy.in("id", ids);
  await qy;

  revalidatePath("/", "layout");
}
