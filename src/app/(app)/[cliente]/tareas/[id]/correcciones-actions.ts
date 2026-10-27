"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import { canMoveStatus, canOverrideStatus } from "@/lib/roles";
import { transicionRequiereLead } from "@/lib/task-actions";
import { esCategoria } from "@/lib/tipos-cambio";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { getCurrentUser } from "@/lib/identity";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import { faltaCortinilla, MSG_FALTA_LEGAL } from "@/lib/cortinilla";
import { enCanchaDelLead, MSG_CANCHA_DEL_LEAD } from "@/lib/cambios-pendientes";
import { RESPUESTA_MAX, destinoRespuesta, type DestinoRespuesta } from "@/lib/correcciones";
import { piezaEnPortal } from "@/lib/portal-bucket";

export type CorreccionResultado = { ok: true; id?: string } | { ok: false; error: string };

/** El perfil del usuario autenticado — para atribuir la acción (author_id). */
async function actorId(): Promise<string | null> {
  return (await getCurrentUser())?.userId ?? null;
}

/** Ubicación exacta a la que apunta una corrección. `copies_temas`/`copies` entran
 *  aquí porque los Copies son entregables al cliente: el cliente ancla cambios a un
 *  tema/copy en el portal, igual que a un plano/estático (0046). */
