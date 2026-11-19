// Qué es «nuevo» en el Archivo del cliente (0101, Pedro 2026-11-19). Puro, sin BD: lo usan el
// número rojo del menú y la etiqueta «Nuevo» de cada paquete, para que digan lo mismo.

/** La fecha más reciente entre las aprobaciones de las piezas y la carpeta de Drive (ISO). */
export function novedadDe(aprobaciones: (string | null)[], driveAt: string | null): string | null {
  let max: string | null = null;
  for (const f of [...aprobaciones, driveAt]) {
    if (f && !Number.isNaN(Date.parse(f)) && (!max || Date.parse(f) > Date.parse(max))) max = f;
  }
  return max;
}

/** ¿El paquete cambió para el cliente después de su última visita al Archivo?
 *  Sin visita registrada (null), todo lo que tiene fecha cuenta como nuevo. */
export function esNovedad(novedadAt: string | null, vistoAt: string | null): boolean {
  if (!novedadAt) return false;
  return !vistoAt || Date.parse(novedadAt) > Date.parse(vistoAt);
}

/** Cuántos paquetes son nuevos desde la última visita. */
export function contarNovedades(paquetes: { novedadAt: string | null }[], vistoAt: string | null): number {
  return paquetes.filter((p) => esNovedad(p.novedadAt, vistoAt)).length;
}
