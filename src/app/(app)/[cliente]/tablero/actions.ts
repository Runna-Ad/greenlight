"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import { canAssign, canMoveStatus, canOverrideStatus, type ViewRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/identity";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import type { AssetStatus } from "@/lib/brand";

export type ActionResult = { ok: boolean; error?: string };

type Db = ReturnType<typeof supabaseAdmin>;

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

/** Contexto común: quién eres, con qué rol miras, y tu perfil (para atribución).
 *  Todo desde la SESIÓN autenticada — nada de cookies falsificables. */
async function context(): Promise<{ role: ViewRole; soyId: string | null; profileId: string | null }> {
  const u = await getCurrentUser();
  return { role: u?.role ?? "creative", soyId: u?.member?.id ?? null, profileId: u?.userId ?? null };
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

  const { role, soyId, profileId } = await context();
  if (!canMoveStatus(role)) {
    return { ok: false, error: "Este rol no puede cambiar el estado de una tarea." };
  }
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_move_task", {
    p_idea_id: ideaId,
    p_to: toStatus,
    p_as_lead: canOverrideStatus(role),
    p_actor: profileId,
    p_reason: reason ?? null,
    p_actor_member: soyId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_start", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** Terminé → En revisión, y el lead se entera. */
export async function submitForReview(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId } = await context();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no puede mandar a revisión." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_submit_review", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** El lead pide cambios → En correcciones, y los responsables se enteran. */
export async function requestChanges(ideaId: string, body: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId, profileId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede pedir cambios." };
  }
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!body.trim()) return { ok: false, error: "Escribe qué hay que corregir." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_request_changes", {
    p_idea_id: ideaId,
    p_body: body.trim(),
    p_actor_member: soyId,
    p_actor: profileId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** El lead aprueba → Completado. */
export async function approveTask(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId, profileId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede aprobar." };
  }
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_approve", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_actor: profileId,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** El lead publica al cliente → Publicado. Paso APARTE de aprobar (Pedro). */
export async function sendToClient(ideaId: string, note?: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId, profileId } = await context();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede enviar al cliente." };
  }
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_send_client", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_actor: profileId,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

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
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();

  // DIFF, no borrar-y-reinsertar: las filas que SIGUEN asignadas conservan su
  // assigned_at (0034). Si borráramos todo y reinsertáramos, cada reasignación
  // (agregar/quitar a una persona) resetearía la hora de asignación de TODOS a
  // now() — y esa hora es justo lo que la Evaluación va a medir. Sólo tocamos lo
  // que cambió. Se ignoran las filas de la vía antigua (member_id null): no son
  // nuestras para borrarlas.
  const deseado = new Set(memberIds);
  const { data: actuales, error: readErr } = await db
    .from("idea_assignments")
    .select("member_id")
    .eq("idea_id", ideaId)
    .not("member_id", "is", null)
    .returns<{ member_id: string }[]>();
  if (readErr) return { ok: false, error: readErr.message };
  const yaAsignados = new Set((actuales ?? []).map((r) => r.member_id));

  const quitar = [...yaAsignados].filter((id) => !deseado.has(id));
  const agregar = memberIds.filter((id) => !yaAsignados.has(id));

  if (quitar.length) {
    const { error: delErr } = await db
      .from("idea_assignments")
      .delete()
      .eq("idea_id", ideaId)
      .in("member_id", quitar);
    if (delErr) return { ok: false, error: delErr.message };
  }
  if (agregar.length) {
    const { error: insErr } = await db
      .from("idea_assignments")
      .insert(agregar.map((member_id) => ({ idea_id: ideaId, member_id })));
    if (insErr) return { ok: false, error: insErr.message };
  }

  await revalidateFor(db, ideaId);
  // Después de responder, drena la cola de emails (Gmail SMTP). Off the response
  // path (after) para no frenar el botón; cada acción también sirve de reintento
  // por si un envío anterior no completó.
  after(() => dispatchPendingEmails());
  return { ok: true };
}
