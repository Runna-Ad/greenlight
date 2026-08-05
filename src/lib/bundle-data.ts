// La carga de bundles desde Supabase. Aparte de bundle.ts para que la lógica
// pura (filtro, orden, agrupación) se pruebe sin base ni `server-only`.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ViewRole } from "@/lib/roles";
import {
  BUNDLE_SELECT,
  agruparBundles,
  compararBundle,
  filtroBundle,
  type Bundle,
  type BundleTask,
} from "@/lib/bundle";

/** Las tareas de UN brief, ya filtradas y ordenadas. */
export async function cargarBundle(
  briefId: string,
  role: ViewRole,
  soyId: string | null,
): Promise<BundleTask[]> {
  const { data } = await supabaseAdmin()
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .eq("brief_id", briefId)
    .returns<BundleTask[]>();

  return (data ?? []).filter(filtroBundle(role, soyId)).sort(compararBundle);
}

/** Todos los bundles de un cliente (la página de briefs). */
export async function cargarBundles(
  clienteSlug: string,
  role: ViewRole,
  soyId: string | null,
): Promise<Bundle[]> {
  const { data } = await supabaseAdmin()
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .eq("client_slug", clienteSlug)
    .returns<BundleTask[]>();

  return agruparBundles((data ?? []).filter(filtroBundle(role, soyId)));
}
