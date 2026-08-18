// "Consideraciones" del workspace: un solo campo que combina las DOS columnas
// importadas del sheet — Comentarios del lead (comentarios_creativo) y Peloteo
// (peloteo_raw) — divididas. Decisión de Pedro: una sola caja editable que
// guarda a `peloteo_raw`.
//
// Pura (sin React, sin base) para que la comparen igual el cliente (valor
// inicial que se muestra) y el servidor (compare-and-set + consolidación).

/**
 * Combina las dos fuentes en el texto que se MUESTRA en la caja. Se ponen los
 * comentarios del lead primero y el peloteo después, separados por una línea en
 * blanco. Se descartan las partes vacías (o de sólo espacios); las que tienen
 * contenido se unen TAL CUAL (sin recortar). Ambas vacías → null.
 *
 * No se recorta a propósito: el compare-and-set del guardado compara el valor
 * que el cliente recuerda contra este combinado; si aquí recortáramos, un salto
 * de línea final dispararía un conflicto espurio y la edición no se guardaría.
 */
export function combinarConsideraciones(
  comentarios: string | null | undefined,
  peloteo: string | null | undefined,
): string | null {
  const partes = [comentarios, peloteo].filter((s) => (s ?? "").trim().length > 0) as string[];
  return partes.length ? partes.join("\n\n") : null;
}
