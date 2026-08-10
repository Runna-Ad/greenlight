// Correcciones localizadas — lógica pura (sin React ni Supabase), para poder
// probarla con el harness de node y compartirla entre servidor y cliente.
//
// Una corrección apunta a un CAMPO exacto (tabla + fila + campo) y lleva dos
// estados de resolución que se combinan en tres:
//   open   (rojo)  — sin atender
//   done   (ámbar) — el especialista la marcó atendida, falta que el revisor confirme
//   closed (verde) — el revisor la confirmó

export type EstadoCorreccion = "open" | "done" | "closed";

export type Correccion = {
  id: string;
  targetTabla: string | null;
  targetFilaId: string | null;
  targetCampo: string | null;
  targetLabel: string | null;
  body: string;
  autor: string | null;
  ronda: number;
  estado: EstadoCorreccion;
};

/** El estado de una fila de `comments` a partir de sus timestamps. */
export function estadoDeTimestamps(row: {
  atendido_at: string | null;
  resolved_at: string | null;
}): EstadoCorreccion {
  if (row.resolved_at) return "closed";
  if (row.atendido_at) return "done";
  return "open";
}

/** La llave estable de un campo, para agrupar/ubicar correcciones. */
export const keyCampo = (
  tabla: string | null,
  filaId: string | null,
  campo: string | null,
): string => `${tabla ?? ""}::${filaId ?? ""}::${campo ?? ""}`;

/** Estado agregado de un campo con varias correcciones: open > done > closed. */
export function estadoCampo(cs: Correccion[]): EstadoCorreccion | null {
  if (!cs.length) return null;
  if (cs.some((c) => c.estado === "open")) return "open";
  if (cs.some((c) => c.estado === "done")) return "done";
  return "closed";
}

/** Correcciones vivas de un campo (las de la ronda actual, sin cerrar historial). */
export function porCampo(correcciones: Correccion[]): Map<string, Correccion[]> {
  const m = new Map<string, Correccion[]>();
  for (const c of correcciones) {
    const k = keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo);
    (m.get(k) ?? m.set(k, []).get(k)!).push(c);
  }
  return m;
}

/** Cuántas correcciones siguen sin resolver (rojas o ámbar). */
export const sinResolver = (cs: Correccion[]): number =>
  cs.filter((c) => c.estado !== "closed").length;

/** Cuántas siguen abiertas (rojas, sin atender). El botón del lead mira esto. */
export const abiertas = (cs: Correccion[]): number =>
  cs.filter((c) => c.estado === "open").length;

/** Agrupa por ronda, descendente (la actual primero). */
export function porRonda(correcciones: Correccion[]): { ronda: number; items: Correccion[] }[] {
  const m = new Map<number, Correccion[]>();
  for (const c of correcciones) (m.get(c.ronda) ?? m.set(c.ronda, []).get(c.ronda)!).push(c);
  return [...m.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ronda, items]) => ({ ronda, items }));
}
