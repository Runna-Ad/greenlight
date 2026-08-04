"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import type { AssetStatus } from "@/lib/brand";

export type ActionResult = { ok: boolean; error?: string };

/**
 * Move a TASK (one sheet row) to another status.
 *
 * The database is the authority: a BEFORE UPDATE trigger raises on an illegal
 * transition. The board dims unreachable columns using the TS mirror of that
 * rule, so this should rarely fire — but it stays as the real guard, and its
 * message is surfaced verbatim rather than swallowed.
 */
export async function moveTask(
  clienteSlug: string,
  ideaId: string,
  toStatus: AssetStatus,
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const db = supabaseAdmin();
  const { error } = await db.from("ideas").update({ status: toStatus }).eq("id", ideaId);

  if (error) {
    // The trigger's message is already in Spanish and names both states.
    return { ok: false, error: error.message };
  }

  revalidatePath(`/${clienteSlug}/tablero`);
  return { ok: true };
}

/**
 * Set exactly who is on a task.
 *
 * The sheet's "Asignación" is multi-person and carries no role ("Galie, Mony"),
 * so this replaces the whole set rather than adding one person at a time —
 * it mirrors editing that one cell.
 *
 * Deletes first, then inserts, so removing someone actually removes them.
 */
export async function setAssignees(
  clienteSlug: string,
  ideaId: string,
  memberIds: string[],
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const db = supabaseAdmin();

  // Only clear the rows this screen owns. An assignment made through the older
  // profile-based path (a real account) is not ours to delete.
  const { error: delErr } = await db
    .from("idea_assignments")
    .delete()
    .eq("idea_id", ideaId)
    .not("member_id", "is", null);
  if (delErr) return { ok: false, error: delErr.message };

  if (memberIds.length) {
    const { error: insErr } = await db
      .from("idea_assignments")
      .insert(memberIds.map((member_id) => ({ idea_id: ideaId, member_id })));
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath(`/${clienteSlug}/tablero`);
  return { ok: true };
}
