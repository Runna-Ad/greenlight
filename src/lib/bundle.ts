// El BUNDLE: las tareas de un brief, en un orden estable, filtradas por rol.
//
// UNA sola fuente. La página de briefs (los cards) y la página de tarea (las
// flechas ← 2/10 →) llaman a esto mismo; si cada pantalla calculara el bundle
// por su cuenta, las flechas dirían 2/10 y la lista enseñaría 8.
//
// La CARGA (Supabase) vive en bundle-data.ts, no aquí: este archivo sólo tiene
// lógica pura para poder probarse sin base ni `server-only`.

import type { ViewRole } from "@/lib/roles";
import type { AssetStatus } from "@/lib/brand";

export type BundleTask = {
  id: string;
  code: string | null;
  status: AssetStatus;
  naming_base: string | null;
  concepto: string | null;
  tipo_asset: string | null;
  duracion: string[] | null;
  marca: string | null;
  plataformas: string[] | null;
  file_count: number;
  member_ids: string[];
  members: { id: string; name: string; color: string }[];
  brief_id: string;
  brief_title: string | null;
  brief_tab: string | null;
  client_slug: string | null;
};

/**
 * El filtro por rol, como función pura y probada aparte.
 *
 * Especialista → sólo sus tareas asignadas (necesita una sesión con un miembro
 * ligado — sin identidad, su bundle es vacío, no "todo"). Los demás roles internos
 * ven el bundle completo. El cliente no llega aquí: la página lo bloquea antes.
 */
export function filtroBundle(
  role: ViewRole,
  soyId: string | null,
): (t: Pick<BundleTask, "member_ids">) => boolean {
  if (role !== "creative") return () => true;
  if (!soyId) return () => false;
  return (t) => t.member_ids.includes(soyId);
}

/**
 * El orden del bundle, como comparador ÚNICO.
 * Por código de idea (A1, A2, B1…) y con desempate por id: sin el desempate,
 * dos tareas sin código harían que las flechas saltaran de orden entre cargas.
 */
export function compararBundle(
  a: Pick<BundleTask, "code" | "id">,
  b: Pick<BundleTask, "code" | "id">,
): number {
  const ca = a.code ?? "￿"; // sin código → al final
  const cb = b.code ?? "￿";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type Bundle = {
  brief_id: string;
  brief_title: string | null;
  brief_tab: string | null;
  tasks: BundleTask[];
};

/** Agrupa las tareas visibles por brief y las ordena (lógica pura, testeable). */
export function agruparBundles(visibles: BundleTask[]): Bundle[] {
  const porBrief = new Map<string, Bundle>();
  for (const t of visibles) {
    let b = porBrief.get(t.brief_id);
    if (!b) {
      b = { brief_id: t.brief_id, brief_title: t.brief_title, brief_tab: t.brief_tab, tasks: [] };
      porBrief.set(t.brief_id, b);
    }
    b.tasks.push(t);
  }
  for (const b of porBrief.values()) b.tasks.sort(compararBundle);

  // Briefs con más tareas primero; empate → por título, estable.
  return [...porBrief.values()].sort(
    (a, b) =>
      b.tasks.length - a.tasks.length ||
      (a.brief_title ?? "").localeCompare(b.brief_title ?? ""),
  );
}

/** Las columnas que la vista board_tasks expone para un bundle. */
export const BUNDLE_SELECT =
  "id, code, status, naming_base, concepto, tipo_asset, duracion, marca, plataformas, file_count, member_ids, members, brief_id, brief_title, brief_tab, client_slug";

/** Dónde está esta tarea dentro de su bundle — alimenta las flechas ← n/N →. */
export function posicionEnBundle(tasks: BundleTask[], ideaId: string) {
  const i = tasks.findIndex((t) => t.id === ideaId);
  return {
    // -1 = la tarea abierta no está en el bundle filtrado (p. ej. un
    // especialista abrió por URL una tarea ajena): se enseña "— / n" y las
    // flechas se apagan. No se cae ni se cambia el filtro en silencio.
    indice: i,
    total: tasks.length,
    anterior: i > 0 ? tasks[i - 1] : null,
    siguiente: i >= 0 && i < tasks.length - 1 ? tasks[i + 1] : null,
  };
}
