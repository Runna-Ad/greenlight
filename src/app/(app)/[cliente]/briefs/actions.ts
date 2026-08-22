"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAdmin } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";

/**
 * Borra un BRIEF entero, con TODAS sus tareas — sólo master/admin (Pedro
 * 2026-08-21). Es un DELETE duro: los FKs con ON DELETE CASCADE limpian ideas
 * (y por cascada de éstas, sus planos/estáticos/assets/asignaciones/comentarios/
 * referencias/snippets) + assets/comments/delivery_waves/idea_families/snippets
 * del brief (verificado contra el catálogo). No se puede deshacer — la
 * confirmación de dos pasos vive en la UI (BundleCard).
 */
export async function eliminarBrief(
  cliente: string,
  briefId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canAdmin(role)) return { ok: false, error: "Sólo un admin o master puede borrar un brief." };

  const { error } = await supabaseAdmin().from("briefs").delete().eq("id", briefId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${cliente}/briefs`);
  revalidatePath(`/${cliente}/tablero`);
  return { ok: true };
}
