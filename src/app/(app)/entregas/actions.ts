"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAdmin } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { sintetizarSiAuto } from "@/lib/hue-sintesis";

/**
 * Marca una tarea Greenlit como "top performer" — una ESTRELLA HUMANA (Greenlight no
 * tiene métricas de anuncio en vivo, así que la estrella ES la señal "esto ganó" que
 * pone Pedro). Alimenta la Biblioteca de Ganadores de H.Ü.E (aprende de los ganadores).
 * Sólo master/admin. Fase 1: captura; el job de síntesis (Etapa 2) consume estas filas.
 */
export async function estrellarTopPerformer(
  ideaId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin o master marca top performers." };
  const soyId = await getSoyId();
  const { error } = await supabaseAdmin()
    .from("hue_top_performers")
    .upsert(
      { idea_id: ideaId, starred_by: soyId, reason: reason?.trim() || null },
      { onConflict: "idea_id" },
    );
  if (error) return { ok: false, error: error.message };
  // Seam del loop de auto-aprendizaje (E): si el master encendió auto_learn, la síntesis
  // corre al estrellar. Diferida con after() + best-effort (no bloquea ni rompe el estrellado).
  after(() => sintetizarSiAuto(soyId));
  revalidatePath("/entregas");
  return { ok: true };
}

/** Quita la estrella de top performer. Sólo master/admin. */
export async function quitarTopPerformer(ideaId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin o master quita top performers." };
  const { error } = await supabaseAdmin().from("hue_top_performers").delete().eq("idea_id", ideaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/entregas");
  return { ok: true };
}
