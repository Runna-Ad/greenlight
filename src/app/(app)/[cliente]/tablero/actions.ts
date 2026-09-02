"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import {
  canAssign, canMoveStatus, canOverrideStatus, puedeSerLead, puedeSerEspecialista,
  type ViewRole,
} from "@/lib/roles";
import type { Track } from "@/lib/vocab";

/** La forma mínima que necesitan `puedeSerLead`/`puedeSerEspecialista`. */
type MiembroAsignable = { role: string | null; track: Track | null; tracks: Track[] | null; active?: boolean };
import { transicionRequiereLead } from "@/lib/task-actions";
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
  // board_tasks ya expone client_slug directo (0032) — evita el segundo viaje a
  // `clients` que sólo traducía client_id → slug.
  const { data } = await db
    .from("board_tasks")
    .select("client_slug")
    .eq("id", ideaId)
    .maybeSingle<{ client_slug: string | null }>();
  if (data?.client_slug) {
    revalidatePath(`/${data.client_slug}/tablero`);
    revalidatePath(`/${data.client_slug}/tareas/${ideaId}`);
    // El portal del cliente también cambia con un movimiento/borrado (una pieza
    // publicada que se manda a la papelera seguía visible en navegación suave).
    revalidatePath(`/${data.client_slug}/portal`);
  }
  revalidatePath("/mi-trabajo");
  revalidatePath("/entregas");
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

  // Gate POR TRANSICIÓN (no sólo por rol): un no-lead sólo hace transiciones de doer.
  // Aprobar / enviar-a-cliente / entregar / pedir-cambios son del lead — el arrastre
  // y el menú "Mover" del tablero NO deben saltarse lo que los botones ya bloquean.
  // rpc_move_task sólo valida el rol en transiciones ILEGALES; una transición legal
  // pasaba sin mirar el rol → un creativo podía auto-aprobar/publicar su propia tarea.
  const { data: cur } = await db
    .from("ideas").select("status").eq("id", ideaId).maybeSingle<{ status: AssetStatus }>();
  const from = cur?.status;
  if (from && transicionRequiereLead(from, toStatus) && !canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede aprobar, enviar al cliente o entregar." };
  }

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
 * Asigna una tarea en DOS niveles de una sola vez: un LEAD (es_lead=true) y sus
 * ESPECIALISTAS (es_lead=false). Reemplaza el conjunto completo con un DIFF (sólo
 * toca lo que cambió) para preservar assigned_at de quien sigue asignado — esa hora
 * es la que mide la Evaluación (0034). Enforcea la regla de negocio en el
 * SERVIDOR (no confía en la UI) con puedeSerLead/puedeSerEspecialista (lib/roles):
 * personas ACTIVAS con grant sobre el track de la tarea; lead = rol `lead` de ese track
 * o admin/master (globales, Pedro 2026-09-01); especialistas = rol `creative`.
 * Funciona aunque la tarea no tenga a nadie (arregla el hueco de "sin lead, no se
 * puede asignar después").
 */
export async function asignarTarea(
  ideaId: string,
  leadId: string | null,
  especialistaIds: string[],
): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role } = await context();
  if (!canAssign(role)) return { ok: false, error: "Este rol no puede asignar." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();

  const { data: idea } = await db
    .from("ideas").select("track").eq("id", ideaId).maybeSingle<{ track: string }>();
  const track = idea?.track ?? null;

  // Validación de rol+track (la frontera REAL, no sólo el filtro de la UI).
  const ids = [...(leadId ? [leadId] : []), ...especialistaIds];
  const dedupIds = [...new Set(ids)];
  if (dedupIds.length) {
    const { data: rows } = await db
      .from("track_members")
      .select("id, role, track, tracks, active")
      .in("id", dedupIds)
      .returns<{ id: string; role: string; track: string; tracks: string[] | null; active: boolean }[]>();
    const byId = new Map((rows ?? []).map((m) => [m.id, m]));
    // `puedeSerLead`/`puedeSerEspecialista` (lib/roles) son la fuente ÚNICA que
    // comparten este gate y los dos pickers — así la UI nunca ofrece a alguien que
    // el servidor rechaza. Un admin/master SÍ puede ser lead (Pedro 2026-09-01).
    if (leadId) {
      const m = byId.get(leadId);
      if (!m || !puedeSerLead(m as MiembroAsignable, track as Track | null)) {
        return { ok: false, error: "El lead debe ser un Lead de ese track, o un admin/master." };
      }
    }
    for (const eid of especialistaIds) {
      const m = byId.get(eid);
      if (!m || !puedeSerEspecialista(m as MiembroAsignable, track as Track | null)) {
        return { ok: false, error: "Los especialistas deben ser del track de la tarea." };
      }
    }
  }

  // La escritura va por rpc_set_assignees (0061): hace el DIFF (preserva assigned_at de
  // quien sigue), sella es_lead y assigned_by, y — lo que un insert directo por PostgREST
  // no podía — fija `produccion.acting_member`, así el trigger notify_on_assignment NO
  // avisa "se te asignó" a quien se asigna a sí mismo. (reap 2026-09-02, sweep S1)
  const u = await getCurrentUser();
  const { error } = await db.rpc("rpc_set_assignees", {
    p_idea_id: ideaId,
    p_lead_id: leadId,
    p_especialista_ids: especialistaIds,
    p_actor_member: u?.member?.id ?? null,
    p_actor_profile: u?.userId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  after(() => dispatchPendingEmails());
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Cambios del CLIENTE (in_corrections) → cancha del LEAD
// ─────────────────────────────────────────────────────────────
// Cuando el cliente pide cambios, la tarea es del LEAD (el especialista no la ve hasta
// que se reasigne — eso lo gobierna task-actions + la visibilidad). El lead decide:
//   · HACERLOS ÉL → edita en in_corrections (ya editable) y reenvía directo → reenviarACliente.
//   · REASIGNAR → fija especialista y la manda a EN PROGRESO → reasignarCambios.

/** El lead APLICÓ los cambios del cliente él mismo y reenvía la pieza directo (sin
 *  ronda de revisión, él es el revisor). Sólo lead+; desde in_corrections. */
export async function reenviarACliente(ideaId: string): Promise<ActionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { role, soyId, profileId } = await context();
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead reenvía al cliente." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_lead_reenvia_cliente", {
    p_idea_id: ideaId,
    p_actor_member: soyId,
    p_actor: profileId,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** El lead REASIGNA los cambios del cliente a un especialista: fija la asignación
 *  (lead + especialistas, RE-validada en asignarTarea) y mueve la tarea a EN PROGRESO
 *  para que el especialista la trabaje. Exige al menos un especialista. */
export async function reasignarCambios(
  ideaId: string,
  leadId: string | null,
  especialistaIds: string[],
): Promise<ActionResult> {
  if (!especialistaIds.length) {
    return { ok: false, error: "Elige al menos un especialista para reasignar." };
  }
  // asignarTarea re-valida rol+track+activo y canAssign en el SERVIDOR.
  const asign = await asignarTarea(ideaId, leadId, especialistaIds);
  if (!asign.ok) return asign;

  const { soyId } = await context();
  const db = supabaseAdmin();
  // in_corrections → in_progress (misma RPC que "Retomar"): ahora es del especialista.
  const { error } = await db.rpc("rpc_task_start", { p_idea_id: ideaId, p_actor_member: soyId });
  if (error) return { ok: false, error: error.message };

  await revalidateFor(db, ideaId);
  after(() => dispatchPendingEmails());
  return { ok: true };
}
