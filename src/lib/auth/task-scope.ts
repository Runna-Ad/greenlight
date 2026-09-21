import "server-only";
import { getCurrentUser } from "@/lib/identity";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canOverrideStatus } from "@/lib/roles";
import type { AssetStatus } from "@/lib/brand";
import { ESTADOS_SOLO_LECTURA, motivoSoloLectura } from "@/lib/plantilla";

export type ScopeResult = { ok: true } | { ok: false; error: string };

/**
 * Server-side authorization to ACT ON a specific task (idea). Composes with the
 * role gates (canMoveStatus / canOverrideStatus / canAssign decide WHAT a role may
 * do; this decides on WHICH task):
 *
 *   • master / admin → agency-wide (any task).
 *   • lead           → DEPARTMENTAL: only tasks in their own track (ideas.track).
 *                      Lead Diseño (0076): global, but only tasks with a designer or his own.
 *   • creative       → only tasks they're ASSIGNED to (idea_assignments.member_id).
 *   • client / none  → denied.
 *
 * Closes two launch gaps: a specialist editing any task by URL, and a lead acting
 * outside their department. Uses the service-role client, but the identity itself
 * comes from the verified session (getCurrentUser), so it can't be spoofed.
 */
export async function assertCanActOnTask(
  ideaId: string,
  /** 0076: "ver_o_asignar" = abrir la tarea / ponerle diseñadores. El Lead Diseño lo puede en
   *  CUALQUIER tarea de su alcance (Pedro 2026-09-21); todo lo demás ("actuar") sólo en las
   *  que llevan diseño o son suyas. `asignarTarea` ya le limita el cambio a diseñadores. */
  modo: "actuar" | "ver_o_asignar" = "actuar",
): Promise<ScopeResult> {
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
    // 0076 — el Lead Diseño es global, pero su carril es DISEÑO: actúa sobre las tareas que
    // llevan diseñador o en las que está asignado — no sobre todo el trabajo creativo de
    // ambos equipos. (El primer diseñador de una tarea lo pone el Lead Creativo o un admin.)
    if (u.member.disciplina === "diseno" && modo === "actuar") {
      const [{ data: lleva }, { data: suya }] = await Promise.all([
        admin.rpc("idea_requiere_diseno", { p_idea_id: ideaId }),
        admin.from("idea_assignments").select("id").eq("idea_id", ideaId).eq("member_id", u.member.id)
          .limit(1).maybeSingle(),
      ]);
      if (lleva !== true && !suya) {
        return { ok: false, error: "Esta tarea no lleva diseño." };
      }
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

type TablaFila = "planos" | "estaticos" | "copies_temas" | "copies";

/** La tarea (idea) dueña de una fila hija. `copies` llega por tema_id (2 saltos). */
export async function ideaDeFila(tabla: TablaFila, filaId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  if (tabla === "copies") {
    const { data } = await admin.from("copies").select("tema_id").eq("id", filaId).maybeSingle();
    const temaId = (data as { tema_id: string } | null)?.tema_id;
    return temaId ? ideaDeFila("copies_temas", temaId) : null;
  }
  const { data } = await admin.from(tabla).select("idea_id").eq("id", filaId).maybeSingle();
  return (data as { idea_id: string } | null)?.idea_id ?? null;
}

/** Same check, but resolving the idea from a child row (plano/estático/etc.). */
export async function assertCanActOnRow(tabla: TablaFila, filaId: string): Promise<ScopeResult> {
  const ideaId = await ideaDeFila(tabla, filaId);
  if (!ideaId) return { ok: false, error: "La fila ya no existe." };
  return assertCanActOnTask(ideaId);
}

/**
 * ¿Se puede EDITAR la plantilla de esta tarea? En revisión o cerrada (ESTADOS_SOLO_LECTURA)
 * sólo quien revisa AHORA (`assertPuedePedirCambios`, que ya exige lead-level). Antes sólo
 * las ediciones de CAMPO lo miraban; agregar/borrar planos, vaciar o importar el guión, los
 * temas/copies y los legales no — un asignado podía vaciar el guión de una pieza publicada.
 * Se compone DESPUÉS de assertCanActOnTask/Row. (reap 0076 M2)
 */
export async function assertPuedeEditar(ideaId: string): Promise<ScopeResult> {
  // 0076 — el Lead Diseño maneja SÓLO el lado de diseño (Pedro 2026-09-21): revisa, pide
  // cambios y reparte diseñadores; el CONTENIDO (guión, copies, legales) es de quien trabaja
  // la tarea y del Lead Creativo. Nunca edita, en ningún estado.
  const quien = await getCurrentUser();
  if (quien?.role === "lead" && quien.member?.disciplina === "diseno") {
    return { ok: false, error: "El Lead Diseño revisa y pide cambios; el contenido lo editan quien trabaja la tarea y el Lead Creativo." };
  }
  const { data } = await supabaseAdmin().from("ideas").select("status").eq("id", ideaId).maybeSingle();
  const status = (data as { status: AssetStatus } | null)?.status;
  if (!status) return { ok: false, error: "La tarea ya no existe." };
  if (!ESTADOS_SOLO_LECTURA.includes(status)) return { ok: true };
  const u = await getCurrentUser();
  if (!u || !canOverrideStatus(u.role)) return { ok: false, error: motivoSoloLectura(status) };
  return assertPuedePedirCambios(ideaId);
}

/** Igual, desde una fila hija. */
export async function assertPuedeEditarFila(tabla: TablaFila, filaId: string): Promise<ScopeResult> {
  const ideaId = await ideaDeFila(tabla, filaId);
  if (!ideaId) return { ok: false, error: "La fila ya no existe." };
  return assertPuedeEditar(ideaId);
}

/**
 * 0076 — ¿Puede esta persona revisar la PIEZA COMPLETA (aprobar → completado, enviar o
 * reenviar al cliente, mover a estados de lead)? Lead/admin/master como siempre, SALVO el
 * Lead Diseño: él aprueba el diseño y se lo pasa al Lead Creativo; sólo revisa completo si
 * es el lead ASIGNADO de esa tarea. Espejo del `esRevisorCompleto` que decide los botones
 * (lib/task-actions): el botón y la acción deben coincidir. Se compone DESPUÉS de
 * canOverrideStatus + assertCanActOnTask (esto no amplía, sólo acota).
 */
export async function assertRevisorCompleto(ideaId: string): Promise<ScopeResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Inicia sesión para continuar." };
  if (u.role !== "lead" || u.member?.disciplina !== "diseno") return { ok: true };
  const { data } = await supabaseAdmin()
    .from("idea_assignments")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("member_id", u.member.id)
    .eq("es_lead", true)
    .limit(1)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "El Lead Diseño aprueba el diseño; aprobar la pieza y enviarla al cliente es del Lead Creativo." };
  }
  return { ok: true };
}

