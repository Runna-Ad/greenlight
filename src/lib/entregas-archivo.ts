// Entregas (archivo) por BRIEF JUNTO y por paquete (fase 2, Pedro 2026-11-13: opción A).
// Lógica pura, probada en scripts/test-lib.mjs.
//
// Antes había un card por PESTAÑA y Real y Normal del mismo día decían los dos
// "Brief 30/10". Ahora: un card por brief (cliente + fecha; sin fecha, la pestaña sola),
// igual que la página de Briefs y el portal; adentro, las tareas por paquete («Sin
// paquete» al final) y cada fila dice Real o Normal.

import { ddmm } from "./paquetes.ts";

export type FilaArchivo = {
  id: string;
  briefId: string;
  track: string | null;
  paquete: { id: string; nombre: string } | null;
};
export type PestanaArchivo = {
  id: string;
  client_id: string;
  brief_date: string | null;
  brief_name: string | null;
  code: string | null;
};

export type CardArchivo<T extends FilaArchivo> = {
  llave: string;
  /** "Brief 30/10" (o el nombre propio del brief sin fecha). */
  etiqueta: string;
  clientId: string;
  /** "Real 4 · Normal 2". */
  desglose: string;
  total: number;
  grupos: { paqueteId: string | null; nombre: string | null; tareas: T[] }[];
};

/** `filas` llegan de la más reciente a la más vieja: los cards quedan en ese orden (el
 *  brief con la entrega más nueva primero) y cada grupo conserva el orden de sus filas. */
export function agruparArchivo<T extends FilaArchivo>(
  filas: T[],
  pestanas: ReadonlyMap<string, PestanaArchivo>,
): CardArchivo<T>[] {
  const cards = new Map<string, CardArchivo<T> & { _real: number; _normal: number }>();
  for (const f of filas) {
    const b = pestanas.get(f.briefId);
    if (!b) continue;
    const llave = b.brief_date ? `${b.client_id}|${b.brief_date}` : `b:${b.id}`;
    let c = cards.get(llave);
    if (!c) {
      c = {
        llave,
        etiqueta: b.brief_date ? `Brief ${ddmm(b.brief_date)}` : b.brief_name?.trim() || b.code?.trim() || "Brief",
        clientId: b.client_id,
        desglose: "",
        total: 0,
        grupos: [],
        _real: 0,
        _normal: 0,
      };
      cards.set(llave, c);
    }
    const pid = f.paquete?.id ?? null;
    let g = c.grupos.find((x) => x.paqueteId === pid);
    if (!g) {
      g = { paqueteId: pid, nombre: f.paquete?.nombre ?? null, tareas: [] };
      c.grupos.push(g);
    }
    g.tareas.push(f);
    c.total++;
    if (f.track === "real") c._real++;
    else if (f.track === "normal") c._normal++;
  }
  return [...cards.values()].map(({ _real, _normal, ...c }) => ({
    ...c,
    desglose: [_real && `Real ${_real}`, _normal && `Normal ${_normal}`].filter(Boolean).join(" · "),
    // Paquetes por nombre, «Sin paquete» al final: el mismo orden que el card de Briefs.
    grupos: c.grupos.sort((a, b) =>
      a.nombre === null ? 1 : b.nombre === null ? -1 : a.nombre.localeCompare(b.nombre),
    ),
  }));
}
