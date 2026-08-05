"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAssign, canMoveStatus, canOverrideStatus, type ViewRole } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import type { AssetStatus } from "@/lib/brand";

export type ActionResult = { ok: boolean; error?: string };

type Db = ReturnType<typeof supabaseAdmin>;

/** El perfil al que se atribuye la acción mientras no hay login. */
async function actorId(db: Db): Promise<string | null> {
  const { data } = await db
    .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * Estas acciones se llaman desde el tablero Y desde /mi-trabajo, que no lleva
 * el cliente en la URL. Se resuelve desde la tarea y se refrescan las dos
 * rutas: si no, una queda con datos viejos y parece que el botón no hizo nada.
 */
async function revalidateFor(db: Db, ideaId: string) {
  const { data } = await db
    .from("board_tasks").select("client_id").eq("id", ideaId).maybeSingle();
  if (data?.client_id) {
    const { data: c } = await db
      .from("clients").select("slug").eq("id", data.client_id).maybeSingle();
    if (c?.slug) revalidatePath(`/${c.slug}/tablero`);
  }
  revalidatePath("/mi-trabajo");
}

/** Contexto común: quién eres y con qué rol miras. Siempre desde el servidor. */
async function context(): Promise<{ role: ViewRole; soyId: string | null }> {
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  return { role, soyId: soy?.id ?? null };
}

/**
 * Mover una TAREA a otro estado (arrastre y menú "Mover" del lead).
 *
 * Pasa por rpc_move_task, la única puerta: valida la transición, decide si el
 * override de lead procede, y deja el movimiento en status_events con quién,
 * de dónde a dónde y por qué.
 *
 * El rol se lee de la cookie EN EL SERVIDOR. Si viniera del cliente, cualquiera
 * podría pedir poderes de lead mandando otro valor.
 */
export async function moveTask(
  _clienteSlug: string,
  ideaId: string,
  toStatus: AssetStatus,
  reason?: string,
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const { role, soyId } = await context();
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
    p_actor_member: soyId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Los cuatro verbos del flujo
// ─────────────────────────────────────────────────────────────
// Cada uno comprueba en el SERVIDOR quién eres y con qué rol miras. La UI ya
// esconde lo que no toca, pero una server action es un POST público.

/** Empezar (o retomar tras correcciones) → En progreso. */
export async function startTask(ideaId: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no puede trabajar tareas." };
  if (!soyId && role === "creative") {
    return { ok: false, error: "Dinos quién eres antes de empezar una tarea." };
  }

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_start", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

/** Terminé → En revisión, y el lead se entera. */
export async function submitForReview(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no puede mandar a revisión." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_submit_review", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

/** El lead pide cambios → En correcciones, y los responsables se enteran. */
export async function requestChanges(ideaId: string, body: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede pedir cambios." };
  }
  if (!body.trim()) return { ok: false, error: "Escribe qué hay que corregir." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_request_changes", {
    p_idea_id: ideaId,
    p_body: body.trim(),
    p_actor_member: soyId,
    p_actor: await actorId(db),
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

/** El lead aprueba → Completado. */
export async function approveTask(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede aprobar." };
  }

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_approve", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_actor: await actorId(db),
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

/** El lead publica al cliente → Publicado. Paso APARTE de aprobar (Pedro). */
export async function sendToClient(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede enviar al cliente." };
  }

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_send_client", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_actor: await actorId(db),
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  return { ok: true };
}

/**
 * Marcar cuáles de los asignados son LEAD de esta tarea (wireframe: LEAD vs
 * TEAM). No agrega gente — sólo pone el flag es_lead sobre asignaciones que ya
 * existen. Añadir o quitar personas sigue siendo setAssignees, en el tablero.
 */
export async function setLeads(
  ideaId: string,
  leadMemberIds: string[],
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role } = await context();
  if (!canAssign(role)) return { ok: false, error: "Este rol no puede marcar leads." };

  const db = supabaseAdmin();
  // Primero todos a false, luego los elegidos a true — en dos updates, para que
  // el conjunto quede exactamente como se pidió.
  const { error: e1 } = await db
    .from("idea_assignments").update({ es_lead: false }).eq("idea_id", ideaId);
  if (e1) return { ok: false, error: e1.message };

  if (leadMemberIds.length) {
    const { error: e2 } = await db
      .from("idea_assignments").update({ es_lead: true })
      .eq("idea_id", ideaId).in("member_id", leadMemberIds);
    if (e2) return { ok: false, error: e2.message };
  }

  await revalidateFor(db, ideaId);
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
  _clienteSlug: string,
  ideaId: string,
  memberIds: string[],
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const { role } = await context();
  if (!canAssign(role)) return { ok: false, error: "Este rol no puede cambiar la asignación." };

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

  await revalidateFor(db, ideaId);
  return { ok: true };
}
