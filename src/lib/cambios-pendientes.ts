import "server-only";

import type { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Qué tareas (de las dadas) están en la "cancha del LEAD" por cambios del CLIENTE: hay
 * cambios del cliente ENVIADOS esta ronda (ronda != null), resueltos o no. Mientras dure,
 * un especialista NO ve esa tarea (ni en el tablero, ni en Mi Trabajo, ni en el bundle).
 * La cancha vuelve cuando el lead ENVÍA o REASIGNA (cambia el status fuera de in_corrections),
 * NO cuando confirma cada cambio — si no, al confirmar el último la tarea reaparecía al
 * especialista a media ventana. Misma regla que `clientChangesPending` en la tarea. (Pedro 2026-09-03)
 *
 * UNA sola consulta compartida (tablero · Mi Trabajo · bundle). Sólo tiene sentido para
 * tareas en `in_corrections`; el llamador pasa esos ids.
 */
export async function ideasConCambiosDelCliente(
  db: ReturnType<typeof supabaseAdmin>,
  ideaIds: string[],
): Promise<Set<string>> {
  if (!ideaIds.length) return new Set();
  const { data } = await db
    .from("comments")
    .select("idea_id")
    .in("idea_id", ideaIds)
    .eq("kind", "client_change")
    .not("ronda", "is", null)
    .returns<{ idea_id: string }[]>();
  return new Set((data ?? []).map((r) => r.idea_id));
}
