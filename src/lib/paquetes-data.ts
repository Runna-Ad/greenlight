// Carga de paquetes (0097) para la lista de briefs del equipo y el portal. UNA sola
// función: las dos pantallas calculan la entrega de un paquete igual, con TODAS sus
// tareas vivas (Real y Normal), no sólo las que esa pantalla muestra.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaqueteEquipo } from "@/lib/bundle";
import { desgloseTracks, entregaDePaquete } from "@/lib/paquetes";

export async function cargarPaquetes(clientId: string, ids: (string | null)[]): Promise<Map<string, PaqueteEquipo>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, PaqueteEquipo>();
  if (!unicos.length) return out;

  const db = supabaseAdmin();
  // Acotado al cliente: un paquete_id equivocado nunca enseña el paquete de otro cliente.
  const { data: paqs, error: e1 } = await db
    .from("paquetes").select("id, nombre, fecha_entrega").eq("client_id", clientId).in("id", unicos)
    .returns<{ id: string; nombre: string; fecha_entrega: string | null }[]>();
  const delCliente = (paqs ?? []).map((p) => p.id);
  // Las tareas vivas de esos paquetes, directo de `ideas` (board_tasks no trae paquete_id, ver
  // 0097). Mandar un brief a la papelera sella también sus tareas, así que deleted_at basta.
  const { data: tareas, error: e2 } = delCliente.length
    ? await db.from("ideas").select("paquete_id, status, delivered_at, track, tipo_asset")
        .in("paquete_id", delCliente).is("deleted_at", null)
        .returns<{ paquete_id: string; status: string; delivered_at: string | null; track: string | null; tipo_asset: string | null }[]>()
    : { data: [], error: null };
  // Sin paquetes no se rompe la pantalla: las tareas se ven igual, agrupadas en "Sin paquete".
  if (e1 || e2) {
    console.error("cargarPaquetes:", e1?.message ?? e2?.message);
    return out;
  }

  const porPaquete = new Map<string, { paquete_id: string; status: string; delivered_at: string | null; track: string | null; tipo_asset: string | null }[]>();
  for (const t of tareas ?? []) (porPaquete.get(t.paquete_id) ?? porPaquete.set(t.paquete_id, []).get(t.paquete_id)!).push(t);

  for (const p of paqs ?? []) {
    const ts = porPaquete.get(p.id) ?? [];
    const e = entregaDePaquete(ts, p.fecha_entrega);
    out.set(p.id, {
      id: p.id,
      nombre: p.nombre,
      fechaEntrega: p.fecha_entrega,
      entregadoEl: e.entregadoEl,
      diasAntes: e.diasAntes,
      desglose: desgloseTracks(ts.map((t) => ({ track: t.track, tipoAsset: t.tipo_asset }))),
      total: ts.length,
    });
  }
  return out;
}

export type PaqueteDeTarea = { id: string; nombre: string };

/**
 * El paquete de cada tarea, para las pantallas del equipo que no lo traían (fase 2: tablero,
 * Mi trabajo, Entregas, Performance). board_tasks no tiene `paquete_id` (0097 no toca esa
 * vista), así que se lee de `ideas`, por lotes de 100 ids (el tope de una URL de PostgREST).
 * Un error no rompe la pantalla: las tareas se ven sin paquete y queda en el log.
 */
export async function paquetesDeTareas(ideaIds: string[]): Promise<Map<string, PaqueteDeTarea>> {
  const out = new Map<string, PaqueteDeTarea>();
  const ids = [...new Set(ideaIds)];
  if (!ids.length) return out;
  const db = supabaseAdmin();

  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 100) }, (_, i) => xs.slice(i * 100, i * 100 + 100));

  // Los lotes van en paralelo. Si uno falla, la pantalla sale sin paquetes (todas igual),
  // no con unas tarjetas con paquete y otras sin.
  const rIdeas = await Promise.all(lotes(ids).map((l) =>
    db.from("ideas").select("id, paquete_id").in("id", l).not("paquete_id", "is", null)
      .returns<{ id: string; paquete_id: string }[]>()));
  const eIdeas = rIdeas.find((r) => r.error)?.error;
  if (eIdeas) { console.error("paquetesDeTareas (ideas):", eIdeas.message); return out; }
  const paqDe = new Map(rIdeas.flatMap((r) => r.data ?? []).map((r) => [r.id, r.paquete_id]));

  const rPaqs = await Promise.all(lotes([...new Set(paqDe.values())]).map((l) =>
    db.from("paquetes").select("id, nombre").in("id", l).returns<{ id: string; nombre: string }[]>()));
  const ePaqs = rPaqs.find((r) => r.error)?.error;
  if (ePaqs) { console.error("paquetesDeTareas (paquetes):", ePaqs.message); return out; }
  const nombre = new Map(rPaqs.flatMap((r) => r.data ?? []).map((p) => [p.id, p.nombre]));

  for (const [ideaId, paqId] of paqDe) {
    const n = nombre.get(paqId);
    if (n) out.set(ideaId, { id: paqId, nombre: n });
  }
  return out;
}
