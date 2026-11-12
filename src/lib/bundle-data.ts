// La carga de bundles desde Supabase. Aparte de bundle.ts para que la lógica
// pura (filtro, orden, agrupación) se pruebe sin base ni `server-only`.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ideasConCambiosDelCliente } from "@/lib/cambios-pendientes";
import { cargarPaquetes } from "@/lib/paquetes-data";
import type { ViewRole } from "@/lib/roles";
import type { Track } from "@/lib/vocab";
import {
  BUNDLE_SELECT,
  agruparBundles,
  compararBundle,
  filtroBundle,
  bundleEnCurso,
  juntarPorFecha,
  ordenDeTarjeta,
  type Bundle,
  type BundleTask,
} from "@/lib/bundle";

/**
 * Las tareas del brief de una tarea, ya filtradas y en el orden del card de /briefs: las
 * flechas ← n/N → recorren el MISMO brief que el card (Real y Normal del mismo día juntos)
 * y en el mismo orden (por paquete).
 */
export async function cargarBundle(
  briefId: string,
  role: ViewRole,
  soyId: string | null,
  tracks: Track[] | null,
): Promise<BundleTask[]> {
  const db = supabaseAdmin();
  const ids = await pestanasDelBrief(db, briefId);
  const { data } = await db
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .in("brief_id", ids)
    .returns<Omit<BundleTask, "paquete_id">[]>();

  const tasks = await conPaquete(db, data ?? []);
  const conCambios = await cambiosParaFiltro(db, role, tasks);
  const visibles = tasks.filter(filtroBundle(role, soyId, tracks, conCambios)).sort(compararBundle);

  const paqIds = [...new Set(visibles.map((t) => t.paquete_id).filter((x): x is string => !!x))];
  const { data: paqs } = paqIds.length
    ? await db.from("paquetes").select("id, nombre").in("id", paqIds).returns<{ id: string; nombre: string }[]>()
    : { data: [] };
  return ordenDeTarjeta(visibles, paqs ?? []);
}

/** Las pestañas vivas del mismo brief (mismo cliente y misma fecha); sin fecha, sólo ella. */
async function pestanasDelBrief(db: ReturnType<typeof supabaseAdmin>, briefId: string): Promise<string[]> {
  const { data: b } = await db
    .from("briefs").select("client_id, brief_date").eq("id", briefId)
    .maybeSingle<{ client_id: string; brief_date: string | null }>();
  if (!b?.brief_date) return [briefId];
  const { data } = await db
    .from("briefs").select("id").eq("client_id", b.client_id).eq("brief_date", b.brief_date).is("deleted_at", null)
    .returns<{ id: string }[]>();
  const ids = (data ?? []).map((r) => r.id);
  return ids.includes(briefId) ? ids : [briefId, ...ids];
}

/** board_tasks no trae `paquete_id` (0097 no toca esa vista): se lee de `ideas`, por lotes. */
async function conPaquete(
  db: ReturnType<typeof supabaseAdmin>,
  tasks: Omit<BundleTask, "paquete_id">[],
): Promise<BundleTask[]> {
  const paq = new Map<string, string | null>();
  const ids = tasks.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("ideas").select("id, paquete_id").in("id", ids.slice(i, i + 100))
      .returns<{ id: string; paquete_id: string | null }[]>();
    if (error) console.error("conPaquete:", error.message); // sin paquete se ve igual, en "Sin paquete"
    for (const r of data ?? []) paq.set(r.id, r.paquete_id);
  }
  return tasks.map((t) => ({ ...t, paquete_id: paq.get(t.id) ?? null }));
}

/** Sólo el especialista necesita saber qué tareas tienen cambios del cliente (los demás
 *  las ven igual): para otros roles no se consulta nada. */
async function cambiosParaFiltro(
  db: ReturnType<typeof supabaseAdmin>,
  role: ViewRole,
  tasks: BundleTask[],
): Promise<Set<string>> {
  if (role !== "creative") return new Set();
  return ideasConCambiosDelCliente(
    db,
    tasks.filter((t) => t.status === "in_corrections").map((t) => t.id),
  );
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
  const { data: estados, error: eErr } = await db
    .from("brief_estado")
    .select("brief_id, n_tareas, greenlit_at")
    .eq("client_slug", clienteSlug)
    .returns<{ brief_id: string; n_tareas: number; greenlit_at: string | null }[]>();
  // Un error aquí NO puede degradar a "lista vacía": si la vista no existiera en prod
  // (código antes que la migración 0060), todos los clientes verían 0 briefs sin
  // ninguna señal. Mejor la página de error que un vacío convincente. (review 2026-09-02)
  if (eErr) throw new Error(`brief_estado: ${eErr.message}`);

  const { data: cli } = await db.from("clients").select("id").eq("slug", clienteSlug).maybeSingle<{ id: string }>();
  // La fecha de cada pestaña (0097): Real y Normal del mismo día son UN card.
  const { data: fechas, error: fErr } = cli
    ? await db.from("briefs").select("id, brief_date").eq("client_id", cli.id).is("deleted_at", null)
        .returns<{ id: string; brief_date: string | null }[]>()
    : { data: [], error: null };
  if (fErr) throw new Error(`briefs: ${fErr.message}`);
  const fechaDe = new Map((fechas ?? []).map((f) => [f.id, f.brief_date]));
  const llave = (id: string) => (fechaDe.get(id) ? `d:${fechaDe.get(id)}` : `b:${id}`);

  // Misma regla que abajo (bundleEnCurso), por brief JUNTO: si una de sus pestañas sigue en
  // curso, se cargan todas (si no, el card enseñaría sólo la mitad). Sin tareas: fuera.
  const conTareas = (estados ?? []).filter((e) => e.n_tareas > 0);
  const llavesEnCurso = new Set(
    conTareas.filter((e) => bundleEnCurso({ greenlitAt: e.greenlit_at })).map((e) => llave(e.brief_id)),
  );
  const enCurso = conTareas.filter((e) => llavesEnCurso.has(llave(e.brief_id))).map((e) => e.brief_id);
  if (!enCurso.length) return [];

  const { data, error } = await db
    .from("board_tasks")
    .select(BUNDLE_SELECT)
    .in("brief_id", enCurso)
    .returns<Omit<BundleTask, "paquete_id">[]>();
  if (error) throw new Error(`board_tasks: ${error.message}`);

  const tasks = await conPaquete(db, data ?? []);
  const conCambios = await cambiosParaFiltro(db, role, tasks);
  const bundles = juntarPorFecha(agruparBundles(tasks.filter(filtroBundle(role, soyId, tracks, conCambios))), fechaDe)
    .filter((b) => bundleEnCurso(b));

  // Paquetes (0097): sólo los que tocan las tareas VISIBLES; su entrega se calcula con
  // todas sus tareas (cargarPaquetes).
  const paquetes = cli
    ? await cargarPaquetes(cli.id, bundles.flatMap((b) => b.tasks.map((t) => t.paquete_id)))
    : new Map();
  for (const b of bundles) {
    const ids = new Set(b.tasks.map((t) => t.paquete_id).filter((x): x is string => !!x));
    b.paquetes = [...ids].map((id) => paquetes.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
      .sort((x, y) => x.nombre.localeCompare(y.nombre));
  }
  return bundles;
}
