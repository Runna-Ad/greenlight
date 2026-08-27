import "server-only";
import { getCurrentUser } from "@/lib/identity";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ScopeResult = { ok: true } | { ok: false; error: string };

/**
 * Server-side authorization to ACT ON a specific task (idea). Composes with the
 * role gates (canMoveStatus / canOverrideStatus / canAssign decide WHAT a role may
 * do; this decides on WHICH task):
 *
 *   • master / admin → agency-wide (any task).
 *   • lead           → DEPARTMENTAL: only tasks in their own track (ideas.track).
 *   • creative       → only tasks they're ASSIGNED to (idea_assignments.member_id).
 *   • client / none  → denied.
 *
 * Closes two launch gaps: a specialist editing any task by URL, and a lead acting
 * outside their department. Uses the service-role client, but the identity itself
 * comes from the verified session (getCurrentUser), so it can't be spoofed.
 */
export async function assertCanActOnTask(ideaId: string): Promise<ScopeResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Inicia sesión para continuar." };
  if (u.role === "master" || u.role === "admin") return { ok: true };
  if (u.role === "client") return { ok: false, error: "Un cliente no trabaja tareas internas." };
  if (!u.member) return { ok: false, error: "Tu cuenta no está ligada a un miembro del equipo." };

  const admin = supabaseAdmin();

  if (u.role === "lead") {
    const { data } = await admin.from("ideas").select("track").eq("id", ideaId).maybeSingle();
    const track = (data as { track: "real" | "normal" } | null)?.track;
    if (!track) return { ok: false, error: "La tarea ya no existe." };
    // El alcance del lead es su conjunto EFECTIVO de tracks (grant multi-track): uno
    // o ambos. `member.tracks` ya lo resuelve (grant | [track home]).
    if (!u.member.tracks.includes(track)) {
      return { ok: false, error: "Esta tarea es de otro equipo." };
    }
    return { ok: true };
  }

  // creative (specialist): must be one of the task's assignees.
  const { data } = await admin
    .from("idea_assignments")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("member_id", u.member.id)
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, error: "No estás asignado a esta tarea." };
  return { ok: true };
}

/** Same check, but resolving the idea from a child row (plano/estático/etc.). */
export async function assertCanActOnRow(
  tabla: "planos" | "estaticos" | "copies_temas" | "copies",
  filaId: string,
): Promise<ScopeResult> {
  const admin = supabaseAdmin();
  // `copies` llega por tema_id → hay que saltar a copies_temas para el idea_id (2 saltos).
  if (tabla === "copies") {
    const { data } = await admin.from("copies").select("tema_id").eq("id", filaId).maybeSingle();
    const temaId = (data as { tema_id: string } | null)?.tema_id;
    if (!temaId) return { ok: false, error: "La fila ya no existe." };
    return assertCanActOnRow("copies_temas", temaId);
  }
  const { data } = await admin.from(tabla).select("idea_id").eq("id", filaId).maybeSingle();
  const ideaId = (data as { idea_id: string } | null)?.idea_id;
  if (!ideaId) return { ok: false, error: "La fila ya no existe." };
  return assertCanActOnTask(ideaId);
}
