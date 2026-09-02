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
import type { Track } from "@/lib/vocab";

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
  track: "real" | "normal";
  member_ids: string[];
  members: { id: string; name: string; color: string }[];
  brief_id: string;
  brief_title: string | null;
  brief_tab: string | null;
  client_slug: string | null;
  /** Cuándo se entregó (Greenlit). null = aún no. Lo expone la vista desde 0058. */
  delivered_at: string | null;
};

/** La ventana en la que el trabajo ya entregado sigue A LA VISTA antes de vivir sólo
 *  en Entregas. UNA constante: la usan la columna Greenlit del tablero y la lista de
 *  briefs. Si cada pantalla tuviera la suya, un día dirían cosas distintas. */
export const MS_VENTANA_GREENLIT = 7 * 24 * 60 * 60 * 1000;

/** ¿Se entregó hace ≤7 días? (null = nunca entregado → false) */
export function esGreenlitReciente(deliveredAt: string | null | undefined, ahora = Date.now()): boolean {
  return !!deliveredAt && ahora - new Date(deliveredAt).getTime() <= MS_VENTANA_GREENLIT;
}

/**
 * El filtro por rol, como función pura y probada aparte.
 *
 * Especialista → sólo sus tareas asignadas (sin identidad, bundle vacío, no "todo").
 * LEAD → sólo sus track(s) otorgados (grant multi-track) — antes veía AMBOS tracks,
 * inconsistente con el tablero/Evaluación que sí acotan (reap S3). Admin/master → todo.
 * El cliente no llega aquí: la página lo bloquea antes.
 */
export function filtroBundle(
  role: ViewRole,
  soyId: string | null,
  tracks: Track[] | null,
  /** Tareas en in_corrections con cambios del CLIENTE sin resolver (cancha del lead):
   *  el especialista NO las ve — la MISMA exclusión que el tablero y Mi Trabajo. Sin
   *  esto la tarea desaparecía de esas dos superficies y seguía en el bundle, editable.
   *  (reap 2026-09-02, sweep S2) */
  conCambiosDelCliente: ReadonlySet<string> = new Set(),
): (t: Pick<BundleTask, "id" | "status" | "member_ids" | "track">) => boolean {
  if (role === "creative") {
    if (!soyId) return () => false;
    return (t) =>
      t.member_ids.includes(soyId) &&
      !(t.status === "in_corrections" && conCambiosDelCliente.has(t.id));
  }
  if (role === "lead") {
    if (!tracks || !tracks.length) return () => false;
    return (t) => tracks.includes(t.track);
  }
  return () => true; // admin/master: vista global
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
  /**
   * El brief está GREENLIT: todas sus tareas vivas están entregadas. Vale la fecha de
   * la ÚLTIMA entrega (la que cierra el brief) — o null si aún queda trabajo.
   * DERIVADO de las tareas, nunca guardado: si alguien reabre una entregada, el brief
   * deja de estar greenlit solo. (Pedro 2026-09-01)
   */
  greenlitAt: string | null;
};

/**
 * ¿El brief está entregado por completo? Sí cuando tiene AL MENOS una tarea y todas
 * están `delivered` con fecha. La condición de "al menos una" no es un detalle: sin
 * ella un brief vacío cumple "todas entregadas" por vacuidad y desaparecería de la
 * lista recién creado. Devuelve la fecha de la última entrega, o null.
 */
export function greenlitDeBundle(tasks: Pick<BundleTask, "status" | "delivered_at">[]): string | null {
  if (!tasks.length) return null;
  let ultima: string | null = null;
  for (const t of tasks) {
    if (t.status !== "delivered" || !t.delivered_at) return null;
    if (!ultima || t.delivered_at > ultima) ultima = t.delivered_at;
  }
  return ultima;
}

/**
 * ¿Este brief se sigue mostrando en /briefs? Sí mientras tenga trabajo en curso, o si
 * se cerró hace ≤7 días. Los más viejos viven en Entregas (que los agrupa por brief),
 * así que la lista deja de crecer para siempre. MISMA ventana que el tablero.
 */
export function bundleEnCurso(b: Pick<Bundle, "greenlitAt">, ahora = Date.now()): boolean {
  return !b.greenlitAt || esGreenlitReciente(b.greenlitAt, ahora);
}

/** Agrupa las tareas visibles por brief y las ordena (lógica pura, testeable). */
export function agruparBundles(visibles: BundleTask[]): Bundle[] {
  const porBrief = new Map<string, Bundle>();
  for (const t of visibles) {
    let b = porBrief.get(t.brief_id);
    if (!b) {
      b = {
        brief_id: t.brief_id, brief_title: t.brief_title, brief_tab: t.brief_tab,
        tasks: [], greenlitAt: null,
      };
      porBrief.set(t.brief_id, b);
    }
    b.tasks.push(t);
  }
  for (const b of porBrief.values()) {
    b.tasks.sort(compararBundle);
    b.greenlitAt = greenlitDeBundle(b.tasks);
  }

  // Briefs con más tareas primero; empate → por título, estable.
  return [...porBrief.values()].sort(
    (a, b) =>
      b.tasks.length - a.tasks.length ||
      (a.brief_title ?? "").localeCompare(b.brief_title ?? ""),
  );
}

/** Las columnas que la vista board_tasks expone para un bundle. */
export const BUNDLE_SELECT =
  "id, code, status, naming_base, concepto, tipo_asset, duracion, marca, plataformas, file_count, track, member_ids, members, brief_id, brief_title, brief_tab, client_slug, delivered_at";

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
