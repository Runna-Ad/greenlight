import "server-only";

import type { supabaseAdmin } from "@/lib/supabase-admin";
import { plantillaPara, requiereCortinilla } from "@/lib/plantilla";

export const MSG_FALTA_LEGAL =
  "Agrega la cortinilla de cierre (legales) antes de mandar a revisión.";

/**
 * La cortinilla de cierre (legales) es OBLIGATORIA para mandar a revisión: video y estático
 * la llevan (copies no). "Tiene legal" = un snippet legal elegido (idea_snippets, que sólo
 * guarda legales) O texto libre en `ideas.legales_libres`. Fuente ÚNICA — la comparten TODAS
 * las puertas a under_review (submitForReview, moveTask, devolverARevision), o el legal se
 * saltaría por la que quede sin gatear (fix-the-class). (Pedro 2026-09-03)
 */
export async function faltaCortinilla(
  db: ReturnType<typeof supabaseAdmin>,
  ideaId: string,
): Promise<boolean> {
  const { data: idea } = await db
    .from("ideas")
    .select("tipo_asset, legales_libres")
    .eq("id", ideaId)
    .maybeSingle<{ tipo_asset: string | null; legales_libres: string | null }>();
  if (!idea) return false; // la tarea ya no existe: que el flujo normal lo maneje
  if (!requiereCortinilla(plantillaPara(idea.tipo_asset))) return false; // copies no lleva
  if (idea.legales_libres?.trim()) return false; // legal por texto libre
  const { count } = await db
    .from("idea_snippets")
    .select("*", { count: "exact", head: true })
    .eq("idea_id", ideaId);
  return (count ?? 0) === 0; // sin snippet legal elegido tampoco → falta
}
