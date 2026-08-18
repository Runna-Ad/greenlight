"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import { canMoveStatus, canOverrideStatus } from "@/lib/roles";
import { esCategoria } from "@/lib/tipos-cambio";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";

export type CorreccionResultado = { ok: true; id?: string } | { ok: false; error: string };

type Db = ReturnType<typeof supabaseAdmin>;

/** Perfil al que se atribuye la acción mientras no hay login (author_id). */
async function actorId(db: Db): Promise<string | null> {
  const { data } = await db
    .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Ubicación exacta a la que apunta una corrección. */
export type CorreccionTarget = {
  tabla: "planos" | "estaticos" | "ideas" | "brief";
  filaId: string | null;
  campo: string;
  label: string;
  /** Ancla por selección de texto (opcional): el substring citado + offsets. */
  quote?: string | null;
  start?: number | null;
  end?: number | null;
  /** Tipo de cambio (rúbrica). OBLIGATORIO para un cambio interno — alimenta la
   *  Evaluación. El lado del cliente no manda categoría. */
  categoria?: string | null;
};

const TABLAS_VALIDAS = new Set(["planos", "estaticos", "ideas", "brief"]);

function revalida(clienteSlug: string) {
  revalidatePath("/[cliente]/tareas/[id]", "page");
  if (clienteSlug) revalidatePath(`/${clienteSlug}/tablero`);
  revalidatePath("/mi-trabajo");
}

/**
 * El Dept Head fija una corrección a un campo concreto. NO mueve el estado: las
 * correcciones se acumulan mientras revisa; "Mandar a correcciones" las envía.
 */
export async function agregarCorreccion(
  ideaId: string,
  target: CorreccionTarget,
  body: string,
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead puede pedir cambios." };
  }
  if (!TABLAS_VALIDAS.has(target.tabla)) return { ok: false, error: "Destino inválido." };
  if (!body.trim()) return { ok: false, error: "Escribe qué hay que corregir." };
  // El tipo de cambio es obligatorio para un cambio interno: es lo que puntúa la
  // Evaluación. Sin categoría válida no se fija.
  if (!esCategoria(target.categoria)) {
    return { ok: false, error: "Elige el tipo de cambio." };
  }

  const db = supabaseAdmin();
  // Los params del ancla por selección se mandan SÓLO si hay quote (PostgREST
  // resuelve por NOMBRE de argumento). OJO: desde 0034 SIEMPRE mandamos
  // p_categoria, así que este código EXIGE la firma de 0034 — la migración 0034
  // debe aplicarse CON o ANTES del deploy de este código; si no, la RPC no existe
  // y crear un cambio falla. Mismo acoplamiento que el `select categoria` de page.tsx.
  const params: Record<string, unknown> = {
    p_idea_id: ideaId,
    p_target_tabla: target.tabla,
    p_target_fila: target.filaId,
    p_target_campo: target.campo,
    p_target_label: target.label,
    p_body: body.trim(),
    p_actor_member: soy?.id ?? null,
    p_actor: await actorId(db),
    p_categoria: target.categoria,
  };
  const quote = target.quote?.trim();
  if (quote) {
    params.p_target_quote = quote;
    params.p_target_start = target.start ?? null;
    params.p_target_end = target.end ?? null;
  }
  const { data, error } = await db.rpc("rpc_add_correction", params);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as string) ?? undefined };
}

/**
 * Cambia el estado de UNA corrección.
 *  - "done"   = el especialista la marca atendida (ámbar)
 *  - "open"   = reabrir (limpia atendido y confirmación)
 *  - "closed" = el revisor la confirma (verde) — SÓLO lead
 */
export async function setEstadoCorreccion(
  ideaId: string,
  commentId: string,
  estado: "open" | "done" | "closed",
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no toca las correcciones." };
  if (estado === "closed" && !canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead confirma una corrección." };
  }

  const db = supabaseAdmin();
  const patch: Record<string, string | null> =
    estado === "done"
      ? { atendido_at: new Date().toISOString(), atendido_by: soy?.id ?? null, resolved_at: null, resolved_by: null, resolved_member_id: null }
      : estado === "open"
        ? { atendido_at: null, atendido_by: null, resolved_at: null, resolved_by: null, resolved_member_id: null }
        : { resolved_at: new Date().toISOString(), resolved_member_id: soy?.id ?? null, resolved_by: await actorId(db) };

  const { error } = await db
    .from("comments").update(patch).eq("id", commentId).eq("idea_id", ideaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * El revisor DESCARTA una corrección que fijó (cambió de opinión). Borrado duro
 * de la fila de `comments` — no queda historial (esa es la intención: "nunca la
 * quise pedir"). Sólo el revisor (canOverrideStatus). El scope por id + idea_id +
 * kind evita borrar por error otra tarea u otro tipo de comentario.
 *
 * No mueve el estado ni avisa. La ronda se auto-cura: correction_next_round mira
 * "¿queda alguna sin resolver?" y el botón de acción mira el conteo vivo; al
 * refrescar, ambos recalculan solos (borrar la última abierta NO deja colgada la
 * tarea — mandar-a-correcciones ya exige conteo>0, y aprobar sigue disponible).
 */
export async function descartarCorreccion(
  ideaId: string,
  commentId: string,
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead descarta una corrección." };
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .eq("kind", "correction_request");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** El revisor confirma (verde) TODAS las correcciones abiertas de un campo. */
export async function confirmarCampo(
  ideaId: string,
  tabla: string,
  filaId: string | null,
  campo: string,
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead confirma correcciones." };

  const db = supabaseAdmin();
  const soy = await getSoy();
  let qy = db
    .from("comments")
    .update({ resolved_at: new Date().toISOString(), resolved_member_id: soy?.id ?? null, resolved_by: await actorId(db) })
    .eq("idea_id", ideaId)
    .eq("kind", "correction_request")
    .is("resolved_at", null)
    .eq("target_tabla", tabla)
    .eq("target_campo", campo);
  qy = filaId === null ? qy.is("target_fila_id", null) : qy.eq("target_fila_id", filaId);

  const { error } = await qy;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Mandar la ronda a correcciones (under_review → in_corrections). Lead. */
export async function mandarCorrecciones(
  clienteSlug: string,
  ideaId: string,
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead manda correcciones." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_send_corrections", {
    p_idea_id: ideaId,
    p_actor_member: soy?.id ?? null,
    p_actor: await actorId(db),
  });
  if (error) return { ok: false, error: error.message };
  revalida(clienteSlug);
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** Devolver a revisión (in_corrections → under_review). El especialista. */
export async function devolverARevision(
  clienteSlug: string,
  ideaId: string,
): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no devuelve a revisión." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_return_review", {
    p_idea_id: ideaId,
    p_actor_member: soy?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalida(clienteSlug);
  after(() => dispatchPendingEmails());
  return { ok: true };
}
