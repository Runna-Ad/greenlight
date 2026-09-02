import "server-only";

import type { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Qué tareas (de las dadas) tienen CAMBIOS DEL CLIENTE sin resolver — la "cancha del
 * lead": mientras el lead no los atienda/reasigne, un especialista NO debe ver esa tarea
 * (ni en el tablero, ni en Mi Trabajo, ni en el bundle de briefs).
 *
 * UNA sola consulta compartida. Antes el tablero y Mi Trabajo tenían cada uno su copia y
 * el bundle de briefs NO la tenía: la tarea desaparecía de dos superficies y seguía en la
 * tercera, editable. (reap pre-lanzamiento 2026-09-02, sweep S2)
 *
 * Sólo tiene sentido para tareas en `in_corrections`; el llamador pasa esos ids.
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
    .is("resolved_at", null)
    .returns<{ idea_id: string }[]>();
  return new Set((data ?? []).map((r) => r.idea_id));
}
