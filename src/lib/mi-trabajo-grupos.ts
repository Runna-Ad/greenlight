// Mi trabajo por PAQUETE dentro de cada estado (fase 2, Pedro 2026-11-13: opción A).
// Lógica pura, probada en scripts/test-lib.mjs.
//
// Las secciones de estado se quedan como están (Cambios pedidos primero: una tarea devuelta
// no puede quedar enterrada). Dentro de cada una, las tareas van bajo su paquete.

export type TareaConPaquete = {
  id: string;
  paquete?: { id: string; nombre: string } | null;
  /** Etiqueta del brief del paquete ("Brief 30/10"), para el título del grupo. */
  briefDeGrupo?: string | null;
  /** El cliente contestó: esa tarea (y su grupo) va arriba, como hoy. */
  clienteRespondio?: boolean;
};

export type GrupoMiTrabajo<T> = {
  llave: string;
  /** null = «Sin paquete». */
  nombre: string | null;
  brief: string | null;
  tareas: T[];
};

/**
 * Agrupa por paquete. Orden: primero los grupos con una tarea donde el cliente respondió,
 * luego por nombre de paquete (y brief, si dos clientes usan el mismo nombre), «Sin paquete»
 * al final. Cada grupo conserva el orden en que llegaron sus tareas.
 */
export function gruposMiTrabajo<T extends TareaConPaquete>(tareas: T[]): GrupoMiTrabajo<T>[] {
  const grupos = new Map<string, GrupoMiTrabajo<T>>();
  for (const t of tareas) {
    const llave = t.paquete ? `p:${t.paquete.id}` : "sin";
    let g = grupos.get(llave);
    if (!g) {
      g = { llave, nombre: t.paquete?.nombre ?? null, brief: t.paquete ? t.briefDeGrupo ?? null : null, tareas: [] };
      grupos.set(llave, g);
    }
    g.tareas.push(t);
  }
  const urgente = (g: GrupoMiTrabajo<T>) => g.tareas.some((t) => t.clienteRespondio);
  return [...grupos.values()].sort(
    (a, b) =>
      Number(urgente(b)) - Number(urgente(a)) ||
      (a.nombre === null ? 1 : 0) - (b.nombre === null ? 1 : 0) ||
      (a.nombre ?? "").localeCompare(b.nombre ?? "") ||
      (a.brief ?? "").localeCompare(b.brief ?? ""),
  );
}