export type CorreccionTarget = {
  tabla: "planos" | "estaticos" | "ideas" | "brief" | "copies_temas" | "copies";
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

const TABLAS_VALIDAS = new Set(["planos", "estaticos", "ideas", "brief", "copies_temas", "copies"]);

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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

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
    p_actor: await actorId(),
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const patch: Record<string, string | null> =
    estado === "done"
      ? { atendido_at: new Date().toISOString(), atendido_by: soy?.id ?? null, resolved_at: null, resolved_by: null, resolved_member_id: null }
      : estado === "open"
        ? { atendido_at: null, atendido_by: null, resolved_at: null, resolved_by: null, resolved_member_id: null }
        : { resolved_at: new Date().toISOString(), resolved_member_id: soy?.id ?? null, resolved_by: await actorId() };
  // Cualquier cambio de estado deja de ser "sin cambio" (0085): reabrir, atender o confirmar.
  const patchFinal: Record<string, string | boolean | null> = { ...patch, sin_cambio: false };

  // Sólo correcciones (internas o del cliente): sin el filtro por `kind`, el mismo POST
  // podía sellar atendido/confirmado en CUALQUIER comentario de la tarea (una aprobación,
  // una nota). Mismo filtro que descartarCorreccion. Si no matchea nada, se DICE (antes
  // devolvía ok con 0 filas tocadas).
  const { data, error } = await db
    .from("comments")
    .update(patchFinal)
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .in("kind", ["correction_request", "client_change"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Esa corrección ya no existe." };
  return { ok: true };
}

/**
 * El lead cierra un cambio del CLIENTE como "Sin cambio (acordado)" (0085, Pedro
 * 2026-10-27): lo hablaron en el hilo y el cliente aceptó no hacerlo. Queda RESUELTO
 * (no bloquea la ronda ni la aprobación) pero no se presenta como "Aplicado" ni entra a
 * lo que el cliente tiene que revisar. La razón ya está en el hilo: no se pide otra.
 */
export async function cerrarSinCambio(ideaId: string, commentId: string): Promise<CorreccionResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead cierra un cambio sin cambio." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  // YA confirmado (lo más común: "Reenviar al cliente" confirma todo, y el "ok, déjalo" del
  // cliente llega después — Pedro 2026-10-27): sólo se marca, sin tocar quién/cuándo resolvió.
  const ya = await db
    .from("comments")
    .update({ sin_cambio: true })
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .eq("kind", "client_change")
    .not("ronda", "is", null)
    .not("resolved_at", "is", null)
    .select("id");
  if (ya.error) return { ok: false, error: ya.error.message };
  if (ya.data?.length) return { ok: true };

  // Aún abierto: se resuelve aquí mismo.
  const { data, error } = await db
    .from("comments")
    .update({
      sin_cambio: true,
      atendido_at: null,
      atendido_by: null,
      resolved_at: new Date().toISOString(),
      resolved_member_id: soy?.id ?? null,
      resolved_by: await actorId(),
    })
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .eq("kind", "client_change")
    .not("ronda", "is", null)
    .is("resolved_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Ese cambio del cliente ya no existe." };
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  // Incluye client_change: los cambios del cliente son correcciones de primera clase
  // (0038) — el lead puede descartarlos igual (decidir no honrar el pedido).
  const { error } = await db
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .in("kind", ["correction_request", "client_change"]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type RespuestaResultado =
  | { ok: true; id: string; destino: DestinoRespuesta }
  /** `destinoCambio`: la pantalla está vieja (el "Va para" ya no es cierto) → refrescar. */
  | { ok: false; error: string; destinoCambio?: boolean };

/**
 * Responde en el hilo de un cambio (0082/0083). El DESTINO se decide solo
 * (`destinoRespuesta`, la misma regla que pinta el letrero "Va para"): en un cambio del
 * cliente que sigue en la cancha del lead, o si lo último lo escribió el cliente, lo que
 * contesta un lead le llega AL CLIENTE; todo lo demás queda en el equipo. La RPC guarda,
 * valida (nada interno puede ir al cliente) y crea los avisos en un solo paso.
 */
export async function responderCorreccion(
  ideaId: string,
  commentId: string,
  body: string,
  /** El destino que la pantalla le ENSEÑÓ a quien escribe ("Va para"). Si al enviar ya es
   *  otro (el cliente contestó entretanto, o mandó otra ronda), no se guarda nada: así
   *  una nota interna nunca le llega al cliente por una pantalla vieja. */
  destinoEsperado: DestinoRespuesta,
): Promise<RespuestaResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no responde en los cambios." };
  const texto = body.trim();
  if (!texto) return { ok: false, error: "Escribe tu respuesta." };
  if (texto.length > RESPUESTA_MAX) {
    return { ok: false, error: `La respuesta pasa de ${RESPUESTA_MAX} caracteres.` };
  }
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  // El cambio debe ser de ESTA tarea: interno, o del cliente YA ENVIADO (ronda not null),
  // el mismo filtro con que page.tsx los carga. (La RPC lo vuelve a exigir.)
  const { data: cambio, error: errCambio } = await db
    .from("comments")
    .select("id, kind")
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .or("kind.eq.correction_request,and(kind.eq.client_change,ronda.not.is.null)")
    .maybeSingle<{ id: string; kind: string }>();
  if (errCambio) return { ok: false, error: errCambio.message };
  if (!cambio) return { ok: false, error: "Ese cambio ya no existe." };

  const cambioDelCliente = cambio.kind === "client_change";
  let destino: DestinoRespuesta = "equipo";
  if (cambioDelCliente && canOverrideStatus(role)) {
    const [{ data: pieza }, { data: ultima }] = await Promise.all([
      // Bandera CRUDA (sin mirar el estado), igual que el letrero del panel (page.tsx):
      // el trigger la apaga al salir de in_corrections, y piezaEnPortal cubre el resto.
      db
        .from("ideas")
        .select("status, deleted_at, published_at, cambios_cliente_en_lead")
        .eq("id", ideaId)
        .maybeSingle<{
          status: string;
          deleted_at: string | null;
          published_at: string | null;
          cambios_cliente_en_lead: boolean;
        }>(),
      db
        .from("correccion_respuestas")
        .select("de_cliente")
        .eq("comment_id", commentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ de_cliente: boolean }>(),
    ]);
    destino = destinoRespuesta({
      cambioDelCliente,
      esLead: true,
      enCanchaDelLead: !!pieza?.cambios_cliente_en_lead,
      ultimaDeCliente: !!ultima?.de_cliente,
      piezaEnPortal: !!pieza && piezaEnPortal(pieza),
    });
  }
  if (destino !== destinoEsperado) {
    return {
      ok: false,
      destinoCambio: true,
      error:
        destino === "cliente"
          ? "Mientras escribías, el cliente contestó: esta respuesta ahora le llegaría a él. Revisa y vuelve a enviar."
          : "Esta respuesta ya no le llegaría al cliente (la pieza cambió de etapa). Revisa y vuelve a enviar.",
    };
  }

  const { data, error } = await db.rpc("rpc_responder_cambio", {
    p_comment_id: commentId,
    p_idea_id: ideaId,
    p_body: texto,
    p_de_cliente: false,
    p_para_cliente: destino === "cliente",
    p_actor_member: soy?.id ?? null,
    p_actor_profile: await actorId(),
  });
  // 23503 = el cambio se descartó entre la verificación y el guardado.
  if (error?.code === "23503") return { ok: false, error: "Ese cambio ya no existe." };
  if (error) return { ok: false, error: error.message };
  after(() => dispatchPendingEmails());
  return { ok: true, id: data as string, destino };
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
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const soy = await getSoy();
  let qy = db
    .from("comments")
    .update({ resolved_at: new Date().toISOString(), resolved_member_id: soy?.id ?? null, resolved_by: await actorId() })
    .eq("idea_id", ideaId)
    .in("kind", ["correction_request", "client_change"])
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
  // Gate derivado del MISMO allowlist que moveTask (DOER_TRANSITIONS), no hardcodeado:
  // así este mover no puede driftar del tablero si la lista de transiciones cambia.
  if (transicionRequiereLead("under_review", "in_corrections") ? !canOverrideStatus(role) : !canMoveStatus(role))
    return { ok: false, error: "Sólo un lead manda correcciones." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_task_send_corrections", {
    p_idea_id: ideaId,
    p_actor_member: soy?.id ?? null,
    p_actor: await actorId(),
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
  // Mismo allowlist compartido (in_corrections→under_review es transición de doer).
  if (transicionRequiereLead("in_corrections", "under_review") ? !canOverrideStatus(role) : !canMoveStatus(role))
    return { ok: false, error: "Este rol no devuelve a revisión." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  if (!canOverrideStatus(role) && (await enCanchaDelLead(db, ideaId))) {
    return { ok: false, error: MSG_CANCHA_DEL_LEAD };
  }
  // Devolver a revisión es OTRA puerta a under_review: se gatea la cortinilla igual que
  // "Mandar a revisión" y el arrastre del tablero (guard-all-paths). (Pedro 2026-09-03)
  if (await faltaCortinilla(db, ideaId)) return { ok: false, error: MSG_FALTA_LEGAL };
  const { error } = await db.rpc("rpc_task_return_review", {
    p_idea_id: ideaId,
    p_actor_member: soy?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalida(clienteSlug);
  after(() => dispatchPendingEmails());
  return { ok: true };
}
