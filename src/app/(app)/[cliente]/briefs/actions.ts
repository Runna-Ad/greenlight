"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAdmin } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getCurrentUser } from "@/lib/identity";

/**
 * Manda un BRIEF entero a la PAPELERA, con TODAS sus tareas — sólo master/admin
 * (Pedro 2026-08-21).
 *
 * Ya NO es un DELETE duro (0057): sella `deleted_at`/`deleted_by` en el brief Y en
 * sus tareas. El árbol viaja JUNTO (decisión de Pedro 2026-09-01): restaurar el
 * brief devuelve exactamente las tareas que se fueron con él — por eso se sella
 * sólo lo que aún estaba vivo (`is deleted_at null`), para no resucitar una tarea
 * que ya estaba en la papelera por su cuenta.
 * El Master Builder restaura durante 30 días desde la Papelera.
 */
export async function eliminarBrief(
  cliente: string,
  briefId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canAdmin(role)) return { ok: false, error: "Sólo un admin o master puede borrar un brief." };
  const actor = (await getCurrentUser())?.userId ?? null;

  const db = supabaseAdmin();
  const sello = { deleted_at: new Date().toISOString(), deleted_by: actor };

  // Las TAREAS primero: si fallara a media faena, un brief vivo con tareas selladas
  // se ve raro pero es recuperable; un brief sellado con tareas vivas dejaría trabajo
  // huérfano visible en el tablero sin brief detrás.
  const { error: eIdeas } = await db
    .from("ideas").update(sello).eq("brief_id", briefId).is("deleted_at", null);
  if (eIdeas) return { ok: false, error: eIdeas.message };

  const { error } = await db
    .from("briefs").update(sello).eq("id", briefId).is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${cliente}/briefs`);
  revalidatePath(`/${cliente}/tablero`);
  revalidatePath(`/${cliente}/portal`); // sus piezas publicadas salen del portal
  revalidatePath("/mi-trabajo");
  revalidatePath("/entregas");
  return { ok: true };
}
