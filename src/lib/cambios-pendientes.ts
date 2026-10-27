import "server-only";

import type { supabaseAdmin } from "@/lib/supabase-admin";
import { clienteEscribioUltimo } from "@/lib/correcciones";

/**
 * Qué tareas (de las dadas) están en la "cancha del LEAD" por cambios del CLIENTE: el
 * cliente envió cambios y el lead todavía no los enruta. Mientras dure, un especialista
 * NO ve esa tarea (ni en el tablero, ni en Mi Trabajo, ni en el bundle).
 *
 * La fuente es la bandera `ideas.cambios_cliente_en_lead` (0077): la PRENDE el envío del
 * cliente y la APAGAN el enrutado del lead (asignar un especialista nuevo, o "Reasignar")
 * y cualquier salida de in_corrections. Confirmar cambios NO la apaga (al confirmar el
 * último la tarea no debe reaparecerle al especialista a media ventana — Pedro 2026-09-03).
 * Antes se DERIVABA de "existe un client_change enviado" — de cualquier ronda, para
 * siempre: asignar a la especialista desde el picker no la sacaba, y una tarea con
 * historial de cliente se volvía a esconder en cada ronda interna. (Pedro 2026-10-05)
 *
 * UNA sola consulta compartida (tablero · Mi Trabajo · bundle).
 */
export async function ideasConCambiosDelCliente(
  db: ReturnType<typeof supabaseAdmin>,
  ideaIds: string[],
): Promise<Set<string>> {
  if (!ideaIds.length) return new Set();
  const { data } = await db
    .from("ideas")
    .select("id")
    .in("id", ideaIds)
    .eq("cambios_cliente_en_lead", true)
    .returns<{ id: string }[]>();
  return new Set((data ?? []).map((r) => r.id));
}

export const MSG_CANCHA_DEL_LEAD =
  "El cliente pidió cambios y esperan al lead: él los hace o te los asigna. Recarga la página.";

/**
 * Gate del SERVIDOR para la cancha del lead: mientras la bandera esté prendida, sólo un
 * revisor (lead/admin/master) mueve la tarea. La UI ya esconde Retomar/Devolver al
 * especialista, pero una pestaña vieja o un POST directo los ejecutaban igual — y al salir
 * de in_corrections el trigger apaga la bandera, así que los cambios del cliente se
 * saltaban el enrutado del lead. Lo comparten startTask, submitForReview,
 * devolverARevision y moveTask (todas las puertas de salida del especialista). (Pedro 2026-10-08)
 */
export async function enCanchaDelLead(
  db: ReturnType<typeof supabaseAdmin>,
  ideaId: string,
): Promise<boolean> {
  return (await ideasConCambiosDelCliente(db, [ideaId])).has(ideaId);
}

/**
 * Qué tareas en correcciones están trabajando, AHORA, cambios que pidió el CLIENTE: la
 * ronda actual (la más alta entre correcciones internas y cambios del cliente enviados)
 * trae al menos un client_change. Es la pastilla "Cambios pedidos por el cliente" del
 * tablero — la ve el lead (antes de enrutar) y el especialista (después). Una ronda
 * interna posterior ya no la muestra.
 */
export async function ideasEnRondaDelCliente(
  db: ReturnType<typeof supabaseAdmin>,
  ideaIds: string[],
): Promise<Set<string>> {
  if (!ideaIds.length) return new Set();
  const { data } = await db
    .from("comments")
    .select("idea_id, kind, ronda")
    .in("idea_id", ideaIds)
    .in("kind", ["correction_request", "client_change"])
    .returns<{ idea_id: string; kind: string; ronda: number | null }[]>();
  // Un borrador del cliente (ronda null) no cuenta; una corrección interna sin ronda es la 1
  // (mismo criterio que correction_next_round).
  const filas = (data ?? []).filter((r) => r.kind === "correction_request" || r.ronda != null);
  const max = new Map<string, number>();
  for (const r of filas) max.set(r.idea_id, Math.max(max.get(r.idea_id) ?? 0, r.ronda ?? 1));
  return new Set(
    filas
      .filter((r) => r.kind === "client_change" && r.ronda === max.get(r.idea_id))
      .map((r) => r.idea_id),
  );
}

/**
 * Qué tareas (de las dadas) tienen una RESPUESTA DEL CLIENTE esperando al lead: en algún
 * cambio suyo (enviado), lo último del hilo visible para él lo escribió el cliente. Es la
 * pastilla "El cliente respondió" de Mi Trabajo (Pedro 2026-10-27). Se apaga cuando el
 * lead le contesta. Lee por páginas: PostgREST corta en silencio a 1000 filas.
 */
export async function ideasConRespuestaDelCliente(
  db: ReturnType<typeof supabaseAdmin>,
  ideaIds: string[],
): Promise<Set<string>> {
  if (!ideaIds.length) return new Set();
  type Resp = { idea_id: string; comment_id: string; created_at: string; de_cliente: boolean; para_cliente: boolean };
  const PAGINA = 1000;
  const resps: Resp[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("correccion_respuestas")
      .select("idea_id, comment_id, created_at, de_cliente, para_cliente")
      .in("idea_id", ideaIds)
      .or("de_cliente.eq.true,para_cliente.eq.true")
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) {
      console.error("[mi-trabajo] respuestas del cliente:", error.message);
      return new Set();
    }
    resps.push(...((data ?? []) as Resp[]));
    if ((data ?? []).length < PAGINA) break;
  }
  const porIdea = new Map<string, { commentId: string; createdAt: string; deCliente: boolean; paraCliente: boolean }[]>();
  for (const r of resps) {
    (porIdea.get(r.idea_id) ?? porIdea.set(r.idea_id, []).get(r.idea_id)!).push({
      commentId: r.comment_id, createdAt: r.created_at, deCliente: r.de_cliente, paraCliente: r.para_cliente,
    });
  }
  return new Set([...porIdea].filter(([, rs]) => clienteEscribioUltimo(rs)).map(([id]) => id));
}