/** 0076 — ¿Puede aprobar el DISEÑO? Lead Diseño, admin o master. */
export async function assertRevisorDiseno(): Promise<ScopeResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Inicia sesión para continuar." };
  if (u.role === "master" || u.role === "admin") return { ok: true };
  if (u.role === "lead" && u.member?.disciplina === "diseno") return { ok: true };
  return { ok: false, error: "Sólo el Lead Diseño aprueba el diseño." };
}

/**
 * 0076 — ¿Es quien revisa AHORA? El Lead Diseño, mientras la tarea está EN REVISIÓN con el
 * diseño pendiente; en cualquier otro caso lo decide `assertRevisorCompleto`. Una sola regla
 * para pedir cambios (botón, arrastre, correcciones localizadas), confirmar/descartar
 * correcciones y editar una tarea de sólo lectura.
 */
export async function assertPuedePedirCambios(ideaId: string): Promise<ScopeResult> {
  const { data: t } = await supabaseAdmin()
    .from("board_tasks").select("status, requiere_diseno, diseno_aprobado_at").eq("id", ideaId)
    .maybeSingle<{ status: string; requiere_diseno: boolean; diseno_aprobado_at: string | null }>();
  // SÓLO en revisión: una tarea aprobada "sin diseño" conserva diseno_aprobado_at null, y sin
  // este filtro el Lead Diseño podía arrastrar a correcciones una pieza publicada. (reap S2)
  const disenoPendiente = t?.status === "under_review" && !!t.requiere_diseno && !t.diseno_aprobado_at;
  if (disenoPendiente && (await assertRevisorDiseno()).ok) return { ok: true };
  return assertRevisorCompleto(ideaId);
}
