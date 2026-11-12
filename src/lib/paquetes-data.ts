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
    ? await db.from("ideas").select("paquete_id, status, delivered_at, track")
        .in("paquete_id", delCliente).is("deleted_at", null)
        .returns<{ paquete_id: string; status: string; delivered_at: string | null; track: string | null }[]>()
    : { data: [], error: null };
  // Sin paquetes no se rompe la pantalla: las tareas se ven igual, agrupadas en "Sin paquete".
  if (e1 || e2) {
    console.error("cargarPaquetes:", e1?.message ?? e2?.message);
    return out;
  }

  const porPaquete = new Map<string, { paquete_id: string; status: string; delivered_at: string | null; track: string | null }[]>();
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
      desglose: desgloseTracks(ts),
      total: ts.length,
    });
  }
  return out;
}
