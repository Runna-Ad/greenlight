// El filtro «Brief / paquete» del tablero (fase 2, Pedro 2026-11-13: opción A). Lógica pura,
// probada en scripts/test-lib.mjs.
//
// Antes el selector listaba cada PESTAÑA (fila de `briefs`): Real y Normal del mismo día
// salían como dos «Brief 30/10». Ahora cada brief sale UNA vez (las pestañas con la misma
// fecha juntas, igual que la página de Briefs y el portal), con «Todo el brief» primero y
// sus paquetes debajo.

import { etiquetaBrief } from "./paquetes.ts";

export type PestanaFiltro = { id: string; brief_date: string | null; title: string | null; tab: string | null; track?: string | null };
export type TareaFiltro = { brief_id: string; paquete?: { id: string; nombre: string } | null };

export type GrupoFiltro = {
  /** Valor del <option> «Todo el brief». */
  valor: string;
  etiqueta: string;
  /** Las pestañas que junta (Real y Normal del mismo día). */
  briefIds: string[];
  /** Sus paquetes con tareas en el tablero, por nombre. */
  paquetes: { valor: string; id: string; nombre: string }[];
};

/** Los grupos del selector, en el orden en que llegan las pestañas (la más nueva primero). */
export function gruposFiltroBrief(pestanas: PestanaFiltro[], tareas: TareaFiltro[]): GrupoFiltro[] {
  const grupos = new Map<string, GrupoFiltro>();
  const grupoDeBrief = new Map<string, GrupoFiltro>();
  for (const b of pestanas) {
    const k = b.brief_date ? `d:${b.brief_date}` : `b:${b.id}`;
    let g = grupos.get(k);
    if (!g) {
      g = {
        valor: `g:${k}`,
        // Con fecha junta Real y Normal: "Brief 30/10". Sin fecha la pestaña va sola, con su
        // track ("Voyager · Real"), la misma etiqueta que Entregas, la tarea y la Papelera.
        etiqueta: b.brief_date
          ? etiquetaBrief({ brief_date: b.brief_date })
          : etiquetaBrief({ brief_date: null, brief_name: b.title ?? b.tab, track: b.track }),
        briefIds: [],
        paquetes: [],
      };
      grupos.set(k, g);
    }
    g.briefIds.push(b.id);
    grupoDeBrief.set(b.id, g);
  }
  // Un paquete va bajo el brief de sus tareas (Real y Normal del mismo paquete caen en el
  // mismo grupo porque el grupo ya junta las dos pestañas).
  for (const t of tareas) {
    const g = grupoDeBrief.get(t.brief_id);
    if (!g || !t.paquete || g.paquetes.some((p) => p.id === t.paquete!.id)) continue;
    g.paquetes.push({ valor: `p:${t.paquete.id}`, id: t.paquete.id, nombre: t.paquete.nombre });
  }
  for (const g of grupos.values()) g.paquetes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return [...grupos.values()];
}

/** ¿La tarea pasa el filtro elegido? `todos` = el valor de «Todos los briefs». Un valor
 *  que ya no existe (p. ej. el brief se borró) no deja pasar nada, para que se note. */
export function pasaFiltroBrief(valor: string, todos: string, grupos: GrupoFiltro[], t: TareaFiltro): boolean {
  if (valor === todos) return true;
  if (valor.startsWith("p:")) return t.paquete?.id === valor.slice(2);
  const g = grupos.find((x) => x.valor === valor);
  return !!g && g.briefIds.includes(t.brief_id);
}
