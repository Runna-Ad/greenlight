/**
 * HÜE Prisma › Formatos — las reglas del tope diario de Gemini (0088). Módulo puro: lo usan el servidor, la pantalla
 * del Hub y las pruebas. Sin tope (null) nunca se bloquea.
 */
export const TOPE_MIN_USD = 0.01;
export const TOPE_MAX_USD = 10_000;

/** ¿Ya no se puede llamar a la IA hoy? Llegar justo al tope ya cuenta como pasarlo. */
export function topeAlcanzado(tope: number | null, gastadoHoy: number): boolean {
  return tope !== null && gastadoHoy >= tope;
}

/** Una llamada sin costo reportado por Google sí se cobró: para el tope cuenta un poco arriba de la imagen más cara (2K, US$0.0519), no como 0. */
export const COSTO_SIN_REPORTE_USD = 0.06;
export const gastoParaTope = (hoyUsd: number, sinCostoHoy: number): number => hoyUsd + sinCostoHoy * COSTO_SIN_REPORTE_USD;

/** Lo que escribe el Master: dólares con 2 decimales como máximo (punto o coma), o null si no sirve. */
export function leerTope(texto: string): number | null {
  const t = texto.trim().replace(/^\$/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= TOPE_MIN_USD && n <= TOPE_MAX_USD ? n : null;
}

export const usd = (n: number): string => `US$${n.toFixed(2)}`;

/** Lo que ve quien la usa: cualquier rol de Prisma. El monto y dónde se mueve son del Master. */
export const MENSAJE_TOPE = "Se llegó al tope de gasto de IA de hoy. Avísale a Pedro.";
