// El BRIEF como lo ve el cliente (0097, Pedro 2026-11-12): las pestañas Real y Normal del
// mismo día son UN brief ("Brief 30/10"). En la base siguen siendo dos filas de `briefs`
// (una por pestaña: el equipo de cada una, sus leads, su sync); aquí se juntan por fecha.
// Lógica pura, probada en scripts/test-lib.mjs.

export type FilaBrief = { id: string; brief_name: string | null; code: string | null; brief_date: string | null; created_at?: string | null };
export type EstadoBrief = { brief_id: string; greenlit_at: string | null; n_tareas: number };

export type GrupoBrief = {
  /** El id con que el portal nombra al brief: el de la pestaña más vieja (estable). */
  id: string;
  memberIds: string[];
  brief_name: string | null;
  code: string | null;
  brief_date: string | null;
  /** Completo cuando TODAS sus pestañas con piezas lo están: la última fecha. Si alguna sigue
   *  abierta, null. Una pestaña sin piezas no cuenta (si no, un brief nunca cerraría). */
  greenlitAt: string | null;
  nTareas: number;
};

export function agruparBriefsPortal(filas: FilaBrief[], estados: EstadoBrief[]): GrupoBrief[] {
  const est = new Map(estados.map((e) => [e.brief_id, e]));
  const orden = [...filas].sort(
    (a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id),
  );
  const porLlave = new Map<string, FilaBrief[]>();
  for (const f of orden) {
    // Sin fecha (un brief manual sin día): queda solo, como antes.
    const k = f.brief_date ? `d:${f.brief_date}` : `b:${f.id}`;
    (porLlave.get(k) ?? porLlave.set(k, []).get(k)!).push(f);
  }
  return [...porLlave.values()].map((ms) => {
    const conPiezas = ms.filter((m) => (est.get(m.id)?.n_tareas ?? 0) > 0);
    let greenlitAt: string | null = null;
    if (conPiezas.length) {
      for (const m of conPiezas) {
        const g = est.get(m.id)?.greenlit_at ?? null;
        if (!g) { greenlitAt = null; break; }
        if (!greenlitAt || g > greenlitAt) greenlitAt = g;
      }
    }
    return {
      id: ms[0].id,
      memberIds: ms.map((m) => m.id),
      brief_name: ms[0].brief_name,
      code: ms[0].code,
      brief_date: ms[0].brief_date,
      greenlitAt,
      nTareas: ms.reduce((s, m) => s + (est.get(m.id)?.n_tareas ?? 0), 0),
    };
  });
}
