// Un solo lugar para "¿es una URL que puedo pintar como href?".
// Vive aparte de las server actions para probarse sin arrastrar next/cache.

/** Sólo http/https. Nada de javascript:, data:, file: … */
export function urlSegura(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
