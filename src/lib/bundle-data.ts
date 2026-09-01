// La carga de bundles desde Supabase. Aparte de bundle.ts para que la lógica
// pura (filtro, orden, agrupación) se pruebe sin base ni `server-only`.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ViewRole } from "@/lib/roles";
import type { Track } from "@/lib/vocab";
import {
  BUNDLE_SELECT,
  agruparBundles,
  compararBundle,
  filtroBundle,
  bundleEnCurso,
  type Bundle,
  type BundleTask,
} from "@/lib/bundle";

/** Las tareas de UN brief, ya filtradas y ordenadas. */
export async function cargarBundle(
  briefId: string,
  role: ViewRole,
  soyId: string | null,
  tracks: Track[] | null,
): Promise<BundleTask[]> {
  const { data } = await supabaseAdmin()
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .eq("brief_id", briefId)
    .returns<BundleTask[]>();

  return (data ?? []).filter(filtroBundle(role, soyId, tracks)).sort(compararBundle);
}

/**
 * Todos los bundles de un cliente PARA LA LISTA de briefs: los que siguen en curso, más
 * los cerrados hace ≤7 días. Un brief entregado por completo se queda una semana a la
 * vista y luego vive en Entregas (que ya los agrupa por brief) — la misma regla que las
 * tareas en el tablero, para que la lista no crezca sin fin. (Pedro 2026-09-01)
 *
 * `cargarBundle` (singular) NO filtra: las flechas ← n/N → de una tarea tienen que
 * seguir funcionando dentro de un brief ya archivado.
 */
export async function cargarBundles(
  clienteSlug: string,
  role: ViewRole,
  soyId: string | null,
  tracks: Track[] | null,
): Promise<Bundle[]> {
  const { data } = await supabaseAdmin()
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .eq("client_slug", clienteSlug)
    .returns<BundleTask[]>();

  return agruparBundles((data ?? []).filter(filtroBundle(role, soyId, tracks)))
    .filter((b) => bundleEnCurso(b));
}
