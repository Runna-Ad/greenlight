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
 * DOS fases, acotadas al working set (0060): primero la vista `brief_estado` dice qué
 * briefs del cliente siguen en curso (una fila por brief, calculado en la BD sobre TODAS
 * sus tareas vivas), y sólo después se traen las tareas de ESOS briefs. Antes se leían
 * todos los board_tasks del cliente y se filtraba en JS: crece con el histórico y
 * PostgREST corta en silencio al tope de filas — un brief con tareas pendientes fuera
 * del corte PARECÍA terminado y desaparecía de la lista. (Un `.limit()` lo agravaría.)
 *
 * El filtro por rol y el greenlit del bundle se siguen calculando en JS sobre las tareas
 * VISIBLES (bundle.ts): la vista sólo es un pre-filtro por brief, que es un superconjunto
 * — si algún subconjunto visible sigue en curso, el brief entero también.
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
  const db = supabaseAdmin();
  const { data: estados } = await db
    .from("brief_estado")
    .select("brief_id, n_tareas, greenlit_at")
    .eq("client_slug", clienteSlug)
    .returns<{ brief_id: string; n_tareas: number; greenlit_at: string | null }[]>();

  // Misma regla que abajo (bundleEnCurso), aplicada al brief entero. Un brief sin
  // tareas no puede formar bundle: fuera.
  const enCurso = (estados ?? [])
    .filter((e) => e.n_tareas > 0 && bundleEnCurso({ greenlitAt: e.greenlit_at }))
    .map((e) => e.brief_id);
  if (!enCurso.length) return [];

  const { data } = await db
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .in("brief_id", enCurso)
    .returns<BundleTask[]>();

  return agruparBundles((data ?? []).filter(filtroBundle(role, soyId, tracks)))
    .filter((b) => bundleEnCurso(b));
}
