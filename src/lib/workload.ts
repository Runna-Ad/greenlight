// La carga (Workload) por persona. Aparte de performance/data.ts para que la lógica
// pura (acotado por track, agrupación por estado/cliente) se pruebe sin base ni
// `server-only` — el mismo patrón que bundle.ts vs bundle-data.ts.

import type { Track } from "@/lib/vocab";
import type { AssetStatus } from "@/lib/brand";

// "Activa" = asignada y NO publicada/entregada. ESTADOS_ACTIVOS es EXACTAMENTE el
// complemento de TERMINALES sobre el enum de 7 valores, así que el filtro en SQL
// (`.in("status", ESTADOS_ACTIVOS)`) equivale al `!TERMINALES.has()` de aquí — sin
// traer las ideas terminales (la tabla que más crece con el histórico).
export const TERMINALES = new Set<string>(["published", "delivered"]);
export const ESTADOS_ACTIVOS: AssetStatus[] = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
];

/** Una tarea viva en la carga de alguien — lo justo para listarla y enlazarla. */
export type CargaTarea = {
  id: string;
  label: string;
  clientSlug: string;
  clientName: string;
  clientColor: string;
};

/** La carga de UNA persona, ya acotada al scope de quien mira. */
export type CargaMiembro = {
  id: string;
  name: string;
  track: Track; // HOME track (agrupa/ordena)
  tracks: Track[]; // alcance efectivo (grant multi-track)
  role: string;
  color: string;
  es_lead: boolean;
  total: number;
  /** Sólo estados con al menos una tarea, en el orden de ESTADOS_ACTIVOS. */
  porEstado: { status: AssetStatus; tareas: CargaTarea[] }[];
  porCliente: { slug: string; name: string; color: string; count: number }[];
};

// Filas crudas de la BD (lo que trae cargarWorkload). Tipadas aquí para que la
// función pura no dependa del cliente de Supabase.
export type MiembroRow = {
  id: string;
  name: string;
  track: Track;
  tracks: Track[] | null;
  role: string;
  color: string;
  es_lead: boolean;
};
export type AsigRow = { member_id: string | null; idea_id: string };
export type IdeaRow = {
  id: string;
  status: string;
  brief_id: string;
  track: Track | null;
  naming_base: string | null;
  code: string | null;
};
export type BriefRow = { id: string; client_id: string };
export type ClientRow = { id: string; name: string; slug: string; brand_color: string };

const COLOR_MARCA_DEFAULT = "#775cbf";

/**
 * Agrupa la carga VIVA por persona, ya ACOTADA por track a lo que ve quien mira.
 *
 * `tracks = null` = admin/master (ve todo); un lead pasa su(s) track(s) efectivo(s).
 * El acotado se aplica a la TAREA (idea.track), así que el desglose, los conteos, el
 * total Y la lista de tareas cuentan SÓLO tareas del track visible — cierra la puerta
 * lateral por la que un lead veía (y el Paso B habría dejado abrir) las tareas de una
 * persona multi-track en el OTRO equipo. El desglose HEREDA el scope de quien mira, no
 * lo re-inventa. (Paso B, 2026-09-01)
 *
 * Nota: el conteo por estado se DERIVA de `tareas.length` en la capa de arriba, así que
 * el número y la lista no pueden discrepar — no hay dos fuentes que driften.
 */
export function agruparCarga(
  miembros: MiembroRow[],
  asigs: AsigRow[],
  ideas: IdeaRow[],
  briefs: BriefRow[],
  clients: ClientRow[],
  tracks: Track[] | null,
): CargaMiembro[] {
  const ideaById = new Map(ideas.map((i) => [i.id, i]));
  const briefClient = new Map(briefs.map((b) => [b.id, b.client_id]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  type Acc = { total: number; porEstado: Map<string, CargaTarea[]>; porCliente: Map<string, number> };
  const acc = new Map<string, Acc>();

  // Visible = admin/master (tracks null) ó la tarea es de un track que quien mira ve.
  // Una tarea sin track no le pertenece a un lead acotado → sólo la ven los globales.
  const visible = (t: Track | null): boolean => !tracks || (t != null && tracks.includes(t));

  for (const a of asigs) {
    if (!a.member_id) continue;
    const idea = ideaById.get(a.idea_id);
    if (!idea || TERMINALES.has(idea.status)) continue;
    if (!visible(idea.track)) continue; // GUARD de scope por track (Paso B)
    const cid = briefClient.get(idea.brief_id);
    const c = cid ? clientById.get(cid) : undefined;
    const m: Acc = acc.get(a.member_id) ?? { total: 0, porEstado: new Map(), porCliente: new Map() };
    m.total += 1;
    const lista = m.porEstado.get(idea.status) ?? [];
    lista.push({
      id: idea.id,
      label: idea.naming_base ?? idea.code ?? "Tarea",
      clientSlug: c?.slug ?? "",
      clientName: c?.name ?? "?",
      clientColor: c?.brand_color ?? COLOR_MARCA_DEFAULT,
    });
    m.porEstado.set(idea.status, lista);
    if (cid) m.porCliente.set(cid, (m.porCliente.get(cid) ?? 0) + 1);
    acc.set(a.member_id, m);
  }

  return (
    miembros
      // Grant efectivo (0059): sin grant se cae al home. Un lead/creativo con grant en
      // ESTE track entra aunque su home sea el otro.
      .map((mem) => ({ ...mem, misTracks: mem.tracks?.length ? mem.tracks : [mem.track] }))
      // Miembro visible = tiene grant en algún track que quien mira ve. El acotado por
      // TAREA de arriba ya vacía a quien no tenga tareas visibles (total 0 → la UI lo
      // esconde); este filtro mantiene la paridad con cargarEvaluacion.
      .filter((mem) => !tracks || mem.misTracks.some((t) => tracks.includes(t)))
      .map((mem) => {
        const d = acc.get(mem.id);
        return {
          id: mem.id,
          name: mem.name,
          track: mem.track,
          tracks: mem.misTracks,
          role: mem.role,
          color: mem.color,
          es_lead: mem.es_lead,
          total: d?.total ?? 0,
          porEstado: ESTADOS_ACTIVOS.filter((s) => (d?.porEstado.get(s)?.length ?? 0) > 0).map((s) => ({
            status: s,
            tareas: d!.porEstado.get(s)!,
          })),
          porCliente: d
            ? [...d.porCliente]
                .map(([cid, count]) => {
                  const c = clientById.get(cid);
                  return {
                    slug: c?.slug ?? "",
                    name: c?.name ?? "?",
                    color: c?.brand_color ?? COLOR_MARCA_DEFAULT,
                    count,
                  };
                })
                .sort((x, y) => y.count - x.count)
            : [],
        };
      })
  );
}
