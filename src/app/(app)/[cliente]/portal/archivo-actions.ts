"use server";

import { getCurrentUser } from "@/lib/identity";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";

/**
 * El cliente abrió su Archivo: su número rojo vuelve a cero (0101). Sólo cuenta la visita
 * de un cliente de verdad; el Master que mira su portal no le borra las novedades.
 */
export async function marcarArchivoVisto(): Promise<void> {
  if (!hasSupabase()) return;
  const user = await getCurrentUser();
  if (!user || user.role !== "client") return;
  const { error } = await supabaseAdmin()
    .from("profiles").update({ archivo_visto_at: new Date().toISOString() }).eq("id", user.userId);
  if (error) console.error("marcarArchivoVisto:", error.message);
}
