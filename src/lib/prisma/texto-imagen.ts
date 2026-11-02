/**
 * Texto en imagen para ChatGPT Images (gpt-image-2.5): la guía oficial pide deletrear las
 * palabras raras y escribirlas entre comillas. Deletrear un párrafo entero satura el
 * prompt, así que sólo se hace con textos cortos (≤ 24 letras); si es más largo, null.
 * Módulo puro.
 */
export const DELETREO_MAX = 24;

/** "Hasta 20%" → "H-a-s-t-a 2-0-%". Conserva mayúsculas/minúsculas tal como las escribió
 *  el diseñador: el texto pedido nunca se "mejora". */
export function deletrear(texto: string): string | null {
  const t = texto.trim().replace(/\s+/g, " ");
  if (!t || t.length > DELETREO_MAX) return null;
  return t
    .split(" ")
    .map((palabra) => [...palabra].join("-"))
    .join(" ");
}
