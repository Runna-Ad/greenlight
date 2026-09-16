import "server-only";
import { hasSupabase } from "@/lib/supabase-admin";
import { canHue } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";

/** La puerta del H.Ü.E HUB (conocimiento, herramientas, vigía): sólo el Master Builder. Una sola función para
 *  todas las acciones del Hub — dos copias del mismo permiso terminan divergiendo. */
export async function noMaster(): Promise<{ ok: false; error: string } | null> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canHue(await getViewAs())) return { ok: false, error: "El H.Ü.E HUB es sólo del Master Builder." };
  return null;
}
