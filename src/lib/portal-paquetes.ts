// El portal por PAQUETE (Pedro 2026-11-12): para el cliente lo importante es el paquete; el
// brief es una etiqueta. Cada paquete es una "unidad" de revisión: entrar a un paquete enseña
// SÓLO sus piezas (pestañas, flechas y listas). Lógica pura, probada en scripts/test-lib.mjs.
//
// La unidad viaja en el mismo parámetro `?brief=` que ya usa toda la navegación del portal,
// como "<id del brief>.<id del paquete>" ("otras" = piezas sin paquete). Un `?brief=` viejo
// (sólo el id del brief, p. ej. desde el Archivo) se sigue entendiendo: ver `unidadPedida`.

export const SIN_PAQUETE = "otras";

/** El id de una unidad: brief + paquete (null = las piezas del brief sin paquete). */
export function idDeUnidad(briefId: string, paqueteId: string | null): string {
  return `${briefId}.${paqueteId ?? SIN_PAQUETE}`;
}

/** Separa "<brief>.<paquete>". Un id sin punto es un brief entero (link viejo). */
export function leerUnidad(id: string): { briefId: string; paqueteId: string | null } | { briefId: string; paqueteId?: undefined } {
  const i = id.indexOf(".");
  if (i < 0) return { briefId: id };
  const p = id.slice(i + 1);
  return { briefId: id.slice(0, i), paqueteId: p === SIN_PAQUETE ? null : p };
}

type BriefBase<T> = {
  id: string;
  label: string;
  tasks: T[];
  paquetes: { id: string; nombre: string; fechaVisible: string | null }[];
};

/**
 * Las unidades de revisión de cada brief: una por paquete con piezas ENVIADAS, más "Otras
 * piezas" si hay enviadas sin paquete. Un brief sin ningún paquete queda como una sola unidad
 * con su propio nombre (como antes). Conserva el orden de los briefs y, dentro, el de sus
 * paquetes (por nombre).
 */
export function unidadesDePaquete<T extends { paqueteId: string | null }, B extends BriefBase<T>>(
  briefs: B[],
): (B & { briefId: string; paqueteId: string | null; etiqueta: string | null })[] {
  const out: (B & { briefId: string; paqueteId: string | null; etiqueta: string | null })[] = [];
  for (const b of briefs) {
    const ids = new Set(b.paquetes.map((p) => p.id));
    if (!b.paquetes.length) {
      if (b.tasks.length) out.push({ ...b, id: idDeUnidad(b.id, null), briefId: b.id, paqueteId: null, etiqueta: null });
      continue;
    }
    for (const p of b.paquetes) {
      const tasks = b.tasks.filter((t) => t.paqueteId === p.id);
      if (!tasks.length) continue;
      out.push({
        ...b, id: idDeUnidad(b.id, p.id), label: p.nombre, tasks, paquetes: [p],
        briefId: b.id, paqueteId: p.id, etiqueta: b.label,
      });
    }
    const otras = b.tasks.filter((t) => !t.paqueteId || !ids.has(t.paqueteId));
    if (otras.length) {
      out.push({
        ...b, id: idDeUnidad(b.id, null), label: "Otras piezas", tasks: otras, paquetes: [],
        briefId: b.id, paqueteId: null, etiqueta: b.label,
      });
    }
  }
  return out;
}

/**
 * Qué unidad abrir para un `?brief=` y un `?tarea=`:
 *   · "<brief>.<paquete>" → esa unidad, si existe.
 *   · un brief entero (link viejo / Archivo) → la unidad de la tarea pedida, o la primera del brief.
 *   · sin brief pero con tarea (aviso por correo) → la unidad de esa tarea.
 * Las ids de brief ya vienen traducidas al brief del portal (Real+Normal juntos).
 */
export function unidadPedida<U extends { id: string; briefId: string; tasks: { id: string }[] }>(
  unidades: U[],
  briefParam: string | undefined,
  tareaParam: string | undefined,
): U | null {
  const deTarea = (us: U[]) => (tareaParam ? us.find((u) => u.tasks.some((t) => t.id === tareaParam)) : undefined);
  if (briefParam) {
    const exacta = unidades.find((u) => u.id === briefParam);
    if (exacta) return exacta;
    const delBrief = unidades.filter((u) => u.briefId === leerUnidad(briefParam).briefId);
    if (delBrief.length) return deTarea(delBrief) ?? delBrief[0];
  }
  return deTarea(unidades) ?? unidades[0] ?? null;
}
