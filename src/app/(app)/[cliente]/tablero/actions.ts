"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAssign, canMoveStatus, canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import type { AssetStatus } from "@/lib/brand";

export type ActionResult = { ok: boolean; error?: string };

/** El perfil al que se atribuye la acción mientras no hay login. */
async function actorId(db: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const { data } = await db
    .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * Mover una TAREA (una fila del sheet) a otro estado.
 *
 * Pasa siempre por rpc_move_task, que es la única puerta: valida la transición,
 * decide si el override de lead procede y deja el movimiento registrado en
 * status_events con quién y por qué.
 *
 * El rol se lee de la cookie EN EL SERVIDOR. Si viniera del cliente, cualquiera
 * podría pedir poderes de lead simplemente mandando otro valor.
 */
export async function moveTask(
  clienteSlug: string,
  ideaId: string,
  toStatus: AssetStatus,
  reason?: string,
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const role = await getViewAs();
  if (!canMoveStatus(role)) {
    return { ok: false, error: "Este rol no puede cambiar el estado de una tarea." };
  }

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_move_task", {
    p_idea_id: ideaId,
    p_to: toStatus,
    p_as_lead: canOverrideStatus(role),
    p_actor: await actorId(db),
    p_reason: reason ?? null,
  });

  // El mensaje del trigger ya viene en español y nombra ambos estados.
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/tablero`);
  return { ok: true };
}

/**
 * Fijar exactamente quién trabaja una tarea.
 *
 * La "Asignación" del sheet es multi-persona y sin rol ("Galie, Mony"), así que
 * esto reemplaza el conjunto entero en vez de ir sumando de a uno — es editar
 * esa celda.
 */
export async function setAssignees(
  clienteSlug: string,
  ideaId: string,
  memberIds: string[],
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const role = await getViewAs();
  if (!canAssign(role)) {
    return { ok: false, error: "Este rol no puede cambiar la asignación." };
  }

  const db = supabaseAdmin();

  // Sólo se limpian las filas que gestiona esta pantalla. Una asignación hecha
  // por la vía antigua (con cuenta real) no es nuestra para borrarla.
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
